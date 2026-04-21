import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { ChevronLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

interface SetupLayoutProps {
  children: ReactNode;
  gameId: string;
  title: string;
  step: number;
}

export function SetupLayout({ children, gameId, title, step }: SetupLayoutProps) {
  const steps = [
    { num: 1, label: "Info", path: `/setup/${gameId}/info` },
    { num: 2, label: "Teams", path: `/setup/${gameId}/teams` },
    { num: 3, label: "Players", path: `/setup/${gameId}/players` },
    { num: 4, label: "Extras", path: `/setup/${gameId}/extras` },
  ];

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <header className="border-b bg-card px-6 py-4 sticky top-0 z-10 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/">
            <Button variant="ghost" size="icon">
              <ChevronLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-primary">SETUP WIZARD</h1>
            <p className="text-sm text-muted-foreground">{title}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {steps.map((s) => (
            <Link key={s.num} href={s.path}>
              <div
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-bold transition-colors cursor-pointer ${
                  s.num === step
                    ? "bg-primary text-primary-foreground"
                    : s.num < step
                    ? "bg-muted text-foreground border border-muted-foreground/30 hover:border-primary/50"
                    : "bg-muted/50 text-muted-foreground border border-transparent hover:border-primary/50"
                }`}
              >
                {s.num}
              </div>
            </Link>
          ))}
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
