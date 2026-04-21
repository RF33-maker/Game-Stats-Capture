import { defineConfig } from "drizzle-kit";
import path from "path";

const connectionString = process.env.SUPABASE_DATABASE_URL;

if (!connectionString) {
  throw new Error(
    "SUPABASE_DATABASE_URL must be set to the Supabase Postgres connection string.",
  );
}
if (!/^postgres(ql)?:\/\//i.test(connectionString)) {
  throw new Error(
    "SUPABASE_DATABASE_URL must start with postgresql:// — use Supabase 'Connection string → Transaction pooler'.",
  );
}

export default defineConfig({
  schema: path.join(__dirname, "./src/schema/index.ts"),
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString,
  },
});
