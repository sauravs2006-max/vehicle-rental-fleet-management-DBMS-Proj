import { ObjectId } from "mongodb";
import { z } from "zod";
import { getMongo } from "@/lib/mongo";
import { requireRole } from "@/lib/auth";
import { HttpError, json, route } from "@/lib/http";
import { query } from "@/lib/db";
import { INSPECTION_SEVERITIES, toDamageSeverity } from "@/lib/severity";

const updateSchema = z.object({
  notes: z.string().max(5000).optional(),
  severity: z.enum(INSPECTION_SEVERITIES).optional(),
  photo_references: z.array(z.string().trim().min(1).max(2048)).max(20).optional(),
}).strict().refine((v) => Object.keys(v).length > 0, "Provide at least one field to update");

function parseObjectId(value: string) {
  if (!ObjectId.isValid(value) || new ObjectId(value).toHexString() !== value.toLowerCase()) {
    throw new HttpError(400, "Invalid inspection ID");
  }
  return new ObjectId(value);
}

export const GET = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requireRole("admin");
  const db = await getMongo();
  const inspection = await db.collection("inspections").findOne({ _id: parseObjectId(params.id) });
  if (!inspection) throw new HttpError(404, "Inspection not found");
  return json(inspection);
});

export const PATCH = route<{ params: { id: string } }>(async (req, { params }) => {
  await requireRole("admin");
  const _id = parseObjectId(params.id);
  const body = updateSchema.parse(await req.json());

  const db = await getMongo();
  const result = await db.collection("inspections").updateOne({ _id }, { $set: { ...body, updated_at: new Date() } });
  if (!result.matchedCount) throw new HttpError(404, "Inspection not found");

  // The damage_reports row in PostgreSQL stores the same severity on its own scale - keep it in step.
  let dbEffect = `MongoDB updateOne: inspection ${_id} updated.`;
  if (body.severity) {
    const severity = toDamageSeverity(body.severity);
    const { rowCount } = await query("UPDATE damage_reports SET severity = $1 WHERE mongo_inspection_id = $2", [severity, _id.toString()]);
    dbEffect += ` PostgreSQL: ${rowCount} damage_reports row(s) set to ${severity}.`;
  }
  return json({ ok: true, inspection: await db.collection("inspections").findOne({ _id }), dbEffect });
});

export const DELETE = route<{ params: { id: string } }>(async (_req, { params }) => {
  await requireRole("admin");
  const _id = parseObjectId(params.id);
  const db = await getMongo();
  if (!(await db.collection("inspections").findOne({ _id }, { projection: { _id: 1 } }))) {
    throw new HttpError(404, "Inspection not found");
  }
  // Clear the pointer in PostgreSQL first, so no row ever points at a deleted document.
  // If the Mongo delete then fails, the document is still there and nothing is lost.
  const { rowCount } = await query("UPDATE damage_reports SET mongo_inspection_id = NULL WHERE mongo_inspection_id = $1", [_id.toString()]);
  await db.collection("inspections").deleteOne({ _id });
  return json({ ok: true, deletedId: _id.toString(),
    dbEffect: `MongoDB deleteOne: inspection ${_id} removed. PostgreSQL: ${rowCount} damage_reports pointer(s) cleared.` });
});
