import { neon } from "@neondatabase/serverless";
import { Pool } from "pg";

// One small interface over two Postgres hosts, so the rest of the app does not care which one it is on.
// Supabase (and any ordinary Postgres) is reached over a pooled connection. Neon keeps its own HTTP driver.
// A query is not sent until it is awaited, so a list of them can be handed to transaction() and run as one.

export interface Query extends PromiseLike<unknown[]> {
  text: string;
  params: unknown[];
}

export interface Sql {
  query(text: string, params?: unknown[]): Query;
  transaction(queries: Query[], opts?: { readOnly?: boolean }): Promise<unknown[][]>;
}

export const isNeon = (url: string) => /\.neon\.tech/i.test(url);

function neonSql(url: string): Sql {
  const n = neon(url);
  const real = (q: Query) => n.query(q.text, q.params);
  return {
    query(text, params = []) {
      return { text, params, then: (ok, fail) => (n.query(text, params) as Promise<unknown[]>).then(ok, fail) };
    },
    transaction: (queries, opts) => n.transaction(queries.map(real), opts) as Promise<unknown[][]>,
  };
}

function pooledSql(url: string): Sql {
  // The address carries options this driver does not know (and "sslmode=require" would demand a public
  // certificate chain the pooler does not present), so they are dropped and encryption is switched on here.
  const u = new URL(url);
  u.search = "";
  const pool = new Pool({
    connectionString: u.toString(),
    ssl: { rejectUnauthorized: false },
    // Each running copy of the app keeps at most one connection; the host's pooler shares them out.
    max: Number(process.env.SETTER_PG_POOL || 1),
    // An unused connection is closed after this long. Opening the next one costs about 4,000 bytes of the
    // database's monthly traffic allowance against about 80 for a small question on an open one, so requests
    // that arrive further apart than this pay 50 times more. SETTER_PG_IDLE_MS changes it without a code change.
    idleTimeoutMillis: Math.max(1000, Number(process.env.SETTER_PG_IDLE_MS) || 20_000),
    connectionTimeoutMillis: 10_000,
    allowExitOnIdle: true,
  });
  pool.on("error", (e) => console.error("[setter] database connection dropped:", e.message));
  // Unnamed statements only, which is what a transaction pooler needs.
  const run = async (text: string, params: unknown[]) => (await pool.query(text, params)).rows as unknown[];
  return {
    query(text, params = []) {
      return { text, params, then: (ok, fail) => run(text, params).then(ok, fail) };
    },
    async transaction(queries, opts) {
      const c = await pool.connect();
      try {
        await c.query(opts?.readOnly ? "begin read only" : "begin");
        const out: unknown[][] = [];
        for (const q of queries) out.push((await c.query(q.text, q.params)).rows);
        await c.query("commit");
        return out;
      } catch (e) {
        await c.query("rollback").catch(() => {});
        throw e;
      } finally {
        c.release();
      }
    },
  };
}

export const connect = (url: string): Sql => (isNeon(url) ? neonSql(url) : pooledSql(url));
