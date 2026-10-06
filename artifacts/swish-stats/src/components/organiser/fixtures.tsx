import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { format, addDays, parseISO } from "date-fns";
import { AlertTriangle, CalendarPlus, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { createFixtures, listLeagueTeams, listVenues, roundRobin, type FixtureInput, type LeagueTeam } from "@/lib/organiser";
import { teamsKey } from "./teams-tab";
import { venuesKey } from "./venues-rules";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
const NONE = "__none";

/** The bits of an existing game needed to spot a clash. */
export type ScheduledGame = {
  date: string;
  tipoffTime?: string | null;
  venueUid?: string | null;
  homeLeagueTeamUid?: string | null;
  awayLeagueTeamUid?: string | null;
  gameNumber?: number | null;
  status: string;
};

/** Why a new fixture might be a mistake: a team twice in one day, or a court double-booked. */
export function clashes(f: FixtureInput, others: ScheduledGame[], teams: LeagueTeam[]): string[] {
  const out: string[] = [];
  const name = (uid: string) => teams.find(t => t.uid === uid)?.name ?? "A team";
  for (const g of others) {
    if (g.date.slice(0, 10) !== f.date) continue;
    for (const uid of [f.homeUid, f.awayUid]) {
      if (uid && (g.homeLeagueTeamUid === uid || g.awayLeagueTeamUid === uid)) out.push(`${name(uid)} already play that day`);
    }
    if (f.venueUid && g.venueUid === f.venueUid && (!f.time || !g.tipoffTime || g.tipoffTime.slice(0, 5) === f.time.slice(0, 5))) {
      out.push(f.time && g.tipoffTime ? "That court already has a game at that time" : "That court already has a game that day");
    }
  }
  return [...new Set(out)];
}

function nextNumber(games: ScheduledGame[]) {
  return Math.max(0, ...games.map(g => g.gameNumber ?? 0)) + 1;
}

function useSetup(leagueUid: string) {
  const teams = useQuery({ queryKey: teamsKey(leagueUid), queryFn: () => listLeagueTeams(leagueUid) });
  const venues = useQuery({ queryKey: venuesKey(leagueUid), queryFn: () => listVenues(leagueUid) });
  return { teams: teams.data ?? [], venues: venues.data ?? [], loading: teams.isLoading || venues.isLoading };
}

export function NewFixtureDialog({ leagueUid, games, onClose, onCreated }: {
  leagueUid: string;
  games: ScheduledGame[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { teams, venues, loading } = useSetup(leagueUid);
  const [home, setHome] = useState("");
  const [away, setAway] = useState("");
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState(NONE);
  const [round, setRound] = useState("");
  const [number, setNumber] = useState(String(nextNumber(games)));
  const [busy, setBusy] = useState(false);

  const fixture: FixtureInput = {
    homeUid: home, awayUid: away, date, time: time || null, venueUid: venue === NONE ? null : venue,
    round: round || null, number: number ? Number(number) : null,
  };
  const warnings = home && away ? clashes(fixture, games, teams) : [];
  const ready = home && away && home !== away && date;

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Schedule a game</DialogTitle>
          <DialogDescription>Rosters, coaches and the league's rules are filled in for you.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : teams.length < 2 ? (
          <p className="text-sm text-muted-foreground py-4">Add at least two teams in the Teams tab first.</p>
        ) : (
          <div className="space-y-4 py-1">
            <div className="grid grid-cols-2 gap-3">
              <TeamSelect label="Home" value={home} onChange={setHome} teams={teams} exclude={away} testId="fixture-home" />
              <TeamSelect label="Away" value={away} onChange={setAway} teams={teams} exclude={home} testId="fixture-away" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="fx-date">Date</Label>
                <Input id="fx-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="fx-time">Tip-off</Label>
                <Input id="fx-time" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Venue</Label>
              <Select value={venue} onValueChange={setVenue}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Not set</SelectItem>
                  {venues.map(v => <SelectItem key={v.uid} value={v.uid}>{v.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-[1fr_7rem] gap-3">
              <div className="space-y-1.5"><Label htmlFor="fx-round">Round</Label>
                <Input id="fx-round" value={round} maxLength={40} placeholder="e.g. Round 3, Semi-final" onChange={e => setRound(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="fx-num">Game no.</Label>
                <Input id="fx-num" type="number" min={1} value={number} onChange={e => setNumber(e.target.value)} /></div>
            </div>
            {warnings.map(w => (
              <p key={w} className="flex items-center gap-2 text-sm text-amber-500"><AlertTriangle className="w-4 h-4 shrink-0" />{w}</p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!ready || busy} data-testid="create-fixture" onClick={async () => {
            setBusy(true);
            try { await createFixtures(leagueUid, [fixture]); toast.success("Game scheduled"); onCreated(); }
            catch (e) { err(e); } finally { setBusy(false); }
          }}>
            {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Schedule game
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TeamSelect({ label, value, onChange, teams, exclude, testId }: {
  label: string; value: string; onChange: (v: string) => void; teams: LeagueTeam[]; exclude: string; testId: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger data-testid={testId}><SelectValue placeholder="Choose a team" /></SelectTrigger>
        <SelectContent>
          {teams.filter(t => t.uid !== exclude).map(t => <SelectItem key={t.uid} value={t.uid}>{t.name}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ScheduleDialog({ leagueUid, games, onClose, onCreated }: {
  leagueUid: string;
  games: ScheduledGame[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { teams, venues, loading } = useSetup(leagueUid);
  const [left, setLeft] = useState<Set<string>>(new Set());   // teams left out
  const [legs, setLegs] = useState<"1" | "2">("1");
  const [start, setStart] = useState(format(new Date(), "yyyy-MM-dd"));
  const [gap, setGap] = useState("7");
  const [time, setTime] = useState("");
  const [venue, setVenue] = useState(NONE);
  const [busy, setBusy] = useState<number | null>(null);

  const playing = teams.filter(t => !left.has(t.uid));
  const fixtures = useMemo<(FixtureInput & { roundNo: number })[]>(() => {
    if (!start) return [];
    const first = nextNumber(games);
    return roundRobin(playing, legs === "2" ? 2 : 1).map((p, i) => ({
      roundNo: p.round,
      homeUid: p.home.uid, awayUid: p.away.uid,
      date: format(addDays(parseISO(start), (p.round - 1) * Math.max(0, Number(gap) || 0)), "yyyy-MM-dd"),
      time: time || null, venueUid: venue === NONE ? null : venue,
      round: `Round ${p.round}`, number: first + i,
    }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing.map(t => t.uid).join(), legs, start, gap, time, venue, games.length]);
  const rounds = [...new Set(fixtures.map(f => f.roundNo))];
  const name = (uid: string) => teams.find(t => t.uid === uid)?.name ?? "?";
  const existing = games.filter(g => g.homeLeagueTeamUid || g.awayLeagueTeamUid).length;

  return (
    <Dialog open onOpenChange={o => { if (!o && busy == null) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Build a round-robin schedule</DialogTitle>
          <DialogDescription>Every team plays every other team. Check the preview, then create all the games in one go — you can still edit or delete any of them afterwards.</DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : teams.length < 2 ? (
          <p className="text-sm text-muted-foreground py-4">Add at least two teams in the Teams tab first.</p>
        ) : (
          <div className="space-y-5 py-1">
            <div className="space-y-2">
              <Label>Teams taking part ({playing.length})</Label>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5">
                {teams.map(t => (
                  <label key={t.uid} className="flex items-center gap-2 text-sm cursor-pointer">
                    <Checkbox checked={!left.has(t.uid)} onCheckedChange={v => setLeft(s => {
                      const n = new Set(s); if (v) n.delete(t.uid); else n.add(t.uid); return n;
                    })} />
                    <span className="truncate">{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1.5 col-span-2 sm:col-span-1">
                <Label>Format</Label>
                <Select value={legs} onValueChange={v => setLegs(v as "1" | "2")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">Play once</SelectItem>
                    <SelectItem value="2">Home and away</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor="rr-start">First round</Label>
                <Input id="rr-start" type="date" value={start} onChange={e => setStart(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="rr-gap">Days between</Label>
                <Input id="rr-gap" type="number" min={0} max={60} value={gap} onChange={e => setGap(e.target.value)} /></div>
              <div className="space-y-1.5"><Label htmlFor="rr-time">Tip-off</Label>
                <Input id="rr-time" type="time" value={time} onChange={e => setTime(e.target.value)} /></div>
            </div>
            {venues.length > 0 && (
              <div className="space-y-1.5 max-w-xs">
                <Label>Venue for every game</Label>
                <Select value={venue} onValueChange={setVenue}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>Set later, game by game</SelectItem>
                    {venues.map(v => <SelectItem key={v.uid} value={v.uid}>{v.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            {existing > 0 && (
              <p className="flex items-center gap-2 text-sm text-amber-500">
                <AlertTriangle className="w-4 h-4 shrink-0" />This league already has {existing} scheduled game{existing === 1 ? "" : "s"} — these are added on top.
              </p>
            )}
            <div className="rounded-lg border border-border max-h-64 overflow-y-auto text-sm" data-testid="schedule-preview">
              {rounds.map(r => {
                const list = fixtures.filter(f => f.roundNo === r);
                return (
                  <div key={r} className="px-3 py-2 border-b border-border last:border-0">
                    <div className="sa-eyebrow mb-1">Round {r} · {format(parseISO(list[0].date), "EEE d MMM")}</div>
                    {list.map(f => <div key={f.number}>{name(f.homeUid)} <span className="text-muted-foreground">v</span> {name(f.awayUid)}</div>)}
                  </div>
                );
              })}
              {!fixtures.length && <div className="p-4 text-muted-foreground">Pick at least two teams.</div>}
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" disabled={busy != null} onClick={onClose}>Cancel</Button>
          <Button disabled={!fixtures.length || busy != null} data-testid="create-schedule" onClick={async () => {
            setBusy(fixtures.length);
            try {
              const made = await createFixtures(leagueUid, fixtures.map(({ roundNo: _r, ...f }) => f));
              toast.success(`${made} games scheduled`);
              onCreated();
            } catch (e) { err(e); onCreated(); } finally { setBusy(null); }
          }}>
            {busy != null ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CalendarPlus className="w-4 h-4 mr-2" />}
            Create {fixtures.length || ""} game{fixtures.length === 1 ? "" : "s"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
