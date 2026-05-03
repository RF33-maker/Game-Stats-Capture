import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
  LogIn,
  ArrowRight,
  Zap,
  Shield,
  Upload,
  Home as HomeIcon,
  Video,
  BarChart3,
  Wifi,
  Loader2,
  Sparkles,
  ExternalLink,
  Camera,
  Cloud,
  Share2,
} from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";
import logoUrl from "@assets/ChatGPT_Image_Jul_5,_2025,_09_52_53_PM_(1)_1777802723071.png";

const HERO_HIGHLIGHTS = [
  {
    icon: Zap,
    title: "Capture games fast",
    desc: "Intuitive tools for scorekeepers and league admins.",
  },
  {
    icon: Shield,
    title: "League hub access",
    desc: "Manage teams, schedules, players, and standings.",
  },
  {
    icon: Upload,
    title: "Streamlined uploads",
    desc: "Upload, validate, and sync your stats with ease.",
  },
];

const FEATURE_CARDS = [
  {
    icon: HomeIcon,
    title: "League Hub",
    desc: "Manage leagues, teams, players, and schedules.",
  },
  {
    icon: Video,
    title: "Game Capture",
    desc: "Capture live stats with our intuitive game recorder.",
  },
  {
    icon: BarChart3,
    title: "Instant Box Scores",
    desc: "Full stats ready the moment the buzzer sounds.",
  },
  {
    icon: Wifi,
    title: "Live Sync",
    desc: "Keep your data up to date across all devices.",
  },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading, login } = useAuth();

  if (LOCAL_MODE_ENABLED) {
    return <LandingPage mode="local" onCta={() => setLocation("/leagues")} />;
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isAuthenticated) {
    return <LandingPage mode="authed" onCta={() => setLocation("/leagues")} />;
  }

  const handleLogin = () => {
    const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "") || "";
    login(`${base}/leagues`);
  };

  return <LandingPage mode="guest" onCta={handleLogin} />;
}

type Mode = "local" | "authed" | "guest";

