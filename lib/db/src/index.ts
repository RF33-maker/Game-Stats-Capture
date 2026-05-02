import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString =
  process.env.DATABASE_URL ?? process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "DATABASE_URL (or SUPABASE_DATABASE_URL) must be set to a Postgres connection string.",
  );
}
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error(
    "DATABASE_URL must start with postgresql://.",
  );
}

// Supabase pooler connections often need SSL but with a relaxed CA check.
const useSsl =
  /supabase\.(co|com)/i.test(connectionString) ||
  /sslmode=require/i.test(connectionString);

export const pool = new Pool({
  connectionString,
  ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
});
export const db = drizzle(pool, { schema });

export * from "./schema";
