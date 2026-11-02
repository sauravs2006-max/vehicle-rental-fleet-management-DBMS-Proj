import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { quoteSchema } from "@/lib/validation";

// Live price preview - calls the calc_fare() stored function
export const GET = route(async (req) => {
  const s = await requireRole("customer", "admin");
  const q = quoteSchema.parse(Object.fromEntries([...req.nextUrl.searchParams.entries()]));
  const { rows } = await query(
    `SELECT * FROM calc_fare($1, $2::timestamptz, $3::timestamptz, $4, NULL,
            (SELECT loyalty_points >= 500 FROM users WHERE user_id = $5))`,
    [q.vehicleId, q.start, q.end, q.km, s.userId]);
  return json(rows[0]);
});
