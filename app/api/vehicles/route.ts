import { z } from "zod";
import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, route } from "@/lib/http";

const filters = z.object({
  branchId: z.coerce.number().int().positive().optional(),
  category: z.enum(["Hatchback", "Sedan", "SUV", "Van", "Luxury"]).optional(),
  fuel: z.enum(["Petrol", "Diesel", "Electric", "Hybrid", "CNG"]).optional(),
  seats: z.coerce.number().int().min(1).max(15).optional(),
  maxRate: z.coerce.number().positive().optional(),
  start: z.string().datetime({ offset: true }).optional(),
  end: z.string().datetime({ offset: true }).optional(),
});

// Catalog with filters. Availability is date-range based (no overlapping live booking), not a flag.
export const GET = route(async (req) => {
  await requireRole("customer", "admin");
  const f = filters.parse(Object.fromEntries(req.nextUrl.searchParams));
  const { rows } = await query(
    `SELECT v.vehicle_id, v.reg_no, v.make, v.model, v.category, v.fuel_type, v.seats, v.daily_rate, v.per_km_rate,
            v.status, br.name AS branch_name, br.city, COALESCE(r.avg_rating, 0) AS avg_rating, COALESCE(r.cnt, 0) AS review_count
       FROM vehicles v
       JOIN branches br ON br.branch_id = v.branch_id
       LEFT JOIN LATERAL (SELECT ROUND(AVG(rating),1) AS avg_rating, count(*) AS cnt FROM reviews WHERE vehicle_id = v.vehicle_id) r ON TRUE
      WHERE v.status NOT IN ('Maintenance_Required','Under_Maintenance','Out_of_Service')
        AND ($1::int  IS NULL OR v.branch_id = $1)
        AND ($2::text IS NULL OR v.category  = $2)
        AND ($3::text IS NULL OR v.fuel_type = $3)
        AND ($4::int  IS NULL OR v.seats    >= $4)
        AND ($5::numeric IS NULL OR v.daily_rate <= $5)
        AND ($6::timestamptz IS NULL OR $7::timestamptz IS NULL OR NOT EXISTS (
              SELECT 1 FROM bookings bk
               WHERE bk.vehicle_id = v.vehicle_id AND bk.status IN ('Confirmed','Active')
                 AND tstzrange(bk.start_ts, bk.end_ts, '[)') && tstzrange($6::timestamptz, $7::timestamptz, '[)')))
      ORDER BY v.daily_rate`,
    [f.branchId ?? null, f.category ?? null, f.fuel ?? null, f.seats ?? null, f.maxRate ?? null, f.start ?? null, f.end ?? null]);
  return json(rows);
});
