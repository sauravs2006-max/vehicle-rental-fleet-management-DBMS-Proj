import { query, withTransaction } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { HttpError, intParam, json, route } from "@/lib/http";
import { returnSchema } from "@/lib/validation";
import { toInspectionSeverity } from "@/lib/severity";
import { inrExact } from "@/lib/utils";

// Admin check-in of an Active booking touches both databases:
//   1. save the inspection document in MongoDB
//   2. CALL sp_complete_return() in PostgreSQL (re-price, payments, vehicle status, damage report, loyalty)
//   3. if step 2 fails, delete the Mongo document again (there's no two-phase commit across the two DBs)
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam(params.id);
  const b = returnSchema.parse(await req.json());

  // A booking whose pickup time has passed counts as Active, even if nothing has promoted it yet.
  await query("CALL sp_activate_due_bookings()");
  const bk = await query("SELECT vehicle_id, status FROM bookings WHERE booking_id = $1", [id]);
  if (!bk.rowCount) throw new HttpError(404, "Booking not found");
  if (bk.rows[0].status !== "Active") throw new HttpError(422, `Only Active bookings can be checked in; booking ${id} is ${bk.rows[0].status}`);

  const mongo = await getMongo();
  const ins = await mongo.collection("inspections").insertOne({
    booking_id: id, vehicle_id: bk.rows[0].vehicle_id, stage: "post_rental", severity: toInspectionSeverity(b.severity),
    status: "Recorded", inspection_date: new Date(),
    notes: b.notes, checklist: b.checklist ?? {}, photo_references: [],
    inspector_id: s.userId, created_at: new Date(),
  });

  let settled;
  try {
    settled = await withTransaction(async (c) => {
      const before = await c.query("SELECT COALESCE(MAX(payment_id), 0) AS last FROM payments WHERE booking_id = $1", [id]);
      await c.query(
        "CALL sp_complete_return($1::int, $2::timestamptz, $3::int, $4::text, $5::text, $6::text)",
        [id, b.returnedAt ?? new Date().toISOString(), b.actualKm, b.severity, b.notes, ins.insertedId.toString()]);
      // The procedure has no OUT parameters: read back what calc_fare() priced and what it inserted.
      const fare = await c.query(
        `SELECT f.* FROM bookings b CROSS JOIN LATERAL
           calc_fare(b.vehicle_id, b.start_ts, b.end_ts, b.actual_distance_km, b.returned_ts, b.loyalty_discount) f
          WHERE b.booking_id = $1`, [id]);
      const paid = await c.query("SELECT kind, amount FROM payments WHERE booking_id = $1 AND payment_id > $2", [id, before.rows[0].last]);
      return { fare: fare.rows[0], payment: paid.rows[0] };
    });
  } catch (e) {
    await mongo.collection("inspections").deleteOne({ _id: ins.insertedId });
    throw e;
  }

  const out = await query(
    `SELECT b.booking_id, b.status, b.total_fare, v.status AS vehicle_status,
            v.odometer_km - v.last_service_km >= v.service_interval_km AS service_due,
            (SELECT json_agg(json_build_object('kind', kind, 'amount', amount) ORDER BY payment_id)
               FROM payments WHERE booking_id = b.booking_id) AS payments
       FROM bookings b JOIN vehicles v USING (vehicle_id) WHERE b.booking_id = $1`, [id]);
  const r = out.rows[0];
  const { fare, payment } = settled;
  const lateFee = Number(fare.late_fee) > 0 ? `late fee ${inrExact(fare.late_fee)}` : "no late fee";
  const settlement = payment ? `payments: ${payment.kind} ${inrExact(payment.amount)}` : "no payment inserted";
  // sp_complete_return sets the vehicle Available first; the service-due trigger fires on that update, the damage trigger only if it did not.
  const flaggedBy = r.service_due ? "trg_vehicle_service_due" : "trg_damage_flags_vehicle";
  const vehicle = r.vehicle_status === "Maintenance_Required" ? `vehicle set to Maintenance_Required by ${flaggedBy}` : `vehicle set to ${r.vehicle_status}`;
  return json({ ...r, late_fee: fare.late_fee, mongo_inspection_id: ins.insertedId, dbEffect:
    `sp_complete_return: booking ${id}; calc_fare(): ${lateFee}, fare ${inrExact(fare.total)}; ${settlement}; ${vehicle}.` });
});
