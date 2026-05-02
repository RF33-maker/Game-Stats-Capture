import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation, useSearch } from "wouter";
import { Loader2 } from "lucide-react";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [location] = useLocation();
  const search = useSearch();

  useEffect(() => {
    if (LOCAL_MODE_ENABLED) return;
    if (!isLoading && !isAuthenticated) {
      const base =
        (import.meta.env.BASE_URL as string).replace(/\/+$/, "") || "";
      const qs = search ? `?${search}` : "";
      login(`${base}${location}${qs}`);
    }
  }, [isAuthenticated, isLoading, location, search, login]);

  if (LOCAL_MODE_ENABLED) return <>{children}</>;

  if (isLoading || !isAuthenticated) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return <>{children}</>;
}
