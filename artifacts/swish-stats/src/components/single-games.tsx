import { useState } from "react";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { Calendar, Loader2, Lock, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { assignGameToLeague, searchSiteFixtures } from "@/lib/organiser";

export type SingleGame = {
  id: number;
  uid: string;
  status: string;
  date: string;
  competition?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
};
export type TargetLeague = { id: number; uid: string; name: string; siteLeagueName?: string | null; siteLeagueId?: string | null };

const NEW_GAME = "__new";
const statusText = (s: string) => (s === "setup" ? "Setting up" : s === "active" ? "In play" : "Final");
const title = (g: SingleGame) => (g.homeTeamName && g.awayTeamName ? `${g.homeTeamName} v ${g.awayTeamName}` : g.competition || "Single game");
const href = (g: SingleGame, leagueId: number) =>
  g.status === "setup" ? `/setup/${g.id}/info?league=${leagueId}`
    : g.status === "final" ? `/game/${g.id}/box?league=${leagueId}` : `/game/${g.id}?league=${leagueId}`;

/** One-off games kept private to this account, with a way to add one to a league (and its Swish fixture) once it is good. */
export function SingleGames({ games, personalLeagueId, leagues }: {
  games: SingleGame[];
  personalLeagueId: number;
  /** Leagues this account runs that are linked to a Swish competition. */
  leagues: TargetLeague[];
}) {
  const [adding, setAdding] = useState<SingleGame | null>(null);
  if (!games.length) return null;
  return (
    <section className="space-y-4" data-testid="single-games">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2">Single games <Lock className="w-4 h-4 text-muted-foreground" aria-label="Private" /></h2>
        <p className="text-sm text-muted-foreground">Private to you. Nothing here is on the Swish site until you add it to a league.</p>
      </div>
      <div className="divide-y divide-border sa-card overflow-hidden">
        {games.map(g => (
          <div key={g.id} className="flex items-center gap-3 px-5 py-4" data-testid="single-game-row">
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{title(g)}</div>
              <div className="text-xs text-muted-foreground flex items-center gap-3">
                <span>{statusText(g.status)}</span>
                <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{format(new Date(g.date), "MMM d, yyyy")}</span>
              </div>
            </div>
            <Link href={href(g, personalLeagueId)}><Button size="sm" variant="outline">{g.status === "final" ? "Box score" : g.status === "setup" ? "Finish setup" : "Open capture"}</Button></Link>
            <Button size="sm" variant="secondary" className="gap-1.5" disabled={!leagues.length} onClick={() => setAdding(g)}
              title={leagues.length ? undefined : "You don't run a league linked to a Swish competition yet"} data-testid="add-to-league">
              <Send className="w-3.5 h-3.5" />Add to a league
            </Button>
          </div>
        ))}
      </div>
      {adding && <AddToLeagueDialog game={adding} leagues={leagues} onClose={() => setAdding(null)} />}
    </section>
  );
}

function AddToLeagueDialog({ game, leagues, onClose }: { game: SingleGame; leagues: TargetLeague[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [leagueUid, setLeagueUid] = useState(leagues.length === 1 ? leagues[0].uid : "");
  const [query, setQuery] = useState("");
  const [fixture, setFixture] = useState<string>(NEW_GAME);
  const [busy, setBusy] = useState(false);
  const league = leagues.find(l => l.uid === leagueUid);

  const fixtures = useQuery({
    queryKey: ["assign-fixtures", leagueUid, query],
    queryFn: () => searchSiteFixtures(leagueUid, query),
    enabled: !!leagueUid,
    retry: false,
  });

  const go = async () => {
    setBusy(true);
    try {
      await assignGameToLeague(game.uid, leagueUid, fixture === NEW_GAME ? null : fixture);
      toast.success(game.status === "setup" ? "Game added to the league" : "Game added to the league and published");
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't add the game");
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o && !busy) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add to a league</DialogTitle>
          <DialogDescription>
            {title(game)}: pick the league, then the game on the Swish site it should fill.
            {game.status !== "setup" && " Its stats are published as soon as you confirm."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>League</Label>
            <Select value={leagueUid} onValueChange={v => { setLeagueUid(v); setFixture(NEW_GAME); }}>
              <SelectTrigger data-testid="assign-league"><SelectValue placeholder="Choose a league" /></SelectTrigger>
              <SelectContent>
                {leagues.map(l => <SelectItem key={l.uid} value={l.uid}>{l.name}{l.siteLeagueName ? ` · ${l.siteLeagueName}` : ""}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {league && (
            <div className="space-y-2">
              <Label>Game on the Swish site</Label>
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="Search by team" aria-label="Search fixtures" />
              <div className="space-y-1.5 max-h-64 overflow-y-auto">
                <button type="button" onClick={() => setFixture(NEW_GAME)} data-testid="assign-new"
                  className={`w-full text-left rounded-lg border p-3 text-sm ${fixture === NEW_GAME ? "border-primary bg-primary/5" : "border-border"}`}>
                  <span className="font-medium">Publish as a new game</span>
                  <span className="block text-xs text-muted-foreground">No existing game to fill. It appears as its own game in the league.</span>
                </button>
                {fixtures.isLoading && <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-primary" /></div>}
                {fixtures.error && <p className="text-sm text-destructive">{fixtures.error instanceof Error ? fixtures.error.message : "Couldn't load games"}</p>}
                {fixtures.data?.map(f => {
                  const blocked = f.hasStats ? "Already has stats" : f.captured ? "Already being scored" : null;
                  return (
                    <button key={f.gameKey} type="button" disabled={!!blocked} onClick={() => setFixture(f.gameKey)} data-testid="assign-fixture"
                      className={`w-full text-left rounded-lg border p-3 text-sm disabled:opacity-50 ${fixture === f.gameKey ? "border-primary bg-primary/5" : "border-border"}`}>
                      <span className="font-medium">{f.home} v {f.away}</span>
                      <span className="block text-xs text-muted-foreground">
                        {format(new Date(f.matchtime), "EEE d MMM yyyy, HH:mm")}{f.status === "error" ? " · LiveStats stopped" : ""}{blocked ? ` · ${blocked}` : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button onClick={go} disabled={!leagueUid || busy} data-testid="assign-confirm">
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Add to league
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
