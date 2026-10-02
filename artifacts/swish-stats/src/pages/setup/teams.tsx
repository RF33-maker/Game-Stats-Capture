import { useRoute, useLocation, useSearch } from "wouter";
import { SetupLayout } from "@/components/layout/setup-layout";
import { useListTeams, useCreateTeam, useUpdateTeam, getListTeamsQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link2, Shield, X } from "lucide-react";
import { TeamSearchDialog } from "@/components/directory-search";
import { DIRECTORY_AVAILABLE, localApi, type SiteTeam } from "@/lib/directory";

const teamSchema = z.object({
  name: z.string().min(1, "Name required"),
  abbreviation: z.string().min(1, "Abbreviation required").max(4, "Max 4 chars").toUpperCase(),
  colorPrimary: z.string().min(4),
  colorSecondary: z.string().min(4),
  // Link to the team's existing page on Swish Assistant (public.teams.team_id).
  siteTeamId: z.string().nullable().optional(),
  logoUrl: z.string().nullable().optional(),
});

// "Bedford Thunder Senior Men" -> "BT", "Bath Basketball Senior Men" -> "BATH"
const GENERIC_WORDS = /^(basketball|bball|senior|seniors|junior|juniors|men|mens|women|womens|ladies|boys|girls|club|bc|team|u\d+|\d+u|\d+\+)$/i;
function suggestAbbreviation(name: string) {
  const all = name.replace(/[^A-Za-z0-9+ ]/g, " ").split(/\s+/).filter(Boolean);
  const meaningful = all.filter(w => !GENERIC_WORDS.test(w));
  const words = meaningful.length ? meaningful : all;
  if (words.length >= 2) return words.map(w => w[0]).join("").slice(0, 4).toUpperCase();
  return (words[0] ?? "").slice(0, 4).toUpperCase();
}

const formSchema = z.object({
  home: teamSchema,
  away: teamSchema,
});

