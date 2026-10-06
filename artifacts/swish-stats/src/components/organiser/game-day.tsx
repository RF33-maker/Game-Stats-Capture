import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { localApi } from "@/lib/directory";
import { store } from "@/lib/local-store";
import {
  OFFICIAL_ROLES, ORGANISER_AVAILABLE, addOfficial, fetchGameCode, joinGameByCode, listGameScorers, listOfficials,
  listVenues, officialRoleName, removeGameScorer, removeOfficial, type OfficialRole,
} from "@/lib/organiser";
import { venuesKey } from "./venues-rules";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const NONE = "__none";

/** "ABC234" → "ABC-234": easier to read out and type. */
export function prettyCode(code: string) {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

export type GameDayGame = {
  id: number;
  uid: string;
  date: string;
  status: string;
  gameCode?: string | null;
  tipoffTime?: string | null;
  roundLabel?: string | null;
  gameNumber?: number | null;
  venue?: string | null;
  venueUid?: string | null;
  attendance?: number | null;
};

export function OfficialsEditor({ gameUid, gameDate, canEdit }: { gameUid: string; gameDate?: string; canEdit: boolean }) {
  const qc = useQueryClient();
  const key = ["organiser", "officials", gameUid];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => listOfficials(gameUid), retry: false });
  const [role, setRole] = useState<OfficialRole>("crew_chief");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  // Offer the next role that hasn't been filled yet.
  useEffect(() => {
    if (!data) return;
    const used = data.map(o => o.role);
    const order: OfficialRole[] = ["crew_chief", "umpire", "umpire", "scorer", "timer", "shot_clock", "commissioner", "assistant_scorer", "statistician"];
    const pool = [...used];
    const next = order.find(r => { const i = pool.indexOf(r); if (i === -1) return true; pool.splice(i, 1); return false; });
    if (next) setRole(next);
  }, [data]);

  if (error) return <p className="text-sm text-muted-foreground">{(error as Error).message}</p>;
  return (
    <div className="space-y-2" data-testid="officials-editor">
      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      {data?.map(o => (
        <div key={o.uid} className="flex items-center gap-2 text-sm">
          <span className="w-36 shrink-0 text-muted-foreground">{officialRoleName(o.role)}</span>
          <span className="flex-1 truncate font-medium">{o.name}</span>
          {canEdit && (
            <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label={`Remove ${o.name}`}
              onClick={async () => { try { await removeOfficial(o.uid); await qc.invalidateQueries({ queryKey: key }); } catch (e) { err(e); } }}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          )}
        </div>
      ))}
      {data && !data.length && !canEdit && <p className="text-sm text-muted-foreground">No officials recorded.</p>}
      {canEdit && (
        <form className="flex gap-2" onSubmit={async e => {
          e.preventDefault();
          if (!name.trim()) return;
          setBusy(true);
          try {
            const other = await addOfficial(gameUid, role, name, gameDate);
            setWarning(other.length ? `${name.trim()} is also down for ${other.join(", ")} on the same day.` : null);
            setName("");
            await qc.invalidateQueries({ queryKey: key });
          } catch (e2) { err(e2); } finally { setBusy(false); }
        }}>
          <Select value={role} onValueChange={v => setRole(v as OfficialRole)}>
            <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>{OFFICIAL_ROLES.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
          </Select>
          <Input value={name} onChange={e => setName(e.target.value)} placeholder="Name" className="h-9" aria-label="Official's name" />
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !name.trim()} data-testid="add-official"><Plus className="w-3.5 h-3.5 mr-1" />Add</Button>
        </form>
      )}
      {warning && <p className="flex items-center gap-2 text-sm text-amber-500"><AlertTriangle className="w-4 h-4 shrink-0" />{warning}</p>}
    </div>
  );
}

