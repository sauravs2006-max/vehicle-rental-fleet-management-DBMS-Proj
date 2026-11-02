import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, intParam, json, route } from "@/lib/http";
import { vehiclePatchSchema } from "@/lib/validation";
import { inrExact } from "@/lib/utils";

// Change a vehicle's rates or take it in/out of service.
export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  await requireRole("admin");
  const id = intParam(params.id);
  const b = vehiclePatchSchema.parse(await req.json());
  const { rows } = await query(
    `UPDATE vehicles SET status      = COALESCE($2, status),
                         daily_rate  = COALESCE($3, daily_rate),
                         per_km_rate = COALESCE($4, per_km_rate)
      WHERE vehicle_id = $1 AND ($2::text IS NULL OR status <> 'Rented')
      RETURNING vehicle_id, status, daily_rate, per_km_rate`,
    [id, b.status ?? null, b.dailyRate ?? null, b.perKmRate ?? null]);
  if (!rows.length) throw new HttpError(409, "Vehicle not found, or it is rented out right now");
  const v = rows[0];
  return json({ ...v, dbEffect: `UPDATE vehicles: vehicle ${id} is now ${v.status}, daily rate ${inrExact(v.daily_rate)}, per-km rate ${inrExact(v.per_km_rate)}.` });
});

// Remove a vehicle. bookings.vehicle_id is ON DELETE RESTRICT, so a vehicle with rental history
// cannot be deleted - mark it Out of Service instead.
export const DELETE = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requireRole("admin");
  const id = intParam(params.id);
  try {
    const { rowCount } = await query("DELETE FROM vehicles WHERE vehicle_id = $1", [id]);
    if (!rowCount) throw new HttpError(404, "Vehicle not found");
  } catch (e: any) {
    if (e?.code === "23503") throw new HttpError(409, "This vehicle has booking history, so it can't be deleted. Mark it Out of Service instead.");
    throw e;
  }
  return json({ ok: true, dbEffect: `DELETE vehicles: vehicle ${id} removed; no booking referenced it, so ON DELETE RESTRICT allowed it.` });
});
