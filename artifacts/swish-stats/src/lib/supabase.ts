import { createClient } from "@supabase/supabase-js";

// Same Supabase project (and therefore the same accounts) as
// swishassistant.com. The capture app's data lives in the `capture` schema.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const SUPABASE_CONFIGURED = Boolean(url && anonKey);

export const supabase = createClient(url ?? "http://localhost", anonKey ?? "missing", {
  db: { schema: "capture" },
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Separate from the site's session key so the two apps never fight over it.
    storageKey: "swish-stats-auth",
  },
});
