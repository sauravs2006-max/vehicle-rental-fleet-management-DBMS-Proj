-- Database-level access control: two roles + row-level security (RLS).
-- Applied automatically by `npm run db:init` (right after schema.sql); safe to re-run.
--
-- fleet_admin    full access to everything
-- fleet_customer read the catalog, and see only THEIR OWN bookings, disputes and user row
--
-- The API switches into one of these roles per request (see withDbRole in lib/db.ts) and sets
-- app.current_user_id from the verified session, never from anything the client sends.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fleet_admin')    THEN CREATE ROLE fleet_admin NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'fleet_customer') THEN CREATE ROLE fleet_customer NOLOGIN; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO fleet_admin, fleet_customer;

-- admin: everything
GRANT ALL PRIVILEGES ON ALL TABLES    IN SCHEMA public TO fleet_admin;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO fleet_admin;

-- customer: only what the booking history / catalog pages need (column-level where possible)
GRANT SELECT ON vehicles, branches TO fleet_customer;
GRANT SELECT (user_id, full_name)                           ON users    TO fleet_customer;
GRANT SELECT (driver_id, full_name)                         ON drivers  TO fleet_customer;
GRANT SELECT (review_id, booking_id)                        ON reviews  TO fleet_customer;
GRANT SELECT (booking_id, raised_by, status, created_at)    ON disputes TO fleet_customer;
GRANT SELECT, INSERT, UPDATE ON bookings TO fleet_customer;
GRANT USAGE, SELECT ON SEQUENCE bookings_booking_id_seq TO fleet_customer;
-- (no access at all to payments, maintenance_logs, damage_reports)

-- row-level security
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE users    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bookings_customer_select ON bookings;
DROP POLICY IF EXISTS bookings_customer_insert ON bookings;
DROP POLICY IF EXISTS bookings_customer_update ON bookings;
DROP POLICY IF EXISTS bookings_admin_all       ON bookings;
DROP POLICY IF EXISTS disputes_customer_select ON disputes;
DROP POLICY IF EXISTS disputes_admin_all       ON disputes;
DROP POLICY IF EXISTS users_customer_select    ON users;
DROP POLICY IF EXISTS users_admin_all          ON users;

-- "who is asking": set by the API inside each transaction; empty/missing => no rows
CREATE POLICY bookings_customer_select ON bookings FOR SELECT TO fleet_customer
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int);
CREATE POLICY bookings_customer_insert ON bookings FOR INSERT TO fleet_customer
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int);
CREATE POLICY bookings_customer_update ON bookings FOR UPDATE TO fleet_customer
  USING      (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int)
  WITH CHECK (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int);
CREATE POLICY disputes_customer_select ON disputes FOR SELECT TO fleet_customer
  USING (raised_by = NULLIF(current_setting('app.current_user_id', true), '')::int);
CREATE POLICY users_customer_select ON users FOR SELECT TO fleet_customer
  USING (user_id = NULLIF(current_setting('app.current_user_id', true), '')::int);

CREATE POLICY bookings_admin_all ON bookings FOR ALL TO fleet_admin USING (true) WITH CHECK (true);
CREATE POLICY disputes_admin_all ON disputes FOR ALL TO fleet_admin USING (true) WITH CHECK (true);
CREATE POLICY users_admin_all    ON users    FOR ALL TO fleet_admin USING (true) WITH CHECK (true);

-- Let the login the app connects with switch into these roles (SET ROLE).
GRANT fleet_admin, fleet_customer TO CURRENT_USER;
