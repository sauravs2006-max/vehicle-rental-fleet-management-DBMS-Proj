import { withTransaction } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, intParam, json, route } from "@/lib/http";
import { resolveSchema } from "@/lib/validation";

// Dispute resolution = one transaction: close the dispute AND (optionally) issue the refund payment.
export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  const s = await requireRole("admin");
  const id = intParam(params.id);
  const b = resolveSchema.parse(await req.json());
  if (b.status === "Rejected" && b.refund > 0) throw new HttpError(422, "A rejected dispute cannot carry a refund");

  await withTransaction(async (c) => {
    const d = await c.query("SELECT booking_id, status FROM disputes WHERE dispute_id = $1 FOR UPDATE", [id]);
    if (!d.rowCount) throw new HttpError(404, "Dispute not found");
    if (d.rows[0].status !== "Open") throw new HttpError(409, "Dispute is already closed");
    const bookingId = d.rows[0].booking_id;

    if (b.refund > 0) {
      const net = await c.query(
        "SELECT COALESCE(SUM(CASE WHEN kind='Refund' THEN -amount ELSE amount END),0) AS net FROM payments WHERE booking_id=$1 AND status='Paid'", [bookingId]);
      if (b.refund > Number(net.rows[0].net)) throw new HttpError(422, "Refund exceeds the amount paid for this booking");
      await c.query("INSERT INTO payments (booking_id, amount, method, kind) VALUES ($1,$2,'Wallet','Refund')", [bookingId, b.refund]);
    }
    await c.query(
      `UPDATE disputes SET status=$1, resolution_note=$2, refund_amount=$3, resolved_by=$4, resolved_at=now() WHERE dispute_id=$5`,
      [b.status, b.note, b.refund, s.userId, id]);
  });
  return json({ ok: true });
});
