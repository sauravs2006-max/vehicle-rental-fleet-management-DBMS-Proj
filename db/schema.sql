-- ============================================================================
-- Vehicle Rental & Fleet Management System  -  PostgreSQL schema (idempotent)
-- Sections: 0 reset | 1 tables | 2 ALTERs | 3 indexes | 4 functions/procedures
--           5 triggers | 6 views
-- ============================================================================

-- ---------- 0. RESET (DROP demonstrates DDL; makes the script re-runnable) ---
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- needed for EXCLUDE (int WITH =, range WITH &&)

DROP VIEW  IF EXISTS v_fleet_utilization, v_maintenance_alerts, v_expiring_documents, v_driver_performance CASCADE;
DROP TABLE IF EXISTS disputes, reviews, damage_reports, payments, bookings,
                     maintenance_logs, drivers, vehicles, branches, users CASCADE;
DROP FUNCTION  IF EXISTS calc_fare(INT, TIMESTAMPTZ, TIMESTAMPTZ, INT, TIMESTAMPTZ, BOOLEAN) CASCADE;
DROP PROCEDURE IF EXISTS sp_complete_return(INT, TIMESTAMPTZ, INT, TEXT, TEXT, TEXT);
DROP PROCEDURE IF EXISTS sp_activate_due_bookings();
DROP PROCEDURE IF EXISTS sp_reject_booking(INT, TEXT);
DROP FUNCTION  IF EXISTS fn_flag_service_due(), fn_damage_flags_vehicle(), fn_after_maintenance(), fn_review_guard(), fn_driver_guard() CASCADE;

