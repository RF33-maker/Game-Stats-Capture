import { useEffect, useState } from "react";
import { useAuth, signInWithPassword, sendPasswordReset } from "@/lib/auth";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Loader2, BarChart3, Users, Zap } from "lucide-react";
import { AppMenu } from "@/components/app-menu";
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
    title: "Team management",
    desc: "Organize leagues, rosters, and scorers in one place",
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
        <div className="max-w-md w-full text-center space-y-6">
          <div>
            <h1 className="text-4xl font-black tracking-tight text-primary">
              SWISH STATS
            </h1>
            <p className="text-muted-foreground mt-2 text-lg">
              Track every play. Own every game.
            </p>
          </div>
          <div className="rounded-xl border bg-amber-500/10 border-amber-500/30 px-6 py-4 text-sm text-amber-500 font-medium">
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
    <div className="relative min-h-[100dvh] flex flex-col md:flex-row">
      <div className="absolute top-4 right-4 z-20">
        <AppMenu triggerClassName="text-foreground/70 hover:text-foreground bg-background/70 backdrop-blur-sm border border-border" />
      </div>
      <div className="relative flex flex-col justify-between bg-primary text-primary-foreground p-10 md:w-[52%] md:min-h-[100dvh]">
        {/* Background texture */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg,currentColor 0,currentColor 1px,transparent 0,transparent 50%)",
            backgroundSize: "20px 20px",
          }}
        />

        {/* Logo */}
        <div className="relative">
          <div className="inline-flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary-foreground/20 flex items-center justify-center">
              <BarChart3 className="w-5 h-5" />
            </div>
            <span className="text-2xl font-black tracking-tight">SWISH STATS</span>
          </div>
        </div>

        <div className="relative py-12 md:py-0">
          <h2 className="text-4xl md:text-5xl font-black leading-tight tracking-tight">
            Track every play.
            <br />
            Own every game.
          </h2>
          <p className="mt-4 text-primary-foreground/70 text-lg max-w-sm">
            The live stats platform for basketball leagues of any size — from
            pickup runs to organized seasons.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map(({ icon: Icon, title, desc }) => (
              <li key={title} className="flex items-start gap-4">
                <div className="w-9 h-9 rounded-lg bg-primary-foreground/15 flex items-center justify-center shrink-0 mt-0.5">
                  <Icon className="w-4 h-4" />
                </div>
                <div>
                  <div className="font-semibold">{title}</div>
                  <div className="text-primary-foreground/60 text-sm">{desc}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative text-primary-foreground/40 text-xs">
          &copy; {new Date().getFullYear()} Swish Stats
        </div>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center p-10 bg-background text-foreground">
        <div className="w-full max-w-sm space-y-8">
          <div>
            <h3 className="text-2xl font-bold tracking-tight">Welcome back</h3>
            <p className="text-muted-foreground mt-1">
              Sign in with your Swish Assistant account.
            </p>
          </div>

          <form
            className="space-y-4"
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
          <p className="text-xs text-muted-foreground">
            No account yet? Sign up at swishassistant.com — the same login works here.
          </p>

        </div>
      </div>
    </div>
  );
}
