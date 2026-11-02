# Test results

Commands to run from the project root (PostgreSQL and MongoDB running, `.env.local` set):

```bash
npm run db:reset
npm run typecheck
npm run build
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/tests.sql
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/rbac-tests.sql
npm run test:mongo:validation
```

Fill in the table with your own run (date, machine, and a screenshot or pasted output).

| Test | What it checks | Expected | Your result |
|---|---|---|---|
| `npm run typecheck` | TypeScript compiles | no errors | |
| `npm run build` | production build | succeeds | |
| `db/tests.sql` | constraints, triggers, procedures, fare function, view, CTEs | 22 rows, all PASS | |
| `db/rbac-tests.sql` | roles + row-level security | 9 rows, all PASS | |
| `test:mongo:validation` | `$jsonSchema` accepts a valid inspection, rejects a bad severity | 2 PASS lines | |
| Inspection CRUD in the admin UI | create, read, update, delete | works, list refreshes | |
| Reject an upcoming booking | status Cancelled, reason shown to the customer, refund created | works | |
| Add / edit / remove a vehicle | INSERT, UPDATE, DELETE; delete refused when the vehicle has bookings | works | |
