import { useSyncExternalStore } from "react";
import { getSyncStatus, subscribeSyncStatus, type SyncStatus } from "@/lib/local-sync";

export function useSyncStatus(): SyncStatus {
  return useSyncExternalStore(
    subscribeSyncStatus,
    getSyncStatus,
    getSyncStatus,
  );
}
