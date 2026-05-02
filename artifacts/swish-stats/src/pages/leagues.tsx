import { useState } from "react";
import { Link } from "wouter";
import {
  useListLeagues,
  useCreateLeague,
  getListLeaguesQueryKey,
} from "@workspace/api-client-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, LogOut, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { LOCAL_MODE_ENABLED } from "@/lib/local-mode";

export default function LeaguesHub() {
  const { user, logout } = useAuth();
  const queryClient = useQueryClient();
  const { data: leagues, isLoading } = useListLeagues();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState("");
  const [season, setSeason] = useState("");

  const createLeague = useCreateLeague({
    mutation: {
      onSuccess: () => {
        toast.success("League created");
        setCreateOpen(false);
        setName("");
        setSeason("");
        queryClient.invalidateQueries({ queryKey: getListLeaguesQueryKey() });
      },
      onError: () => toast.error("Failed to create league"),
    },
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">
              SWISH STATS
            </h1>
            <p className="text-muted-foreground mt-1">
              Your leagues — pick one to capture games or view stats.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {user ? (
              <span className="text-sm text-muted-foreground">
                {user.firstName ?? user.email ?? user.id}
              </span>
            ) : null}
            {!LOCAL_MODE_ENABLED && (
              <Button variant="outline" size="sm" onClick={() => logout()}>
                <LogOut className="w-4 h-4 mr-2" />
                Sign out
              </Button>
            )}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              {!LOCAL_MODE_ENABLED && (
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    New League
                  </Button>
                </DialogTrigger>
              )}
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create league</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="lname">Name</Label>
                    <Input
                      id="lname"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="e.g. Saturday Hoops"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lseason">Season (optional)</Label>
                    <Input
                      id="lseason"
                      value={season}
                      onChange={(e) => setSeason(e.target.value)}
                      placeholder="e.g. Spring 2026"
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={() =>
                      createLeague.mutate({
                        data: {
                          name,
                          season: season.trim() ? season.trim() : null,
                        },
                      })
                    }
                    disabled={!name.trim() || createLeague.isPending}
                  >
                    {createLeague.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : null}
                    Create
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !leagues || leagues.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-lg bg-card/50">
            <h3 className="text-xl font-semibold mb-2">No leagues yet</h3>
            <p className="text-muted-foreground mb-6">
              {LOCAL_MODE_ENABLED
                ? "Local mode is currently empty."
                : "Create your first league to start tracking games."}
            </p>
            {!LOCAL_MODE_ENABLED && (
              <Button size="lg" onClick={() => setCreateOpen(true)}>
                <Plus className="w-5 h-5 mr-2" />
                Create league
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {leagues.map((league) => (
              <Link key={league.id} href={`/leagues/${league.id}`}>
                <Card className="bg-card hover:bg-accent/50 transition-colors cursor-pointer h-full">
                  <CardContent className="p-6 space-y-3">
                    <div className="flex items-start justify-between">
                      <h3 className="font-semibold text-lg">{league.name}</h3>
                      <span className="text-xs px-2 py-1 rounded-full uppercase tracking-wider font-bold bg-primary/20 text-primary">
                        {league.viewerRole}
                      </span>
                    </div>
                    {league.season && (
                      <p className="text-sm text-muted-foreground">
                        {league.season}
                      </p>
                    )}
                    <div className="flex items-center gap-2 text-sm text-muted-foreground pt-2">
                      <Users className="w-4 h-4" />
                      Open league
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
