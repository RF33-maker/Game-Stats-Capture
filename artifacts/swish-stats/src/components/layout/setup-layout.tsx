import { ReactNode } from "react";
import { Link } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppMenu } from "@/components/app-menu";
import { BrandMark } from "@/components/brand";

interface SetupLayoutProps {
  children: ReactNode;
  gameId: string;
  title: string;
  step: number;
  leagueId?: string | null;
}

export function SetupLayout({
  children,
  gameId,
  title,
  step,
  leagueId,
}: SetupLayoutProps) {
  const qs = leagueId ? `?league=${leagueId}` : "";
  const backHref = leagueId ? `/leagues/${leagueId}` : "/leagues";
  const steps = [
    { num: 1, label: "Info", path: `/setup/${gameId}/info${qs}` },
    { num: 2, label: "Teams", path: `/setup/${gameId}/teams${qs}` },
    { num: 3, label: "Rosters", path: `/setup/${gameId}/players${qs}` },
    { num: 4, label: "Review", path: `/setup/${gameId}/extras${qs}` },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="sticky top-0 z-10 border-b sa-glass">
        <div className="sa-topline" />
        <div className="px-4 md:px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <Link href={backHref} aria-label="Back to league" className="shrink-0 hover:opacity-90 transition-opacity">
              <BrandMark className="h-9" />
            </Link>
            <Link href={backHref}>
              <Button variant="ghost" size="icon" aria-label="Back to league">
                <ChevronLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="min-w-0">
              <p className="sa-eyebrow leading-none">Game setup · Step {step} of {steps.length}</p>
              <h1 className="text-2xl font-bold leading-none mt-1 truncate">{title}</h1>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Segmented stepper, like the site's filter toggles */}
            <nav aria-label="Setup steps" className="hidden sm:inline-flex p-[3px] gap-0.5 rounded-[10px] bg-secondary border border-border">
              {steps.map((s) => (
                <Link key={s.num} href={s.path}>
                  <span
                    aria-current={s.num === step ? "step" : undefined}
                    className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-[7px] text-sm font-medium transition-colors cursor-pointer ${
                      s.num === step
                        ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--border))]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <span className={`sa-num text-base font-bold ${s.num === step ? "text-primary" : s.num < step ? "text-emerald-400" : ""}`}>{s.num}</span>
                    <span className="hidden md:inline">{s.label}</span>
                  </span>
                </Link>
              ))}
            </nav>
            <AppMenu />
          </div>
        </div>
      </header>
      <main className="flex-1 p-6 md:p-12 overflow-auto">
        <div className="max-w-2xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
