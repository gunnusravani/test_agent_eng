import { Pool } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL ?? process.env.NEON;
if (!connectionString) {
  throw new Error("Set DATABASE_URL (or NEON) to a Postgres connection string.");
}

const pool = new Pool({ connectionString });

export const db = drizzle(pool, { schema });
