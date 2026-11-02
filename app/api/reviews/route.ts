import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { reviewSchema } from "@/lib/validation";

export const POST = route(async (req) => {
  const s = await requireRole("customer");
  const b = reviewSchema.parse(await req.json());
  const bk = await query("SELECT vehicle_id FROM bookings WHERE booking_id = $1 AND user_id = $2", [b.bookingId, s.userId]);
  if (!bk.rowCount) throw new HttpError(404, "Booking not found");
  // trg_review_guard (DB) additionally enforces 'completed booking by this renter'
  const { rows } = await query(
    `INSERT INTO reviews (booking_id, user_id, vehicle_id, rating, comment) VALUES ($1,$2,$3,$4,$5) RETURNING review_id`,
    [b.bookingId, s.userId, bk.rows[0].vehicle_id, b.rating, b.comment ?? null]);
  return json({ ...rows[0], dbEffect: `INSERT reviews: review ${rows[0].review_id} saved for booking ${b.bookingId}; trg_review_guard confirmed it is your completed booking.` }, 201);
});

// Full-text search over review comments (GIN index on the generated tsvector column)
export const GET = route(async (req) => {
  await requireRole("customer", "admin");
  const q = req.nextUrl.searchParams.get("q")?.trim();
  if (!q) throw new HttpError(400, "Query parameter q is required");
  const { rows } = await query(
    `SELECT r.review_id, r.rating, r.comment, v.make || ' ' || v.model AS vehicle,
            ts_rank(r.search, websearch_to_tsquery('english', $1)) AS rank
       FROM reviews r JOIN vehicles v USING (vehicle_id)
      WHERE r.search @@ websearch_to_tsquery('english', $1)
      ORDER BY rank DESC LIMIT 20`, [q]);
  return json(rows);
});
