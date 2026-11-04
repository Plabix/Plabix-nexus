import dns from "node:dns";
import { Pool, type QueryResultRow } from "pg";

// Resolve "localhost" to 127.0.0.1 before ::1. Docker Desktop on Windows
// accepts IPv6 loopback connections and then resets them, which surfaces
// as random ECONNRESET errors when DATABASE_URL uses "localhost".
dns.setDefaultResultOrder("ipv4first");

let pool: Pool | null = null;

/**
 * Returns a singleton Postgres connection pool.
 * Lazily created so build-time (no DB available) doesn't crash.
 */
export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Copy .env.example to .env.local and configure it."
      );
    }
    pool = new Pool({ connectionString, max: 10, idleTimeoutMillis: 30_000 });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T[]> {
  const client = getPool();
  const result = await client.query<T>(text, params);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Runs a callback inside a transaction, rolling back on error. */
export async function withTransaction<T>(
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
