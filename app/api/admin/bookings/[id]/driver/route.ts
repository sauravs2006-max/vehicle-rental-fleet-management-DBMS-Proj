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
  const { rowCount } = await query(
    "UPDATE bookings SET driver_id = $1 WHERE booking_id = $2 AND status IN ('Confirmed','Active')", [b.driverId, id]);
  if (!rowCount) throw new HttpError(404, "No open booking with that id");
  return json({ ok: true });
});
