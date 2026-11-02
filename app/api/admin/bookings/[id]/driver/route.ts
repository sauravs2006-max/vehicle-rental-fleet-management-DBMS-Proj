import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, intParam, json, route } from "@/lib/http";
import { assignDriverSchema } from "@/lib/validation";

// Chauffeur assignment. Double-booking is rejected by excl_driver_overlap (23P01);
// expired licences / inactive drivers by trg_driver_guard.
export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  await requireRole("admin");
  const id = intParam(params.id);
  const b = assignDriverSchema.parse(await req.json());
  const { rows } = await query(
    `UPDATE bookings SET driver_id = $1 WHERE booking_id = $2 AND status IN ('Confirmed','Active')
     RETURNING (SELECT full_name FROM drivers d WHERE d.driver_id = bookings.driver_id) AS driver_name`, [b.driverId, id]);
  if (!rows.length) throw new HttpError(404, "No open booking with that id");
  return json({ ok: true, dbEffect: rows[0].driver_name
    ? `UPDATE bookings: booking ${id} assigned to ${rows[0].driver_name}; trg_driver_guard and excl_driver_overlap allowed it.`
    : `UPDATE bookings: booking ${id} set to self-drive, driver_id cleared.` });
});