export default function SetupTeams() {
  const [, params] = useRoute("/setup/:gameId/teams");
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");
  const qs = leagueQuery ? `?league=${leagueQuery}` : "";

  const { data: teams, isLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  const { data: league } = useQuery({
    queryKey: ["league-site-link", leagueQuery],
    queryFn: () => localApi<{ siteLeagueId?: string | null }>(`/api/leagues/${leagueQuery}`, "GET"),
    enabled: !!leagueQuery,
  });
  const [linking, setLinking] = useState<"home" | "away" | null>(null);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      home: { name: "", abbreviation: "", colorPrimary: "#ea580c", colorSecondary: "#ffffff" },
      away: { name: "", abbreviation: "", colorPrimary: "#2563eb", colorSecondary: "#ffffff" },
    }
  });

  useEffect(() => {
    if (teams && teams.length > 0) {
      const home = teams.find(t => t.isHome);
      const away = teams.find(t => !t.isHome);
      if (home) form.setValue("home", home as z.infer<typeof teamSchema>);
      if (away) form.setValue("away", away as z.infer<typeof teamSchema>);
    }
  }, [teams, form]);

  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    try {
      const homeTeam = teams?.find(t => t.isHome);
      const awayTeam = teams?.find(t => !t.isHome);

      if (homeTeam) {
        await updateTeam.mutateAsync({ teamId: homeTeam.id, data: { ...data.home, isHome: true } });
      } else {
        await createTeam.mutateAsync({ gameId, data: { ...data.home, isHome: true } });
      }

      if (awayTeam) {
        await updateTeam.mutateAsync({ teamId: awayTeam.id, data: { ...data.away, isHome: false } });
      } else {
        await createTeam.mutateAsync({ gameId, data: { ...data.away, isHome: false } });
      }

      queryClient.invalidateQueries({ queryKey: getListTeamsQueryKey(gameId) });
      toast.success("Teams saved");
      setLocation(`/setup/${gameId}/players${qs}`);
    } catch (err) {
      toast.error("Failed to save teams");
    }
  };

  if (isLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Teams" step={2} leagueId={leagueQuery}>
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </SetupLayout>
    );
  }

  const isPending = createTeam.isPending || updateTeam.isPending;

  return (
    <SetupLayout gameId={String(gameId)} title="Teams" step={2} leagueId={leagueQuery}>
      <TeamSearchDialog
        open={linking !== null}
        onOpenChange={(o) => { if (!o) setLinking(null); }}
        initialQuery={linking ? form.getValues(`${linking}.name`) : ""}
        competitionId={league?.siteLeagueId ?? null}
        onPick={(t: SiteTeam) => {
          if (!linking) return;
          form.setValue(`${linking}.siteTeamId`, t.teamId, { shouldDirty: true });
          form.setValue(`${linking}.logoUrl`, t.logoUrl ?? null, { shouldDirty: true });
          form.setValue(`${linking}.name`, t.name, { shouldDirty: true, shouldValidate: true });
          if (!form.getValues(`${linking}.abbreviation`)) {
            form.setValue(`${linking}.abbreviation`, suggestAbbreviation(t.name), { shouldValidate: true });
          }
          setLinking(null);
        }}
      />
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          
          <div className="grid md:grid-cols-2 gap-8">
            {/* Home Team */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: form.watch("home.colorPrimary") }} />
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="bg-primary/10 text-primary px-2 py-0.5 rounded text-sm">HOME</span>
                Team Details
              </h2>
              {DIRECTORY_AVAILABLE && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-border p-3" data-testid="site-team-link-home">
                  {form.watch("home.siteTeamId") ? (
                    <>
                      {form.watch("home.logoUrl") ? (
                        <img src={form.watch("home.logoUrl") ?? ""} alt="" className="w-8 h-8 rounded object-contain bg-muted" />
                      ) : <Shield className="w-8 h-8 p-1.5 rounded bg-muted text-muted-foreground" />}
                      <div className="flex-1 min-w-0 text-sm leading-tight">
                        <div className="font-semibold">On Swish</div>
                        <div className="text-xs text-muted-foreground">Stats go to this team's page</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLinking("home")}>Change</Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Unlink"
                        onClick={() => form.setValue("home.siteTeamId", null, { shouldDirty: true })}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-xs text-muted-foreground">
                        Already on Swish Assistant? Link the team to use its page and import its roster.
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setLinking("home")}>Find team</Button>
                    </>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="home.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="home.abbreviation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abbreviation (Max 4)</FormLabel>
                      <FormControl><Input {...field} maxLength={4} className="uppercase" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="home.colorPrimary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="color" className="w-12 h-10 p-1" {...field} />
                            <Input className="flex-1" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="home.colorSecondary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="color" className="w-12 h-10 p-1" {...field} />
                            <Input className="flex-1" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>

            {/* Away Team */}
            <div className="bg-card border border-border rounded-xl p-6 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1" style={{ backgroundColor: form.watch("away.colorPrimary") }} />
              <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <span className="bg-muted text-muted-foreground px-2 py-0.5 rounded text-sm">AWAY</span>
                Team Details
              </h2>
              {DIRECTORY_AVAILABLE && (
                <div className="mb-4 flex items-center gap-3 rounded-lg border border-dashed border-border p-3" data-testid="site-team-link-away">
                  {form.watch("away.siteTeamId") ? (
                    <>
                      {form.watch("away.logoUrl") ? (
                        <img src={form.watch("away.logoUrl") ?? ""} alt="" className="w-8 h-8 rounded object-contain bg-muted" />
                      ) : <Shield className="w-8 h-8 p-1.5 rounded bg-muted text-muted-foreground" />}
                      <div className="flex-1 min-w-0 text-sm leading-tight">
                        <div className="font-semibold">On Swish</div>
                        <div className="text-xs text-muted-foreground">Stats go to this team's page</div>
                      </div>
                      <Button type="button" variant="ghost" size="sm" onClick={() => setLinking("away")}>Change</Button>
                      <Button type="button" variant="ghost" size="icon" className="h-8 w-8" title="Unlink"
                        onClick={() => form.setValue("away.siteTeamId", null, { shouldDirty: true })}>
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  ) : (
                    <>
                      <Link2 className="w-5 h-5 text-muted-foreground shrink-0" />
                      <div className="flex-1 text-xs text-muted-foreground">
                        Already on Swish Assistant? Link the team to use its page and import its roster.
                      </div>
                      <Button type="button" variant="secondary" size="sm" onClick={() => setLinking("away")}>Find team</Button>
                    </>
                  )}
                </div>
              )}
              
              <div className="space-y-4">
                <FormField
                  control={form.control}
                  name="away.name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Team Name</FormLabel>
                      <FormControl><Input {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="away.abbreviation"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Abbreviation (Max 4)</FormLabel>
                      <FormControl><Input {...field} maxLength={4} className="uppercase" /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="away.colorPrimary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Primary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="color" className="w-12 h-10 p-1" {...field} />
                            <Input className="flex-1" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="away.colorSecondary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Secondary Color</FormLabel>
                        <FormControl>
                          <div className="flex items-center gap-2">
                            <Input type="color" className="w-12 h-10 p-1" {...field} />
                            <Input className="flex-1" {...field} />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={isPending}>
              {isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save & Continue
            </Button>
          </div>
        </form>
      </Form>
    </SetupLayout>
  );
}
