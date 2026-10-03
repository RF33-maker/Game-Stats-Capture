import { HardDrive, RotateCcw, Wifi, WifiOff, RefreshCw, CloudUpload, CheckCircle2, AlertTriangle } from "lucide-react";
import { resetLocalData, LOCAL_MODE_ENABLED } from "@/lib/local-mode";
import { syncNow, retryFailed } from "@/lib/local-sync";
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

// `inline` renders the pill in normal flow (used in the capture header, where a
// floating pill would sit on top of the stat buttons).
export function LocalModeBadge({ inline = false }: { inline?: boolean }) {
  const status = useSyncStatus();
  const showPending = status.remoteEnabled && status.pending > 0;
  const showFailed = status.remoteEnabled && status.failed > 0;
  const notSignedIn = status.remoteEnabled && !status.signedIn;

  // A quiet pill on the page surface; the state is carried by the icon colour.
  const stateClass = showFailed
    ? "text-rose-400 border-rose-500/40"
    : !status.online
      ? "text-zinc-300 border-[hsl(var(--border-strong))]"
      : status.syncing
        ? "text-sky-400 border-sky-500/30"
        : showPending || notSignedIn
          ? "text-amber-400 border-amber-500/30"
          : status.remoteEnabled
            ? "text-emerald-400 border-[hsl(var(--border-strong))]"
            : "text-amber-400 border-amber-500/30";

  const StateIcon = showFailed
    ? AlertTriangle
    : !status.online
      ? WifiOff
      : status.syncing
        ? RefreshCw
        : showPending || notSignedIn
          ? CloudUpload
          : status.remoteEnabled
            ? CheckCircle2
            : HardDrive;

  // Offline is normal mid-game: say the work is safe, not that it's broken.
  const stateLabel = showFailed
    ? `${status.failed} FAILED`
    : !status.online
      ? status.pending > 0 ? `OFFLINE · ${status.pending} SAVED` : "OFFLINE"
      : status.syncing
        ? "SYNCING…"
        : notSignedIn
          ? status.pending > 0 ? `${status.pending} WAITING · SIGN IN` : "NOT SIGNED IN"
          : showPending
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
        </div>
      );
    }
    return (
      <div className="text-xs leading-snug space-y-1">
        <div className="font-bold flex items-center gap-1">
          {status.online ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {status.online ? "Online" : "Offline"}
        </div>
        <div>Saved on this device, waiting to send: <span className="font-mono">{status.pending}</span></div>
        {status.failed > 0 && <div>Failed: <span className="font-mono">{status.failed}</span></div>}
        {!status.signedIn && <div>Sign in to send them.</div>}
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
      className={`${inline ? "shrink-0" : "fixed bottom-4 left-4 z-50 shadow-[var(--shadow-card-lg)]"} flex items-center gap-2 text-[11px] font-semibold tracking-wide px-3 py-1.5 rounded-full border bg-card ${stateClass}`}
      data-testid="local-mode-badge"
    >
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1.5" data-testid="sync-status">
            <StateIcon className={`w-3.5 h-3.5 ${status.syncing ? "animate-spin" : ""}`} />
            <span className="text-foreground/90">{stateLabel}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent>{tooltip}</TooltipContent>
      </Tooltip>

      {showFailed && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-5 px-1.5 text-[10px] font-bold text-current hover:bg-black/10 hover:text-current rounded-full"
              onClick={() => retryFailed()}
              data-testid="button-retry-failed"
            >
              RETRY
            </Button>
          </TooltipTrigger>
          <TooltipContent>Try sending the failed changes again</TooltipContent>
        </Tooltip>
      )}

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

      {LOCAL_MODE_ENABLED && <Tooltip>
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
      </Tooltip>}
    </div>
  );
}
