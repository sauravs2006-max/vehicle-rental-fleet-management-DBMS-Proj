# Screenshots

Taken on 4 November 2026 with the demo data loaded.

| File | Screen | Database work shown |
|---|---|---|
| `01_customer_catalogue.png` | Customer: find a vehicle | PostgreSQL: vehicles joined to branches and reviews; `NOT EXISTS` on bookings checks the dates |
| `02_customer_bookings.png` | Customer: my bookings | PostgreSQL under role `fleet_customer`; row-level security limits it to the customer's own rows |
| `03_admin_overview.png` | Admin: overview | Scalar subqueries; CTE with `generate_series` for the last 7 days by branch |
| `04_admin_bookings.png` | Admin: active and upcoming bookings, open disputes | Joins; check-in only on Active bookings; rejection through `sp_reject_booking` |
| `05_admin_all_bookings.png` | Admin: all bookings | PostgreSQL under role `fleet_admin` |
| `06_admin_fleet.png` | Admin: fleet | View `v_fleet_utilization` |
| `07_admin_inspections.png` | Admin: inspection reports | MongoDB `inspections` collection (create, edit, delete) |
| `08_admin_analytics_telematics.png` | Admin: vehicle telematics | MongoDB aggregation pipeline |
