import { z } from "zod";

const iso = z.string().datetime({ offset: true });
const id = z.coerce.number().int().positive();

export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().email().max(150),
  password: z.string().min(8).max(72)
    .regex(/[A-Za-z]/, "Must contain a letter").regex(/[0-9]/, "Must contain a digit"),
  phone: z.string().trim().regex(/^[0-9+ -]{7,20}$/, "Invalid phone number").optional(),
  licenseNo: z.string().trim().max(30).optional(),
});
export const loginSchema = z.object({ email: z.string().trim().toLowerCase().email(), password: z.string().min(1) });

export const quoteSchema = z.object({ vehicleId: id, start: iso, end: iso, km: z.coerce.number().int().min(0).max(5000).default(0) });

export const bookingSchema = z.object({
  vehicleId: id, start: iso, end: iso,
  estDistanceKm: z.number().int().min(0).max(5000).default(0),
  paymentMethod: z.enum(["Card", "UPI", "Cash", "Wallet"]),
}).refine((b) => new Date(b.end) > new Date(b.start), { message: "End must be after start", path: ["end"] })
  .refine((b) => new Date(b.start).getTime() > Date.now() - 5 * 60_000, { message: "Start cannot be in the past", path: ["start"] })
  .refine((b) => new Date(b.end).getTime() - new Date(b.start).getTime() <= 30 * 86_400_000, { message: "Maximum rental is 30 days", path: ["end"] });

export const returnSchema = z.object({
  actualKm: z.number().int().min(0).max(5000),
  severity: z.enum(["None", "Minor", "Major"]),
  notes: z.string().trim().max(1000).default(""),
  returnedAt: iso.optional(),
  checklist: z.object({
    tyres: z.boolean(), brakes: z.boolean(), lights: z.boolean(),
    interiorClean: z.boolean(), fuelLevelPct: z.number().min(0).max(100),
  }).partial().optional(),
});

export const reviewSchema = z.object({
  bookingId: id, rating: z.number().int().min(1).max(5), comment: z.string().trim().max(1000).optional(),
});
export const disputeSchema = z.object({ bookingId: id, reason: z.string().trim().min(10).max(1000) });
export const resolveSchema = z.object({
  status: z.enum(["Resolved", "Rejected"]),
  note: z.string().trim().min(3).max(1000),
  refund: z.number().min(0).max(1_000_000).default(0),
});
export const assignDriverSchema = z.object({ driverId: id.nullable() });

export const telematicsSchema = z.array(z.object({
  vehicle_id: id, ts: iso,
  speed_kmph: z.number().min(0).max(300), distance_km: z.number().min(0).max(100),
  fuel_litres: z.number().min(0).max(50).default(0), energy_kwh: z.number().min(0).max(100).default(0),
  odometer_km: z.number().int().min(0), harsh_brake: z.boolean().default(false), harsh_accel: z.boolean().default(false),
  engine_temp_c: z.number().min(-40).max(200).optional(),
})).min(1).max(500);

// ---- admin: reject a booking, manage the fleet ------------------------------------------------
export const rejectBookingSchema = z.object({ reason: z.string().trim().min(5, "Give a reason (at least 5 characters)").max(300) });

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
export const vehicleSchema = z.object({
  branchId: id,
  regNo: z.string().trim().toUpperCase().min(4).max(20),
  make: z.string().trim().min(1).max(50),
  model: z.string().trim().min(1).max(50),
  category: z.enum(["Hatchback", "Sedan", "SUV", "Van", "Luxury"]),
  fuelType: z.enum(["Petrol", "Diesel", "Electric", "Hybrid", "CNG"]),
  seats: z.coerce.number().int().min(1).max(15),
  dailyRate: z.coerce.number().positive().max(100000),
  perKmRate: z.coerce.number().min(0).max(1000),
  odometerKm: z.coerce.number().int().min(0).max(1_000_000),
  serviceIntervalKm: z.coerce.number().int().min(1000).max(50000),
  registrationExpiry: day, insuranceExpiry: day, pucExpiry: day,
});
export const vehiclePatchSchema = z.object({
  status: z.enum(["Available", "Out_of_Service"]).optional(),
  dailyRate: z.coerce.number().positive().max(100000).optional(),
  perKmRate: z.coerce.number().min(0).max(1000).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const maintenanceSchema = z.object({
  vehicleId: id,
  serviceType: z.enum(["Scheduled", "Repair", "Inspection"]),
  description: z.string().trim().min(3).max(500),
  partsReplaced: z.string().trim().max(300).optional(),
  cost: z.coerce.number().min(0).max(1_000_000),
  odometerKm: z.coerce.number().int().min(0).max(1_000_000),
  downtimeDays: z.coerce.number().int().min(0).max(60).default(0),
});
