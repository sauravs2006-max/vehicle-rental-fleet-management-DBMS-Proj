import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { intParam, json, route } from "@/lib/http";
import { rejectBookingSchema } from "@/lib/validation";

// Admin rejects an upcoming booking (e.g. the chauffeur fell ill). All the logic - status check,
// cancellation, reason, refund - lives in sp_reject_booking(); a failed rule comes back as a 422.
export const POST = route<{ params: { id: string } }>(async (req, { params }) => {
  await requireRole("admin");
  const id = intParam(params.id);
  const { reason } = rejectBookingSchema.parse(await req.json());
  await query("CALL sp_reject_booking($1, $2)", [id, reason]);
  const { rows } = await query(
    `SELECT b.booking_id, b.status, b.cancel_reason,
            COALESCE((SELECT SUM(amount) FROM payments p WHERE p.booking_id = b.booking_id AND p.kind = 'Refund'), 0) AS refunded
       FROM bookings b WHERE b.booking_id = $1`, [id]);
  return json(rows[0]);
});
