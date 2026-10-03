import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { AppMenu } from "@/components/app-menu";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";
import { Brand, BrandMark } from "@/components/brand";
import { ChevronLeft } from "lucide-react";

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
    <header className="sticky top-0 z-20 border-b sa-glass">
      <div className="sa-topline" />
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center gap-4">
        <div className="flex items-center gap-4 flex-1 min-w-0">
          <Link href="/leagues" className="shrink-0 hover:opacity-90 transition-opacity" aria-label="Swish Stats home">
            {showBack ? <BrandMark className="h-9" /> : <Brand />}
          </Link>
          {showBack && (
            <Link href={showBack.href}>
              <span className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm font-medium shrink-0">
                <ChevronLeft className="w-4 h-4" />
                {showBack.label}
              </span>
            </Link>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {!LOCAL_MODE_ENABLED && displayName && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center text-xs font-bold select-none ring-1 ring-primary/25">
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
