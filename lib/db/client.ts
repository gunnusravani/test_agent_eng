import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

type DrizzleDb = ReturnType<typeof drizzle<typeof schema>>;

let cached: DrizzleDb | null = null;

/**
 * Connects lazily, on first actual query, rather than at module import time. Next's
 * `next build` "collect page data" step imports every route module to inspect it —
 * it never calls a query — so an eager connection here throws during build on any
 * environment (like a fresh Vercel project) that hasn't set DATABASE_URL/NEON yet,
 * even though the built app would run fine once the env var is added.
 */
function getDb(): DrizzleDb {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL ?? process.env.NEON;
  if (!connectionString) {
    throw new Error("Set DATABASE_URL (or NEON) to a Postgres connection string.");
  }
  const pool = new Pool({ connectionString });
  cached = drizzle(pool, { schema });
  return cached;
}

export const db: DrizzleDb = new Proxy({} as DrizzleDb, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb(), prop, receiver);
  },
});
