# API notes

All inspection and analytics endpoints require an authenticated admin session.

## Inspection endpoints
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/admin/inspections` | List inspections; optional `vehicleId` and `q` filters |
| POST | `/api/admin/inspections` | Create an inspection for an existing vehicle; optional booking must belong to that vehicle |
| GET | `/api/admin/inspections/:id` | Read one MongoDB inspection by ObjectId |
| PATCH | `/api/admin/inspections/:id` | Update notes, severity and/or photo references |
| DELETE | `/api/admin/inspections/:id` | Delete inspection; clears matching `damage_reports.mongo_inspection_id` pointers first |
| POST | `/api/bookings/:id/return` | Existing check-in workflow creates the post-rental inspection and completes the booking |

### PATCH example
```json
{
  "notes": "Checked rear bumper; scratch confirmed",
  "severity": "Medium",
  "photo_references": [
    "https://example.test/photos/rear-bumper.jpg",
    "/inspections/booking-22-side.jpg"
  ]
}
```
`photo_references` is an array of strings. Invalid ObjectIds return 400, missing documents 404, and non-admin sessions 403.

Changing `severity` also updates the matching `damage_reports` row in PostgreSQL. The two stores use different scales, so the API converts: Low ↔ None, Medium ↔ Minor, High ↔ Major (Critical is stored as Major on the SQL side).

### POST example
```json
{
  "vehicle_id": 1,
  "booking_id": 15,
  "notes": "Initial inspection completed",
  "severity": "Low",
  "photo_references": ["/inspections/vehicle-1-front.jpg"]
}
```
`inspector_id` is derived from the authenticated admin session, never from the request body.

## Booking rejection
`POST /api/admin/bookings/:id/reject` with `{ "reason": "Driver unavailable: chauffeur on sick leave" }` (admin only).

Calls `sp_reject_booking()`. Only `Confirmed` (upcoming) bookings can be rejected. The booking becomes `Cancelled` with the reason stored, a `Refund` payment is created for whatever was paid, and the vehicle and chauffeur are free for those dates again (the overlap constraints ignore cancelled bookings). Response: `{ booking_id, status, cancel_reason, refunded }`. A booking in any other state returns 422; a reason shorter than 5 characters returns 400.

## Fleet management
- `POST /api/admin/vehicles` adds a vehicle (duplicate registration returns 409).
- `PATCH /api/admin/vehicles/:id` changes `status` (Available or Out_of_Service), `dailyRate` or `perKmRate`; a rented vehicle cannot change status.
- `DELETE /api/admin/vehicles/:id` removes a vehicle. A vehicle with booking history is refused with 409 because `bookings.vehicle_id` is `ON DELETE RESTRICT`.
- `POST /api/admin/maintenance` inserts a maintenance log; the trigger `trg_after_maintenance` resets the service counter and clears the maintenance flag.

## SQL reports
`GET /api/admin/reports` lists the reports; `GET /api/admin/reports?id=3` runs one. The queries come from `db/queries.sql` (Q1-Q7, Q10, Q11) and are looked up by number, so no SQL ever comes from the client.

## CTE analytics
`GET /api/admin/analytics/branch-daily-availability-revenue?days=30`

- `days`: optional integer from 1 to 90; defaults to 30.
- Response shape: `{ "days": 30, "count": 90, "rows": [...] }` for three branches.
- Each row includes `branch_id`, `branch`, `day`, `total_vehicles`, `available_vehicles`, and `net_revenue`.
- The query uses `generate_series()` to preserve dates with no activity, excludes overlapping Confirmed/Active bookings from availability, and nets refunds against paid revenue.