/** Everything the organiser does for one game before the day: details, the scorer's code, officials. */
export function GameDayDialog({ game, leagueUid, title, onClose, onChanged }: {
  game: GameDayGame;
  leagueUid: string;
  title: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const qc = useQueryClient();
  const { data: venues } = useQuery({ queryKey: venuesKey(leagueUid), queryFn: () => listVenues(leagueUid), retry: false });
  const { data: code } = useQuery({
    queryKey: ["organiser", "code", game.uid],
    queryFn: async () => game.gameCode ?? await fetchGameCode(game.uid),
    retry: false,
  });
  const scorersKey = ["organiser", "scorers", game.uid];
  const { data: scorers } = useQuery({ queryKey: scorersKey, queryFn: () => listGameScorers(game.uid), retry: false });

  const [date, setDate] = useState(game.date.slice(0, 10));
  const [time, setTime] = useState(game.tipoffTime?.slice(0, 5) ?? "");
  const [round, setRound] = useState(game.roundLabel ?? "");
  const [number, setNumber] = useState(game.gameNumber != null ? String(game.gameNumber) : "");
  const [venue, setVenue] = useState(game.venueUid ?? NONE);
  const [busy, setBusy] = useState(false);
  const dirty = date !== game.date.slice(0, 10) || time !== (game.tipoffTime?.slice(0, 5) ?? "") || round !== (game.roundLabel ?? "")
    || number !== (game.gameNumber != null ? String(game.gameNumber) : "") || venue !== (game.venueUid ?? NONE);

  const save = async () => {
    setBusy(true);
    try {
      await localApi(`/api/games/${game.id}`, "PATCH", {
        date, tipoffTime: time || null, roundLabel: round.trim() || null, gameNumber: number ? Number(number) : null,
        venueUid: venue === NONE ? null : venue,
        ...(venue !== (game.venueUid ?? NONE) ? { venue: venue === NONE ? null : venues?.find(v => v.uid === venue)?.name ?? null } : {}),
      });
      toast.success("Game details saved");
      onChanged();
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Details, the scorer's code and the officials for this game.</DialogDescription>
        </DialogHeader>

        {game.status !== "final" && (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-2" data-testid="game-code-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="sa-eyebrow">Scorer's game code</p>
                <p className="font-mono text-3xl font-bold tracking-[0.2em]" data-testid="game-code">{code ? prettyCode(code) : "······"}</p>
              </div>
              <Button variant="secondary" size="sm" disabled={!code} onClick={() => {
                void navigator.clipboard?.writeText(prettyCode(code!)); toast.success("Code copied");
              }}><Copy className="w-3.5 h-3.5 mr-1.5" />Copy</Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Give this to whoever is scoring. They sign in to Swish Stats, choose <strong>Join with a game code</strong> and get this game only — no access to the rest of your league. It stops working once the game is final.
            </p>
            {!!scorers?.length && (
              <div className="pt-1 space-y-1">
                {scorers.map(s => (
                  <div key={s.userId} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate">{s.email ?? s.userId}</span>
                    <span className="text-xs text-muted-foreground">joined with the code</span>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Remove scorer"
                      onClick={async () => { try { await removeGameScorer(game.uid, s.userId); await qc.invalidateQueries({ queryKey: scorersKey }); } catch (e) { err(e); } }}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="space-y-3">
          <h3 className="font-semibold text-sm">Details</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5"><Label htmlFor="gd-date">Date</Label>
              <Input id="gd-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="gd-time">Tip-off</Label>
              <Input id="gd-time" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="gd-round">Round</Label>
              <Input id="gd-round" value={round} maxLength={40} onChange={e => setRound(e.target.value)} /></div>
            <div className="space-y-1.5"><Label htmlFor="gd-num">Game no.</Label>
              <Input id="gd-num" type="number" min={1} value={number} onChange={e => setNumber(e.target.value)} /></div>
          </div>
          {!!venues?.length && (
            <div className="space-y-1.5">
              <Label>Venue</Label>
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{game.venue && !game.venueUid ? game.venue : "Not set"}</SelectItem>
                  {venues.map(v => <SelectItem key={v.uid} value={v.uid}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          {dirty && (
            <div className="flex justify-end">
              <Button size="sm" onClick={save} disabled={busy || !date} data-testid="save-game-details">
                {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save details
              </Button>
            </div>
          )}
        </div>

        <div className="space-y-2 pt-3 border-t border-border">
          <h3 className="font-semibold text-sm">Officials</h3>
          <OfficialsEditor gameUid={game.uid} gameDate={date} canEdit />
        </div>

        <DialogFooter><Button variant="ghost" onClick={onClose}>Done</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** For volunteers: type the code from the organiser, get that one game. */
export function JoinGameDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const clean = code.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

  const join = async () => {
    setBusy(true); setError(null);
    try {
      const uid = await joinGameByCode(clean);
      await qc.invalidateQueries();
      const game = store.games.getByUid(uid);
      onOpenChange(false);
      setCode("");
      if (!game) { toast.success("Game added — it will appear in your list shortly"); return; }
      toast.success("You're in — this game is now on your device");
      setLocation(game.status === "setup"
        ? `/setup/${game.id}/players?league=${game.leagueId}`
        : `/game/${game.id}?league=${game.leagueId}`);
    } catch (e) { setError(e instanceof Error ? e.message : "Couldn't join that game"); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-primary" />Join with a game code</DialogTitle>
          <DialogDescription>Your league organiser gives you a six-character code for the game you're scoring.</DialogDescription>
        </DialogHeader>
        {!ORGANISER_AVAILABLE ? (
          <p className="text-sm text-muted-foreground">Game codes need you to be signed in.</p>
        ) : (
          <form onSubmit={e => { e.preventDefault(); if (clean.length === 6) void join(); }} className="space-y-3">
            <Input value={code} onChange={e => setCode(e.target.value.toUpperCase())} autoFocus maxLength={7} placeholder="ABC-234"
              autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-label="Game code" data-testid="join-code-input"
              className="h-14 text-center font-mono text-2xl font-bold tracking-[0.25em]" />
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            <Button type="submit" className="w-full" disabled={clean.length !== 6 || busy} data-testid="join-code-submit">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Join game
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
