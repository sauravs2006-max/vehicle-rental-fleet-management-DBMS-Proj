import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { disputeSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const s = await requireRole("customer");
  const b = disputeSchema.parse(await req.json());
  const bk = await query("SELECT status FROM bookings WHERE booking_id = $1 AND user_id = $2", [b.bookingId, s.userId]);
  if (!bk.rowCount) throw new HttpError(404, "Booking not found");
  if (bk.rows[0].status !== "Completed") throw new HttpError(422, "Only completed bookings can be disputed");
  const open = await query("SELECT 1 FROM disputes WHERE booking_id = $1 AND status = 'Open'", [b.bookingId]);
  if (open.rowCount) throw new HttpError(409, "A dispute is already open for this booking");
  const { rows } = await query(
    "INSERT INTO disputes (booking_id, raised_by, reason) VALUES ($1,$2,$3) RETURNING dispute_id", [b.bookingId, s.userId, b.reason]);
  return json({ ...rows[0], dbEffect: `INSERT disputes: dispute ${rows[0].dispute_id} opened for booking ${b.bookingId}, status Open.` }, 201);
});
