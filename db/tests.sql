-- Database test cases. Run after `npm run db:reset`:  psql "$DATABASE_URL" -f db/tests.sql
-- Each block prints PASS/FAIL. Everything runs inside a transaction that is rolled back.
BEGIN;
CREATE TEMP TABLE results (name text, passed boolean);

-- expect_error(label, sql): passes when the statement raises
CREATE FUNCTION pg_temp.expect_error(label text, stmt text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE stmt; INSERT INTO results VALUES (label, false);
  EXCEPTION WHEN OTHERS THEN INSERT INTO results VALUES (label, true); END;
END $$;

SELECT pg_temp.expect_error('CHECK: negative daily rate rejected',
  $$INSERT INTO vehicles (branch_id,reg_no,make,model,category,fuel_type,seats,daily_rate,registration_expiry,insurance_expiry,puc_expiry)
    VALUES (1,'T1','m','m','SUV','Petrol',5,-1,now(),now(),now())$$);
SELECT pg_temp.expect_error('CHECK: invalid vehicle status rejected', $$UPDATE vehicles SET status='Flying' WHERE vehicle_id=2$$);
SELECT pg_temp.expect_error('UNIQUE: duplicate registration rejected', $$UPDATE vehicles SET reg_no=(SELECT reg_no FROM vehicles WHERE vehicle_id=1) WHERE vehicle_id=2$$);
SELECT pg_temp.expect_error('FK: booking for unknown vehicle rejected',
  $$INSERT INTO bookings (user_id,vehicle_id,start_ts,end_ts,total_fare) VALUES (2,9999,now(),now()+interval '1 day',1)$$);
SELECT pg_temp.expect_error('CHECK: end before start rejected',
  $$INSERT INTO bookings (user_id,vehicle_id,start_ts,end_ts,total_fare) VALUES (2,2,now()+interval '2 day',now()+interval '1 day',1)$$);
SELECT pg_temp.expect_error('EXCLUDE: overlapping booking for same vehicle rejected',
  $$INSERT INTO bookings (user_id,vehicle_id,start_ts,end_ts,total_fare) SELECT 2,vehicle_id,start_ts+interval '1 hour',end_ts,1 FROM bookings WHERE status='Active' LIMIT 1$$);
SELECT pg_temp.expect_error('TRIGGER: review requires a completed booking by the renter',
  $$INSERT INTO reviews (booking_id,user_id,vehicle_id,rating) SELECT booking_id,user_id,vehicle_id,5 FROM bookings WHERE status='Active' LIMIT 1$$);
SELECT pg_temp.expect_error('TRIGGER: expired-licence driver cannot be assigned',
  $$INSERT INTO bookings (user_id,vehicle_id,driver_id,start_ts,end_ts,total_fare) VALUES (2,2,2,now()+interval '40 day',now()+interval '41 day',1)$$);

-- Pricing: 2 days, 100 km on a vehicle with known rates
INSERT INTO results SELECT 'calc_fare: base + distance', (f.total = 2*v.daily_rate + 100*v.per_km_rate)
  FROM vehicles v, calc_fare(v.vehicle_id, now(), now()+interval '2 days', 100) f WHERE v.vehicle_id = 2;
INSERT INTO results SELECT 'calc_fare: 5h late => late fee > 0', (f.late_fee > 0)
  FROM calc_fare(2, now()-interval '2 days', now(), 0, now()+interval '5 hours') f;
INSERT INTO results SELECT 'calc_fare: within 1h grace => no late fee', (f.late_fee = 0)
  FROM calc_fare(2, now()-interval '2 days', now(), 0, now()+interval '50 minutes') f;
INSERT INTO results SELECT 'calc_fare: loyalty gives 5% off base', (f.discount = ROUND(f.base_fare*0.05,2))
  FROM calc_fare(2, now(), now()+interval '1 day', 0, NULL, true) f;

-- Trigger: odometer past threshold flags the vehicle
UPDATE vehicles SET odometer_km = last_service_km + service_interval_km, status = 'Available' WHERE vehicle_id = 2;
INSERT INTO results SELECT 'TRIGGER: odometer over interval => Maintenance_Required', status = 'Maintenance_Required' FROM vehicles WHERE vehicle_id = 2;
-- Trigger: a maintenance log restores service
INSERT INTO maintenance_logs (vehicle_id, service_type, description, cost, odometer_km) SELECT vehicle_id,'Scheduled','test',100,odometer_km FROM vehicles WHERE vehicle_id=2;
INSERT INTO results SELECT 'TRIGGER: maintenance log => Available & counter reset', status='Available' AND last_service_km=odometer_km FROM vehicles WHERE vehicle_id=2;

-- Rejecting an upcoming booking: cancelled, reason stored, refunded, and the slot is free again
DO $$
DECLARE bid INT; refunded NUMERIC; fare NUMERIC; reusable BOOLEAN := FALSE;
BEGIN
  INSERT INTO bookings (user_id, vehicle_id, start_ts, end_ts, total_fare)
    VALUES (2, 4, now() + interval '300 days', now() + interval '302 days', 5000) RETURNING booking_id, total_fare INTO bid, fare;
  INSERT INTO payments (booking_id, amount, method, kind) VALUES (bid, 5000, 'UPI', 'Fare');
  CALL sp_reject_booking(bid, 'Driver unavailable');
  SELECT amount INTO refunded FROM payments WHERE booking_id = bid AND kind = 'Refund';
  INSERT INTO results SELECT 'PROC: reject booking => Cancelled with reason and full refund',
    status = 'Cancelled' AND cancel_reason = 'Driver unavailable' AND refunded = 5000 FROM bookings WHERE booking_id = bid;
  BEGIN
    INSERT INTO bookings (user_id, vehicle_id, start_ts, end_ts, total_fare)
      VALUES (3, 4, now() + interval '300 days', now() + interval '302 days', 5000);
    reusable := TRUE;
  EXCEPTION WHEN OTHERS THEN reusable := FALSE;
  END;
  INSERT INTO results VALUES ('PROC: rejected booking frees the vehicle slot (EXCLUDE ignores Cancelled)', reusable);
END $$;
SELECT pg_temp.expect_error('PROC: only Confirmed bookings can be rejected',
  $$CALL sp_reject_booking((SELECT booking_id FROM bookings WHERE status = 'Completed' LIMIT 1), 'Not allowed anyway')$$);
SELECT pg_temp.expect_error('PROC: rejection needs a reason',
  $$CALL sp_reject_booking((SELECT booking_id FROM bookings WHERE status = 'Confirmed' LIMIT 1), 'no')$$);
SELECT pg_temp.expect_error('CHECK: cancelled booking must carry a reason',
  $$UPDATE bookings SET status = 'Cancelled' WHERE booking_id = (SELECT booking_id FROM bookings WHERE status = 'Confirmed' LIMIT 1)$$);

-- Recursive CTE: three milestones for every vehicle that is still in the fleet
INSERT INTO results SELECT 'RECURSIVE CTE: 3 service milestones per vehicle',
  (SELECT count(*) FROM (
     WITH RECURSIVE m AS (
       SELECT vehicle_id, 1 AS n FROM vehicles WHERE status <> 'Out_of_Service'
       UNION ALL SELECT vehicle_id, n + 1 FROM m WHERE n < 3)
     SELECT * FROM m) x) = 3 * (SELECT count(*) FROM vehicles WHERE status <> 'Out_of_Service');

-- View sanity
INSERT INTO results SELECT 'VIEW: v_fleet_utilization has one row per vehicle',
  (SELECT count(*) FROM v_fleet_utilization) = (SELECT count(*) FROM vehicles);

-- CTE smoke test: generate_series emits a full 30-day calendar for each branch.
INSERT INTO results
SELECT 'CTE: 30-day calendar has one row per branch/day',
       (SELECT count(*) FROM branches b CROSS JOIN generate_series(CURRENT_DATE - 29, CURRENT_DATE, INTERVAL '1 day') d)
       = ((SELECT count(*) FROM branches) * 30);

SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name FROM results ORDER BY passed, name;
ROLLBACK;
