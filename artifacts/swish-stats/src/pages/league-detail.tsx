import { useState } from "react";
import { Link, useRoute, useLocation } from "wouter";
import {
  useGetLeague,
  useListLeagueGames,
  useCreateLeagueGame,
  useListLeagueMembers,
  useListLeagueActivity,
  useAddLeagueMember,
  useRemoveLeagueMember,
  useUpdateLeagueMember,
  useUpdateGame,
  useDeleteGame,
  getListLeagueGamesQueryKey,
  getListLeagueMembersQueryKey,
  getListLeagueActivityQueryKey,
  getGetLeagueQueryKey,
  LeagueActivityType,
  type LeagueRole,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { CompetitionSearchDialog } from "@/components/directory-search";
import { DIRECTORY_AVAILABLE, localApi } from "@/lib/directory";
import { toast as sonnerToast } from "sonner";
import { Button } from "@/components/ui/button";
import { newGameDefaults } from "@/lib/app-settings";
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
  Play,
  UserPlus,
  Trash2,
  Pencil,
  Calendar,
  MapPin,
  Zap,
  Users,
  BarChart3,
  Activity,
  UserCheck,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { AppHeader } from "@/components/app-header";

const ROLES: LeagueRole[] = ["viewer", "scorer", "admin"];

function roleBadge(role: string) {
  const classes =
    role === "admin"
      ? "bg-primary/20 text-primary border-primary/30"
      : role === "scorer"
        ? "bg-violet-500/20 text-violet-400 border-violet-500/30"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${classes}`}
    >
      {role}
    </span>
  );
}

function statusBadge(status: string) {
  const classes =
    status === "active"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/30"
      : status === "final"
        ? "bg-muted text-muted-foreground border-border"
        : "bg-blue-500/20 text-blue-400 border-blue-500/30";
  const label =
    status === "active" ? "Live" : status === "final" ? "Final" : "Setup";
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-bold border ${classes}`}
    >
      {status === "active" && (
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
      )}
      {label}
    </span>
  );
}

