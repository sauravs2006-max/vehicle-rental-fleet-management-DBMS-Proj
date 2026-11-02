-- Important queries: JOIN, GROUP BY, HAVING, ORDER BY, aggregates, subqueries, window functions, full-text, CTEs.
-- The admin dashboard (Analytics tab) runs Q1-Q7, Q10 and Q11 straight from this file, so keep each block as:
--   -- Q<number> <title> (<technique>)
--   <one SELECT statement>

-- Q1 Revenue per branch and category (JOIN + GROUP BY + SUM, refunds netted)
SELECT br.name AS branch, v.category, count(DISTINCT b.booking_id) AS bookings,
       SUM(CASE WHEN p.kind='Refund' THEN -p.amount ELSE p.amount END) AS net_revenue
FROM payments p JOIN bookings b USING (booking_id) JOIN vehicles v USING (vehicle_id) JOIN branches br USING (branch_id)
WHERE p.status = 'Paid'
GROUP BY br.name, v.category ORDER BY net_revenue DESC;

-- Q2 Repeat customers (GROUP BY + HAVING)
SELECT u.full_name, count(*) AS completed_rentals, SUM(b.total_fare) AS lifetime_spend
FROM bookings b JOIN users u USING (user_id) WHERE b.status = 'Completed'
GROUP BY u.user_id HAVING count(*) >= 3 ORDER BY lifetime_spend DESC;

-- Q3 Idle vehicles: no rental in the last 10 days (correlated NOT EXISTS subquery)
SELECT v.reg_no, v.make, v.model FROM vehicles v
WHERE v.status = 'Available' AND NOT EXISTS (
  SELECT 1 FROM bookings b WHERE b.vehicle_id = v.vehicle_id AND b.status IN ('Active','Completed')
     AND b.start_ts > now() - INTERVAL '10 days');

-- Q4 Vehicles rated above the fleet average (scalar subquery)
SELECT v.reg_no, ROUND(AVG(r.rating),2) AS avg_rating
FROM reviews r JOIN vehicles v USING (vehicle_id) GROUP BY v.vehicle_id
HAVING AVG(r.rating) > (SELECT AVG(rating) FROM reviews) ORDER BY avg_rating DESC;

-- Q5 Rank vehicles by revenue inside each branch (window function)
SELECT branch, vehicle, total_revenue, RANK() OVER (PARTITION BY branch ORDER BY total_revenue DESC) AS rank_in_branch
FROM v_fleet_utilization;

-- Q6 Late-return rate per vehicle (aggregate FILTER)
SELECT v.reg_no, count(*) AS rentals,
       count(*) FILTER (WHERE b.returned_ts > b.end_ts + INTERVAL '1 hour') AS late_returns
FROM bookings b JOIN vehicles v USING (vehicle_id) WHERE b.status = 'Completed' GROUP BY v.reg_no ORDER BY late_returns DESC;

-- Q7 Full-text search over customer reviews (GIN index)
SELECT v.make || ' ' || v.model AS vehicle, r.comment, ts_rank(r.search, q) AS rank
FROM reviews r JOIN vehicles v USING (vehicle_id), websearch_to_tsquery('english', 'brake noise OR weak AC') q
WHERE r.search @@ q ORDER BY rank DESC;

-- Q8 Pricing function (stored function)
SELECT * FROM calc_fare(5, now() + INTERVAL '1 day', now() + INTERVAL '4 days', 300);
-- Q9 UPDATE and DELETE examples (DML)
UPDATE vehicles SET daily_rate = daily_rate * 1.05 WHERE category = 'Luxury';
DELETE FROM disputes WHERE status = 'Rejected' AND resolved_at < now() - INTERVAL '1 year';


-- Q10 Daily availability and net revenue per branch (CTE + generate_series)
-- $1 = number of days; the dashboard uses 7, the API endpoint /api/admin/analytics/branch-daily-availability-revenue allows up to 90.
WITH date_series AS (
  SELECT generate_series(
    CURRENT_DATE - ($1::int - 1),
    CURRENT_DATE,
    INTERVAL '1 day'
  )::date AS day
),
branch_days AS (
  SELECT br.branch_id, br.name AS branch, ds.day
  FROM branches br CROSS JOIN date_series ds
),
availability AS (
  SELECT bd.branch_id, bd.branch, bd.day,
         COUNT(v.vehicle_id)::int AS total_vehicles,
         COUNT(v.vehicle_id) FILTER (
           WHERE NOT EXISTS (
             SELECT 1
             FROM bookings b
             WHERE b.vehicle_id = v.vehicle_id
               AND b.status IN ('Confirmed', 'Active')
               AND b.start_ts < (bd.day + INTERVAL '1 day')
               AND b.end_ts > bd.day::timestamptz
           )
         )::int AS available_vehicles
  FROM branch_days bd
  LEFT JOIN vehicles v ON v.branch_id = bd.branch_id
  GROUP BY bd.branch_id, bd.branch, bd.day
),
daily_revenue AS (
  SELECT v.branch_id, p.paid_at::date AS day,
         SUM(CASE WHEN p.kind = 'Refund' THEN -p.amount ELSE p.amount END)::numeric(12,2) AS net_revenue
  FROM payments p
  JOIN bookings b ON b.booking_id = p.booking_id
  JOIN vehicles v ON v.vehicle_id = b.vehicle_id
  WHERE p.status = 'Paid'
    AND p.paid_at >= CURRENT_DATE - ($1::int - 1)
    AND p.paid_at < CURRENT_DATE + INTERVAL '1 day'
  GROUP BY v.branch_id, p.paid_at::date
)
SELECT a.branch_id, a.branch, a.day,
       a.total_vehicles, a.available_vehicles,
       COALESCE(r.net_revenue, 0)::numeric(12,2) AS net_revenue
FROM availability a
LEFT JOIN daily_revenue r ON r.branch_id = a.branch_id AND r.day = a.day
ORDER BY a.day, a.branch;

-- Q11 Next three service milestones per vehicle (recursive CTE)
WITH RECURSIVE milestones AS (
  SELECT v.vehicle_id, v.reg_no, v.make || ' ' || v.model AS vehicle, v.odometer_km,
         v.last_service_km + v.service_interval_km AS due_km, v.service_interval_km, 1 AS service_no
    FROM vehicles v WHERE v.status <> 'Out_of_Service'
  UNION ALL
  SELECT m.vehicle_id, m.reg_no, m.vehicle, m.odometer_km,
         m.due_km + m.service_interval_km, m.service_interval_km, m.service_no + 1
    FROM milestones m WHERE m.service_no < 3
)
SELECT vehicle, reg_no, service_no, due_km, due_km - odometer_km AS km_from_now
  FROM milestones ORDER BY vehicle_id, service_no;

-- Q12 Reject an upcoming booking (stored procedure: cancels, records the reason, refunds the customer)
-- CALL sp_reject_booking(<booking_id>, 'Driver unavailable');
