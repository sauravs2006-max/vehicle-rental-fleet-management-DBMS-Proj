import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { maintenanceSchema } from "@/lib/validation";

// Log a service. The trigger trg_after_maintenance then resets the vehicle's service counter
// and clears its Maintenance_Required / Under_Maintenance status.
export const POST = route(async (req) => {
  await requireRole("admin");
  const m = maintenanceSchema.parse(await req.json());
  const exists = await query("SELECT 1 FROM vehicles WHERE vehicle_id = $1", [m.vehicleId]);
  if (!exists.rowCount) throw new HttpError(404, "Vehicle not found");
  await query(
    `INSERT INTO maintenance_logs (vehicle_id, service_type, description, parts_replaced, cost, odometer_km, downtime_days)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [m.vehicleId, m.serviceType, m.description, m.partsReplaced ?? null, m.cost, m.odometerKm, m.downtimeDays]);
  const { rows } = await query("SELECT vehicle_id, status, odometer_km, last_service_km FROM vehicles WHERE vehicle_id = $1", [m.vehicleId]);
  const v = rows[0];
  return json({ ...v, dbEffect: `INSERT maintenance_logs: service logged for vehicle ${v.vehicle_id}; trg_after_maintenance set last_service_km to ${v.last_service_km}, vehicle is now ${v.status}.` }, 201);
});
