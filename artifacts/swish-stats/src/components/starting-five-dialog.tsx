import { useEffect, useState } from "react";
import { Link } from "wouter";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShirtNumberInput } from "@/components/shirt-number-input";
import { localApi } from "@/lib/directory";
import { teamTextColor, appSurface } from "@/lib/team-colors";

type RosterPlayer = { id: number; teamId: number; jerseyNumber: string; firstName: string; lastName: string; isStarter: boolean; isActive: boolean };
type DialogTeam = { id: number; name: string; abbreviation: string; colorPrimary: string };

// The starting five, checked when the players walk out rather than during
// warm-ups. A team's starters can change until its first substitution: after
// that, who is on court is worked out from the subs, so changes go through SUB.
export function StartingFiveDialog({
  open, onOpenChange, teams, players, lockedTeamIds, hasPlays, required, backHref, onSaved, onConfirmed,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teams: DialogTeam[]; // away, home
  players: RosterPlayer[];
  lockedTeamIds: Set<number>;
  hasPlays: boolean;
  // A team is missing its five: the game can't be scored until it's picked.
  required: boolean;
  backHref: string;
  // Refreshes the roster; awaited so the screen never sees the old starters after saving.
  onSaved: () => unknown;
  onConfirmed: () => void;
}) {
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);

  // Start from the saved starters each time it opens.
  useEffect(() => {
    if (open) setPicked(new Set(players.filter(p => p.isStarter).map(p => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const toggle = (p: RosterPlayer) => {
    if (lockedTeamIds.has(p.teamId)) return;
    const next = new Set(picked);
    if (next.has(p.id)) next.delete(p.id);
    else {
      if (players.filter(o => o.teamId === p.teamId && next.has(o.id)).length >= 5) {
        toast.error("Five starters already. Untick one first");
        return;
      }
      next.add(p.id);
    }
    setPicked(next);
  };

  const countFor = (teamId: number) => players.filter(p => p.teamId === teamId && picked.has(p.id)).length;
  const ready = teams.every(t => lockedTeamIds.has(t.id) || countFor(t.id) === 5);

  const confirm = async () => {
    setSaving(true);
    try {
      for (const p of players) {
        if (lockedTeamIds.has(p.teamId)) continue;
        const starts = picked.has(p.id);
        if (starts === p.isStarter && (!starts || p.isActive)) continue;
        // Starting puts a player on the game roster too.
        await localApi(`/api/players/${p.id}`, "PATCH", { isStarter: starts, ...(starts && !p.isActive ? { isActive: true } : {}) });
      }
      await onSaved();
      onConfirmed();
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the starters");
    } finally {
      setSaving(false);
    }
  };

  const byNumber = (a: RosterPlayer, b: RosterPlayer) => (parseInt(a.jerseyNumber) || 999) - (parseInt(b.jerseyNumber) || 999);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && required && !ready) return; onOpenChange(o); }}>
      <DialogContent className="bg-card text-foreground border-border sm:max-w-[760px] max-h-[90dvh] flex flex-col" data-testid="starting-five-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase tracking-tighter">Starting five</DialogTitle>
          <DialogDescription>
            Check who walks out for the tip. Tap a player to start or bench them, and fix a shirt number here if it's wrong.
            {hasPlays && " Plays already recorded stay with the player they were credited to."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid sm:grid-cols-2 gap-4 overflow-y-auto min-h-0 py-1">
          {teams.map(team => {
            const locked = lockedTeamIds.has(team.id);
            const list = players.filter(p => p.teamId === team.id).sort(byNumber);
            const count = countFor(team.id);
            return (
              <div key={team.id} className="min-w-0" data-testid={`starters-${team.abbreviation}`}>
                <div className="flex items-center justify-between mb-2">
                  <div className="font-black text-lg" style={{ color: teamTextColor(team.colorPrimary, appSurface()) }}>{team.abbreviation}</div>
                  <div className={`text-xs font-bold font-mono ${count === 5 ? "text-emerald-400" : "text-amber-400"}`} data-testid="starters-count">{count}/5</div>
                </div>
                {locked && (
                  <p className="text-xs text-muted-foreground mb-2">{team.name} have made a substitution, so the starters are fixed. Use SUB to change who's on court.</p>
                )}
                <div className="space-y-1">
                  {list.map(p => {
                    const on = picked.has(p.id);
                    return (
                      <div key={p.id} className={`flex items-center gap-2 rounded-lg border px-2 py-1 ${on ? "border-primary bg-primary/10" : "border-transparent bg-secondary/60"} ${!p.isActive && !on ? "opacity-60" : ""}`}>
                        <ShirtNumberInput player={p} taken={list.filter(o => o.id !== p.id).map(o => o.jerseyNumber)} onSaved={onSaved} />
                        <button type="button" disabled={locked} onClick={() => toggle(p)} data-testid="starter-toggle" data-on={on ? "true" : "false"}
                          className="flex-1 min-w-0 flex items-center justify-between gap-2 text-left disabled:cursor-not-allowed">
                          <span className="truncate font-semibold text-sm">
                            {p.lastName}, {p.firstName}
                            {!p.isActive && <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">not playing</span>}
                          </span>
                          <span className={`shrink-0 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded ${on ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
                            {on ? "Starts" : "Bench"}
                          </span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {required && !ready
            ? <Link href={backHref}><Button variant="ghost">Back to league</Button></Link>
            : <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>}
          <Button className="font-bold" disabled={!ready || saving} onClick={() => void confirm()} data-testid="starters-confirm">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {ready ? "These are the starters" : "Pick 5 for each team"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
