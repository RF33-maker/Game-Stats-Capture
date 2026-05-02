import { useEffect } from "react";
import { useLocation } from "wouter";
import { Loader2 } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

export default function Home() {
  const [, setLocation] = useLocation();
  const { isAuthenticated, isLoading } = useAuth();

  useEffect(() => {
    if (LOCAL_MODE_ENABLED) {
      setLocation("/leagues");
      return;
    }
    if (isLoading) return;
    setLocation(isAuthenticated ? "/leagues" : "/login");
  }, [isAuthenticated, isLoading, setLocation]);

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
      <Loader2 className="w-8 h-8 animate-spin text-primary" />
    </div>
  );
}
