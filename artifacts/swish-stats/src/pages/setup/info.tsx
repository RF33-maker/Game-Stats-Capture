import { format } from "date-fns";
import { useRoute, useLocation, useSearch } from "wouter";
import { SetupLayout } from "@/components/layout/setup-layout";
import { useGetGame, useUpdateGame, getGetGameQueryKey } from "@workspace/api-client-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useEffect } from "react";

const formSchema = z.object({
  competition: z.string().optional(),
  venue: z.string().optional(),
  date: z.string().min(1, "Date is required"),
  captureMode: z.enum(["simple", "complex"]),
  periodCount: z.coerce.number().min(1).max(10),
  periodDurationMins: z.coerce.number().min(1).max(60),
});

export default function SetupInfo() {
  const [, params] = useRoute("/setup/:gameId/info");
  const gameId = Number(params?.gameId);
  const [, setLocation] = useLocation();
  const search = useSearch();
  const leagueQuery = new URLSearchParams(search).get("league");
  const qs = leagueQuery ? `?league=${leagueQuery}` : "";

  const { data: game, isLoading } = useGetGame(gameId, {
    query: { enabled: !!gameId, queryKey: getGetGameQueryKey(gameId) }
  });

  const updateGame = useUpdateGame({
    mutation: {
      onSuccess: () => {
        toast.success("Game info saved");
        setLocation(`/setup/${gameId}/teams${qs}`);
      },
      onError: () => toast.error("Failed to save game info")
    }
  });

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      competition: "",
      venue: "",
      date: format(new Date(), "yyyy-MM-dd"), // local date, not UTC
      captureMode: "complex",
      periodCount: 4,
      periodDurationMins: 10,
    }
  });

  useEffect(() => {
    if (game) {
      form.reset({
        competition: game.competition || "",
        venue: game.venue || "",
        date: game.date.split("T")[0],
        captureMode: game.captureMode,
        periodCount: game.periodCount,
        periodDurationMins: game.periodDurationMins,
      });
    }
  }, [game, form]);

  if (isLoading) {
    return (
      <SetupLayout gameId={String(gameId)} title="Game Information" step={1} leagueId={leagueQuery}>
        <div className="flex justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
      </SetupLayout>
    );
  }

  return (
    <SetupLayout gameId={String(gameId)} title="Game Information" step={1} leagueId={leagueQuery}>
      <div className="bg-card border rounded-xl p-8 shadow-sm">
        <Form {...form}>
          <form onSubmit={form.handleSubmit((data) => updateGame.mutate({ gameId, data }))} className="space-y-6">
            
            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="competition"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Competition / League</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Summer Pro Am" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="venue"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Venue</FormLabel>
                    <FormControl>
                      <Input placeholder="e.g. Rucker Park" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="date"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="captureMode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Capture Mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select mode" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="simple">Simple (Basic Stats)</SelectItem>
                        <SelectItem value="complex">Complex (Full FIBA Stats)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-6">
              <FormField
                control={form.control}
                name="periodCount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Periods</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={10} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="periodDurationMins"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Minutes per Period</FormLabel>
                    <FormControl>
                      <Input type="number" min={1} max={60} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="pt-4 flex justify-end">
              <Button type="submit" size="lg" disabled={updateGame.isPending}>
                {updateGame.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                Save & Continue
              </Button>
            </div>
          </form>
        </Form>
      </div>
    </SetupLayout>
  );
}
