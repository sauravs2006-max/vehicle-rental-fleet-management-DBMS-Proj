import { z } from "zod";
import { getMongo } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { query } from "@/lib/db";
import { HttpError, json, route } from "@/lib/http";
import { INSPECTION_SEVERITIES } from "@/lib/severity";

const createSchema = z.object({
  vehicle_id: z.number().int().positive(),
  booking_id: z.number().int().positive().optional(),
  notes: z.string().max(5000).default(""),
  severity: z.enum(INSPECTION_SEVERITIES),
  photo_references: z.array(z.string().trim().min(1).max(2048)).max(20).default([]),
}).strict();

// List inspections, optionally filtered by vehicle or a text search on the notes.
export const GET = route(async (req) => {
  await requireRole("admin");
  const sp = req.nextUrl.searchParams;
  const filter: Record<string, unknown> = {};
  const vid = Number(sp.get("vehicleId"));
  if (Number.isInteger(vid) && vid > 0) filter.vehicle_id = vid;
  const q = sp.get("q")?.trim();
  if (q) filter.$text = { $search: q };
  const db = await getMongo();
  const docs = await db.collection("inspections").find(filter).sort({ created_at: -1 }).limit(50).toArray();
  return json(docs);
});

// Add an inspection by hand (check-in creates them automatically too).
export const POST = route(async (req) => {
  const session = await requireRole("admin");
  const body = createSchema.parse(await req.json());
  const vehicle = await query("SELECT vehicle_id FROM vehicles WHERE vehicle_id = $1", [body.vehicle_id]);
  if (!vehicle.rowCount) throw new HttpError(404, "Vehicle not found");
  if (body.booking_id) {
    const booking = await query("SELECT vehicle_id FROM bookings WHERE booking_id = $1", [body.booking_id]);
    if (!booking.rowCount) throw new HttpError(404, "Booking not found");
    if (Number(booking.rows[0].vehicle_id) !== body.vehicle_id) {
      throw new HttpError(422, "Booking does not belong to the selected vehicle");
    }
  }
  const now = new Date();
  const db = await getMongo();
  const document = {
    vehicle_id: body.vehicle_id,
    ...(body.booking_id ? { booking_id: body.booking_id } : {}),
    inspector_id: session.userId,
    inspection_date: now,
    severity: body.severity,
    status: "Recorded",
    notes: body.notes,
    photo_references: body.photo_references,
    stage: "manual",
    checklist: {},
    created_at: now,
  };
  const inserted = await db.collection("inspections").insertOne(document);
  return json({ ...document, _id: inserted.insertedId,
    dbEffect: `MongoDB insertOne: inspection ${inserted.insertedId} added for vehicle ${body.vehicle_id}, accepted by the $jsonSchema validator.` }, 201);
});
