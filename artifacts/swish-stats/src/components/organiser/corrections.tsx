import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { Check, Loader2, MessageSquareWarning, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { listCorrections, requestCorrection, reviewCorrection, type Correction } from "@/lib/organiser";

const err = (e: unknown) => toast.error(e instanceof Error ? e.message : "Something went wrong");

const STATUS: Record<Correction["status"], { label: string; tone: string }> = {
  pending: { label: "Waiting", tone: "bg-amber-500/20 text-amber-500 border-amber-500/30" },
  approved: { label: "Accepted", tone: "bg-blue-500/20 text-blue-400 border-blue-500/30" },
  applied: { label: "Fixed", tone: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  rejected: { label: "Not changed", tone: "bg-muted text-muted-foreground border-border" },
};

/** Ask for (or, as an admin, deal with) fixes to a finished game. */
export function Corrections({ gameUid, canAdmin }: { gameUid: string; canAdmin: boolean }) {
  const qc = useQueryClient();
  const key = ["organiser", "corrections", gameUid];
  const { data, isLoading, error } = useQuery({ queryKey: key, queryFn: () => listCorrections(gameUid), retry: false });
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");

  const run = async (fn: () => Promise<unknown>, done: string) => {
    setBusy(true);
    try { await fn(); toast.success(done); await qc.invalidateQueries({ queryKey: ["organiser"] }); }
    catch (e) { err(e); } finally { setBusy(false); }
  };

  return (
    <div className="sa-card p-6 space-y-4 print:hidden" data-testid="corrections">
      <div className="flex items-start gap-3">
        <MessageSquareWarning className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div>
          <h2 className="font-bold text-lg leading-tight">Stat corrections</h2>
          <p className="text-sm text-muted-foreground">
            {canAdmin
              ? "This game is final. To fix something, reopen it from the league page, make the change, then mark the request as fixed."
              : "This game is final, so only the league organiser can change it. Spotted a mistake? Tell them here."}
          </p>
        </div>
      </div>

      {isLoading && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
      {error && <p className="text-sm text-muted-foreground">{(error as Error).message}</p>}
      {data?.map(c => (
        <div key={c.uid} className="rounded-lg border border-border p-3 space-y-2" data-testid="correction-row">
          <div className="flex items-center justify-between gap-2">
            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${STATUS[c.status].tone}`}>{STATUS[c.status].label}</span>
            <span className="text-xs text-muted-foreground">{c.mine ? "You, " : ""}{formatDistanceToNow(new Date(c.requestedAt), { addSuffix: true })}</span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{c.description}</p>
          {c.reviewNote && <p className="text-xs text-muted-foreground">Organiser: {c.reviewNote}</p>}
          {canAdmin && (c.status === "pending" || c.status === "approved") && (
            noteFor === c.uid ? (
              <div className="flex gap-2">
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Why it isn't being changed (optional)" aria-label="Reason"
                  className="flex-1 h-8 rounded-md border border-border bg-card px-2 text-sm" />
                <Button size="sm" variant="outline" disabled={busy} onClick={() => run(() => reviewCorrection(c.uid, "rejected", note), "Request closed").then(() => { setNoteFor(null); setNote(""); })}>Confirm</Button>
                <Button size="sm" variant="ghost" onClick={() => setNoteFor(null)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => run(() => reviewCorrection(c.uid, "applied"), "Marked as fixed")} data-testid="correction-applied">
                  <Check className="w-3.5 h-3.5 mr-1" />Mark as fixed
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setNoteFor(c.uid); setNote(""); }}>
                  <X className="w-3.5 h-3.5 mr-1" />Not changing
                </Button>
              </div>
            )
          )}
        </div>
      ))}

      <form className="space-y-2" onSubmit={e => { e.preventDefault(); void run(() => requestCorrection(gameUid, text), "Sent to the league organiser").then(() => setText("")); }}>
        <Textarea value={text} onChange={e => setText(e.target.value)} rows={2} maxLength={2000} data-testid="correction-text"
          placeholder={canAdmin ? "Note a correction to make (e.g. Q3 4:12 — the block was #7, not #9)" : "What needs fixing? e.g. Q3 4:12 — the block was #7, not #9"} />
        <div className="flex justify-end">
          <Button type="submit" size="sm" variant="secondary" disabled={busy || !text.trim()} data-testid="correction-send">
            {canAdmin ? "Add note" : "Send request"}
          </Button>
        </div>
      </form>
    </div>
  );
}
