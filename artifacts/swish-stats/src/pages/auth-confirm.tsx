import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { supabase } from "@/lib/supabase";
import { resendConfirmation, friendlyAuthError } from "@/lib/auth";

type OtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

// Where an emailed sign-up or sign-in link lands. Two shapes of link arrive:
//  - a Supabase link that has already signed the person in (tokens in the URL
//    hash, which the client picks up on its own): wait for the session;
//  - a link carrying ?token_hash=... (an email template that sends people to
//    the app first): confirm only when they press the button, because mail
//    scanners open links and would otherwise use the one-time token up.
export default function AuthConfirm() {
  const [, navigate] = useLocation();
  const query = new URLSearchParams(window.location.search);
  const tokenHash = query.get("token_hash");
  const typeParam = query.get("type");
  const type: OtpType = (["invite", "magiclink", "recovery", "email_change", "email"] as const).find((t) => t === typeParam) ?? "signup";
  // Supabase reports a dead link in the hash: #error=access_denied&error_code=otp_expired
  const hashError = new URLSearchParams(window.location.hash.replace(/^#/, "")).get("error_description");

  const [status, setStatus] = useState<"waiting" | "idle" | "verifying" | "done" | "error">(
    hashError ? "error" : tokenHash ? "idle" : "waiting",
  );
  const [error, setError] = useState(hashError ? hashError.replace(/\+/g, " ") : "");
  const [email, setEmail] = useState("");
  const [resent, setResent] = useState(false);

  // Hash-style link: the session shows up a moment after the page loads.
  useEffect(() => {
    if (status !== "waiting") return;
    let live = true;
    const done = () => { if (live) setStatus("done"); };
    void supabase.auth.getSession().then(({ data }) => { if (data.session) done(); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => { if (session) done(); });
    const timer = setTimeout(() => {
      if (!live) return;
      setError("This link has expired or has already been used.");
      setStatus("error");
    }, 4000);
    return () => { live = false; sub.subscription.unsubscribe(); clearTimeout(timer); };
  }, [status]);

  useEffect(() => {
    if (status !== "done") return;
    const t = setTimeout(() => navigate("/leagues"), 1200);
    return () => clearTimeout(t);
  }, [status, navigate]);

  const confirm = async () => {
    if (!tokenHash) return;
    setStatus("verifying");
    const { error: err } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type } as Parameters<typeof supabase.auth.verifyOtp>[0]);
    if (err) {
      setError(/expired|invalid/i.test(err.message) ? "This link has expired or has already been used." : friendlyAuthError(err.message));
      setStatus("error");
      return;
    }
    setStatus("done");
  };

  const resend = async () => {
    if (!email.trim()) { setError("Enter your email and we'll send a new link."); return; }
    const err = await resendConfirmation(email);
    if (err) setError(friendlyAuthError(err)); else { setError(""); setResent(true); }
  };

  if (status === "done") {
    return (
      <AuthShell title="You're in">
        <p className="flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="w-5 h-5" />Email confirmed. Taking you to your leagues…</p>
        <Button className="w-full" onClick={() => navigate("/leagues")}>Continue</Button>
      </AuthShell>
    );
  }

  if (status === "idle" || status === "verifying") {
    return (
      <AuthShell title="Confirm your email" intro="One tap and you're signed in.">
        <Button size="lg" className="w-full" onClick={confirm} disabled={status === "verifying"}>
          {status === "verifying" && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
          Confirm and continue
        </Button>
      </AuthShell>
    );
  }

  if (status === "waiting") {
    return (
      <AuthShell title="Confirming…">
        <div className="flex justify-center py-4"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="That link didn't work" intro="Links in emails are single-use and expire. Ask for a new one below, or sign in if you've already confirmed.">
      {error && <p className="flex items-start gap-2 text-sm text-destructive" role="alert"><AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />{error}</p>}
      {resent ? (
        <p className="text-sm text-muted-foreground" role="status">New link sent. Check your inbox (and spam).</p>
      ) : (
        <div className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="resend-email">Email</Label>
            <Input id="resend-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <Button variant="secondary" className="w-full" onClick={resend}>Send a new confirmation email</Button>
        </div>
      )}
      <p className="text-sm text-muted-foreground">
        <Link href="/login" className="font-medium text-primary hover:underline underline-offset-2">Back to sign in</Link>
      </p>
    </AuthShell>
  );
}
