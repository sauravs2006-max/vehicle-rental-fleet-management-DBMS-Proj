import { timingSafeEqual } from "crypto";
import { getMongo } from "@/lib/mongo";
import { HttpError, json, route } from "@/lib/http";
import { telematicsSchema } from "@/lib/validation";

// Ingestion endpoint for in-vehicle devices - authenticated by a shared device key, not a user session.
export const POST = route(async (req) => {
  const key = process.env.TELEMATICS_API_KEY ?? "";
  const got = req.headers.get("x-device-key") ?? "";
  const a = Buffer.from(key), b = Buffer.from(got);
  if (!key || a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(401, "Invalid device key");
  const rows = telematicsSchema.parse(await req.json());
  const db = await getMongo();
  const r = await db.collection("telematics").insertMany(rows.map((x) => ({ ...x, ts: new Date(x.ts) })));
  return json({ inserted: r.insertedCount }, 201);
});
