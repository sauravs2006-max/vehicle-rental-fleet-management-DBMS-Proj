import { MongoClient, Db } from "mongodb";

const g = globalThis as unknown as { __mongo?: Promise<MongoClient> };

// One shared client per server process. The inspections validator and all indexes
// are created by scripts/init-mongo.mjs (run as part of `npm run db:reset`).
export async function getMongo(): Promise<Db> {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is not set (see .env.example)");
  g.__mongo ??= new MongoClient(process.env.MONGODB_URI, { maxPoolSize: 10 }).connect();
  return (await g.__mongo).db(process.env.MONGODB_DB ?? "fleet_ops");
}
