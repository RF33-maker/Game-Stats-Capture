import { useRoute, useLocation } from "wouter";
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
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const teamSchema = z.object({
  name: z.string().min(1, "Name required"),
  abbreviation: z.string().min(1, "Abbreviation required").max(4, "Max 4 chars").toUpperCase(),
  colorPrimary: z.string().min(4),
  colorSecondary: z.string().min(4),
});

const formSchema = z.object({
  home: teamSchema,
  away: teamSchema,
});

export default function SetupTeams() {
  const [, params] = useRoute("/setup/:gameId/teams");
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();

  const { data: teams, isLoading } = useListTeams(gameId, {
    query: { enabled: !!gameId, queryKey: getListTeamsQueryKey(gameId) }
  });

  const createTeam = useCreateTeam();
  const updateTeam = useUpdateTeam();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      home: { name: "", abbreviation: "", colorPrimary: "#ffffff", colorSecondary: "#000000" },
      away: { name: "", abbreviation: "", colorPrimary: "#000000", colorSecondary: "#ffffff" },
    }
  });

  useEffect(() => {
    if (teams && teams.length > 0) {
      const home = teams.find(t => t.isHome);
      const away = teams.find(t => !t.isHome);
      if (home) form.setValue("home", home);
      if (away) form.setValue("away", away);
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
      setLocation(`/setup/${gameId}/players`);
    } catch (err) {
      toast.error("Failed to save teams");
    }
  };

  if (isLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Teams" step={2}>
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </SetupLayout>
    );
  }

  const isPending = createTeam.isPending || updateTeam.isPending;

  return (
    <SetupLayout gameId={String(gameId)} title="Teams" step={2}>
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
