-- Tests for db/rbac.sql (roles + row-level security). Run after `npm run db:reset`:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rbac-tests.sql
-- Everything runs in a transaction that is rolled back at the end.
BEGIN;
CREATE TEMP TABLE results (name text, passed boolean);

-- run `stmt` as the customer (user `uid`) and report whether the database refused it
CREATE FUNCTION pg_temp.denied(uid int, stmt text) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('app.current_user_id', uid::text, true);
  SET LOCAL ROLE fleet_customer;
  BEGIN
    EXECUTE stmt;
    RESET ROLE;
    RETURN false;
  EXCEPTION WHEN insufficient_privilege THEN
    RESET ROLE;
    RETURN true;
  END;
END $$;

-- run a count query as role `r` for user `uid`
CREATE FUNCTION pg_temp.count_as(r text, uid int, stmt text) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE n bigint;
BEGIN
  PERFORM set_config('app.current_user_id', COALESCE(uid::text, ''), true);
  EXECUTE format('SET LOCAL ROLE %I', r);
  EXECUTE stmt INTO n;
  RESET ROLE;
  RETURN n;
END $$;

DO $$
DECLARE cust int; other int;
BEGIN
  SELECT user_id INTO cust  FROM bookings GROUP BY user_id ORDER BY count(*) DESC LIMIT 1;
  SELECT user_id INTO other FROM users WHERE role = 'customer' AND user_id <> cust LIMIT 1;

  INSERT INTO results VALUES ('admin role sees every booking',
    pg_temp.count_as('fleet_admin', 1, 'SELECT count(*) FROM bookings') = (SELECT count(*) FROM bookings));
  INSERT INTO results VALUES ('customer sees only own bookings',
    pg_temp.count_as('fleet_customer', cust, 'SELECT count(*) FROM bookings') > 0
    AND pg_temp.count_as('fleet_customer', cust, format('SELECT count(*) FROM bookings WHERE user_id <> %s', cust)) = 0);
  INSERT INTO results VALUES ('customer with no identity sees zero bookings',
    pg_temp.count_as('fleet_customer', NULL, 'SELECT count(*) FROM bookings') = 0);
  INSERT INTO results VALUES ('customer sees only own user row',
    pg_temp.count_as('fleet_customer', cust, 'SELECT count(*) FROM users') = 1);
  INSERT INTO results VALUES ('customer sees only own disputes',
    pg_temp.count_as('fleet_customer', cust, format('SELECT count(*) FROM disputes WHERE raised_by <> %s', cust)) = 0);

  INSERT INTO results VALUES ('customer cannot read payments',
    pg_temp.denied(cust, 'SELECT count(*) FROM payments'));
  INSERT INTO results VALUES ('customer cannot read password hashes',
    pg_temp.denied(cust, 'SELECT password_hash FROM users'));
  INSERT INTO results VALUES ('customer cannot delete bookings',
    pg_temp.denied(cust, 'DELETE FROM bookings'));
  INSERT INTO results VALUES ('customer cannot book on behalf of another user',
    pg_temp.denied(cust, format($q$INSERT INTO bookings (user_id, vehicle_id, start_ts, end_ts, total_fare)
                                   VALUES (%s, 1, now() + interval '200 days', now() + interval '201 days', 1)$q$, other)));
END $$;

SELECT CASE WHEN passed THEN 'PASS' ELSE 'FAIL' END AS result, name FROM results ORDER BY passed, name;
ROLLBACK;
