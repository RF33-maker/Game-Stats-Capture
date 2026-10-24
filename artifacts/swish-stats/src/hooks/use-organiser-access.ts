import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { SYNC_REMOTE_ENABLED } from "@/lib/local-sync";
import { useAuth } from "@/lib/auth";

// Creating leagues (and so games) is a paid feature that Swish approves first.
// The database enforces it (capture.is_approved_organiser); this only decides
// what the screens offer, so nobody builds a league on their device that the
// server would then refuse to keep.

export type OrganiserAccessState = "loading" | "approved" | "none" | "pending" | "revoked";

const CACHE_KEY = "swish-stats:organiser-access";

function readCache(userId: string): OrganiserAccessState | null {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null") as { user: string; state: OrganiserAccessState } | null;
    return v && v.user === userId ? v.state : null;
  } catch { return null; }
}
function writeCache(userId: string, state: OrganiserAccessState) {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ user: userId, state })); } catch { /* ignore */ }
}

async function fetchState(userId: string): Promise<OrganiserAccessState> {
  try {
    const ok = await supabase.rpc("is_approved_organiser");
    if (ok.error) throw ok.error;
    if (ok.data === true) { writeCache(userId, "approved"); return "approved"; }
    const row = await supabase.from("organiser_access").select("status").eq("user_id", userId).maybeSingle();
    if (row.error) throw row.error;
    const state: OrganiserAccessState = (row.data?.status as OrganiserAccessState | undefined) ?? "none";
    writeCache(userId, state);
    return state;
  } catch (e) {
    // Offline or the server is unreachable: go with what we last knew.
    const cached = readCache(userId);
    if (cached) return cached;
    throw e;
  }
}

export function useOrganiserAccess() {
  const { user } = useAuth();
  const qc = useQueryClient();
  // No account and no sync (local development mode): nothing to approve.
  const needsApproval = SYNC_REMOTE_ENABLED && !!user && user.id !== "local";
  const key = ["organiser-access", user?.id ?? null];

  const q = useQuery({
    queryKey: key,
    queryFn: () => fetchState(user!.id),
    enabled: needsApproval,
    staleTime: 60_000,
    retry: 1,
  });

  const request = useCallback(async (organisation: string, note: string): Promise<string | null> => {
    const { error } = await supabase.rpc("request_organiser_access", {
      p_organisation: organisation, p_note: note || null,
    });
    if (error) return error.message;
    await qc.invalidateQueries({ queryKey: key });
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qc, user?.id]);

  const state: OrganiserAccessState = !needsApproval ? "approved" : q.data ?? (q.isError ? "none" : "loading");
  return { state, canCreate: state === "approved", isLoading: state === "loading", request };
}
