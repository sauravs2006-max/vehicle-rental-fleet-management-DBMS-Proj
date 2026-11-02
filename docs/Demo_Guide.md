# Demo guide (about 10 minutes, ordered by the marking scheme)

Start with `npm run dev`. Keep two browser windows: admin and customer (use a private window for the second). Logins are in the README.

| Marks | Item | What to show |
|---|---|---|
| 5 | Database design | `docs/ER_Diagram.mmd` (render it on mermaid.live) and `docs/Relational_Schema.md`. Mention the 10 tables, the PK/FK links, and that inspections and telematics are in MongoDB. |
| 9 | Database creation | `db/schema.sql`: CREATE / ALTER / DROP, CHECK, UNIQUE, the EXCLUDE constraint, indexes, views. For MongoDB: `scripts/init-mongo.mjs` (validator + indexes). Technology justification: README table "Why two databases". |
| 8 | SQL operations and queries | Dashboard, Analytics tab: click Q1 to Q11. Each shows the SQL, the technique (JOIN, HAVING, correlated NOT EXISTS, scalar subquery, window function, CTE, recursive CTE) and the result. DML: add a vehicle, edit its rate, remove it (Fleet tab). |
| 13 | Advanced concepts | Log a service on a flagged vehicle (Fleet tab): trigger resets the counter. Customer books; admin rejects (Bookings tab): `sp_reject_booking` refunds and frees the slot. Mention `calc_fare()` and the other triggers. Run `db/tests.sql` (22 checks) in a terminal. |
| 7 | MongoDB feature (RUD) | Inspections tab: Add, Edit, Delete an inspection. Show the validator rejecting a bad severity with `npm run test:mongo:validation`. Analytics tab: telematics (aggregation pipeline). |
| 5 | Web app + integration | Walk through catalog filters, the live price quote, booking, history. Point at `app/api/...` route handlers and `.env.local` (no secrets in code). |
| 4 | Authentication and roles | Log in as customer: no admin pages, no Reject button. Log in as admin: no Write review / Raise complaint. In `psql`, run `db/rbac-tests.sql` (9 checks): roles and row-level security. |
| 6 | Docs, GitHub, testing, originality | README, `docs/`, test results, commit history showing both members. Be ready to explain any file. |

## A short story that touches most items
1. Customer (Priya) books a car for next week. Show the quote (`calc_fare`).
2. Admin: Bookings tab, the chauffeur is "sick", click Reject, choose "Driver unavailable". Priya's booking page now shows the reason and the refund.
3. Customer books the same dates again: it works, because the EXCLUDE constraint only counts Confirmed/Active bookings.
4. Admin: Fleet tab, log a service on a vehicle flagged for maintenance. It becomes Available (trigger).
5. Admin: Inspections tab, edit the severity of an inspection. Open Analytics, run Q11 (recursive CTE) to show upcoming service milestones.

## Questions to be ready for
- Why is `bookings` protected by an EXCLUDE constraint and not just a check in the app?
- What happens if PostgreSQL fails after the Mongo inspection was saved? (compensation in the return route)
- Why MongoDB for inspections but PostgreSQL for payments?
- What does `withDbRole()` do and why does the booking history use it?
- Add a column / trigger / endpoint live (they may ask).
