import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import {
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
import { useAuth } from "@/lib/auth";
import { AppMenu } from "@/components/app-menu";
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
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="rounded-md font-semibold shadow-[0_0_0_1px_rgba(255,255,255,0.06)]"
                onClick={onCta}
              >
                {ctaLabel}
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
              <AppMenu triggerClassName="text-white/70 hover:text-white hover:bg-white/10" />
            </div>
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

            {/* Right: live score mockup */}
            <div className="lg:sticky lg:top-8 space-y-5">
              <LiveScoreMockup />
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

function LiveScoreMockup() {
  const TARGET_HOME = 78;
  const TARGET_AWAY = 71;
  const [home, setHome] = useState(0);
  const [away, setAway] = useState(0);
  const [quarter, setQuarter] = useState(1);
  const [clock, setClock] = useState("12:00");

  // Animate the score counters up from 0 on mount
  useEffect(() => {
    const duration = 1600;
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setHome(Math.round(TARGET_HOME * eased));
      setAway(Math.round(TARGET_AWAY * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Tick a fake game clock for ambient motion
  useEffect(() => {
    const id = setInterval(() => {
      setClock((prev) => {
        const [m, s] = prev.split(":").map(Number);
        const total = m * 60 + s - 1;
        if (total <= 0) {
          setQuarter((q) => (q >= 4 ? 1 : q + 1));
          return "12:00";
        }
        const nm = Math.floor(total / 60);
        const ns = total % 60;
        return `${nm}:${ns.toString().padStart(2, "0")}`;
      });
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const TeamRow = ({
    abbr,
    name,
    score,
    accent,
    leading,
  }: {
    abbr: string;
    name: string;
    score: number;
    accent: string;
    leading: boolean;
  }) => (
    <div className="flex items-center gap-3">
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center text-[11px] font-black tracking-tight text-white shadow-inner"
        style={{ background: accent }}
      >
        {abbr}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-white truncate">{name}</div>
        <div className="text-[10px] text-white/40 uppercase tracking-wider">
          {leading ? "Leading" : "Trailing"}
        </div>
      </div>
      <div
        className={`text-2xl font-black tabular-nums ${
          leading ? "text-white" : "text-white/70"
        }`}
      >
        {score}
      </div>
    </div>
  );

  return (
    <div
      className="hidden lg:block rounded-2xl border border-white/10 bg-gradient-to-br from-[#15151a]/95 to-[#0d0d0f]/95 backdrop-blur-sm p-5 shadow-2xl shadow-black/50 relative overflow-hidden"
      aria-hidden="true"
    >
      {/* Court accent in background */}
      <svg
        className="absolute -right-6 -bottom-8 w-44 h-44 text-primary/10"
        viewBox="0 0 100 100"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      >
        <rect x="2" y="2" width="96" height="96" rx="2" />
        <circle cx="50" cy="50" r="10" />
        <line x1="2" y1="50" x2="98" y2="50" />
        <rect x="30" y="2" width="40" height="22" />
        <rect x="30" y="76" width="40" height="22" />
        <path d="M30 24 A20 20 0 0 0 70 24" />
        <path d="M30 76 A20 20 0 0 1 70 76" />
      </svg>

      <div className="relative">
        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
            </span>
            <span className="text-[10px] font-bold tracking-[0.18em] uppercase text-red-400">
              Live
            </span>
          </div>
          <div className="text-[10px] font-mono text-white/50 tabular-nums">
            Q{quarter} · {clock}
          </div>
        </div>

        <div className="space-y-3">
          <TeamRow
            abbr="HAW"
            name="Hawks"
            score={home}
            accent="linear-gradient(135deg,#ea580c,#9a3412)"
            leading={home >= away}
          />
          <div className="h-px bg-white/5" />
          <TeamRow
            abbr="WLF"
            name="Wolves"
            score={away}
            accent="linear-gradient(135deg,#3f3f46,#18181b)"
            leading={away > home}
          />
        </div>

        <div className="mt-4 pt-4 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
          {[
            { label: "FG%", value: "48" },
            { label: "3PT", value: "11" },
            { label: "AST", value: "19" },
          ].map((s) => (
            <div key={s.label}>
              <div className="text-sm font-bold text-white tabular-nums">
                {s.value}
              </div>
              <div className="text-[9px] uppercase tracking-wider text-white/40">
                {s.label}
              </div>
            </div>
          ))}
        </div>
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
