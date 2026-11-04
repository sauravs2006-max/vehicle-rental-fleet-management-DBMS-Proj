# FleetRent: Vehicle Rental and Fleet Management System

FleetRent is a web app for a small car rental business. Customers search for a car by dates, pay, and manage their bookings. Admins run the fleet: they check cars in and out, log services, watch document expiry dates, reject bookings when something falls through, and look at the numbers.

We built it for the DBMS Experiential Learning Level 3 project at PES University (course instructor: Dr. Nagasundari S). The main goal was to make the database do real work instead of just storing rows. Pricing, double-booking prevention, service tracking and refunds are all handled in PostgreSQL, and the inspection reports and telematics live in MongoDB.

Stack: Next.js (App Router, TypeScript, Tailwind), PostgreSQL 16, MongoDB 7.

## Features

**Customers**
- Search vehicles by pick-up and return time, branch, category, fuel type, seats and daily price.
- See the price before paying: base fare, distance charge and loyalty discount.
- Book and pay (simulated), then view booking history.
- After a completed trip, leave a review or raise a complaint.
- If an admin rejects an upcoming booking, the reason is shown and the money is refunded.

**Admins**
- **Overview:** net revenue, fleet size, active and upcoming rentals, open disputes, and bookings and revenue per branch for the last 7 days.
- **Bookings:** assign a chauffeur, check a vehicle back in (late fees, early-return refunds, damage), reject an upcoming booking, resolve disputes.
- **Fleet:** add, edit and remove vehicles, log services, see utilisation, service alerts, expiring documents and chauffeur ratings.
- **Inspections:** create, edit and delete inspection reports stored in MongoDB.
- **Analytics:** telematics from a MongoDB aggregation, plus SQL reports that run directly from `db/queries.sql`.

Admins can't write reviews or raise complaints. Customers can't see the admin pages.

## Requirements

- **Node.js 20.6 or newer.** Get the LTS version from nodejs.org. Check with `node -v`.
- **Docker Desktop**, to run PostgreSQL and MongoDB in containers. If you'd rather install the databases directly, PostgreSQL 16 and MongoDB 7 work too (see the note at the end of the setup section).
- **Git**, if you're cloning the repository.

## Setup and run

The commands below are for Windows PowerShell. Mac and Linux users can use the same commands in a terminal; the differences are noted.

### 1. Open the project folder

```powershell
cd fleet-rental
```

### 2. Start the databases

Open Docker Desktop and wait until it says the engine is running. Then run:

```powershell
docker run -d --name pg    -p 5432:5432 -e POSTGRES_USER=fleet -e POSTGRES_PASSWORD=fleet -e POSTGRES_DB=fleetdb postgres:16
docker run -d --name mongo -p 27017:27017 mongo:7
```

You only need these two commands the first time. After that, start the containers with:

```powershell
docker start pg mongo
```

### 3. Create the environment file

```powershell
cp .env.example .env.local
```

Open `.env.local` and set `JWT_SECRET` to a random string of at least 32 characters. To generate one on Windows:

```powershell
[Convert]::ToBase64String((1..36 | ForEach-Object { Get-Random -Maximum 256 }))
```

On Mac or Linux, use `openssl rand -base64 36`.

The database settings in `.env.example` already match the containers above, so you don't need to change them. Here is what each variable does:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | PostgreSQL connection string used by the app and the setup scripts |
| `MONGODB_URI` | MongoDB connection string (inspections and telematics) |
| `JWT_SECRET` | Signs login sessions. Keep it secret and don't commit it. |

`.env.local` is listed in `.gitignore`, so your secret stays on your machine.

### 4. Install, build the database, and start the app

```powershell
npm install
npm run db:reset
npm run dev
```

`npm run db:reset` drops and rebuilds everything. It applies the schema, creates the database roles and row-level security policies, sets up the MongoDB collection with its validator and indexes, and loads demo data. A successful run ends with lines like these:

```
✔ schema applied
✔ roles and row-level security applied
✔ MongoDB ready: inspections validator + indexes
✔ seeded: 261 completed bookings, 522 inspection docs, 2574 telematics readings
```

If it fails with a connection error, PostgreSQL is probably still starting. Wait about ten seconds and run it again.

When `npm run dev` says it's ready, open **http://localhost:3000**.

### 5. Log in

| Role | Email | Password |
|---|---|---|
| Admin | admin@fleet.test | Admin@123 |
| Customer | priya@example.com | Customer@123 |

These accounts come from the demo data. You can also register a new customer from the login page.

### Starting it again later

```powershell
docker start pg mongo
npm run dev
```

You don't need `db:reset` again unless you want the demo data back in its original state. It erases anything you added.

### Mac and Linux

Replace the PowerShell-only pieces like this:
- Generate the secret with `openssl rand -base64 36`.
- Run the tests with `docker exec -i pg psql -U fleet -d fleetdb -v ON_ERROR_STOP=1 < db/tests.sql` instead of `Get-Content ... |`.

Everything else is the same.

### Running without Docker

If you install PostgreSQL 16 and MongoDB 7 directly, create the database and user yourself:

```sql
CREATE USER fleet WITH SUPERUSER PASSWORD 'fleet';
CREATE DATABASE fleetdb OWNER fleet;
```

Then continue from step 3. Keep the MongoDB server on its default port (27017), or change `MONGODB_URI` to match.

## Tests

With the databases running and `db:reset` done:

```powershell
Get-Content db\tests.sql      | docker exec -i pg psql -U fleet -d fleetdb -v ON_ERROR_STOP=1
Get-Content db\rbac-tests.sql | docker exec -i pg psql -U fleet -d fleetdb -v ON_ERROR_STOP=1
npm run test:mongo:validation
npm run typecheck
```

