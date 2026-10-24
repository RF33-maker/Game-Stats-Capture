import { useEffect, useState } from "react";
import {
  useAuth, signInWithPassword, sendPasswordReset, signUpWithPassword, sendMagicLink, resendConfirmation, friendlyAuthError,
} from "@/lib/auth";
import { PASSWORD_REQUIREMENTS, validatePassword } from "@/lib/password-policy";
import { SITE } from "@/lib/site";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, UserPlus, Loader2, BarChart3, Users, Zap, MailCheck, Mail } from "lucide-react";
import { AppMenu } from "@/components/app-menu";
import { Brand } from "@/components/brand";
import { LegalFooter } from "@/components/auth-shell";
import { SignupTerms } from "@/components/signup-terms";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

const FEATURES = [
  {
    icon: Zap,
    title: "Live game capture",
    desc: "Score every play in real time with one tap",
  },
  {
    icon: BarChart3,
    title: "Instant box scores",
    desc: "Full stats ready the moment the final buzzer sounds",
  },
  {
    icon: Users,
    title: "Linked to Swish profiles",
    desc: `Rosters use the players and teams already on ${SITE.partnerName}`,
  },
];

export default function Login() {
  const { isAuthenticated, isLoading } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [, setLocation] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  // Same-site paths only: ?next= must never send someone to another address.
  const rawNext = params.get("next") || "/leagues";
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") && !rawNext.startsWith("/\\") ? rawNext : "/leagues";
  const [mode, setMode] = useState<"signin" | "signup">(params.get("tab") === "signup" ? "signup" : "signin");
  const [name, setName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [agreed, setAgreed] = useState(false);
  // After sign-up: the address we sent a confirmation link to.
  const [sentTo, setSentTo] = useState<string | null>(null);

  const switchMode = (m: "signin" | "signup") => { setMode(m); setError(null); setNotice(null); };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "signin") {
      setSubmitting(true);
      const err = await signInWithPassword(email, password);
      setSubmitting(false);
      if (err) setError(friendlyAuthError(err));
      return;
    }
    const problem = validatePassword(password);
    if (problem) { setError(problem); return; }
    if (password !== confirmPassword) { setError("The two passwords don't match."); return; }
    if (!agreed) { setError("Please tick the box to accept the terms and privacy policy and create your account."); return; }
    setSubmitting(true);
    const res = await signUpWithPassword(email, password, name);
    setSubmitting(false);
    if (res.error !== null) { setError(friendlyAuthError(res.error)); return; }
    if (res.alreadyRegistered) {
      setMode("signin");
      setNotice(`That email already has an account (the same login works on ${SITE.partnerName}). Sign in, or use “Forgot password?”.`);
      return;
    }
    // With email confirmation off there is a session already and the effect above moves on.
    if (res.needsConfirmation) setSentTo(email.trim());
  };

  const needEmail = () => {
    if (email.trim()) return true;
    setError("Enter your email first.");
    return false;
  };

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(next);
    }
  }, [isAuthenticated, next, setLocation]);

  if (LOCAL_MODE_ENABLED) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-8">
        <div className="max-w-md w-full text-center space-y-6 sa-rise">
          <div className="flex justify-center"><Brand size="lg" /></div>
          <p className="text-muted-foreground text-lg">Track every play. Own every game.</p>
          <div className="sa-card border-amber-500/30 px-6 py-4 text-sm text-amber-400 font-medium">
            Running in local mode — all data stays in this browser.
          </div>
          <Button size="lg" className="w-full" onClick={() => setLocation("/leagues")}>
            Continue to league hub
          </Button>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="relative min-h-[100dvh] flex flex-col bg-background text-foreground overflow-hidden">
      <div className="sa-topline" />
      {/* Soft orange glow behind the brand side, as on the site's homepage */}
      <div aria-hidden className="pointer-events-none absolute -top-40 -left-40 w-[640px] h-[640px] rounded-full opacity-[0.16] blur-3xl"
        style={{ background: "radial-gradient(circle, hsl(var(--primary)) 0%, transparent 65%)" }} />

      <header className="relative px-6 h-16 flex items-center justify-between">
        <Brand />
        <AppMenu />
      </header>

      <div className="relative flex-1 grid md:grid-cols-[1.1fr_1fr] gap-10 md:gap-16 items-center max-w-5xl w-full mx-auto px-6 py-10">
        <div className="sa-rise">
          <p className="sa-eyebrow">Live stat capture</p>
          <h1 className="mt-2 text-5xl md:text-6xl font-bold leading-[0.95]">
            Track every play.
            <br />
            <span className="text-primary">Own every game.</span>
          </h1>
          <p className="mt-4 text-muted-foreground text-lg max-w-md">
            Score games courtside and watch them appear live on {SITE.partnerName} —
            box scores, play-by-play and shot charts, even when the gym wifi drops.
          </p>

          <ul className="mt-8 space-y-4">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="sa-icon-tile"><Icon className="w-5 h-5" /></span>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-muted-foreground text-sm">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="sa-card p-6 md:p-8 sa-rise w-full max-w-md md:justify-self-end" style={{ animationDelay: "60ms" }}>
          {sentTo ? (
            <div className="space-y-4" data-testid="check-email">
              <span className="sa-icon-tile"><MailCheck className="w-5 h-5" /></span>
              <h2 className="text-3xl font-bold">Check your email</h2>
              <p className="text-sm text-muted-foreground">
                We sent a confirmation link to <strong className="text-foreground">{sentTo}</strong>. Open it on this device to finish creating your account.
                It can take a minute; check spam if it doesn't arrive.
              </p>
              {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
              {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={async () => {
                  setError(null);
                  const err = await resendConfirmation(sentTo);
                  if (err) setError(friendlyAuthError(err)); else setNotice("Sent again.");
                }}>Send it again</Button>
                <Button variant="ghost" onClick={() => { setSentTo(null); switchMode("signin"); }}>Back to sign in</Button>
              </div>
            </div>
          ) : (
            <>
              <div role="tablist" className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-muted/50 mb-5">
                {(["signin", "signup"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={mode === m} data-testid={`tab-${m}`}
                    onClick={() => switchMode(m)}
                    className={`h-9 rounded-md text-sm font-semibold transition-colors ${mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                    {m === "signin" ? "Sign in" : "Create account"}
                  </button>
                ))}
              </div>
              <h2 className="text-4xl font-bold">{mode === "signin" ? "Sign in" : "Create your account"}</h2>
              <p className="text-muted-foreground mt-2 text-sm">
                {mode === "signin"
                  ? `Use the email and password you signed up with. A ${SITE.partnerName} login works here too.`
                  : `Free to start. If you already have a ${SITE.partnerName} login, use the Sign in tab instead.`}
              </p>

              <form className="space-y-4 mt-6" onSubmit={onSubmit}>
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="name">Your name <span className="text-muted-foreground font-normal">(optional)</span></Label>
                    <Input id="name" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required
                    value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input id="password" type="password" required
                    autoComplete={mode === "signin" ? "current-password" : "new-password"}
                    value={password} onChange={(e) => setPassword(e.target.value)} />
                  {mode === "signup" && (
                    <ul className="text-xs text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-0.5">
                      {PASSWORD_REQUIREMENTS.map((r) => (
                        <li key={r.label} className={r.test(password) ? "text-emerald-500" : ""}>{r.test(password) ? "✓" : "•"} {r.label}</li>
                      ))}
                    </ul>
                  )}
                </div>
                {mode === "signup" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="confirm">Confirm password</Label>
                      <Input id="confirm" type="password" autoComplete="new-password" required
                        value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
                    </div>
                    <SignupTerms agreed={agreed} onChange={setAgreed} />
                  </>
                )}
                {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
                {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
                <Button type="submit" size="lg" className="w-full text-base" disabled={submitting}>
                  {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                    : mode === "signin" ? <LogIn className="w-5 h-5 mr-2" /> : <UserPlus className="w-5 h-5 mr-2" />}
                  {mode === "signin" ? "Sign in" : "Create account"}
                </Button>
                {mode === "signin" && (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      data-testid="magic-link"
                      onClick={async () => {
                        setError(null); setNotice(null);
                        if (!needEmail()) return;
                        const err = await sendMagicLink(email);
                        if (err) setError(friendlyAuthError(err));
                        else setNotice("Check your email for a sign-in link. It works once.");
                      }}
                    >
                      <Mail className="w-3.5 h-3.5" />Email me a sign-in link instead
                    </button>
                    <button
                      type="button"
                      className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
                      onClick={async () => {
                        setError(null); setNotice(null);
                        if (!email.trim()) { setError("Enter your email first, then tap “Forgot password”."); return; }
                        const err = await sendPasswordReset(email);
                        if (err) setError(friendlyAuthError(err));
                        else setNotice("Check your email for a link to reset your password.");
                      }}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}
              </form>
            </>
          )}
        </div>
      </div>

      <footer className="relative px-6 py-5 text-xs text-muted-foreground">
        <LegalFooter className="!px-0 !py-0 justify-end" />
      </footer>
    </div>
  );
}
