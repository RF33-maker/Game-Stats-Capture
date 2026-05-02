import { HardDrive, RotateCcw, Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2, AlertTriangle } from "lucide-react";
import { resetLocalData } from "@/lib/local-mode";
import { syncNow } from "@/lib/local-sync";
import { useSyncStatus } from "@/hooks/use-sync-status";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

function formatRelative(ts: string | null): string {
  if (!ts) return "never";
  const diffMs = Date.now() - new Date(ts).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function LocalModeBadge() {
  const status = useSyncStatus();

  // Pick a "primary" pill color based on current sync state
  const stateClass = !status.online
    ? "bg-zinc-700/95 text-zinc-100 border-zinc-500/50"
    : status.syncing
      ? "bg-sky-500/95 text-white border-sky-400/50"
      : status.pending > 0
        ? "bg-amber-500/95 text-amber-950 border-amber-400/50"
        : status.remoteEnabled
          ? "bg-emerald-500/95 text-emerald-950 border-emerald-400/50"
          : "bg-amber-500/95 text-amber-950 border-amber-400/50";

  const StateIcon = !status.online
    ? WifiOff
    : status.syncing
      ? RefreshCw
      : status.pending > 0
        ? CloudUpload
        : status.remoteEnabled
          ? CheckCircle2
          : HardDrive;

  const stateLabel = !status.online
    ? "OFFLINE"
    : status.syncing
      ? "SYNCING…"
      : status.pending > 0
        ? `${status.pending} PENDING`
        : status.remoteEnabled
          ? "ALL SYNCED"
          : "LOCAL MODE";

  const tooltip = (() => {
    if (!status.remoteEnabled) {
      return (
        <div className="text-xs leading-snug">
          <div className="font-bold">Local-only mode</div>
          <div className="text-muted-foreground">
            All data stays in this browser. Set <code>VITE_SYNC_REMOTE_URL</code> to
            sync to a real API server.
          </div>
          <div className="mt-1">{status.pending} change{status.pending === 1 ? "" : "s"} would be queued for sync.</div>
        </div>
      );
    }
    return (
      <div className="text-xs leading-snug space-y-1">
        <div className="font-bold flex items-center gap-1">
          {status.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {status.online ? "Online" : "Offline"}
        </div>
        <div>Pending: <span className="font-mono">{status.pending}</span></div>
        <div>Last sync: <span className="font-mono">{formatRelative(status.lastSyncAt)}</span></div>
        {status.lastError && (
          <div className="flex items-start gap-1 text-amber-300">
            <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0" />
            <span className="break-all">{status.lastError}</span>
          </div>
        )}
      </div>
    );
  })();

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 flex items-center gap-2 text-xs font-bold px-3 py-1.5 rounded-full shadow-lg backdrop-blur-sm border ${stateClass}`}
      data-testid="local-mode-badge"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5" data-testid="sync-status">
            <StateIcon className={`w-3.5 h-3.5 ${status.syncing ? "animate-spin" : ""}`} />
            <span>{stateLabel}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      {status.remoteEnabled && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-current hover:bg-black/10 hover:text-current rounded-full"
              disabled={status.syncing || !status.online || status.pending === 0}
              onClick={() => { void syncNow(); }}
              data-testid="button-sync-now"
            >
              <RefreshCw className={`w-3 h-3 ${status.syncing ? "animate-spin" : ""}`} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Sync now</TooltipContent>
        </Tooltip>
      )}

      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 text-current hover:bg-black/10 hover:text-current rounded-full"
            onClick={() => {
              if (confirm("Reset all local data? This will erase all games, teams, players, stats, and pending sync queue.")) {
                resetLocalData();
              }
            }}
            data-testid="button-reset-local"
          >
            <RotateCcw className="w-3 h-3" />
          </Button>
        </TooltipTrigger>
        <TooltipContent>Reset local data</TooltipContent>
      </Tooltip>
    </div>
  );
}
