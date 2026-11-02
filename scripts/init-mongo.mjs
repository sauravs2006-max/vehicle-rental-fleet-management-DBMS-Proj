// Creates the inspections collection with its $jsonSchema validator, plus all indexes.
// Safe to run more than once. Runs automatically as part of `npm run db:reset`.
import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");

const num = { bsonType: ["int", "long", "double"] };
const validator = {
  $jsonSchema: {
    bsonType: "object",
    required: ["vehicle_id", "inspector_id", "inspection_date", "severity", "status"],
    properties: {
      vehicle_id: num,            // vehicles.vehicle_id in PostgreSQL
      inspector_id: num,          // users.user_id of the admin who recorded it
      booking_id: num,            // optional: bookings.booking_id
      inspection_date: { bsonType: "date" },
      severity: { bsonType: "string", enum: ["Low", "Medium", "High", "Critical"] },
      status: { bsonType: "string", minLength: 1 },
      stage: { bsonType: "string" },
      notes: { bsonType: "string" },
      photo_references: { bsonType: "array", items: { bsonType: "string" } },
      checklist: { bsonType: "object" },
      created_at: { bsonType: "date" },
      updated_at: { bsonType: "date" },
    },
  },
};

const client = new MongoClient(process.env.MONGODB_URI);
try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "fleet_ops");

  const exists = await db.listCollections({ name: "inspections" }, { nameOnly: true }).hasNext();
  if (exists) await db.command({ collMod: "inspections", validator, validationLevel: "strict", validationAction: "error" });
  else await db.createCollection("inspections", { validator, validationLevel: "strict", validationAction: "error" });

  await Promise.all([
    db.collection("inspections").createIndex({ vehicle_id: 1, created_at: -1 }),
    db.collection("inspections").createIndex({ booking_id: 1 }),
    db.collection("inspections").createIndex({ notes: "text" }),
    db.collection("telematics").createIndex({ vehicle_id: 1, ts: -1 }),
  ]);
  console.log("MongoDB ready: inspections validator + indexes");
} finally {
  await client.close();
}
