// Applies db/schema.sql, then db/rbac.sql (roles + row-level security).
// schema.sql is idempotent: it drops and recreates every object, so this resets the database.
import { readFileSync } from "node:fs";
import pg from "pg";

const run = (file) => readFileSync(new URL(`../db/${file}`, import.meta.url), "utf8");
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query(run("schema.sql"));   // simple-query protocol => several statements per call
  console.log("schema applied");
  await client.query(run("rbac.sql"));
  console.log("roles and row-level security applied");
} finally { await client.end(); }
