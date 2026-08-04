import type { Config } from "drizzle-kit";

export default {
  dialect: "postgresql",
  schema: "./lib/db/schema.ts",
  out: "./lib/db/migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? process.env.NEON!,
  },
} satisfies Config;
