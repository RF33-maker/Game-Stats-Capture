import { useEffect, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AuthShell } from "@/components/auth-shell";
import { supabase } from "@/lib/supabase";
import { updatePassword, friendlyAuthError } from "@/lib/auth";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy";

// Where "Forgot password?" emails land. The Supabase client reads the recovery
// tokens from the URL hash when the page loads and raises PASSWORD_RECOVERY;
// a ?token_hash=... link (template pointing at the app) is verified here.
export default function ResetPassword() {
  const [, navigate] = useLocation();
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const found = useRef(false);

  useEffect(() => {
    let live = true;
    const ok = () => { found.current = true; if (live) { setReady(true); setFailed(false); } };
    const tokenHash = new URLSearchParams(window.location.search).get("token_hash");
    if (tokenHash) {
      void supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error: err }) => {
        if (!live) return;
        if (err) setFailed(true); else ok();
      });
    } else {
      void supabase.auth.getSession().then(({ data }) => { if (data.session) ok(); });
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event) => { if (event === "PASSWORD_RECOVERY") ok(); });
    const timer = setTimeout(() => { if (live && !found.current) setFailed(true); }, 4000);
    return () => { live = false; sub.subscription.unsubscribe(); clearTimeout(timer); };
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const problem = validatePassword(password);
    if (problem) { setError(problem); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setBusy(true);
    const err = await updatePassword(password);
    setBusy(false);
    if (err) { setError(friendlyAuthError(err)); return; }
    setDone(true);
    setTimeout(() => navigate("/leagues"), 1500);
  };

  if (done) {
    return (
      <AuthShell title="Password updated">
        <p className="flex items-center gap-2 text-sm text-emerald-500"><CheckCircle2 className="w-5 h-5" />You're signed in with your new password.</p>
        <Button className="w-full" onClick={() => navigate("/leagues")}>Go to my leagues</Button>
      </AuthShell>
    );
  }

  if (failed && !ready) {
    return (
      <AuthShell title="Reset link expired" intro="Reset links work once and expire. Ask for a new one from the sign-in page.">
        <Button className="w-full" onClick={() => navigate("/login")}>Back to sign in</Button>
      </AuthShell>
    );
  }

  if (!ready) {
    return (
      <AuthShell title="Checking your link…">
        <div className="flex justify-center py-4"><Loader2 className="w-7 h-7 animate-spin text-primary" /></div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password">
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2">
          <Label htmlFor="new-password">New password</Label>
          <Input id="new-password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <ul className="text-xs text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
            {PASSWORD_REQUIREMENTS.map((r) => (
              <li key={r.label} className={r.test(password) ? "text-emerald-500" : ""}>{r.test(password) ? "✓" : "•"} {r.label}</li>
            ))}
          </ul>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm-password">Confirm password</Label>
          <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>
        {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" disabled={busy}>
          {busy && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}Update password
        </Button>
      </form>
      <p className="text-sm text-muted-foreground"><Link href="/login" className="hover:underline underline-offset-2">Cancel</Link></p>
    </AuthShell>
  );
}
