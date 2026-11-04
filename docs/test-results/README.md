# Test results

Tests were run on a freshly initialised PostgreSQL 16 database with the demo data loaded.

Commands:

```powershell
Get-Content db\tests.sql      | docker exec -i pg psql -U fleet -d fleetdb -v ON_ERROR_STOP=1
Get-Content db\rbac-tests.sql | docker exec -i pg psql -U fleet -d fleetdb -v ON_ERROR_STOP=1
npm run test:mongo:validation
npm run typecheck
```

## Summary

| Suite | Checks | Result |
|---|---|---|
| SQL constraints, procedures, triggers, CTEs, views (db/tests.sql) | 22 | All passed |
| Roles and row-level security (db/rbac-tests.sql) | 9 | All passed |
| TypeScript type check (npm run typecheck) | 1 | Passed |
| MongoDB validator (scripts/test-mongo-validation.mjs) | 2 | All passed |

## SQL checks (db/tests.sql)

| Result | Check |
|---|---|
| PASS | CHECK: cancelled booking must carry a reason |
| PASS | CHECK: end before start rejected |
| PASS | CHECK: invalid vehicle status rejected |
| PASS | CHECK: negative daily rate rejected |
| PASS | CTE: 30-day calendar has one row per branch/day |
| PASS | EXCLUDE: overlapping booking for same vehicle rejected |
| PASS | FK: booking for unknown vehicle rejected |
| PASS | PROC: only Confirmed bookings can be rejected |
| PASS | PROC: reject booking => Cancelled with reason and full refund |
| PASS | PROC: rejected booking frees the vehicle slot (EXCLUDE ignores Cancelled) |
| PASS | PROC: rejection needs a reason |
| PASS | RECURSIVE CTE: 3 service milestones per vehicle |
| PASS | TRIGGER: expired-licence driver cannot be assigned |
| PASS | TRIGGER: maintenance log => Available & counter reset |
| PASS | TRIGGER: odometer over interval => Maintenance_Required |
| PASS | TRIGGER: review requires a completed booking by the renter |
| PASS | UNIQUE: duplicate registration rejected |
| PASS | VIEW: v_fleet_utilization has one row per vehicle |
| PASS | calc_fare: 5h late => late fee > 0 |
| PASS | calc_fare: base + distance |
| PASS | calc_fare: loyalty gives 5% off base |
| PASS | calc_fare: within 1h grace => no late fee |

## Security checks (db/rbac-tests.sql)

| Result | Check |
|---|---|
| PASS | admin role sees every booking |
| PASS | customer cannot book on behalf of another user |
| PASS | customer cannot delete bookings |
| PASS | customer cannot read password hashes |
| PASS | customer cannot read payments |
| PASS | customer sees only own bookings |
| PASS | customer sees only own disputes |
| PASS | customer sees only own user row |
| PASS | customer with no identity sees zero bookings |

## MongoDB validator (npm run test:mongo:validation)

```
PASS: valid inspection document accepted
PASS: invalid severity rejected with MongoDB validation error 121
```

## Notes

- Error 121 is MongoDB's "document failed validation" code, so the validator rejected the bad severity as intended.
- The SQL and security suites were run on a freshly initialised database. The MongoDB test was run on the demo machine.
