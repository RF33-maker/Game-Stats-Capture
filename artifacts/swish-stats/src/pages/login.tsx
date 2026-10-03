import { useEffect, useState } from "react";
import { useAuth, signInWithPassword, sendPasswordReset } from "@/lib/auth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, BarChart3, Users, Zap } from "lucide-react";
import { AppMenu } from "@/components/app-menu";
import { Brand } from "@/components/brand";
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
    desc: "Rosters use the players and teams already on Swish Assistant",
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
  const next = params.get("next") || "/leagues";

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
            Score games courtside and watch them appear live on Swish Assistant —
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
          <p className="sa-eyebrow">Your account</p>
          <h2 className="mt-1.5 text-4xl font-bold">Sign in</h2>
          <p className="text-muted-foreground mt-2 text-sm">
            Use your Swish Assistant account — the same login as swishassistant.com.
          </p>

          <form
            className="space-y-4 mt-6"
            onSubmit={async (e) => {
              e.preventDefault();
              setError(null);
              setNotice(null);
              setSubmitting(true);
              const err = await signInWithPassword(email, password);
              setSubmitting(false);
              if (err) setError(err);
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" type="password" autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}
            {notice && <p className="text-sm text-muted-foreground" role="status">{notice}</p>}
            <Button type="submit" size="lg" className="w-full text-base" disabled={submitting}>
              {submitting ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
              Sign in
            </Button>
            <button
              type="button"
              className="w-full text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
              onClick={async () => {
                setError(null);
                if (!email.trim()) { setError("Enter your email first, then tap “Forgot password”."); return; }
                const err = await sendPasswordReset(email);
                if (err) setError(err);
                else setNotice("Check your email for a link to reset your password.");
              }}
            >
              Forgot password?
            </button>
          </form>
          <p className="mt-5 text-xs text-muted-foreground">
            No account yet?{" "}
            <a className="font-medium text-primary hover:underline underline-offset-2" href="https://www.swishassistant.com/auth" target="_blank" rel="noreferrer">
              Sign up at swishassistant.com
            </a>
          </p>
        </div>
      </div>

      <footer className="relative px-6 py-5 text-xs text-muted-foreground">
        &copy; {new Date().getFullYear()} Swish Assistant
      </footer>
    </div>
  );
}
