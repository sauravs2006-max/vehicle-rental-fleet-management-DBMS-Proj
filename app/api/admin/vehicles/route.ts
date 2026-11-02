import { query } from "@/lib/db";
import { requireRole } from "@/lib/auth";
import { json, route } from "@/lib/http";
import { vehicleSchema } from "@/lib/validation";

// Add a vehicle to the fleet. Duplicate registration numbers, bad rates, etc. are rejected by the
// UNIQUE / CHECK constraints in the vehicles table.
export const POST = route(async (req) => {
  await requireRole("admin");
  const v = vehicleSchema.parse(await req.json());
  const { rows } = await query(
    `INSERT INTO vehicles (branch_id, reg_no, make, model, category, fuel_type, seats, daily_rate, per_km_rate,
                           odometer_km, last_service_km, service_interval_km, registration_expiry, insurance_expiry, puc_expiry)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11,$12,$13,$14) RETURNING vehicle_id, reg_no, status`,
    [v.branchId, v.regNo, v.make, v.model, v.category, v.fuelType, v.seats, v.dailyRate, v.perKmRate,
     v.odometerKm, v.serviceIntervalKm, v.registrationExpiry, v.insuranceExpiry, v.pucExpiry]);
  return json(rows[0], 201);
});