- `db/tests.sql` has 22 checks: constraints, triggers, procedures, the fare function, a view and two CTEs. Every line should say PASS.
- `db/rbac-tests.sql` has 9 checks for database roles and row-level security.
- `test:mongo:validation` checks that the MongoDB validator accepts a valid inspection and rejects a bad severity.
- `typecheck` runs the TypeScript compiler without building.

The SQL tests run inside transactions and roll back, so they don't change the demo data.

## A short tour

1. Log in as **Priya** and book a car for next week. Change the dates and watch the quote update.
2. Log in as **admin** in a private window. Open **Bookings**, find Priya's booking, and click **Reject**.
3. Back in Priya's window, **My bookings** shows the booking as cancelled, with the reason and the refund.
4. Book the same car for the same dates. It works, because rejected bookings don't block the car.
5. As admin, open **Fleet**. Click **Service** on a car flagged for maintenance. A trigger clears the flag.
6. Open **Analytics** and click through the SQL reports. Each one shows the query next to its result.

The demo data has a few cases set up on purpose:
- The Honda City is 200 km from its service limit. Book it for 350 km and check it in, and it gets flagged.
- The Kia Seltos is a few hours overdue, so returning it triggers a late fee.
- The BMW 3 Series has insurance expiring in 12 days, so bookings past that date are refused.

## Project structure

```
app/              pages and API route handlers (Next.js App Router)
components/       shared UI components
lib/              database helpers, auth, validation, report loader
db/
  schema.sql      tables, constraints, indexes, views, functions, procedures, triggers
  rbac.sql        database roles and row-level security
  queries.sql     the reports shown in the Analytics tab
  tests.sql       SQL test suite
  rbac-tests.sql  security test suite
scripts/          database setup, demo data, MongoDB setup and its test
docs/             diagrams, schema, data dictionary, architecture, API notes, demo guide, test results, screenshots
```

## How the database is designed

**Why two databases.** Bookings, payments, vehicles and users are related to each other and involve money, so they go in PostgreSQL. Foreign keys, CHECK constraints and transactions matter there. Inspection reports and telematics are different. Each inspection has a different set of notes and photos, and telematics is a large stream of small readings. MongoDB suits that data, and an aggregation pipeline handles the summaries.

**Linking the two.** `damage_reports.mongo_inspection_id` stores the MongoDB id of the matching inspection. There's no transaction across both databases, so the check-in code writes the MongoDB document first, runs the PostgreSQL work, and deletes the MongoDB document if PostgreSQL fails.

**Keeping data correct inside the database:**
- An `EXCLUDE` constraint stops overlapping bookings for the same car or the same chauffeur. Two people clicking Book at the same moment can't both succeed.
- `calc_fare()` calculates the price: daily rate, per-km charge, loyalty discount, one hour of grace, then a late fee.
- `sp_reject_booking()` cancels an upcoming booking, stores the reason and refunds what was paid, all in one call.
- `sp_complete_return()` handles check-in and final pricing.
- Triggers flag a car when it's over its service interval or has post-rental damage, clear that flag when a service is logged, and stop an expired-licence chauffeur from being assigned.
- Row-level security on the booking history means a customer can only read their own rows, even if the app has a bug.

More detail is in `docs/`: the ER diagram ([snapshot](docs/ER_Diagram.png), [draw.io file](docs/FleetRent_ERD.drawio), [Mermaid source](docs/ER_Diagram.mmd)), the relational schema ([diagram](docs/Schema_Diagram.png), [tables](docs/Relational_Schema.md)), [data dictionary](docs/Data_Dictionary.md), [architecture](docs/Architecture.md), [API notes](docs/API_Documentation.md), [demo guide](docs/Demo_Guide.md), [objectives and conclusion](docs/Objectives_and_Conclusion.md), [test results](docs/test-results/README.md) and [screenshots](docs/screenshots/README.md).

## Troubleshooting

| What you see | What to do |
|---|---|
| `failed to connect to the docker API` | Docker Desktop isn't running. Open it and wait for "Engine running". |
| `container ... is not running` | Docker restarted and stopped the containers. Run `docker start pg mongo`. |
| `container name "/pg" is already in use` | The container already exists. Use `docker start pg mongo` instead of `docker run`. |
| `npm is not recognized` | Node.js isn't installed, or the terminal was open during installation. Install Node LTS, close PowerShell completely, and open a new one. |
| `running scripts is disabled on this system` | Run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. |
| `db:reset` fails with `ECONNREFUSED` | PostgreSQL is still starting. Wait about ten seconds and run it again. |
| Inspections tab is empty, or telematics says MongoDB isn't reachable | The `mongo` container isn't running. Run `docker start mongo`, then reload the page. |
| `Port 3000 is already in use` | Start on another port with `npm run dev -- -p 3001`. |
| Keeps sending you back to the login page | Your session expired, or `JWT_SECRET` changed. Log in again. |

## Known limitations

- No waitlist for fully booked vehicles, and no transfers of vehicles between branches.
- Fuel is tracked through telematics readings. There's no separate fuel-log table.
- Only the booking history runs under row-level security. The other routes check roles in the application code. Moving them all under database security would need more grants and a function for availability checks.
- Payments are simulated. No real money is moved.
- Semantic search over reviews (pgvector) isn't built yet. It's the obvious next step.

## Team

| Name | USN | Main areas |
|---|---|---|
| Saurav Shashidhara | PES1UG24AM398 | Database design (ER model, schema, constraints), stored functions, procedures and triggers, roles and row-level security, booking and check-in API |
| Sateesh | PES1UG24AM397 | MongoDB (inspections validator, CRUD, telematics aggregation), SQL reports and analytics, admin dashboard UI, testing and documentation |

The commit history shows each person's contributions.
