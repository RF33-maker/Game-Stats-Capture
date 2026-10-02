import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Menu,
  Home as HomeIcon,
  Trophy,
  BarChart3,
  ClipboardList,
  User as UserIcon,
  Settings as SettingsIcon,
  HelpCircle,
  LogIn,
  LogOut,
  type LucideIcon,
} from "lucide-react";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const SIGNED_OUT_ITEMS: NavItem[] = [
  { label: "Home", href: "/", icon: HomeIcon },
  { label: "Help / About", href: "/help", icon: HelpCircle },
];

const SIGNED_IN_ITEMS: NavItem[] = [
  { label: "League Hub", href: "/leagues", icon: Trophy },
  { label: "Stats / Analytics", href: "/stats", icon: BarChart3 },
  { label: "SwishStats Organizer", href: "/organizer", icon: ClipboardList },
  { label: "Profile / Account", href: "/profile", icon: UserIcon },
  { label: "Settings", href: "/settings", icon: SettingsIcon },
  { label: "Help / About", href: "/help", icon: HelpCircle },
];

interface AppMenuProps {
  /** Extra classes for the trigger button (e.g. to fit dark/light surfaces). */
  triggerClassName?: string;
}

export function AppMenu({ triggerClassName }: AppMenuProps) {
  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();
  const { user, isAuthenticated, login, logout } = useAuth();

  const signedIn = LOCAL_MODE_ENABLED || isAuthenticated;
  const items = signedIn ? SIGNED_IN_ITEMS : SIGNED_OUT_ITEMS;

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      user.id
    : null;

  const initials = displayName
    ? displayName
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase()
    : "?";

  const isActive = (href: string) =>
    href === "/" ? location === "/" : location === href || location.startsWith(`${href}/`);

  const go = (href: string) => {
    setOpen(false);
    navigate(href);
  };

  const handleLogin = () => {
    setOpen(false);
    const base = (import.meta.env.BASE_URL as string).replace(/\/+$/, "") || "";
    login(`${base}/leagues`);
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open menu"
          className={cn("h-9 w-9 shrink-0", triggerClassName)}
        >
          <Menu className="h-5 w-5" />
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="w-[88%] max-w-sm border-white/10 bg-[#0d0d0f] p-0 text-white flex flex-col"
      >
        {/* Brand / header */}
        <div className="px-6 pt-6 pb-5 border-b border-white/10">
          <div className="inline-flex items-center gap-2">
            <span className="text-lg font-black tracking-tight">
              Swish<span className="text-primary">Stats</span>
            </span>
          </div>
          {signedIn && displayName && (
            <div className="mt-4 flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xs font-bold select-none shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{displayName}</div>
                {user?.email && (
                  <div className="text-xs text-white/50 truncate">{user.email}</div>
                )}
              </div>
            </div>
          )}
          {signedIn && !displayName && LOCAL_MODE_ENABLED && (
            <div className="mt-3 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
              LOCAL MODE
            </div>
          )}
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <ul className="space-y-1">
            {items.map(({ label, href, icon: Icon }) => {
              const active = isActive(href);
              return (
                <li key={href}>
                  <button
                    type="button"
                    onClick={() => go(href)}
                    className={cn(
                      "w-full flex items-center gap-3 rounded-lg px-3 py-3 text-sm font-medium transition-colors text-left",
                      active
                        ? "bg-primary/15 text-primary"
                        : "text-white/70 hover:text-white hover:bg-white/5",
                    )}
                  >
                    <Icon className="w-4.5 h-4.5 shrink-0" />
                    <span className="flex-1 truncate">{label}</span>
                    {active && (
                      <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Footer action */}
        <div className="px-4 py-4 border-t border-white/10">
          {signedIn ? (
            !LOCAL_MODE_ENABLED ? (
              <Button
                variant="outline"
                className="w-full gap-2 border-white/15 bg-transparent text-white hover:bg-white/5 hover:text-white"
                onClick={() => logout()}
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </Button>
            ) : (
              <p className="text-center text-xs text-white/40">
                Local mode — data stays in this browser.
              </p>
            )
          ) : (
            <Button className="w-full gap-2" onClick={handleLogin}>
              <LogIn className="w-4 h-4" />
              Log in / Sign up
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
