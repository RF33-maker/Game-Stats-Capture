import { Globe, Lock } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { localApi } from "@/lib/directory";
import { SYNC_REMOTE_ENABLED } from "@/lib/local-sync";

// Says, on every game screen, whether this game goes on the Swish site.
// Mirrors local-sync's publish rule: a game is published only when it is
// synced and its league is linked to a Swish competition.
export function VisibilityPill({ leagueId }: { leagueId: string | number | null | undefined }) {
  const id = leagueId != null && leagueId !== "" ? String(leagueId) : null;
  const { data: league, isLoading } = useQuery({
    queryKey: ["league-site-link", id],
    queryFn: () => localApi<{ siteLeagueId?: string | null; name?: string }>(`/api/leagues/${id}`, "GET"),
    enabled: !!id,
  });
  if (id && isLoading) return null;
  const isPublic = SYNC_REMOTE_ENABLED && !!league?.siteLeagueId;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`shrink-0 inline-flex items-center gap-1.5 text-[11px] font-bold tracking-wide px-2.5 py-1 rounded-full border ${
            isPublic ? "text-emerald-400 border-emerald-500/40 bg-emerald-500/10" : "text-muted-foreground border-[hsl(var(--border-strong))] bg-card"
          }`}
          data-testid="game-visibility"
          data-public={isPublic ? "true" : "false"}
        >
          {isPublic ? <Globe className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
          {isPublic ? "PUBLIC ON SWISH" : "PRIVATE"}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-[260px]">
        {isPublic ? (
          <div className="text-xs leading-snug space-y-1">
            <div className="font-bold">This game is public</div>
            <div>Once it starts, every play goes live on swishassistant.com{league?.name ? ` under ${league.name}` : ""}: score, box score and play-by-play.</div>
          </div>
        ) : (
          <div className="text-xs leading-snug space-y-1">
            <div className="font-bold">This game is private</div>
            <div>It stays in your Scorers Table account and is not shown on swishassistant.com. Games in a league linked to a Swish competition are public.</div>
          </div>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
