# Relational schema (PostgreSQL)

**PK** = primary key, **FK** = foreign key. Column types and the full list of CHECK constraints are in [`db/schema.sql`](../db/schema.sql) and the [data dictionary](Data_Dictionary.md). `loyalty_discount` and `cancel_reason` are added to `bookings` with `ALTER TABLE` in the schema script.

```
branches(branch_id PK, name UNIQUE, city, address)

users(user_id PK, email UNIQUE, password_hash, full_name, phone, role CHECK in ('admin','customer'),
      license_no, loyalty_points >= 0, created_at)

drivers(driver_id PK, full_name, phone, license_no UNIQUE, license_expiry, is_active)

vehicles(vehicle_id PK, branch_id FK -> branches, reg_no UNIQUE, make, model,
         category CHECK, fuel_type CHECK, seats CHECK 1..15, daily_rate > 0, per_km_rate >= 0,
         odometer_km >= 0, last_service_km <= odometer_km, service_interval_km > 0, last_service_date,
         status CHECK in ('Available','Rented','Maintenance_Required','Under_Maintenance','Out_of_Service'),
         registration_expiry, insurance_expiry, puc_expiry)

bookings(booking_id PK, user_id FK -> users, vehicle_id FK -> vehicles (ON DELETE RESTRICT),
         driver_id FK -> drivers (nullable, ON DELETE SET NULL), start_ts, end_ts, returned_ts,
         est_distance_km >= 0, actual_distance_km >= 0, total_fare >= 0,
         status CHECK in ('Confirmed','Active','Completed','Cancelled'), loyalty_discount,
         cancel_reason (at least 5 characters when Cancelled), created_at,
         CHECK end_ts > start_ts,
         EXCLUDE: no overlapping Confirmed/Active bookings for the same vehicle,
         EXCLUDE: no overlapping Confirmed/Active bookings for the same driver)

payments(payment_id PK, booking_id FK -> bookings, amount > 0, method CHECK in ('Card','UPI','Cash','Wallet'),
         kind CHECK in ('Fare','Late_Fee','Adjustment','Refund'), status CHECK in ('Paid','Pending','Failed'), paid_at)

maintenance_logs(log_id PK, vehicle_id FK -> vehicles (ON DELETE CASCADE), service_type CHECK in ('Scheduled','Repair','Inspection'),
                 description, parts_replaced, cost >= 0, odometer_km >= 0, downtime_days >= 0, serviced_on)

damage_reports(report_id PK, booking_id FK -> bookings, vehicle_id FK -> vehicles, stage CHECK in ('Pre_Rental','Post_Rental'),
               severity CHECK in ('None','Minor','Major'), notes,
               mongo_inspection_id  -- pointer to the MongoDB inspection document
               , created_at)

reviews(review_id PK, booking_id FK -> bookings UNIQUE, user_id FK -> users, vehicle_id FK -> vehicles,
        rating CHECK 1..5, comment, created_at, search tsvector GENERATED (GIN index))

disputes(dispute_id PK, booking_id FK -> bookings, raised_by FK -> users, reason (at least 10 characters),
         status CHECK in ('Open','Resolved','Rejected'), resolution_note, refund_amount >= 0,
         resolved_by FK -> users, created_at, resolved_at,
         CHECK (status = 'Open') = (resolved_at IS NULL))
```

Relationships in words:

- One branch has many vehicles.
- A user makes many bookings; a vehicle appears in many bookings; a booking optionally has one chauffeur (driver).
- A booking has many payments (fare, late fee, adjustment, refund), many damage reports (pre- and post-rental), at most one review, and any number of disputes.
- A vehicle has many maintenance logs.

If a detail here ever differs from `db/schema.sql`, trust the schema file (or run `\d bookings` in `psql`).
