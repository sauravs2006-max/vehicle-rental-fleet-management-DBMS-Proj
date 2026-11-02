import { MongoClient } from "mongodb";

if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required");
const client = new MongoClient(process.env.MONGODB_URI);
const testId = `validator-test-${Date.now()}`;

try {
  await client.connect();
  const db = client.db(process.env.MONGODB_DB ?? "fleet_ops");
  const inspections = db.collection("inspections");
  const valid = {
    vehicle_id: 1,
    inspector_id: 1,
    inspection_date: new Date(),
    severity: "Medium",
    status: "Recorded",
    notes: "Temporary validator test document",
    photo_references: ["https://example.test/inspection.jpg"],
    test_run_id: testId,
  };
  const inserted = await inspections.insertOne(valid);
  await inspections.deleteOne({ _id: inserted.insertedId });
  console.log("PASS: valid inspection document accepted");

  let rejected = false;
  try {
    await inspections.insertOne({
      vehicle_id: 1,
      inspector_id: 1,
      inspection_date: new Date(),
      severity: "Impossible",
      status: "Recorded",
      test_run_id: testId,
    });
  } catch (error) {
    if (error?.code === 121) rejected = true;
    else throw error;
  }
  if (!rejected) throw new Error("FAIL: invalid severity was not rejected by $jsonSchema");
  console.log("PASS: invalid severity rejected with MongoDB validation error 121");
} finally {
  await client.close();
}
