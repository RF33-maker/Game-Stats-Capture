import { defineConfig } from "drizzle-kit";
import path from "path";

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

const useSsl =
  /supabase\.(co|com)/i.test(connectionString) ||
  /sslmode=require/i.test(connectionString);

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
    ...(useSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  },
});
