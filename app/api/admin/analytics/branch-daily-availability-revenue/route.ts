import { z } from "zod";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";

const paramsSchema = z.coerce.number().int().min(1).max(90).default(30);

// GET /api/admin/analytics/branch-daily-availability-revenue?days=30
// CTE uses generate_series to produce every day even when no bookings/revenue exist.
export const GET = route(async (req) => {
  await requireRole("admin");
  const parsed = paramsSchema.safeParse(req.nextUrl.searchParams.get("days") ?? "30");
  if (!parsed.success) throw new HttpError(400, "days must be an integer between 1 and 90");
  const days = parsed.data;
  const result = await query(`
    WITH date_series AS (
      SELECT generate_series(
        CURRENT_DATE - ($1::int - 1),
        CURRENT_DATE,
        INTERVAL '1 day'
      )::date AS day
    ),
    branch_days AS (
      SELECT br.branch_id, br.name AS branch, ds.day
      FROM branches br CROSS JOIN date_series ds
    ),
    availability AS (
      SELECT bd.branch_id, bd.branch, bd.day,
             COUNT(v.vehicle_id)::int AS total_vehicles,
             COUNT(v.vehicle_id) FILTER (
               WHERE NOT EXISTS (
                 SELECT 1 FROM bookings b
                 WHERE b.vehicle_id = v.vehicle_id
                   AND b.status IN ('Confirmed', 'Active')
                   AND b.start_ts < (bd.day + INTERVAL '1 day')
                   AND b.end_ts > bd.day::timestamptz
               )
             )::int AS available_vehicles
      FROM branch_days bd
      LEFT JOIN vehicles v ON v.branch_id = bd.branch_id
      GROUP BY bd.branch_id, bd.branch, bd.day
    ),
    daily_revenue AS (
      SELECT v.branch_id, p.paid_at::date AS day,
             SUM(CASE WHEN p.kind = 'Refund' THEN -p.amount ELSE p.amount END)::numeric(12,2) AS net_revenue
      FROM payments p
      JOIN bookings b ON b.booking_id = p.booking_id
      JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      WHERE p.status = 'Paid'
        AND p.paid_at >= CURRENT_DATE - ($1::int - 1)
        AND p.paid_at < CURRENT_DATE + INTERVAL '1 day'
      GROUP BY v.branch_id, p.paid_at::date
    ),
    daily_bookings AS (
      SELECT v.branch_id, b.created_at::date AS day, COUNT(*)::int AS bookings
      FROM bookings b
      JOIN vehicles v ON v.vehicle_id = b.vehicle_id
      WHERE b.status <> 'Cancelled'
        AND b.created_at >= CURRENT_DATE - ($1::int - 1)
        AND b.created_at < CURRENT_DATE + INTERVAL '1 day'
      GROUP BY v.branch_id, b.created_at::date
    )
    SELECT a.branch_id, a.branch, a.day,
           a.total_vehicles, a.available_vehicles,
           COALESCE(db.bookings, 0)::int AS bookings,
           COALESCE(r.net_revenue, 0)::numeric(12,2) AS net_revenue
    FROM availability a
    LEFT JOIN daily_revenue r ON r.branch_id = a.branch_id AND r.day = a.day
    LEFT JOIN daily_bookings db ON db.branch_id = a.branch_id AND db.day = a.day
    ORDER BY a.day, a.branch
  `, [days]);
  return json({ days, count: result.rowCount, rows: result.rows });
});
