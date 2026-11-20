import { Pool, type QueryResultRow } from "pg";
import { attachDatabasePool } from "@vercel/functions";

/**
 * The database pool.
 *
 * In admin mode it uses the station role (read and write). In counter mode it
 * uses the counter role, which can only insert passenger events and update
 * the seats column.
 *
 * The connection string, the TLS setting and the pool size all come from the
 * environment, because the same app runs in two places: on the head station
 * PC, where PostgreSQL is on 127.0.0.1 and speaks plain TCP, and in the
 * cloud, where PostgreSQL is a hosted service that needs TLS and a small pool
 * because every serverless function opens its own.
 */

/** TLS is only turned on when the environment asks for it. */
const databaseSsl =
  process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;

/** The pool size, with a safe fallback when the value is missing or wrong. */
const requestedPoolSize = Number(process.env.DATABASE_POOL_MAX);
const poolSize =
  Number.isFinite(requestedPoolSize) && requestedPoolSize > 0 ? requestedPoolSize : 10;

/** One pool per process, kept across hot reloads in development. */
const globalForDb = globalThis as unknown as { freeryPool?: Pool };

export const pool =
  globalForDb.freeryPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: poolSize,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 8_000,
    ...(databaseSsl ? { ssl: databaseSsl } : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.freeryPool = pool;
}

/**
 * On Vercel the function is stopped between requests, and a connection that
 * is open at that moment can be cut in the middle of a query. The Vercel
 * helper watches the pool and keeps the function alive while a query is
 * still running. It does nothing away from Vercel.
 */
if (process.env.VERCEL) {
  attachDatabasePool(pool);
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const result = await pool.query<T>(text, params as never[]);
  return result.rows;
}

export async function queryOne<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = [],
): Promise<T | null> {
  const rows = await query<T>(text, params);
  return rows[0] ?? null;
}

/** Run several statements in one transaction. */
export async function transaction<T>(
  work: (client: import("pg").PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
