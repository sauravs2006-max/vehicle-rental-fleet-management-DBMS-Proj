# Project documentation additions

## Objectives

1. Model a vehicle rental business in a relational database so that the rules of the business are enforced by the database.
2. Prevent double booking of vehicles and chauffeurs with a constraint, not only with application checks.
3. Keep prices, late fees and refunds consistent by calculating them in one place.
4. Flag vehicles for service and warn about expiring documents automatically.
5. Store inspection reports and telematics in a document database where their structure can vary.
6. Give customers and admins different access, enforced in the application and in the database.
7. Provide a web interface for the main tasks, with reports that show the SQL behind them.

## Functional requirements

| ID | Requirement | Role |
|---|---|---|
| FR1 | Register, log in and log out. Passwords are stored as bcrypt hashes. Sessions last 8 hours. | Customer, Admin |
| FR2 | Search vehicles for a date range with branch, category, fuel, seat and price filters. | Customer |
| FR3 | Show a fare quote and create a booking that cannot overlap another live booking of the same vehicle. | Customer |
| FR4 | View booking history. Raise a complaint or write a review after a completed trip. | Customer |
| FR5 | Reject an upcoming booking with a reason. The amount paid is refunded and the slot is freed. | Admin |
| FR6 | Check a vehicle in. Calculate the final fare, late fee or early-return refund, and loyalty points. | Admin |
| FR7 | Add, edit and remove vehicles. Log services. Show service and document-expiry alerts. | Admin |
| FR8 | Assign a chauffeur only if the chauffeur is active and licensed for the whole trip. | Admin |
| FR9 | Create, view, edit and delete inspection reports. Show telematics analytics. | Admin |
| FR10 | Show reports: revenue by branch, repeat customers, idle vehicles, utilisation and daily availability. | Admin |

## Relations that are not entities in the ER model

- `bookings`: associative relation between users, vehicles and drivers. It has its own attributes (period, fare, status).
- `payments`, `maintenance_logs`, `damage_reports`, `reviews`, `disputes`: weak entities. They are shown as entities, but they cannot exist without their owner.
- `damage_reports.mongo_inspection_id`: a reference to a MongoDB document. It is enforced by the application, not by PostgreSQL.
- The four views (`v_fleet_utilization`, `v_maintenance_alerts`, `v_expiring_documents`, `v_driver_performance`): derived relations, not stored tables.

## Conclusion

FleetRent shows how a relational database can carry most of the rules of a business. The overlap constraint, the pricing function, the refund procedure and the service trigger work whichever screen or script makes the change. The two databases were chosen for the data they hold: PostgreSQL for linked business records, MongoDB for inspection reports and telematics. The project has limits. Payments are simulated, the waitlist and inter-branch transfers are not built, and row-level security covers only the booking, dispute and user tables. These are listed as future work.