function LandingPage({ mode, onCta }: { mode: Mode; onCta: () => void }) {
  const ctaLabel =
    mode === "local"
      ? "Continue to League Hub"
      : mode === "authed"
        ? "Go to League Hub"
        : "Sign In";

  const CtaIcon = mode === "guest" ? LogIn : ArrowRight;

  const cardTitle =
    mode === "local"
      ? "Local Mode"
      : mode === "authed"
        ? "Welcome Back"
        : "League Hub";

  const cardSubtitle =
    mode === "local"
      ? "All data stays in this browser. Continue to start tracking."
      : mode === "authed"
        ? "You're signed in. Continue to your league dashboard."
        : "Sign in to access your league dashboard.";

  return (
    <div className="min-h-[100dvh] bg-[#0d0d0f] text-foreground relative overflow-hidden">
      {/* Background ambience */}
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 90% 0%, rgba(234,88,12,0.18), transparent 60%), radial-gradient(ellipse 60% 40% at 10% 20%, rgba(234,88,12,0.08), transparent 60%)",
        }}
      />
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)",
          backgroundSize: "14px 14px",
        }}
      />

      <div className="relative">
        {/* Partnership banner */}
        <div className="border-b border-white/5 bg-white/[0.02] px-6 py-2 text-center text-xs text-white/60">
          In partnership with{" "}
          <a
            href="https://www.swishassistant.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            Swish Assistant
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        {/* Nav */}
        <header className="px-6 py-5 border-b border-white/5">
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <Brand />
            <Button
              size="sm"
              className="rounded-md font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
              onClick={onCta}
            >
              {ctaLabel}
              <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </div>
        </header>

        {/* Hero */}
        <section className="px-6 pt-16 pb-12 md:pt-24 md:pb-16">
          <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-12 lg:gap-16 items-start">
            {/* Left: pitch */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 text-primary text-xs font-bold tracking-[0.18em] uppercase">
                <Sparkles className="w-3.5 h-3.5" />
                Stat Capture Made Simple
              </div>

              <h1 className="text-5xl md:text-6xl lg:text-7xl font-black tracking-tight leading-[1.02] text-white">
                Fast. Accurate.
                <br />
                Basketball <span className="text-primary">Stat Capture</span>
              </h1>

              <p className="text-base md:text-lg text-white/60 max-w-xl leading-relaxed">
                Swish Stats helps leagues and teams capture every game, manage
                their league hub, and share box scores in just a few taps.
              </p>

              {/* Inline highlights */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-2">
                {HERO_HIGHLIGHTS.map(({ icon: Icon, title, desc }) => (
                  <div key={title} className="space-y-2">
                    <div className="inline-flex items-center gap-2 text-white">
                      <Icon className="w-4 h-4 text-primary" />
                      <span className="font-semibold text-sm">{title}</span>
                    </div>
                    <p className="text-white/50 text-xs leading-relaxed">
                      {desc}
                    </p>
                  </div>
                ))}
              </div>

              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <Button
                  size="lg"
                  className="text-base px-6 h-12 rounded-md font-semibold"
                  onClick={onCta}
                >
                  {ctaLabel}
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>

            {/* Right: auth/info card */}
            <div className="lg:sticky lg:top-8">
              <div className="rounded-2xl border border-white/10 bg-[#15151a]/90 backdrop-blur-sm p-7 md:p-8 shadow-2xl shadow-black/40">
                <div className="flex items-center gap-3 mb-1">
                  <img
                    src={logoUrl}
                    alt=""
                    className="w-8 h-8 object-contain"
                  />
                  <h2 className="text-2xl font-bold text-white">{cardTitle}</h2>
                </div>
                <p className="text-sm text-white/55 mb-7">{cardSubtitle}</p>

                {mode === "local" && (
                  <div className="mb-5 rounded-md border border-amber-500/25 bg-amber-500/[0.06] px-3 py-2 text-xs font-medium text-amber-400">
                    Running in local mode
                  </div>
                )}

                <Button
                  size="lg"
                  className="w-full text-base h-12 rounded-md font-semibold"
                  onClick={onCta}
                >
                  <CtaIcon className="w-4 h-4 mr-2" />
                  {ctaLabel}
                </Button>

                {mode === "guest" && (
                  <p className="text-center text-xs text-white/40 mt-5">
                    Authentication powered by Replit
                  </p>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Partnership / integration explainer */}
        <section className="px-6 pb-16 md:pb-24">
          <div className="max-w-7xl mx-auto rounded-2xl border border-white/8 bg-gradient-to-br from-white/[0.03] to-primary/[0.04] p-8 md:p-12">
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-10 items-center">
              <div className="space-y-4">
                <div className="inline-flex items-center gap-2 text-primary text-xs font-bold tracking-[0.18em] uppercase">
                  <Sparkles className="w-3.5 h-3.5" />
                  Built for Swish Assistant
                </div>
                <h2 className="text-3xl md:text-4xl font-bold tracking-tight text-white leading-tight">
                  A complete package to <span className="text-primary">capture, host, and share</span>.
                </h2>
                <p className="text-white/60 leading-relaxed">
                  Swish Stats works hand-in-hand with{" "}
                  <a
                    href="https://www.swishassistant.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary font-semibold hover:underline inline-flex items-center gap-1"
                  >
                    Swish Assistant
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                  . Capture stats courtside, push them straight to your Swish
                  Assistant league, and share polished box scores with your
                  community — all from one connected workflow.
                </p>
                <a
                  href="https://www.swishassistant.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-sm font-semibold text-white hover:text-primary transition-colors pt-2"
                >
                  Visit swishassistant.com
                  <ArrowRight className="w-4 h-4" />
                </a>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  {
                    icon: Camera,
                    step: "01",
                    title: "Capture",
                    desc: "Track every play live with Swish Stats.",
                  },
                  {
                    icon: Cloud,
                    step: "02",
                    title: "Host",
                    desc: "Stats sync into your Swish Assistant league.",
                  },
                  {
                    icon: Share2,
                    step: "03",
                    title: "Share",
                    desc: "Send box scores and standings to your community.",
                  },
                ].map(({ icon: Icon, step, title, desc }) => (
                  <div
                    key={step}
                    className="rounded-xl border border-white/10 bg-[#15151a]/60 p-5"
                  >
                    <div className="flex items-center justify-between mb-4">
                      <div className="w-9 h-9 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-xs font-mono text-white/30">{step}</span>
                    </div>
                    <h3 className="font-semibold text-white text-sm mb-1">{title}</h3>
                    <p className="text-white/50 text-xs leading-relaxed">{desc}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Feature cards row */}
        <section className="px-6 pb-20 md:pb-28">
          <div className="max-w-7xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {FEATURE_CARDS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="group rounded-xl border border-white/8 bg-white/[0.02] hover:bg-white/[0.04] hover:border-white/12 transition-colors p-5 flex items-start gap-4"
              >
                <div className="w-10 h-10 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
                  <Icon className="w-4.5 h-4.5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="font-semibold text-white text-sm">{title}</h3>
                    <ArrowRight className="w-4 h-4 text-white/30 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>
                  <p className="text-white/50 text-xs mt-1.5 leading-relaxed">
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Footer */}
        <footer className="border-t border-white/5 px-6 py-6">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-white/40">
            <Brand small />
            <div className="flex flex-col sm:flex-row items-center gap-2 sm:gap-4">
              <span>
                In partnership with{" "}
                <a
                  href="https://www.swishassistant.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline font-semibold"
                >
                  Swish Assistant
                </a>
              </span>
              <span className="hidden sm:inline text-white/20">·</span>
              <span>&copy; {new Date().getFullYear()} Swish Stats. All rights reserved.</span>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Brand({ small = false }: { small?: boolean }) {
  return (
    <div className="inline-flex items-center gap-2.5">
      <img
        src={logoUrl}
        alt="Swish Stats logo"
        className={small ? "w-6 h-6 object-contain" : "w-9 h-9 object-contain"}
      />
      <span
        className={
          small
            ? "text-sm font-bold tracking-tight text-white/70"
            : "text-xl font-bold tracking-tight text-white"
        }
      >
        Swish<span className="text-primary">Stats</span>
      </span>
    </div>
  );
}
