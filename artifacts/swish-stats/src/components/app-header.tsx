import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { AppMenu } from "@/components/app-menu";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

interface AppHeaderProps {
  showBack?: { href: string; label: string };
}

export function AppHeader({ showBack }: AppHeaderProps) {
  const { user } = useAuth();

  const displayName = user
    ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || user.email || user.id)
    : null;

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  return (
    <header className="sticky top-0 z-20 border-b bg-card/95 backdrop-blur-sm">
      <div className="max-w-5xl mx-auto px-6 py-3 flex items-center gap-4">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {showBack && (
            <Link href={showBack.href}>
              <span className="text-muted-foreground hover:text-foreground transition-colors text-sm font-medium shrink-0">
                ← {showBack.label}
              </span>
            </Link>
          )}
          {!showBack && (
            <Link href="/leagues">
              <span className="text-lg font-black tracking-tight text-primary hover:opacity-80 transition-opacity cursor-pointer">
                SWISH STATS
              </span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!LOCAL_MODE_ENABLED && displayName && (
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold select-none">
                {initials}
              </div>
              <span className="text-sm text-muted-foreground hidden sm:block max-w-[140px] truncate">
                {displayName}
              </span>
            </div>
          )}
          {LOCAL_MODE_ENABLED && (
            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
              LOCAL
            </span>
          )}
          <AppMenu />
        </div>
      </div>
    </header>
  );
}
