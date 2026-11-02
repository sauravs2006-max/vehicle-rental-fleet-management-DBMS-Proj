import { query, withTransaction } from "@/lib/db";
import { getMongo } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { HttpError, intParam, json, route } from "@/lib/http";
import { returnSchema } from "@/lib/validation";
import { toInspectionSeverity } from "@/lib/severity";

// Admin check-in touches both databases:
//   1. save the inspection document in MongoDB
//   2. CALL sp_complete_return() in PostgreSQL (re-price, payments, vehicle status, damage report, loyalty)
//   3. if step 2 fails, delete the Mongo document again (there's no two-phase commit across the two DBs)
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam(params.id);
  const b = returnSchema.parse(await req.json());

  const bk = await query("SELECT vehicle_id FROM bookings WHERE booking_id = $1", [id]);
  if (!bk.rowCount) throw new HttpError(404, "Booking not found");

  const mongo = await getMongo();
  const ins = await mongo.collection("inspections").insertOne({
    booking_id: id, vehicle_id: bk.rows[0].vehicle_id, stage: "post_rental", severity: toInspectionSeverity(b.severity),
    status: "Recorded", inspection_date: new Date(),
    notes: b.notes, checklist: b.checklist ?? {}, photo_references: [],
    inspector_id: s.userId, created_at: new Date(),
  });

  try {
    await withTransaction((c) => c.query(
      "CALL sp_complete_return($1::int, $2::timestamptz, $3::int, $4::text, $5::text, $6::text)",
      [id, b.returnedAt ?? new Date().toISOString(), b.actualKm, b.severity, b.notes, ins.insertedId.toString()]));
  } catch (e) {
    await mongo.collection("inspections").deleteOne({ _id: ins.insertedId });
    throw e;
  }

  const out = await query(
    `SELECT b.booking_id, b.status, b.total_fare, v.status AS vehicle_status,
            (SELECT json_agg(json_build_object('kind', kind, 'amount', amount) ORDER BY payment_id)
               FROM payments WHERE booking_id = b.booking_id) AS payments
       FROM bookings b JOIN vehicles v USING (vehicle_id) WHERE b.booking_id = $1`, [id]);
  return json(out.rows[0]);
});