export default function LeagueDetail() {
  const [, params] = useRoute("/leagues/:leagueId");
  const leagueId = Number(params?.leagueId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const invalidateActivity = () =>
    queryClient.invalidateQueries({
      queryKey: getListLeagueActivityQueryKey(leagueId, { limit: 10 }),
    });

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
  const { data: activity } = useListLeagueActivity(
    leagueId,
    { limit: 10 },
    {
      query: {
        enabled: !!leagueId,
        queryKey: getListLeagueActivityQueryKey(leagueId, { limit: 10 }),
      },
    },
  );

  const canScore =
    league?.viewerRole === "scorer" || league?.viewerRole === "admin";
  const canAdmin = league?.viewerRole === "admin";

  const createGame = useCreateLeagueGame({
    mutation: {
      onSuccess: (game) => {
        queryClient.invalidateQueries({
          queryKey: getListLeagueGamesQueryKey(leagueId),
        });
        invalidateActivity();
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
        invalidateActivity();
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
      onSuccess: () => {
        queryClient.invalidateQueries({
          queryKey: getListLeagueMembersQueryKey(leagueId),
        });
        invalidateActivity();
      },
      onError: () => toast.error("Failed to update role"),
    },
  });

  const reopenGame = useUpdateGame({
    mutation: {
      onSuccess: (game) => {
        queryClient.invalidateQueries({
          queryKey: getListLeagueGamesQueryKey(leagueId),
        });
        invalidateActivity();
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
        invalidateActivity();
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
        invalidateActivity();
      },
      onError: () => toast.error("Failed to remove member"),
    },
  });

  const [memberOpen, setMemberOpen] = useState(false);
  const [competitionOpen, setCompetitionOpen] = useState(false);
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
      <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4 sa-card p-8">
            <h1 className="text-xl font-bold">League unavailable</h1>
            <p className="text-sm text-muted-foreground">
              This league has been deleted or you no longer have access to it.
            </p>
            <Link href="/leagues">
              <Button className="w-full">Back to hub</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const sortedGames = [...(games ?? [])].sort((a, b) => {
    const order = { active: 0, setup: 1, final: 2 };
    const statusDiff = order[a.status] - order[b.status];
    if (statusDiff !== 0) return statusDiff;
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-5xl mx-auto px-6 py-8 space-y-10">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-2">
              <p className="sa-eyebrow">League</p>
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-4xl md:text-5xl font-bold">
                  {league.name}
                </h1>
                {roleBadge(league.viewerRole)}
              </div>
              {league.season && (
                <p className="text-muted-foreground">{league.season}</p>
              )}
              {DIRECTORY_AVAILABLE && (() => {
                const site = league as typeof league & { siteLeagueId?: string | null; siteLeagueName?: string | null };
                return (
                  <div className="flex items-center gap-2 text-sm" data-testid="league-site-link">
                    <span className="text-muted-foreground">Publishes to Swish:</span>
                    {site.siteLeagueId ? (
                      <span className="font-medium">{site.siteLeagueName ?? "Linked competition"}</span>
                    ) : (
                      <span className="text-muted-foreground italic">not linked yet</span>
                    )}
                    {canAdmin && (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => setCompetitionOpen(true)}>
                        {site.siteLeagueId ? "Change" : "Link a competition"}
                      </Button>
                    )}
                  </div>
                );
              })()}
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="w-4 h-4" />
                  {members?.length ?? "…"} member
                  {(members?.length ?? 0) !== 1 ? "s" : ""}
                </span>
                <span className="flex items-center gap-1.5">
                  <BarChart3 className="w-4 h-4" />
                  {games?.length ?? "…"} game
                  {(games?.length ?? 0) !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
            {canAdmin && (
              <Button
                onClick={() =>
                  createGame.mutate({
                    leagueId,
                    data: newGameDefaults(),
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
          </div>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                Games
                {(games?.length ?? 0) > 0 && (
                  <span className="text-muted-foreground font-normal text-base ml-2">
                    ({games?.length})
                  </span>
                )}
              </h2>
            </div>

            {!games || games.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 gap-4 text-center sa-card text-muted-foreground">
                <Play className="w-8 h-8 opacity-40" />
                <div>
                  <p className="font-medium text-foreground">No games yet</p>
                  <p className="text-sm mt-0.5">
                    {canAdmin
                      ? "Create a game to start tracking stats."
                      : "Ask an admin to schedule a game."}
                  </p>
                </div>
                {canAdmin && (
                  <Button
                    size="sm"
                    onClick={() =>
                      createGame.mutate({
                        leagueId,
                        data: newGameDefaults(),
                      })
                    }
                    disabled={createGame.isPending}
                  >
                    {createGame.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4 mr-2" />
                    )}
                    Create first game
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {sortedGames.map((game) => {
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
                        ? "Finish setup"
                        : "Awaiting setup"
                      : game.status === "final"
                        ? "Box score"
                        : canScore
                          ? "Capture"
                          : "View only";
                  const isPrimary =
                    game.status === "active" || game.status === "setup";

                  return (
                    <Card
                      key={game.id}
                      className={`bg-card border transition-colors ${
                        game.status === "active"
                          ? "border-emerald-500/30"
                          : "hover:border-primary/20"
                      }`}
                    >
                      <CardContent className="p-5 flex flex-col gap-3">
                        <div className="flex items-center justify-between">
                          {statusBadge(game.status)}
                          <span className="text-xs text-muted-foreground font-mono">
                            {format(new Date(game.date), "MMM d, yyyy")}
                          </span>
                        </div>

                        <div className="flex-1">
                          <h3 className="font-semibold leading-tight">
                            {game.competition || "Exhibition game"}
                          </h3>
                          {game.venue && (
                            <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                              <MapPin className="w-3 h-3" />
                              {game.venue}
                            </p>
                          )}
                        </div>

                        <div className="space-y-2 pt-1">
                          {DIRECTORY_AVAILABLE && canScore && game.status !== "setup" && (
                            <Link href={`/game/${game.id}/link?league=${leagueId}`} className="block">
                              <Button size="sm" variant="ghost" className="w-full gap-1.5 text-xs" data-testid="link-players">
                                <Users className="w-3.5 h-3.5" />
                                Link players to Swish
                              </Button>
                            </Link>
                          )}
                          {game.status === "final" && canAdmin ? (
                            <div className="grid grid-cols-2 gap-2">
                              <Link href={target} className="contents">
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="w-full gap-1"
                                >
                                  <BarChart3 className="w-3.5 h-3.5" />
                                  {label}
                                </Button>
                              </Link>
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
                                  <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                                ) : (
                                  <Pencil className="w-3.5 h-3.5 mr-1" />
                                )}
                                Reopen
                              </Button>
                            </div>
                          ) : allowed ? (
                            <Link href={target} className="block">
                              <Button
                                size="sm"
                                variant={isPrimary ? "default" : "secondary"}
                                className="w-full gap-1.5"
                              >
                                {game.status === "active" && (
                                  <Zap className="w-3.5 h-3.5" />
                                )}
                                {game.status === "final" && (
                                  <BarChart3 className="w-3.5 h-3.5" />
                                )}
                                {game.status === "setup" && (
                                  <Calendar className="w-3.5 h-3.5" />
                                )}
                                {label}
                              </Button>
                            </Link>
                          ) : (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              disabled
                            >
                              {label}
                            </Button>
                          )}

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
                                    game.competition || "Exhibition game",
                                })
                              }
                            >
                              {deleteGame.isPending &&
                              deleteGame.variables?.gameId === game.id ? (
                                <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
                              ) : (
                                <Trash2 className="w-3.5 h-3.5 mr-1" />
                              )}
                              Delete
                            </Button>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold flex items-center gap-2">
                <Activity className="w-4 h-4 text-muted-foreground" />
                Recent activity
              </h2>
            </div>

            {!activity || activity.length === 0 ? (
              <div className="text-center py-10 sa-card text-muted-foreground text-sm">
                No activity yet. Finalize a game or add members to see updates here.
              </div>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y">
                  {activity.map((entry, idx) => {
                    const ts = new Date(entry.timestamp);
                    const relative = formatDistanceToNow(ts, {
                      addSuffix: true,
                    });
                    const exact = format(ts, "MMM d, yyyy h:mm a");

                    if (
                      entry.type === LeagueActivityType.game_finalized &&
                      entry.gameId != null
                    ) {
                      return (
                        <Link
                          key={`g-${entry.gameId}-${idx}`}
                          href={`/game/${entry.gameId}/box?league=${leagueId}`}
                          className="flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors"
                        >
                          <div className="w-8 h-8 rounded-full bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                            <CheckCircle2 className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              <span className="font-medium">
                                {entry.gameLabel || "Exhibition game"}
                              </span>
                              <span className="text-muted-foreground">
                                {" "}
                                was finalized
                              </span>
                            </div>
                            <div
                              className="text-xs text-muted-foreground"
                              title={exact}
                            >
                              {relative}
                            </div>
                          </div>
                          <BarChart3 className="w-4 h-4 text-muted-foreground shrink-0" />
                        </Link>
                      );
                    }

                    if (entry.type === LeagueActivityType.member_joined) {
                      return (
                        <div
                          key={`m-${entry.userId}-${idx}`}
                          className="flex items-center gap-3 px-5 py-3"
                        >
                          <div className="w-8 h-8 rounded-full bg-primary/15 text-primary flex items-center justify-center shrink-0">
                            <UserCheck className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm">
                              <span className="font-medium truncate">
                                {entry.userDisplayName ||
                                  entry.userEmail ||
                                  "A member"}
                              </span>
                              <span className="text-muted-foreground">
                                {" joined as "}
                              </span>
                              <span className="font-medium">
                                {entry.role ?? "member"}
                              </span>
                            </div>
                            <div
                              className="text-xs text-muted-foreground"
                              title={exact}
                            >
                              {relative}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </CardContent>
              </Card>
            )}
          </section>

          <section className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-bold">
                Members
                {(members?.length ?? 0) > 0 && (
                  <span className="text-muted-foreground font-normal text-base ml-2">
                    ({members?.length})
                  </span>
                )}
              </h2>
              {canAdmin && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setMemberOpen(true)}
                >
                  <UserPlus className="w-3.5 h-3.5 mr-1.5" />
                  Add member
                </Button>
              )}
            </div>

            {!members || members.length === 0 ? (
              <div className="text-center py-10 sa-card text-muted-foreground text-sm">
                No members found.
              </div>
            ) : (
              <Card>
                <CardContent className="p-0 divide-y">
                  {members.map((m) => (
                    <div
                      key={m.userId}
                      className="flex items-center gap-3 px-5 py-4"
                    >
                      <div className="w-8 h-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-bold shrink-0 select-none">
                        {(
                          (m.firstName?.[0] ?? m.email?.[0] ?? "?")
                        ).toUpperCase()}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-sm">
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
                          <SelectTrigger className="w-28 h-8 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ROLES.map((r) => (
                              <SelectItem key={r} value={r} className="text-xs">
                                {r}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        roleBadge(m.role)
                      )}

                      {canAdmin && league.ownerUserId !== m.userId && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() =>
                            removeMember.mutate({ leagueId, userId: m.userId })
                          }
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </section>
        </div>
      </main>

      {/* Add member dialog */}
      <CompetitionSearchDialog
        open={competitionOpen}
        onOpenChange={setCompetitionOpen}
        onPick={async (c) => {
          try {
            await localApi(`/api/leagues/${leagueId}`, "PATCH", {
              siteLeagueId: c.competitionId,
              siteLeagueName: c.season ? `${c.name} · ${c.season}` : c.name,
            });
            setCompetitionOpen(false);
            sonnerToast.success(`Linked to ${c.name}`);
            queryClient.invalidateQueries();
          } catch (e) {
            sonnerToast.error(e instanceof Error ? e.message : "Couldn't link the competition");
          }
        }}
      />

      <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add member by email</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="memail">Email</Label>
              <Input
                id="memail"
                type="email"
                value={memberEmail}
                onChange={(e) => setMemberEmail(e.target.value)}
                placeholder="user@example.com"
                autoFocus
              />
              <p className="text-xs text-muted-foreground">
                The user must have already signed in to Swish Stats at least
                once.
              </p>
            </div>
            <div className="space-y-1.5">
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
            <Button variant="ghost" onClick={() => setMemberOpen(false)}>
              Cancel
            </Button>
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
              Add member
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete game confirm */}
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
              {confirmDeleteGame
                ? ` "${confirmDeleteGame.label}"`
                : " this game"}{" "}
              and all of its teams, players, stat events, and play-by-play
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
