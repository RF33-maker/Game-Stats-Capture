import { useState } from "react";
import { Loader2, ShieldCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SITE } from "@/lib/site";
import { useOrganiserAccess } from "@/hooks/use-organiser-access";

// Shown where "create a league" would be, until Swish has approved the account.
export function RequestOrganiserAccess() {
  const { state, isLoading, request } = useOrganiserAccess();
  const [organisation, setOrganisation] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (isLoading) return <Loader2 className="w-5 h-5 animate-spin text-primary" />;
  if (state === "approved") return null;

  if (state === "pending") {
    return (
      <div className="sa-card p-5 max-w-md text-left space-y-2" data-testid="organiser-access-pending">
        <div className="flex items-center gap-2 font-bold"><Clock className="w-4 h-4 text-primary" /> Request received</div>
        <p className="text-sm text-muted-foreground">
          Running leagues is a paid feature and we approve each account first. We'll email you when yours is ready.
          Scoring a game with a code from an organiser works in the meantime.
        </p>
      </div>
    );
  }

  if (state === "revoked") {
    return (
      <div className="sa-card p-5 max-w-md text-left space-y-2" data-testid="organiser-access-revoked">
        <div className="flex items-center gap-2 font-bold"><ShieldCheck className="w-4 h-4 text-primary" /> League access is switched off</div>
        <p className="text-sm text-muted-foreground">
          Email <a className="underline" href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> to have it reviewed.
        </p>
      </div>
    );
  }

  return (
    <form
      className="sa-card p-5 max-w-md w-full text-left space-y-3"
      data-testid="organiser-access-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const err = await request(organisation.trim(), note.trim());
        setBusy(false);
        if (err) setError(err);
      }}
    >
      <div className="flex items-center gap-2 font-bold"><ShieldCheck className="w-4 h-4 text-primary" /> Request league access</div>
      <p className="text-sm text-muted-foreground">
        Creating leagues and games is a paid feature, approved by {SITE.operator}. Tell us who you are and we'll be in touch.
      </p>
      <div className="space-y-1.5">
        <Label htmlFor="org-name">League or club</Label>
        <Input id="org-name" value={organisation} onChange={(e) => setOrganisation(e.target.value)} maxLength={200} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="org-note">Anything we should know (optional)</Label>
        <Textarea id="org-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} rows={3} />
      </div>
      {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
      <Button type="submit" disabled={busy || !organisation.trim()}>
        {busy && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
        Request access
      </Button>
    </form>
  );
}
