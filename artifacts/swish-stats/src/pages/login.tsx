import { useEffect } from "react";
import { useAuth } from "@workspace/replit-auth-web";
import { useLocation, useSearch } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LogIn, Loader2 } from "lucide-react";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

export default function Login() {
  const { isAuthenticated, isLoading, login } = useAuth();
  const [, setLocation] = useLocation();
  const search = useSearch();

  const params = new URLSearchParams(search);
  const next = params.get("next") || "/leagues";

  useEffect(() => {
    if (isAuthenticated) {
      setLocation(next);
    }
  }, [isAuthenticated, next, setLocation]);

  if (LOCAL_MODE_ENABLED) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-8">
        <Card className="max-w-md w-full">
          <CardContent className="p-8 text-center space-y-4">
            <h1 className="text-2xl font-bold">Local Mode Active</h1>
            <p className="text-muted-foreground">
              Authentication is disabled in local mode. Head to the league hub
              to continue.
            </p>
            <Button onClick={() => setLocation("/leagues")}>Continue</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-8">
      <Card className="max-w-md w-full">
        <CardContent className="p-10 text-center space-y-6">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">
              SWISH STATS
            </h1>
            <p className="text-muted-foreground mt-2">
              Sign in to manage your leagues, capture games, and view box
              scores.
            </p>
          </div>
          <Button
            size="lg"
            className="w-full"
            onClick={() => {
              const base =
                (import.meta.env.BASE_URL as string).replace(/\/+$/, "") || "";
              login(`${base}${next}`);
            }}
          >
            <LogIn className="w-5 h-5 mr-2" />
            Sign in with Replit
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
