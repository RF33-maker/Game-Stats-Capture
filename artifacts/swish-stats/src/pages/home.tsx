import { useListGames, useCreateGame, useSeedSampleGame } from "@workspace/api-client-react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Loader2, Plus, Play, Database } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";

export default function Home() {
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { data: games, isLoading } = useListGames();
  
  const createGame = useCreateGame({
    mutation: {
      onSuccess: (game) => {
        setLocation(`/setup/${game.id}/info`);
      },
      onError: () => {
        toast.error("Failed to create game");
      }
    }
  });

  const seedGame = useSeedSampleGame({
    mutation: {
      onSuccess: () => {
        toast.success("Sample game seeded");
        queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      },
      onError: () => {
        toast.error("Failed to seed game");
      }
    }
  });

  const handleNewGame = () => {
    createGame.mutate({
      data: {
        captureMode: "complex",
        periodCount: 4,
        periodDurationMins: 10,
        date: new Date().toISOString(),
      }
    });
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-8">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-4xl font-bold tracking-tight text-primary">SWISH STATS</h1>
            <p className="text-muted-foreground mt-1">Live game capture & box scores</p>
          </div>
          <div className="flex gap-4">
            <Button variant="outline" onClick={() => seedGame.mutate()} disabled={seedGame.isPending}>
              {seedGame.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Database className="w-4 h-4 mr-2" />}
              Seed Sample Game
            </Button>
            <Button onClick={handleNewGame} disabled={createGame.isPending}>
              {createGame.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
              New Game
            </Button>
          </div>
        </header>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : !games || games.length === 0 ? (
          <div className="text-center py-24 border border-dashed rounded-lg bg-card/50">
            <h3 className="text-xl font-semibold mb-2">No games found</h3>
            <p className="text-muted-foreground mb-6">Create a new game to start tracking stats.</p>
            <Button onClick={handleNewGame} size="lg">
              <Plus className="w-5 h-5 mr-2" />
              Create First Game
            </Button>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {games.map(game => (
              <Card key={game.id} className="bg-card hover:bg-accent/50 transition-colors">
                <CardContent className="p-6 flex flex-col h-full">
                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-4">
                      <span className="text-xs font-mono text-muted-foreground">
                        {format(new Date(game.date), "MMM d, yyyy")}
                      </span>
                      <span className={`text-xs px-2 py-1 rounded-full uppercase tracking-wider font-bold ${
                        game.status === 'active' ? 'bg-primary/20 text-primary' :
                        game.status === 'final' ? 'bg-muted text-muted-foreground' :
                        'bg-blue-500/20 text-blue-400'
                      }`}>
                        {game.status}
                      </span>
                    </div>
                    <h3 className="font-semibold text-lg mb-1 truncate">
                      {game.competition || "Exhibition Game"}
                    </h3>
                    {game.venue && (
                      <p className="text-sm text-muted-foreground">{game.venue}</p>
                    )}
                  </div>
                  
                  <div className="mt-6 flex items-center justify-between">
                    <div className="text-sm">
                      {game.captureMode} • {game.periodCount}x{game.periodDurationMins}
                    </div>
                    <Link href={
                      game.status === 'setup' ? `/setup/${game.id}/info`
                      : game.status === 'final' ? `/game/${game.id}/box`
                      : `/game/${game.id}`
                    }>
                      <Button size="sm" variant={game.status === 'final' ? 'secondary' : 'default'}>
                        {game.status === 'setup' ? 'Setup' : game.status === 'final' ? 'Box Score' : 'Capture'}
                        <Play className="w-4 h-4 ml-2" />
                      </Button>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
