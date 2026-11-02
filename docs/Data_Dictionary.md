# FleetRent Data Dictionary

This dictionary reflects `db/schema.sql`, `scripts/seed.mjs`, `lib/mongo.ts`, and the current API usage. PostgreSQL IDs are integer keys; MongoDB `_id` values are ObjectIds. Cross-database references are application-managed, not foreign-key constraints.

## PostgreSQL tables

### `users`
| Column | Type | Key / rules | Purpose |
|---|---|---|---|
| `user_id` | SERIAL | PK | User identifier |
| `email` | VARCHAR(150) | UNIQUE, NOT NULL, email CHECK | Login email |
| `password_hash` | TEXT | NOT NULL | bcrypt password hash; never expose through APIs |
| `full_name` | VARCHAR(100) | NOT NULL | Display name |
| `phone` | VARCHAR(20) | CHECK | Contact number |
| `role` | VARCHAR(20) | `admin` or `customer` | Application authorization role |
| `license_no` | VARCHAR(30) | nullable | Customer driving licence |
| `loyalty_points` | INT | NOT NULL, >= 0 | Loyalty balance |
| `created_at` | TIMESTAMPTZ | NOT NULL | Account creation time |

### `branches`
| Column | Type | Key / rules | Purpose |
|---|---|---|---|
| `branch_id` | SERIAL | PK | Branch identifier |
| `name` | VARCHAR(80) | UNIQUE, NOT NULL | Branch name |
| `city` | VARCHAR(60) | NOT NULL | City |
| `address` | VARCHAR(200) | NOT NULL | Street/address details |

### `vehicles`
| Column | Type | Key / rules | Purpose |
|---|---|---|---|
| `vehicle_id` | SERIAL | PK | Vehicle identifier |
| `branch_id` | INT | FK → `branches.branch_id` | Current home branch |
| `reg_no` | VARCHAR(20) | UNIQUE, NOT NULL | Registration number |
| `make`, `model` | VARCHAR | NOT NULL | Vehicle make and model |
| `category` | VARCHAR(20) | CHECK | Hatchback, Sedan, SUV, Van or Luxury |
| `fuel_type` | VARCHAR(15) | CHECK | Petrol, Diesel, Electric, Hybrid or CNG |
| `seats` | SMALLINT | 1–15 | Seating capacity |
| `daily_rate` | NUMERIC(10,2) | > 0 | Daily rental rate |
| `per_km_rate` | NUMERIC(6,2) | >= 0 | Distance charge |
| `odometer_km` | INT | >= 0 | Current odometer |
| `last_service_km` | INT | >= 0 | Odometer at last service |
| `service_interval_km` | INT | > 0 | Service interval |
| `last_service_date` | DATE | nullable | Last service date |
| `status` | VARCHAR(25) | CHECK | Availability / maintenance status |
| `registration_expiry` | DATE | NOT NULL | Registration expiry |
| `insurance_expiry` | DATE | NOT NULL | Insurance expiry |
| `puc_expiry` | DATE | NOT NULL | Pollution certificate expiry |

### `bookings`
| Column | Type | Key / rules | Purpose |
|---|---|---|---|
| `booking_id` | SERIAL | PK | Booking identifier |
| `user_id` | INT | FK → `users.user_id` | Customer who booked |
| `vehicle_id` | INT | FK → `vehicles.vehicle_id` | Rented vehicle |
| `driver_id` | INT | FK → `drivers.driver_id`, nullable | Optional chauffeur |
| `start_ts`, `end_ts` | TIMESTAMPTZ | NOT NULL; end > start | Rental window |
| `returned_ts` | TIMESTAMPTZ | nullable | Actual return timestamp |
| `est_distance_km` | INT | >= 0 | Estimated distance |
| `actual_distance_km` | INT | nullable, >= 0 | Actual distance |
| `total_fare` | NUMERIC(12,2) | >= 0 | Final / quoted fare |
| `status` | VARCHAR(15) | CHECK | Confirmed, Active, Completed or Cancelled |
| `cancel_reason` | TEXT | CHECK: required (5+ characters) when status is Cancelled | Why an admin rejected the booking |
| `created_at` | TIMESTAMPTZ | NOT NULL | Booking creation timestamp |

### Other relational tables
| Table | Primary key | Main foreign keys and purpose |
|---|---|---|
| `drivers` | `driver_id` | Chauffeur profile, unique licence, expiry and active flag |
| `payments` | `payment_id` | `booking_id` → bookings; fare, adjustment, late fee and refund transactions |
| `maintenance_logs` | `log_id` | `vehicle_id` → vehicles; service work, cost, odometer and downtime |
| `damage_reports` | `report_id` | `booking_id` → bookings, `vehicle_id` → vehicles; relational damage summary and `mongo_inspection_id` pointer |
| `reviews` | `review_id` | `booking_id` (UNIQUE), `user_id`, `vehicle_id`; rating/comment and generated full-text search vector |
| `disputes` | `dispute_id` | `booking_id`, `raised_by`, optional `resolved_by`; issue status and refund decision |

## MongoDB collections

### `inspections`
| Field | BSON type | Required / rules | Purpose |
|---|---|---|---|
| `_id` | ObjectId | MongoDB primary key | Inspection document ID |
| `vehicle_id` | int/long/double | Required | References PostgreSQL vehicle ID |
| `booking_id` | int/long/double | Optional in validator | Related booking ID |
| `inspector_id` | int/long/double | Required | User ID of inspector |
| `inspection_date` | date | Required | Inspection timestamp |
| `severity` | string | Required; one of Low / Medium / High / Critical | Inspection severity |
| `status` | string | Required | Workflow/status label |
| `notes` | string | Optional | Free-form notes |
| `photo_references` | array<string> | Optional | Photo URLs or paths |
| `stage` | string | Optional | pre_rental / post_rental |
| `checklist` | object | Optional | Flexible checklist payload |
| `created_at`, `updated_at` | date | Optional | Audit timestamps |

**Severity scales:** inspections use Low / Medium / High / Critical. `damage_reports.severity` in PostgreSQL has a CHECK constraint with None / Minor / Major, so the API maps between the two (see `lib/severity.ts`).

### `telematics`
| Field | BSON type | Purpose |
|---|---|---|
| `_id` | ObjectId | Document identifier |
| `vehicle_id` | numeric | PostgreSQL vehicle identifier |
| `ts` | date | Reading timestamp |
| `speed_kmph` | numeric | Speed reading |
| `distance_km` | numeric | Distance since previous reading |
| `fuel_litres` | numeric | Fuel consumed; zero for electric vehicles |
| `energy_kwh` | numeric | Energy consumed by electric vehicles |
| `odometer_km` | numeric | Odometer reading |
| `harsh_brake`, `harsh_accel` | boolean | Driving event flags |
| `engine_temp_c` | numeric | Engine temperature |

## Relationship cardinality summary
- One branch has many vehicles.
- One customer has many bookings; one vehicle has many bookings over time.
- A driver can be assigned to many bookings over time; a booking has zero or one driver.
- A booking has many payment rows, damage reports, and potentially disputes.
- A booking has zero or one review.
- A booking can have pre-rental and post-rental inspection documents in MongoDB.
- Telematics stores many time-series readings per vehicle.
