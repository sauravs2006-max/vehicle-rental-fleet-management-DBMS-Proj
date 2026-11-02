import { withDbRole, withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { bookingSchema } from "@/lib/validation";

// Booking history. Runs under the user's own database role, so the row-level-security
// policy (not just the WHERE clause below) limits a customer to their own bookings.
export const GET = route(async () => {
  const s = await requireRole("customer", "admin");
  const { rows } = await withDbRole(s, (c) => c.query(
    `SELECT b.booking_id, b.start_ts, b.end_ts, b.returned_ts, b.status, b.cancel_reason, b.total_fare, b.est_distance_km, b.actual_distance_km,
            v.make || ' ' || v.model AS vehicle, v.reg_no, br.name AS branch, dr.full_name AS driver_name,
            u.full_name AS customer_name,
            (rv.review_id IS NOT NULL) AS reviewed,
            (SELECT status FROM disputes d WHERE d.booking_id = b.booking_id ORDER BY created_at DESC LIMIT 1) AS dispute_status
       FROM bookings b
       JOIN users u    ON u.user_id = b.user_id
       JOIN vehicles v ON v.vehicle_id = b.vehicle_id
       JOIN branches br ON br.branch_id = v.branch_id
       LEFT JOIN drivers dr ON dr.driver_id = b.driver_id
       LEFT JOIN reviews rv ON rv.booking_id = b.booking_id
      WHERE ($1::text = 'admin' OR b.user_id = $2)
      ORDER BY b.start_ts DESC LIMIT 100`, [s.role, s.userId]));
  return json(rows);
});

/**
 * ACID booking workflow - one transaction:
 *   1. lock the vehicle row (serialises concurrent bookings of the same car)
 *   2. verify status + document validity + date-range availability
 *   3. price via calc_fare()
 *   4. INSERT booking, INSERT payment, UPDATE vehicle status (if pickup is imminent)
 * Any failure => ROLLBACK, nothing is half-written. The EXCLUDE constraint is the last line of defence.
 */
export const POST = route(async (req) => {
  const s = await requireRole("customer", "admin");
  const b = bookingSchema.parse(await req.json());
  const startsNow = new Date(b.start).getTime() <= Date.now() + 3_600_000;

  const result = await withTransaction(async (c) => {
    const v = await c.query(
      `SELECT vehicle_id, status, registration_expiry, insurance_expiry, puc_expiry
         FROM vehicles WHERE vehicle_id = $1 FOR UPDATE`, [b.vehicleId]);
    if (!v.rowCount) throw new HttpError(404, "Vehicle not found");
    const veh = v.rows[0];
    if (["Maintenance_Required", "Under_Maintenance", "Out_of_Service"].includes(veh.status))
      throw new HttpError(409, `Vehicle is not rentable (${veh.status})`);

    const endDay = new Date(b.end).toISOString().slice(0, 10);
    for (const [label, exp] of [["Registration", veh.registration_expiry], ["Insurance", veh.insurance_expiry], ["PUC", veh.puc_expiry]] as const) {
      if (new Date(exp).toISOString().slice(0, 10) < endDay)
        throw new HttpError(422, `${label} certificate expires before the rental ends`);
    }

    const clash = await c.query(
      `SELECT 1 FROM bookings WHERE vehicle_id = $1 AND status IN ('Confirmed','Active')
          AND tstzrange(start_ts, end_ts, '[)') && tstzrange($2::timestamptz, $3::timestamptz, '[)') LIMIT 1`,
      [b.vehicleId, b.start, b.end]);
    if (clash.rowCount) throw new HttpError(409, "Vehicle is already booked for part of that period");

    const loyal = (await c.query("SELECT loyalty_points >= 500 AS loyal FROM users WHERE user_id = $1", [s.userId])).rows[0].loyal as boolean;
    const fare = (await c.query(
      "SELECT * FROM calc_fare($1, $2::timestamptz, $3::timestamptz, $4, NULL, $5)",
      [b.vehicleId, b.start, b.end, b.estDistanceKm, loyal])).rows[0];

    const bk = (await c.query(
      `INSERT INTO bookings (user_id, vehicle_id, start_ts, end_ts, est_distance_km, total_fare, status, loyalty_discount)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING booking_id, status, total_fare`,
      [s.userId, b.vehicleId, b.start, b.end, b.estDistanceKm, fare.total, startsNow ? "Active" : "Confirmed", loyal])).rows[0];

    await c.query(
      "INSERT INTO payments (booking_id, amount, method, kind) VALUES ($1,$2,$3,'Fare')",
      [bk.booking_id, fare.total, b.paymentMethod]);

    if (startsNow) await c.query("UPDATE vehicles SET status = 'Rented' WHERE vehicle_id = $1", [b.vehicleId]);
    return { booking: bk, fare };
  });
  return json(result, 201);
});
