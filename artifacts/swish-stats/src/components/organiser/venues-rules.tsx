import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, MapPin, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CAPTURE_MODES } from "@/lib/app-settings";
import { localApi } from "@/lib/directory";
import { leagueRules, type LeagueRules } from "@/lib/local-store";
import { deleteVenue, listVenues, saveVenue } from "@/lib/organiser";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");
export const venuesKey = (leagueUid: string) => ["organiser", "venues", leagueUid];

export function VenuesTab({ leagueUid, canAdmin }: { leagueUid: string; canAdmin: boolean }) {
  const qc = useQueryClient();
  const { data: venues, isLoading, error } = useQuery({ queryKey: venuesKey(leagueUid), queryFn: () => listVenues(leagueUid) });
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try { await fn(); await qc.invalidateQueries({ queryKey: venuesKey(leagueUid) }); } catch (e) { err(e); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-4" data-testid="venues-tab">
      <div>
        <h2 className="text-2xl font-bold">Venues</h2>
        <p className="text-sm text-muted-foreground">The courts your league plays on. Pick one when scheduling so two games can't land on the same court at the same time unnoticed.</p>
      </div>
      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="sa-card p-6 text-sm text-muted-foreground">{(error as Error).message}</div>
      ) : (
        <div className="sa-card divide-y divide-border overflow-hidden">
          {!venues?.length && <div className="p-8 text-center text-sm text-muted-foreground">No venues yet.</div>}
          {venues?.map(v => (
            <div key={v.uid} className="flex items-center gap-3 px-5 py-3">
              <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{v.name}</div>
                {v.address && <div className="text-xs text-muted-foreground truncate">{v.address}</div>}
              </div>
              {canAdmin && (
                <Button size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive" aria-label={`Delete ${v.name}`}
                  disabled={busy} onClick={() => run(() => deleteVenue(v.uid))}><Trash2 className="w-3.5 h-3.5" /></Button>
              )}
            </div>
          ))}
        </div>
      )}
      {canAdmin && (
        <form className="grid sm:grid-cols-[1fr_1.4fr_auto] gap-2 items-end"
          onSubmit={e => { e.preventDefault(); void run(async () => { await saveVenue(leagueUid, { name, address }); setName(""); setAddress(""); }); }}>
          <div className="space-y-1"><Label htmlFor="v-name" className="text-xs">Venue name</Label>
            <Input id="v-name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riverside Leisure Centre" /></div>
          <div className="space-y-1"><Label htmlFor="v-addr" className="text-xs">Address (optional)</Label>
            <Input id="v-addr" value={address} onChange={e => setAddress(e.target.value)} /></div>
          <Button type="submit" disabled={busy || !name.trim()} data-testid="add-venue"><Plus className="w-4 h-4 mr-1" />Add venue</Button>
        </form>
      )}
    </section>
  );
}

const NUMBER_FIELDS: { key: Exclude<keyof LeagueRules, "defaultCaptureMode">; label: string; hint?: string; min: number; max: number }[] = [
  { key: "periodCount", label: "Periods", min: 1, max: 8 },
  { key: "periodDurationMins", label: "Minutes per period", min: 1, max: 60 },
  { key: "overtimeDurationMins", label: "Minutes per overtime", min: 1, max: 30 },
  { key: "foulLimit", label: "Fouls to foul out", hint: "FIBA 5, NBA 6", min: 3, max: 8 },
  { key: "bonusAfterTeamFouls", label: "Team fouls before the bonus", hint: "Free throws from the next foul", min: 2, max: 10 },
  { key: "timeoutsFirstHalf", label: "Timeouts — first half", min: 0, max: 6 },
  { key: "timeoutsSecondHalf", label: "Timeouts — second half", min: 0, max: 6 },
  { key: "timeoutsOvertime", label: "Timeouts — each overtime", min: 0, max: 3 },
];

export function RulesTab({ leagueId, league, canAdmin, onSaved }: {
  leagueId: number;
  league: Partial<LeagueRules>;
  canAdmin: boolean;
  onSaved: () => void;
}) {
  const [rules, setRules] = useState<LeagueRules>(() => leagueRules(league));
  const [busy, setBusy] = useState(false);
  const current = JSON.stringify(leagueRules(league));
  useEffect(() => { setRules(JSON.parse(current)); }, [current]);
  const dirty = JSON.stringify(rules) !== current;
  const invalid = NUMBER_FIELDS.some(f => !(rules[f.key] >= f.min && rules[f.key] <= f.max));

  return (
    <section className="space-y-4" data-testid="rules-tab">
      <div>
        <h2 className="text-2xl font-bold">Competition rules</h2>
        <p className="text-sm text-muted-foreground">Every new game in this league starts with these. Games already created keep the rules they were made with.</p>
      </div>
      <div className="sa-card p-6 space-y-5">
        <div className="space-y-1.5 max-w-md">
          <Label>Capture version</Label>
          <Select value={rules.defaultCaptureMode} disabled={!canAdmin}
            onValueChange={v => setRules(r => ({ ...r, defaultCaptureMode: v as LeagueRules["defaultCaptureMode"] }))}>
            <SelectTrigger data-testid="rules-mode"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["complex", "simple"] as const).map(m => (
                <SelectItem key={m} value={m}>{CAPTURE_MODES[m].name} — {CAPTURE_MODES[m].description}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {NUMBER_FIELDS.map(f => (
            <div key={f.key} className="space-y-1.5">
              <Label htmlFor={`rule-${f.key}`}>{f.label}</Label>
              <Input id={`rule-${f.key}`} type="number" min={f.min} max={f.max} disabled={!canAdmin} value={rules[f.key]}
                onChange={e => setRules(r => ({ ...r, [f.key]: Number(e.target.value) }))} />
              {f.hint && <p className="text-xs text-muted-foreground">{f.hint}</p>}
            </div>
          ))}
        </div>
        {canAdmin && (
          <div className="flex justify-end">
            <Button disabled={!dirty || invalid || busy} data-testid="save-rules" onClick={async () => {
              setBusy(true);
              try { await localApi(`/api/leagues/${leagueId}`, "PATCH", rules); toast.success("Rules saved"); onSaved(); }
              catch (e) { err(e); } finally { setBusy(false); }
            }}>
              {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save rules
            </Button>
          </div>
        )}
      </div>
    </section>
  );
}
