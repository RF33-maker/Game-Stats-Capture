import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetLeague,
  useListLeagueGames,
  useCreateLeagueGame,
  useListLeagueMembers,
  useAddLeagueMember,
  useRemoveLeagueMember,
  useUpdateLeagueMember,
  useUpdateGame,
  useDeleteGame,
  getListLeagueGamesQueryKey,
  getListLeagueMembersQueryKey,
  getGetLeagueQueryKey,
  type LeagueRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Loader2,
  Plus,
  ArrowLeft,
  Play,
  UserPlus,
  Trash2,
  Pencil,
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

const ROLES: LeagueRole[] = ["viewer", "scorer", "admin"];

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:leagueId");
  const leagueId = Number(params?.leagueId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const {
    data: league,
    isLoading,
    isError: leagueError,
  } = useGetLeague(leagueId, {
    query: {
      enabled: !!leagueId,
      queryKey: getGetLeagueQueryKey(leagueId),
      retry: false,
    },
  });
  const { data: games } = useListLeagueGames(leagueId, {
    query: {
      enabled: !!leagueId,
      queryKey: getListLeagueGamesQueryKey(leagueId),
    },
  });
  const { data: members } = useListLeagueMembers(leagueId, {
    query: {
      enabled: !!leagueId,
      queryKey: getListLeagueMembersQueryKey(leagueId),
    },
  });

  const canScore =
    league?.viewerRole === "scorer" || league?.viewerRole === "admin";
  const canAdmin = league?.viewerRole === "admin";

  const createGame = useCreateLeagueGame({
    mutation: {
      onSuccess: (game) => {
        queryClient.invalidateQueries({
          queryKey: getListLeagueGamesQueryKey(leagueId),
        });
        setLocation(`/setup/${game.id}/info?league=${leagueId}`);
      },
      onError: () => toast.error("Failed to create game"),
    },
  });

  const addMember = useAddLeagueMember({
    mutation: {
      onSuccess: () => {
        toast.success("Member added");
        setMemberEmail("");
        setMemberRole("viewer");
        setMemberOpen(false);
        queryClient.invalidateQueries({
          queryKey: getListLeagueMembersQueryKey(leagueId),
        });
      },
      onError: (err: unknown) => {
        const msg =
          err instanceof Error ? err.message : "Failed to add member";
        toast.error(msg);
      },
    },
  });

  const updateMember = useUpdateLeagueMember({
    mutation: {
      onSuccess: () =>
        queryClient.invalidateQueries({
          queryKey: getListLeagueMembersQueryKey(leagueId),
        }),
      onError: () => toast.error("Failed to update role"),
    },
  });

  const reopenGame = useUpdateGame({
    mutation: {
      onSuccess: (game) => {
        queryClient.invalidateQueries({
          queryKey: getListLeagueGamesQueryKey(leagueId),
        });
        setLocation(`/game/${game.id}?league=${leagueId}`);
      },
      onError: () => toast.error("Failed to reopen game"),
    },
  });

  const deleteGame = useDeleteGame({
    mutation: {
      onSuccess: () => {
        toast.success("Game deleted");
        queryClient.invalidateQueries({
          queryKey: getListLeagueGamesQueryKey(leagueId),
        });
      },
      onError: () => toast.error("Failed to delete game"),
    },
  });

  const removeMember = useRemoveLeagueMember({
    mutation: {
      onSuccess: () => {
        toast.success("Member removed");
        queryClient.invalidateQueries({
          queryKey: getListLeagueMembersQueryKey(leagueId),
        });
      },
      onError: () => toast.error("Failed to remove member"),
    },
  });

  const [memberOpen, setMemberOpen] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<LeagueRole>("viewer");
  const [confirmDeleteGame, setConfirmDeleteGame] = useState<{
    id: number;
    label: string;
  } | null>(null);

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (leagueError || !league) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-foreground p-6">
        <div className="max-w-sm w-full text-center space-y-4 border rounded-xl bg-card p-8">
          <h1 className="text-xl font-bold">League unavailable</h1>
          <p className="text-sm text-muted-foreground">
            This league has been deleted or you no longer have access to it.
          </p>
          <Link href="/leagues">
            <Button className="w-full">Back to leagues</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-background text-foreground p-8">
      <div className="max-w-5xl mx-auto space-y-8">
        <header className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3">
            <Link href="/leagues">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="w-5 h-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold tracking-tight">
                {league.name}
              </h1>
              {league.season && (
                <p className="text-muted-foreground">{league.season}</p>
              )}
              <span className="text-xs mt-2 inline-block px-2 py-1 rounded-full uppercase tracking-wider font-bold bg-primary/20 text-primary">
                You: {league.viewerRole}
              </span>
            </div>
          </div>
          {canAdmin && (
            <Button
              onClick={() =>
                createGame.mutate({
                  leagueId,
                  data: {
                    captureMode: "complex",
                    periodCount: 4,
                    periodDurationMins: 10,
                    date: new Date().toISOString(),
                  },
                })
              }
              disabled={createGame.isPending}
            >
              {createGame.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Plus className="w-4 h-4 mr-2" />
              )}
              New game
            </Button>
          )}
        </header>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold">Games</h2>
          {!games || games.length === 0 ? (
            <div className="text-center py-12 border border-dashed rounded-lg bg-card/50 text-muted-foreground">
              No games yet.{" "}
              {canAdmin
                ? "Create one to get started."
                : "Ask an admin to schedule a game."}
            </div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {games.map((game) => (
                <Card key={game.id} className="bg-card">
                  <CardContent className="p-5 flex flex-col h-full gap-4">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono text-muted-foreground">
                        {format(new Date(game.date), "MMM d, yyyy")}
                      </span>
                      <span
                        className={`px-2 py-1 rounded-full uppercase tracking-wider font-bold ${
                          game.status === "active"
                            ? "bg-primary/20 text-primary"
                            : game.status === "final"
                              ? "bg-muted text-muted-foreground"
                              : "bg-blue-500/20 text-blue-400"
                        }`}
                      >
                        {game.status}
                      </span>
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold truncate">
                        {game.competition || "Exhibition Game"}
                      </h3>
                      {game.venue && (
                        <p className="text-sm text-muted-foreground">
                          {game.venue}
                        </p>
                      )}
                    </div>
                    {(() => {
                      const target =
                        game.status === "setup"
                          ? `/setup/${game.id}/info?league=${leagueId}`
                          : game.status === "final"
                            ? `/game/${game.id}/box?league=${leagueId}`
                            : `/game/${game.id}?league=${leagueId}`;
                      const allowed =
                        game.status === "final"
                          ? true
                          : game.status === "active"
                            ? canScore
                            : canAdmin;
                      const label =
                        game.status === "setup"
                          ? canAdmin
                            ? "Setup"
                            : "Awaiting setup"
                          : game.status === "final"
                            ? "Box Score"
                            : canScore
                              ? "Capture"
                              : "View only";
                      const variant =
                        game.status === "final" ? "secondary" : "default";
                      const primary = (
                        <Button
                          size="sm"
                          className="w-full"
                          variant={variant}
                          disabled={!allowed}
                        >
                          {label}
                          <Play className="w-4 h-4 ml-2" />
                        </Button>
                      );
                      const primaryEl = allowed ? (
                        <Link href={target}>{primary}</Link>
                      ) : (
                        primary
                      );
                      const actions =
                        game.status === "final" && canAdmin ? (
                          <div className="grid grid-cols-2 gap-2">
                            {primaryEl}
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={reopenGame.isPending}
                              onClick={() =>
                                reopenGame.mutate({
                                  gameId: game.id,
                                  data: { status: "active" },
                                })
                              }
                            >
                              {reopenGame.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Pencil className="w-4 h-4 mr-2" />
                              )}
                              Edit
                            </Button>
                          </div>
                        ) : (
                          primaryEl
                        );
                      return (
                        <div className="space-y-2">
                          {actions}
                          {canAdmin && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                              disabled={
                                deleteGame.isPending &&
                                deleteGame.variables?.gameId === game.id
                              }
                              onClick={() =>
                                setConfirmDeleteGame({
                                  id: game.id,
                                  label:
                                    game.competition || "Exhibition Game",
                                })
                              }
                            >
                              {deleteGame.isPending &&
                              deleteGame.variables?.gameId === game.id ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <Trash2 className="w-4 h-4 mr-2" />
                              )}
                              Delete
                            </Button>
                          )}
                        </div>
                      );
                    })()}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Members</h2>
            {canAdmin && (
              <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <UserPlus className="w-4 h-4 mr-2" />
                    Add member
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add member by email</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="memail">Email</Label>
                      <Input
                        id="memail"
                        type="email"
                        value={memberEmail}
                        onChange={(e) => setMemberEmail(e.target.value)}
                        placeholder="user@example.com"
                      />
                      <p className="text-xs text-muted-foreground mt-2">
                        The user must have already signed in to Swish Stats at
                        least once.
                      </p>
                    </div>
                    <div>
                      <Label>Role</Label>
                      <Select
                        value={memberRole}
                        onValueChange={(v) => setMemberRole(v as LeagueRole)}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {r}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={() =>
                        addMember.mutate({
                          leagueId,
                          data: { email: memberEmail, role: memberRole },
                        })
                      }
                      disabled={!memberEmail.trim() || addMember.isPending}
                    >
                      {addMember.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : null}
                      Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            )}
          </div>
          <Card>
            <CardContent className="p-0 divide-y">
              {(members ?? []).map((m) => (
                <div
                  key={m.userId}
                  className="flex items-center justify-between p-4 gap-4"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {m.firstName || m.lastName
                        ? `${m.firstName ?? ""} ${m.lastName ?? ""}`.trim()
                        : (m.email ?? m.userId)}
                    </div>
                    {m.email && (
                      <div className="text-xs text-muted-foreground truncate">
                        {m.email}
                      </div>
                    )}
                  </div>
                  {canAdmin ? (
                    <Select
                      value={m.role}
                      onValueChange={(v) =>
                        updateMember.mutate({
                          leagueId,
                          userId: m.userId,
                          data: { role: v as LeagueRole },
                        })
                      }
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {r}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs px-2 py-1 rounded-full uppercase tracking-wider font-bold bg-muted">
                      {m.role}
                    </span>
                  )}
                  {canAdmin && league.ownerUserId !== m.userId && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() =>
                        removeMember.mutate({ leagueId, userId: m.userId })
                      }
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>

      <AlertDialog
        open={confirmDeleteGame !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmDeleteGame(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete game?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes
              {confirmDeleteGame ? ` "${confirmDeleteGame.label}"` : " this game"}
              {" "}and all of its teams, players, stat events, and play-by-play
              entries. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (!confirmDeleteGame) return;
                const target = confirmDeleteGame;
                setConfirmDeleteGame(null);
                deleteGame.mutate({ gameId: target.id });
              }}
            >
              Delete game
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
