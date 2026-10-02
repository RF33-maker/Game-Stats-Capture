import { useAuth } from "@/lib/auth";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogOut, Mail, BadgeCheck, Loader2 } from "lucide-react";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

export default function Profile() {
  const { user, isLoading, logout } = useAuth();

  const displayName = user
    ? [user.firstName, user.lastName].filter(Boolean).join(" ") ||
      user.email ||
      user.id
    : LOCAL_MODE_ENABLED
      ? "Local user"
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
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Profile &amp; account</h1>
            <p className="text-muted-foreground mt-1">
              Your account details for Swish Stats.
            </p>
          </div>

          {isLoading && !LOCAL_MODE_ENABLED ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 sm:p-8 space-y-8">
                <div className="flex items-center gap-5">
                  {user?.profileImageUrl ? (
                    <img
                      src={user.profileImageUrl}
                      alt={displayName ?? "Profile"}
                      className="w-16 h-16 rounded-full object-cover border border-border"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-primary/20 text-primary flex items-center justify-center text-xl font-bold select-none">
                      {initials}
                    </div>
                  )}
                  <div className="min-w-0">
                    <h2 className="text-xl font-bold truncate">
                      {displayName ?? "Unknown user"}
                    </h2>
                    {user?.email && (
                      <p className="text-sm text-muted-foreground truncate">
                        {user.email}
                      </p>
                    )}
                    {LOCAL_MODE_ENABLED && (
                      <span className="mt-1 inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-500 border border-amber-500/30">
                        LOCAL MODE
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2">
                  <Detail
                    icon={BadgeCheck}
                    label="First name"
                    value={user?.firstName ?? "—"}
                  />
                  <Detail
                    icon={BadgeCheck}
                    label="Last name"
                    value={user?.lastName ?? "—"}
                  />
                  <Detail
                    icon={Mail}
                    label="Email"
                    value={user?.email ?? "—"}
                  />
                  <Detail
                    icon={BadgeCheck}
                    label="Account ID"
                    value={user?.id ?? (LOCAL_MODE_ENABLED ? "local" : "—")}
                    mono
                  />
                </div>

                {!LOCAL_MODE_ENABLED && (
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      className="gap-2"
                      onClick={() => logout()}
                    >
                      <LogOut className="w-4 h-4" />
                      Sign out
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}

function Detail({
  icon: Icon,
  label,
  value,
  mono,
}: {
  icon: typeof Mail;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wider text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-medium truncate ${mono ? "font-mono text-xs" : ""}`}
        title={value}
      >
        {value}
      </div>
    </div>
  );
}
