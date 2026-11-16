import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { teamTextColor, appSurface } from "@/lib/team-colors";
import type { PlayerFouls } from "@/lib/game-state";

type SubPlayer = { id: number; jerseyNumber: string | number; lastName: string };

// Substitutions from one button: pick who goes off and who comes on, as many
// as there are at the dead ball. Pairs are made in the order they're tapped.
export function SubDialog({
  open, onOpenChange, team, onCourt, bench, fouls, presetOut, reason, onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  team: { id: number; abbreviation: string; colorPrimary: string };
  onCourt: SubPlayer[];
  bench: SubPlayer[];
  fouls: Map<number, PlayerFouls>;
  // Already picked to go off (a player who has just fouled out).
  presetOut?: number[];
  // Why it opened by itself, shown at the top ("#7 Smith has fouled out").
  reason?: string;
  onSubmit: (pairs: { outId: number; inId: number }[]) => Promise<boolean>;
}) {
  const [outIds, setOutIds] = useState<number[]>([]);
  const [inIds, setInIds] = useState<number[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setOutIds(presetOut ?? []); setInIds([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const flip = (list: number[], id: number) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const ready = outIds.length > 0 && outIds.length === inIds.length;
  const color = teamTextColor(team.colorPrimary, appSurface());

  const submit = async () => {
    setSaving(true);
    try {
      if (await onSubmit(outIds.map((outId, i) => ({ outId, inId: inIds[i] })))) onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  const row = (p: SubPlayer, side: "out" | "in") => {
    const list = side === "out" ? outIds : inIds;
    const order = list.indexOf(p.id);
    const picked = order >= 0;
    const f = fouls.get(p.id);
    const barred = side === "in" && !!f?.out;
    return (
      <button key={p.id} type="button" disabled={barred}
        onClick={() => (side === "out" ? setOutIds(flip(outIds, p.id)) : setInIds(flip(inIds, p.id)))}
        data-testid={`sub-${side}`} data-picked={picked ? "true" : "false"}
        title={barred ? (f?.out === "ejected" ? "Ejected: can't return" : "Fouled out: can't return") : undefined}
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg border-2 text-left transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          picked ? (side === "out" ? "border-red-400 bg-red-500/10" : "border-emerald-400 bg-emerald-500/10") : "border-transparent bg-secondary/60 hover:bg-accent"
        }`}>
        <span className="font-mono font-black text-lg w-8 text-center" style={{ color }}>{p.jerseyNumber}</span>
        <span className={`flex-1 min-w-0 truncate font-semibold uppercase text-sm ${barred ? "line-through" : ""}`}>{p.lastName}</span>
        {f && f.total > 0 && (
          <span className={`text-[10px] font-mono font-bold px-1 rounded ${f.out ? "bg-red-600 text-white" : "bg-foreground/10 text-muted-foreground"}`}>
            {f.out ? "OUT" : `${f.total}F`}
          </span>
        )}
        {picked && <span className="text-[11px] font-bold font-mono text-muted-foreground">{order + 1}</span>}
      </button>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card text-foreground border-border sm:max-w-[620px] max-h-[90dvh] flex flex-col" data-testid="sub-dialog">
        <DialogHeader>
          <DialogTitle className="text-2xl font-black uppercase tracking-tighter">
            <span style={{ color }}>{team.abbreviation}</span> substitution
          </DialogTitle>
          <DialogDescription>
            {reason ? <span className="text-red-400 font-semibold">{reason}. </span> : null}
            Tap who goes off and who comes on. Several at once is fine: they pair up in the order you tap them.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 overflow-y-auto min-h-0">
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-red-400 flex items-center gap-1 mb-1"><ArrowDown className="w-3.5 h-3.5" /> Going off</div>
            {onCourt.map(p => row(p, "out"))}
          </div>
          <div className="space-y-1">
            <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1 mb-1"><ArrowUp className="w-3.5 h-3.5" /> Coming on</div>
            {bench.length === 0
              ? <p className="text-sm text-muted-foreground">Nobody on the bench. Add a player from the team panel.</p>
              : bench.map(p => row(p, "in"))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="font-bold" disabled={!ready || saving} onClick={() => void submit()} data-testid="sub-confirm">
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            {outIds.length !== inIds.length
              ? `${outIds.length} off · ${inIds.length} on`
              : ready ? `Make ${outIds.length === 1 ? "the sub" : `${outIds.length} subs`}` : "Pick the players"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
