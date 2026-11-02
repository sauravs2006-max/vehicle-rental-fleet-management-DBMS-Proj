import { Pool, PoolClient, QueryResultRow } from "pg";

const g = globalThis as unknown as { __pgPool?: Pool };

function createPool() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set (see .env.example)");
  return new Pool({ connectionString: process.env.DATABASE_URL, max: 10, idleTimeoutMillis: 30_000 });
}
export const getPool = () => (g.__pgPool ??= createPool());   // pooled, survives HMR in dev

export async function query<T extends QueryResultRow = any>(text: string, params: unknown[] = []) {
  return getPool().query<T>(text, params);
}

/** Runs `fn` inside BEGIN … COMMIT (ROLLBACK on any error). */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>,
  isolation: "READ COMMITTED" | "REPEATABLE READ" | "SERIALIZABLE" = "READ COMMITTED",
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query(`BEGIN ISOLATION LEVEL ${isolation}`);
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (e) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/**
 * Runs `fn` in a transaction under the PostgreSQL role that matches the logged-in user
 * (fleet_admin or fleet_customer) and tells the row-level-security policies who is asking.
 * Anything the role isn't allowed to see is filtered or rejected by the database itself.
 */
export async function withDbRole<T>(
  who: { userId: number; role: "admin" | "customer" },
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  return withTransaction(async (client) => {
    await client.query(who.role === "admin" ? "SET LOCAL ROLE fleet_admin" : "SET LOCAL ROLE fleet_customer");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(who.userId)]);
    return fn(client);
  });
}
