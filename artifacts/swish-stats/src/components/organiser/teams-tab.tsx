import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Link2, Loader2, Pencil, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PlayerSearchDialog, TeamSearchDialog } from "@/components/directory-search";
import { DIRECTORY_AVAILABLE, dedupeRoster, searchPlayers, splitName, type SitePlayer } from "@/lib/directory";
import {
  addSquadPlayers, addTeamManager, createLeagueTeam, deleteLeagueTeam, deleteSquadPlayer, listLeagueTeams,
  listSquad, listTeamManagers, myManagedTeamUids, removeTeamManager, updateLeagueTeam, updateSquadPlayer,
  type LeagueTeam, type SquadPlayer, type SquadPlayerInput,
} from "@/lib/organiser";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

export const teamsKey = (leagueUid: string) => ["organiser", "teams", leagueUid];

function abbreviate(name: string) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
}

function fromSite(p: SitePlayer): SquadPlayerInput {
  const { firstName, lastName } = splitName(p);
  return {
    jerseyNumber: p.shirtNumber ?? "", firstName, lastName, position: p.position,
    headshotUrl: p.photoUrl, sitePlayerId: p.playerId,
  };
}

export function TeamsTab({ leagueUid, siteLeagueId, canAdmin, canScore }: {
  leagueUid: string;
  siteLeagueId?: string | null;
  canAdmin: boolean;
  canScore: boolean;
}) {
  const qc = useQueryClient();
  const { data: teams, isLoading, error } = useQuery({ queryKey: teamsKey(leagueUid), queryFn: () => listLeagueTeams(leagueUid) });
  const { data: managed } = useQuery({ queryKey: ["organiser", "managed"], queryFn: myManagedTeamUids });
  const [editing, setEditing] = useState<LeagueTeam | "new" | null>(null);
  const [squadOf, setSquadOf] = useState<LeagueTeam | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: teamsKey(leagueUid) });

  return (
    <section className="space-y-4" data-testid="teams-tab">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-2xl font-bold">Teams{teams?.length ? <span className="text-muted-foreground font-normal text-base ml-2">({teams.length})</span> : null}</h2>
          <p className="text-sm text-muted-foreground">Set each team up once with its season squad. Every fixture starts with these rosters.</p>
        </div>
        {canAdmin && (
          <Button onClick={() => setEditing("new")} data-testid="add-team"><Plus className="w-4 h-4 mr-2" />Add team</Button>
        )}
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="sa-card p-6 text-sm text-muted-foreground">{(error as Error).message}</div>
      ) : !teams?.length ? (
        <div className="sa-card py-14 text-center text-muted-foreground space-y-1">
          <Users className="w-8 h-8 mx-auto opacity-40" />
          <p className="font-medium text-foreground">No teams yet</p>
          <p className="text-sm">{canAdmin ? "Add the teams in this league, then build the schedule." : "The league organiser hasn't added teams yet."}</p>
        </div>
      ) : (
        <div className="sa-card divide-y divide-border overflow-hidden">
          {teams.map(t => {
            const mine = managed?.has(t.uid) ?? false;
            return (
              <div key={t.uid} className="flex items-center gap-3 px-5 py-3.5" data-testid="league-team-row">
                <span className="w-9 h-9 rounded-full shrink-0 border border-border flex items-center justify-center text-[10px] font-bold"
                  style={{ backgroundColor: t.colorPrimary ?? "hsl(var(--secondary))", color: t.colorSecondary ?? "#fff" }}>
                  {t.abbreviation || abbreviate(t.name)}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate flex items-center gap-2">
                    {t.name}
                    {t.siteTeamId && <Link2 className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Linked to a Swish team" />}
                    {mine && <span className="text-[10px] uppercase tracking-wider font-bold text-primary">Your team</span>}
                  </div>
                  <div className="text-xs text-muted-foreground truncate">
                    {t.squadCount} player{t.squadCount === 1 ? "" : "s"}
                    {t.headCoach ? ` · Coach ${t.headCoach}` : ""}
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setSquadOf(t)} data-testid="open-squad">
                  <Users className="w-3.5 h-3.5 mr-1.5" />Squad
                </Button>
                {(canAdmin || mine) && (
                  <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${t.name}`} onClick={() => setEditing(t)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <TeamDialog
          leagueUid={leagueUid} siteLeagueId={siteLeagueId} team={editing === "new" ? null : editing} canDelete={canAdmin}
          onClose={() => setEditing(null)}
          onSaved={(t, isNew) => { refresh(); setEditing(null); if (isNew && t) setSquadOf(t); }}
        />
      )}
      {squadOf && (
        <SquadDialog
          team={squadOf} siteLeagueId={siteLeagueId}
          canEdit={canScore || (managed?.has(squadOf.uid) ?? false)} canAdmin={canAdmin}
          onClose={() => { setSquadOf(null); refresh(); }}
        />
      )}
    </section>
  );
}

function TeamDialog({ leagueUid, siteLeagueId, team, canDelete, onClose, onSaved }: {
  leagueUid: string;
  siteLeagueId?: string | null;
  team: LeagueTeam | null;
  canDelete: boolean;
  onClose: () => void;
  onSaved: (team: LeagueTeam | null, isNew: boolean) => void;
}) {
  const [name, setName] = useState(team?.name ?? "");
  const [abbr, setAbbr] = useState(team?.abbreviation ?? "");
  const [abbrTouched, setAbbrTouched] = useState(!!team?.abbreviation);
  const [primary, setPrimary] = useState(team?.colorPrimary ?? "#f97316");
  const [secondary, setSecondary] = useState(team?.colorSecondary ?? "#ffffff");
  const [headCoach, setHeadCoach] = useState(team?.headCoach ?? "");
  const [assistant, setAssistant] = useState(team?.assistantCoach ?? "");
  const [siteTeamId, setSiteTeamId] = useState<string | null>(team?.siteTeamId ?? null);
  const [logoUrl, setLogoUrl] = useState<string | null>(team?.logoUrl ?? null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      const input = {
        name, abbreviation: abbr || abbreviate(name), colorPrimary: primary, colorSecondary: secondary,
        headCoach, assistantCoach: assistant, siteTeamId, logoUrl,
      };
      if (team) { await updateLeagueTeam(team.uid, input); onSaved(null, false); }
      else onSaved(await createLeagueTeam(leagueUid, input), true);
      toast.success(team ? "Team saved" : "Team added");
    } catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{team ? "Edit team" : "Add a team"}</DialogTitle>
          <DialogDescription>Colours and coaches are copied onto every fixture this team plays.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          {DIRECTORY_AVAILABLE && (
            <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
              <div className="text-sm min-w-0">
                <div className="font-medium">{siteTeamId ? "Linked to a Swish team" : "Already on swishassistant.com?"}</div>
                <div className="text-xs text-muted-foreground">{siteTeamId ? "Stats will publish under the existing team." : "Link it so stats land on the existing team page."}</div>
              </div>
              {siteTeamId ? (
                <Button size="sm" variant="ghost" onClick={() => setSiteTeamId(null)}>Unlink</Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => setSearchOpen(true)}><Search className="w-3.5 h-3.5 mr-1.5" />Find team</Button>
              )}
            </div>
          )}
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-name">Team name</Label>
              <Input id="lt-name" value={name} autoFocus placeholder="e.g. Riverside Hawks"
                onChange={e => { setName(e.target.value); if (!abbrTouched) setAbbr(abbreviate(e.target.value)); }} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-abbr">Short name</Label>
              <Input id="lt-abbr" value={abbr} maxLength={6} placeholder="HAW"
                onChange={e => { setAbbr(e.target.value.toUpperCase()); setAbbrTouched(true); }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-c1">Kit colour</Label>
              <Input id="lt-c1" type="color" value={primary} onChange={e => setPrimary(e.target.value)} className="h-10 p-1" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-c2">Number colour</Label>
              <Input id="lt-c2" type="color" value={secondary} onChange={e => setSecondary(e.target.value)} className="h-10 p-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="lt-hc">Head coach</Label>
              <Input id="lt-hc" value={headCoach} onChange={e => setHeadCoach(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lt-ac">Assistant coach</Label>
              <Input id="lt-ac" value={assistant} onChange={e => setAssistant(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter className="sm:justify-between gap-2">
          {team && canDelete ? (
            confirmDelete ? (
              <Button variant="destructive" disabled={busy} onClick={async () => {
                setBusy(true);
                try { await deleteLeagueTeam(team.uid); toast.success("Team deleted"); onSaved(null, false); }
                catch (e) { err(e); } finally { setBusy(false); }
              }}>Delete team and squad</Button>
            ) : (
              <Button variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />Delete
              </Button>
            )
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
            <Button onClick={save} disabled={!name.trim() || busy} data-testid="save-team">
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}{team ? "Save" : "Add team"}
            </Button>
          </div>
        </DialogFooter>
        <TeamSearchDialog
          open={searchOpen} onOpenChange={setSearchOpen} initialQuery={name} competitionId={siteLeagueId ?? undefined}
          onPick={t => {
            setSiteTeamId(t.teamId); setLogoUrl(t.logoUrl);
            if (!name.trim()) { setName(t.name); if (!abbrTouched) setAbbr(abbreviate(t.name)); }
            setSearchOpen(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SquadDialog({ team, siteLeagueId, canEdit, canAdmin, onClose }: {
  team: LeagueTeam;
  siteLeagueId?: string | null;
  canEdit: boolean;
  canAdmin: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const key = ["organiser", "squad", team.uid];
  const { data: squad, isLoading } = useQuery({ queryKey: key, queryFn: () => listSquad(team.uid) });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const [num, setNum] = useState("");
  const [first, setFirst] = useState("");
  const [last, setLast] = useState("");
  const [pos, setPos] = useState("");
  const [busy, setBusy] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const run = async (fn: () => Promise<unknown>, done?: string) => {
    setBusy(true);
    try { await fn(); if (done) toast.success(done); await refresh(); }
    catch (e) { err(e); } finally { setBusy(false); }
  };

  const add = () => run(async () => {
    await addSquadPlayers(team.uid, [{ jerseyNumber: num, firstName: first, lastName: last, position: pos || null }]);
    setNum(""); setFirst(""); setLast(""); setPos("");
  });

  const importRoster = () => run(async () => {
    const roster = dedupeRoster(await searchPlayers("", { teamId: team.siteTeamId, limit: 200 }));
    const have = new Set((squad ?? []).map(p => p.sitePlayerId).filter(Boolean));
    const fresh = roster.filter(p => !have.has(p.playerId));
    if (!fresh.length) { toast.info("Everyone on the Swish roster is already in the squad"); return; }
    await addSquadPlayers(team.uid, fresh.map(fromSite));
    toast.success(`Added ${fresh.length} player${fresh.length === 1 ? "" : "s"} from Swish`);
  });

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const p of squad ?? []) {
    if (!p.isActive || p.jerseyNumber === "") continue;
    if (seen.has(p.jerseyNumber)) duplicates.add(p.jerseyNumber);
    seen.add(p.jerseyNumber);
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{team.name} — season squad</DialogTitle>
          <DialogDescription>
            Active players are copied onto each new fixture. Turn a player off rather than deleting them if they've left mid-season.
          </DialogDescription>
        </DialogHeader>

        {canEdit && DIRECTORY_AVAILABLE && (
          <div className="flex gap-2 flex-wrap">
            {team.siteTeamId && (
              <Button size="sm" variant="secondary" disabled={busy} onClick={importRoster} data-testid="import-squad">
                <Download className="w-3.5 h-3.5 mr-1.5" />Import roster from Swish
              </Button>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={() => setSearchOpen(true)}>
              <Search className="w-3.5 h-3.5 mr-1.5" />Find a player on Swish
            </Button>
          </div>
        )}

        {isLoading ? (
          <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : (
          <div className="rounded-lg border border-border divide-y divide-border">
            {!squad?.length && <div className="p-6 text-center text-sm text-muted-foreground">No players yet.</div>}
            {squad?.map(p => (
              <SquadRow key={p.uid} p={p} canEdit={canEdit} duplicate={duplicates.has(p.jerseyNumber) && p.isActive}
                onChange={input => run(() => updateSquadPlayer(p.uid, input))}
                onDelete={() => run(() => deleteSquadPlayer(p.uid))} />
            ))}
          </div>
        )}
        {duplicates.size > 0 && (
          <p className="text-xs text-amber-500">Two active players share number {[...duplicates].join(", ")}.</p>
        )}

        {canEdit && (
          <form className="grid grid-cols-[4rem_1fr_1fr_4.5rem_auto] gap-2 items-end" onSubmit={e => { e.preventDefault(); if (first.trim() || last.trim()) void add(); }}>
            <div className="space-y-1"><Label htmlFor="sq-num" className="text-xs">No.</Label>
              <Input id="sq-num" value={num} maxLength={4} inputMode="numeric" onChange={e => setNum(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="sq-first" className="text-xs">First name</Label>
              <Input id="sq-first" value={first} onChange={e => setFirst(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="sq-last" className="text-xs">Last name</Label>
              <Input id="sq-last" value={last} onChange={e => setLast(e.target.value)} /></div>
            <div className="space-y-1"><Label htmlFor="sq-pos" className="text-xs">Pos.</Label>
              <Input id="sq-pos" value={pos} maxLength={3} onChange={e => setPos(e.target.value.toUpperCase())} /></div>
            <Button type="submit" disabled={busy || !(first.trim() || last.trim())} data-testid="add-squad-player"><Plus className="w-4 h-4 mr-1" />Add</Button>
          </form>
        )}

        {canAdmin && <Managers team={team} />}

        <PlayerSearchDialog
          open={searchOpen} onOpenChange={setSearchOpen} competitionId={siteLeagueId ?? undefined}
          title="Find a player on Swish" description="Adds them to the squad with their existing Swish profile."
          onPick={p => {
            setSearchOpen(false);
            if (squad?.some(s => s.sitePlayerId === p.playerId)) { toast.info("Already in the squad"); return; }
            void run(() => addSquadPlayers(team.uid, [fromSite(p)]), `${p.fullName} added`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function SquadRow({ p, canEdit, duplicate, onChange, onDelete }: {
  p: SquadPlayer; canEdit: boolean; duplicate: boolean;
  onChange: (input: SquadPlayerInput) => void; onDelete: () => void;
}) {
  const [num, setNum] = useState(p.jerseyNumber);
  const [first, setFirst] = useState(p.firstName);
  const [last, setLast] = useState(p.lastName);
  const commit = () => {
    if (num !== p.jerseyNumber || first !== p.firstName || last !== p.lastName) onChange({ jerseyNumber: num, firstName: first, lastName: last });
  };
  if (!canEdit) {
    return (
      <div className={`flex items-center gap-3 px-3 py-2 text-sm ${p.isActive ? "" : "opacity-50"}`}>
        <span className="w-8 font-mono font-bold text-right">{p.jerseyNumber}</span>
        <span className="flex-1 truncate">{p.firstName} {p.lastName}</span>
        <span className="text-xs text-muted-foreground">{p.position}</span>
      </div>
    );
  }
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 ${p.isActive ? "" : "opacity-60"}`} data-testid="squad-row">
      <Input value={num} maxLength={4} aria-label="Number" onChange={e => setNum(e.target.value)} onBlur={commit}
        className={`w-14 h-8 text-center font-mono font-bold ${duplicate ? "border-amber-500" : ""}`} />
      <Input value={first} aria-label="First name" onChange={e => setFirst(e.target.value)} onBlur={commit} className="h-8 flex-1 min-w-0" />
      <Input value={last} aria-label="Last name" onChange={e => setLast(e.target.value)} onBlur={commit} className="h-8 flex-1 min-w-0" />
      {p.sitePlayerId && <Link2 className="w-3.5 h-3.5 text-primary shrink-0" aria-label="Linked to a Swish profile" />}
      <Switch checked={p.isActive} onCheckedChange={v => onChange({ isActive: v })} aria-label={p.isActive ? "Active" : "Inactive"} />
      <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label="Remove player" onClick={onDelete}>
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}

function Managers({ team }: { team: LeagueTeam }) {
  const qc = useQueryClient();
  const key = ["organiser", "managers", team.uid];
  const { data } = useQuery({ queryKey: key, queryFn: () => listTeamManagers(team.uid) });
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await qc.invalidateQueries({ queryKey: key }); } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <div className="space-y-2 pt-3 border-t border-border">
      <div>
        <h3 className="font-semibold text-sm">Team managers</h3>
        <p className="text-xs text-muted-foreground">A manager can keep this squad up to date and fix their own roster before tip-off. They can't score games or see other teams' details.</p>
      </div>
      {data?.map(m => (
        <div key={m.userId} className="flex items-center gap-2 text-sm">
          <span className="flex-1 truncate">{m.email ?? m.userId}</span>
          <Button size="icon" variant="ghost" className="h-7 w-7 text-muted-foreground hover:text-destructive" aria-label="Remove manager"
            disabled={busy} onClick={() => run(() => removeTeamManager(team.uid, m.userId))}><Trash2 className="w-3.5 h-3.5" /></Button>
        </div>
      ))}
      <form className="flex gap-2" onSubmit={e => { e.preventDefault(); void run(async () => { await addTeamManager(team.uid, email); setEmail(""); toast.success("Manager added"); }); }}>
        <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="manager@club.com" className="h-9" />
        <Button type="submit" size="sm" variant="secondary" disabled={busy || !email.trim()}><UserPlus className="w-3.5 h-3.5 mr-1.5" />Add</Button>
      </form>
    </div>
  );
}
