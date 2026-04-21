import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set to a Postgres connection string (e.g. the Supabase Transaction Pooler URI starting with postgresql://).",
  );
}
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error(
    "SUPABASE_DATABASE_URL must start with postgresql:// — got an unexpected value (looks like the HTTPS Project URL?). Use the Supabase 'Connection string → Transaction pooler' value.",
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