-- ---------- 1. TABLES --------------------------------------------------------
CREATE TABLE users (
  user_id        SERIAL PRIMARY KEY,
  email          VARCHAR(150) NOT NULL UNIQUE
                 CHECK (email ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  password_hash  TEXT         NOT NULL,
  full_name      VARCHAR(100) NOT NULL CHECK (length(btrim(full_name)) > 0),
  phone          VARCHAR(20)  CHECK (phone ~ '^[0-9+ -]{7,20}$'),
  role           VARCHAR(20)  NOT NULL DEFAULT 'customer' CHECK (role IN ('admin','customer')),
  license_no     VARCHAR(30),
  loyalty_points INT          NOT NULL DEFAULT 0 CHECK (loyalty_points >= 0),
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE TABLE branches (
  branch_id SERIAL PRIMARY KEY,
  name      VARCHAR(80)  NOT NULL UNIQUE,
  city      VARCHAR(60)  NOT NULL,
  address   VARCHAR(200) NOT NULL
);

CREATE TABLE vehicles (
  vehicle_id          SERIAL PRIMARY KEY,
  branch_id           INT          NOT NULL REFERENCES branches(branch_id) ON DELETE RESTRICT,
  reg_no              VARCHAR(20)  NOT NULL UNIQUE,
  make                VARCHAR(50)  NOT NULL,
  model               VARCHAR(50)  NOT NULL,
  category            VARCHAR(20)  NOT NULL CHECK (category IN ('Hatchback','Sedan','SUV','Van','Luxury')),
  fuel_type           VARCHAR(15)  NOT NULL CHECK (fuel_type IN ('Petrol','Diesel','Electric','Hybrid','CNG')),
  seats               SMALLINT     NOT NULL CHECK (seats BETWEEN 1 AND 15),
  daily_rate          NUMERIC(10,2) NOT NULL CHECK (daily_rate > 0),
  per_km_rate         NUMERIC(6,2)  NOT NULL DEFAULT 0 CHECK (per_km_rate >= 0),
  odometer_km         INT          NOT NULL DEFAULT 0 CHECK (odometer_km >= 0),
  last_service_km     INT          NOT NULL DEFAULT 0 CHECK (last_service_km >= 0),
  service_interval_km INT          NOT NULL DEFAULT 10000 CHECK (service_interval_km > 0),
  last_service_date   DATE,
  status              VARCHAR(25)  NOT NULL DEFAULT 'Available'
                      CHECK (status IN ('Available','Rented','Maintenance_Required','Under_Maintenance','Out_of_Service')),
  registration_expiry DATE NOT NULL,
  insurance_expiry    DATE NOT NULL,
  puc_expiry          DATE NOT NULL,           -- pollution-under-control certificate
  CONSTRAINT chk_service_km_le_odometer CHECK (last_service_km <= odometer_km)
);

CREATE TABLE drivers (
  driver_id      SERIAL PRIMARY KEY,
  full_name      VARCHAR(100) NOT NULL,
  phone          VARCHAR(20)  NOT NULL CHECK (phone ~ '^[0-9+ -]{7,20}$'),
  license_no     VARCHAR(30)  NOT NULL UNIQUE,
  license_expiry DATE         NOT NULL,
  is_active      BOOLEAN      NOT NULL DEFAULT TRUE
);

CREATE TABLE maintenance_logs (
  log_id         SERIAL PRIMARY KEY,
  vehicle_id     INT NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  service_type   VARCHAR(20) NOT NULL CHECK (service_type IN ('Scheduled','Repair','Inspection')),
  description    TEXT        NOT NULL,
  parts_replaced TEXT,
  cost           NUMERIC(10,2) NOT NULL CHECK (cost >= 0),
  odometer_km    INT  NOT NULL CHECK (odometer_km >= 0),
  downtime_days  INT  NOT NULL DEFAULT 0 CHECK (downtime_days >= 0),
  serviced_on    DATE NOT NULL DEFAULT current_date
);

CREATE TABLE bookings (
  booking_id         SERIAL PRIMARY KEY,
  user_id            INT NOT NULL REFERENCES users(user_id)       ON DELETE RESTRICT,
  vehicle_id         INT NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE RESTRICT,
  driver_id          INT          REFERENCES drivers(driver_id)   ON DELETE SET NULL,
  start_ts           TIMESTAMPTZ NOT NULL,
  end_ts             TIMESTAMPTZ NOT NULL,
  returned_ts        TIMESTAMPTZ,
  est_distance_km    INT NOT NULL DEFAULT 0 CHECK (est_distance_km >= 0),
  actual_distance_km INT CHECK (actual_distance_km >= 0),
  total_fare         NUMERIC(12,2) NOT NULL CHECK (total_fare >= 0),
  status             VARCHAR(15) NOT NULL DEFAULT 'Confirmed'
                     CHECK (status IN ('Confirmed','Active','Completed','Cancelled')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_booking_window CHECK (end_ts > start_ts),
  CONSTRAINT chk_returned_after_start CHECK (returned_ts IS NULL OR returned_ts >= start_ts),
  -- Date-range availability enforced by the database itself: no two live bookings
  -- may overlap for the same vehicle, nor for the same chauffeur.
  CONSTRAINT excl_vehicle_overlap EXCLUDE USING gist
      (vehicle_id WITH =, tstzrange(start_ts, end_ts, '[)') WITH &&)
      WHERE (status IN ('Confirmed','Active')),
  CONSTRAINT excl_driver_overlap EXCLUDE USING gist
      (driver_id WITH =, tstzrange(start_ts, end_ts, '[)') WITH &&)
      WHERE (driver_id IS NOT NULL AND status IN ('Confirmed','Active'))
);

CREATE TABLE payments (
  payment_id SERIAL PRIMARY KEY,
  booking_id INT NOT NULL REFERENCES bookings(booking_id) ON DELETE RESTRICT,
  amount     NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  method     VARCHAR(10) NOT NULL CHECK (method IN ('Card','UPI','Cash','Wallet')),
  kind       VARCHAR(12) NOT NULL CHECK (kind IN ('Fare','Late_Fee','Adjustment','Refund')),
  status     VARCHAR(10) NOT NULL DEFAULT 'Paid' CHECK (status IN ('Paid','Pending','Failed')),
  paid_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE damage_reports (
  report_id           SERIAL PRIMARY KEY,
  booking_id          INT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  vehicle_id          INT NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  stage               VARCHAR(12) NOT NULL CHECK (stage IN ('Pre_Rental','Post_Rental')),
  severity            VARCHAR(8)  NOT NULL CHECK (severity IN ('None','Minor','Major')),
  notes               TEXT,
  mongo_inspection_id TEXT,      -- pointer to the rich, schema-less inspection document in MongoDB
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reviews (
  review_id  SERIAL PRIMARY KEY,
  booking_id INT NOT NULL UNIQUE REFERENCES bookings(booking_id) ON DELETE CASCADE,
  user_id    INT NOT NULL REFERENCES users(user_id)       ON DELETE CASCADE,
  vehicle_id INT NOT NULL REFERENCES vehicles(vehicle_id) ON DELETE CASCADE,
  rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    TEXT CHECK (comment IS NULL OR length(comment) <= 1000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  search     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', coalesce(comment, ''))) STORED
);

CREATE TABLE disputes (
  dispute_id      SERIAL PRIMARY KEY,
  booking_id      INT NOT NULL REFERENCES bookings(booking_id) ON DELETE CASCADE,
  raised_by       INT NOT NULL REFERENCES users(user_id),
  reason          TEXT NOT NULL CHECK (length(btrim(reason)) >= 10),
  status          VARCHAR(10) NOT NULL DEFAULT 'Open' CHECK (status IN ('Open','Resolved','Rejected')),
  resolution_note TEXT,
  refund_amount   NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (refund_amount >= 0),
  resolved_by     INT REFERENCES users(user_id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at     TIMESTAMPTZ,
  CONSTRAINT chk_dispute_state CHECK ((status = 'Open') = (resolved_at IS NULL))
);

-- ---------- 2. ALTER TABLE ---------------------------------------------------
ALTER TABLE bookings ADD COLUMN loyalty_discount BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE bookings ADD COLUMN cancel_reason TEXT;
ALTER TABLE bookings ADD CONSTRAINT chk_cancel_reason CHECK (status <> 'Cancelled' OR COALESCE(length(btrim(cancel_reason)), 0) >= 5);
ALTER TABLE vehicles ADD COLUMN image_url TEXT;
ALTER TABLE vehicles ADD CONSTRAINT chk_insurance_sane CHECK (insurance_expiry > DATE '2000-01-01');
ALTER TABLE drivers  ADD COLUMN joined_on DATE NOT NULL DEFAULT current_date;

-- ---------- 3. INDEXES -------------------------------------------------------
CREATE INDEX idx_vehicles_branch_status ON vehicles (branch_id, status);
CREATE INDEX idx_vehicles_category_rate ON vehicles (category, daily_rate);
CREATE INDEX idx_bookings_user          ON bookings (user_id, start_ts DESC);
CREATE INDEX idx_bookings_vehicle_time  ON bookings (vehicle_id, start_ts);
CREATE INDEX idx_bookings_open          ON bookings (status) WHERE status IN ('Confirmed','Active');   -- partial index
CREATE INDEX idx_payments_booking       ON payments (booking_id);
CREATE INDEX idx_maint_vehicle_date     ON maintenance_logs (vehicle_id, serviced_on DESC);
CREATE INDEX idx_reviews_vehicle        ON reviews (vehicle_id);
CREATE INDEX idx_reviews_search         ON reviews USING GIN (search);                                  -- full-text search
CREATE INDEX idx_disputes_open          ON disputes (status) WHERE status = 'Open';
CREATE INDEX idx_tmp_demo               ON vehicles (make);
DROP INDEX  idx_tmp_demo;                                                                              -- DROP INDEX demo

-- ---------- 4. FUNCTIONS / PROCEDURES ---------------------------------------
-- Dynamic pricing: base fare (billed days) + distance charge + late-return penalty
-- (1h grace, then 1.5x hourly rate) - 5% loyalty discount on base. Early returns
-- bill only the days actually used (=> refund when re-priced at return time).
CREATE FUNCTION calc_fare(
  p_vehicle_id INT, p_start TIMESTAMPTZ, p_end TIMESTAMPTZ, p_distance_km INT,
  p_returned TIMESTAMPTZ DEFAULT NULL, p_loyalty BOOLEAN DEFAULT FALSE)
RETURNS TABLE (billed_days INT, base_fare NUMERIC, distance_fare NUMERIC,
               late_fee NUMERIC, discount NUMERIC, total NUMERIC)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v      vehicles%ROWTYPE;
  ret    TIMESTAMPTZ;
  late_h INT;
BEGIN
  SELECT * INTO v FROM vehicles WHERE vehicle_id = p_vehicle_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Vehicle % not found', p_vehicle_id; END IF;
  IF p_end <= p_start THEN RAISE EXCEPTION 'End time must be after start time'; END IF;

  ret           := COALESCE(p_returned, p_end);
  billed_days   := GREATEST(1, CEIL(EXTRACT(EPOCH FROM (LEAST(ret, p_end) - p_start)) / 86400.0))::INT;
  base_fare     := billed_days * v.daily_rate;
  distance_fare := COALESCE(p_distance_km, 0) * v.per_km_rate;
  late_h        := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (ret - p_end)) / 3600.0)::INT - 1);
  late_fee      := ROUND(late_h * (v.daily_rate / 24.0) * 1.5, 2);
  discount      := CASE WHEN p_loyalty THEN ROUND(base_fare * 0.05, 2) ELSE 0 END;
  total         := base_fare + distance_fare + late_fee - discount;
  RETURN NEXT;
END $$;

-- Return workflow: re-price, settle difference (late fee / refund), restore vehicle,
-- log post-rental inspection, award loyalty points. Runs atomically (single CALL).
CREATE PROCEDURE sp_complete_return(
  p_booking_id INT, p_returned TIMESTAMPTZ, p_actual_km INT,
  p_severity TEXT, p_notes TEXT, p_mongo_id TEXT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
  b   bookings%ROWTYPE;
  f   RECORD;
  adj NUMERIC;
BEGIN
  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking % not found', p_booking_id; END IF;
  IF b.status NOT IN ('Confirmed','Active') THEN
    RAISE EXCEPTION 'Booking % is already %', p_booking_id, b.status;
  END IF;
  IF p_severity NOT IN ('None','Minor','Major') THEN RAISE EXCEPTION 'Invalid severity %', p_severity; END IF;
  IF p_returned < b.start_ts THEN RAISE EXCEPTION 'Booking % has not started yet (pickup %)', p_booking_id, b.start_ts; END IF;

  SELECT * INTO f FROM calc_fare(b.vehicle_id, b.start_ts, b.end_ts, p_actual_km, p_returned, b.loyalty_discount);
  adj := f.total - b.total_fare;

  UPDATE bookings SET returned_ts = p_returned, actual_distance_km = p_actual_km,
                      total_fare = f.total, status = 'Completed'
   WHERE booking_id = p_booking_id;

  IF adj > 0 THEN
    INSERT INTO payments (booking_id, amount, method, kind)
    VALUES (p_booking_id, adj, 'Card', CASE WHEN f.late_fee > 0 THEN 'Late_Fee' ELSE 'Adjustment' END);
  ELSIF adj < 0 THEN
    INSERT INTO payments (booking_id, amount, method, kind) VALUES (p_booking_id, -adj, 'Card', 'Refund');
  END IF;

  -- trigger trg_vehicle_service_due may flip this to Maintenance_Required
  UPDATE vehicles SET odometer_km = odometer_km + p_actual_km, status = 'Available'
   WHERE vehicle_id = b.vehicle_id;

  -- trigger trg_damage_flags_vehicle reacts to Minor/Major post-rental damage
  INSERT INTO damage_reports (booking_id, vehicle_id, stage, severity, notes, mongo_inspection_id)
  VALUES (p_booking_id, b.vehicle_id, 'Post_Rental', p_severity, p_notes, p_mongo_id);

  UPDATE users SET loyalty_points = loyalty_points + FLOOR(f.total / 100)::INT WHERE user_id = b.user_id;
END $$;

-- Admin rejects an upcoming booking (driver unavailable, vehicle problem, ...):
-- cancel it, record why, and refund whatever the customer paid. Because the overlap
-- constraints only look at Confirmed/Active bookings, the vehicle and driver are free again
-- for that time slot as soon as the status changes.
CREATE PROCEDURE sp_reject_booking(p_booking_id INT, p_reason TEXT)
LANGUAGE plpgsql AS $$
DECLARE
  b    bookings%ROWTYPE;
  paid NUMERIC;
BEGIN
  IF length(btrim(coalesce(p_reason, ''))) < 5 THEN
    RAISE EXCEPTION 'Please give a reason (at least 5 characters)';
  END IF;

  SELECT * INTO b FROM bookings WHERE booking_id = p_booking_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Booking % not found', p_booking_id; END IF;
  IF b.status <> 'Confirmed' THEN
    RAISE EXCEPTION 'Only upcoming (Confirmed) bookings can be rejected; booking % is %', p_booking_id, b.status;
  END IF;

  SELECT COALESCE(SUM(CASE WHEN kind = 'Refund' THEN -amount ELSE amount END), 0) INTO paid
    FROM payments WHERE booking_id = p_booking_id AND status = 'Paid';

  UPDATE bookings SET status = 'Cancelled', cancel_reason = btrim(p_reason) WHERE booking_id = p_booking_id;

  IF paid > 0 THEN
    INSERT INTO payments (booking_id, amount, method, kind) VALUES (p_booking_id, paid, 'Wallet', 'Refund');
  END IF;
END $$;

-- Promote bookings whose pickup time has arrived (schedule with pg_cron / cron).
CREATE PROCEDURE sp_activate_due_bookings() LANGUAGE sql AS $$
  UPDATE vehicles SET status = 'Rented'
   WHERE status = 'Available' AND vehicle_id IN
         (SELECT vehicle_id FROM bookings WHERE status = 'Confirmed' AND start_ts <= now());
  UPDATE bookings SET status = 'Active' WHERE status = 'Confirmed' AND start_ts <= now();
$$;

-- ---------- 5. TRIGGERS -----------------------------------------------------
-- T1: odometer past service threshold  ->  Maintenance_Required
CREATE FUNCTION fn_flag_service_due() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'Available' AND (NEW.odometer_km - NEW.last_service_km) >= NEW.service_interval_km THEN
    NEW.status := 'Maintenance_Required';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_vehicle_service_due
  BEFORE INSERT OR UPDATE OF odometer_km, status ON vehicles
  FOR EACH ROW EXECUTE FUNCTION fn_flag_service_due();

-- T2: post-rental damage (Minor/Major)  ->  Maintenance_Required
CREATE FUNCTION fn_damage_flags_vehicle() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.stage = 'Post_Rental' AND NEW.severity IN ('Minor','Major') THEN
    UPDATE vehicles SET status = 'Maintenance_Required'
     WHERE vehicle_id = NEW.vehicle_id AND status IN ('Available','Rented');
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_damage_flags_vehicle
  AFTER INSERT ON damage_reports FOR EACH ROW EXECUTE FUNCTION fn_damage_flags_vehicle();

-- T3: a maintenance log resets the service counter and returns the vehicle to service
CREATE FUNCTION fn_after_maintenance() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  UPDATE vehicles
     SET odometer_km       = GREATEST(odometer_km, NEW.odometer_km),
         last_service_km   = GREATEST(last_service_km, NEW.odometer_km),
         last_service_date = GREATEST(COALESCE(last_service_date, NEW.serviced_on), NEW.serviced_on),
         status = CASE WHEN status IN ('Maintenance_Required','Under_Maintenance') THEN 'Available' ELSE status END
   WHERE vehicle_id = NEW.vehicle_id;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_after_maintenance
  AFTER INSERT ON maintenance_logs FOR EACH ROW EXECUTE FUNCTION fn_after_maintenance();

-- T4: only the renter of a COMPLETED booking may review it
CREATE FUNCTION fn_review_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM bookings
                  WHERE booking_id = NEW.booking_id AND user_id = NEW.user_id
                    AND vehicle_id = NEW.vehicle_id AND status = 'Completed') THEN
    RAISE EXCEPTION 'Reviews are allowed only for the renter of a completed booking';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_review_guard
  BEFORE INSERT ON reviews FOR EACH ROW EXECUTE FUNCTION fn_review_guard();

-- T5: a chauffeur must be active with a licence valid through the trip
CREATE FUNCTION fn_driver_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_id IS NOT NULL AND NOT EXISTS (
       SELECT 1 FROM drivers WHERE driver_id = NEW.driver_id AND is_active
          AND license_expiry >= NEW.end_ts::date) THEN
    RAISE EXCEPTION 'Driver is inactive or the licence expires before the trip ends';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_driver_guard
  BEFORE INSERT OR UPDATE OF driver_id ON bookings
  FOR EACH ROW EXECUTE FUNCTION fn_driver_guard();

-- ---------- 6. VIEWS ---------------------------------------------------------
CREATE VIEW v_fleet_utilization AS
SELECT v.vehicle_id, v.reg_no, v.make || ' ' || v.model AS vehicle, br.name AS branch, v.status,
       r.rental_count,
       ROUND(r.rented_days::numeric, 1)                                        AS rented_days_90d,
       LEAST(100, ROUND(100 * r.rented_days / 90.0, 1))                        AS utilization_pct,
       GREATEST(0, ROUND(100 * (1 - COALESCE(m.downtime_days, 0) / 90.0), 1))  AS uptime_pct,
       COALESCE(p.revenue, 0)                                                  AS total_revenue,
       v.odometer_km
FROM vehicles v
JOIN branches br ON br.branch_id = v.branch_id
LEFT JOIN LATERAL (
   SELECT count(*) AS rental_count,
          COALESCE(SUM(GREATEST(0, EXTRACT(EPOCH FROM
             (LEAST(COALESCE(bk.returned_ts, bk.end_ts), now()) - GREATEST(bk.start_ts, now() - INTERVAL '90 days'))) / 86400)), 0) AS rented_days
     FROM bookings bk WHERE bk.vehicle_id = v.vehicle_id AND bk.status IN ('Active','Completed')) r ON TRUE
LEFT JOIN LATERAL (
   SELECT SUM(ml.downtime_days) AS downtime_days FROM maintenance_logs ml
    WHERE ml.vehicle_id = v.vehicle_id AND ml.serviced_on >= current_date - 90) m ON TRUE
LEFT JOIN LATERAL (
   SELECT SUM(CASE WHEN pay.kind = 'Refund' THEN -pay.amount ELSE pay.amount END) AS revenue
     FROM payments pay JOIN bookings bk ON bk.booking_id = pay.booking_id
    WHERE bk.vehicle_id = v.vehicle_id AND pay.status = 'Paid') p ON TRUE;

CREATE VIEW v_maintenance_alerts AS
SELECT v.vehicle_id, v.reg_no, v.make || ' ' || v.model AS vehicle, v.status,
       v.odometer_km, v.last_service_km,
       (v.last_service_km + v.service_interval_km - v.odometer_km) AS km_to_service
FROM vehicles v
WHERE v.status IN ('Maintenance_Required','Under_Maintenance')
   OR (v.last_service_km + v.service_interval_km - v.odometer_km) <= v.service_interval_km * 0.1;

CREATE VIEW v_expiring_documents AS
SELECT 'Vehicle'::text AS owner_type, v.reg_no::text AS owner_ref, d.doc_type::text, d.expiry_date, (d.expiry_date - current_date) AS days_left
  FROM vehicles v
  CROSS JOIN LATERAL (VALUES ('Registration', v.registration_expiry),
                             ('Insurance',    v.insurance_expiry),
                             ('Pollution (PUC)', v.puc_expiry)) AS d(doc_type, expiry_date)
 WHERE d.expiry_date <= current_date + 30
UNION ALL
SELECT 'Driver', dr.full_name::text, 'Driving licence', dr.license_expiry, (dr.license_expiry - current_date)
  FROM drivers dr WHERE dr.is_active AND dr.license_expiry <= current_date + 30;

CREATE VIEW v_driver_performance AS
SELECT d.driver_id, d.full_name, d.license_expiry, d.is_active,
       count(b.booking_id) FILTER (WHERE b.status = 'Completed') AS trips_completed,
       ROUND(AVG(r.rating), 2) AS avg_rating
FROM drivers d
LEFT JOIN bookings b ON b.driver_id = d.driver_id
LEFT JOIN reviews  r ON r.booking_id = b.booking_id
GROUP BY d.driver_id;
