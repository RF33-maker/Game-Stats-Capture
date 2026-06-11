import { useState } from "react";
import { AppHeader } from "@/components/app-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { RotateCcw, Save } from "lucide-react";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
} from "@/lib/app-settings";

export default function Settings() {
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
    setSettings((prev) => ({ ...prev, [key]: value }));

  const handleSave = () => {
    saveSettings(settings);
    toast.success("Settings saved");
  };

  const handleReset = () => {
    setSettings(DEFAULT_SETTINGS);
    saveSettings(DEFAULT_SETTINGS);
    toast.success("Reset to FIBA defaults");
  };

  return (
    <div className="min-h-[100dvh] bg-background text-foreground flex flex-col">
      <AppHeader showBack={{ href: "/leagues", label: "League hub" }} />

      <main className="flex-1">
        <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Default game format and capture preferences. These apply when you
              create new games.
            </p>
          </div>

          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Game format (FIBA defaults)
              </h2>

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Periods" htmlFor="periodCount">
                  <Input
                    id="periodCount"
                    type="number"
                    min={1}
                    max={8}
                    value={settings.periodCount}
                    onChange={(e) =>
                      update("periodCount", clampInt(e.target.value, 1, 8, 4))
                    }
                  />
                </Field>

                <Field label="Period length (min)" htmlFor="periodDuration">
                  <Input
                    id="periodDuration"
                    type="number"
                    min={1}
                    max={20}
                    value={settings.periodDurationMins}
                    onChange={(e) =>
                      update(
                        "periodDurationMins",
                        clampInt(e.target.value, 1, 20, 10),
                      )
                    }
                  />
                </Field>

                <Field label="Overtime length (min)" htmlFor="otDuration">
                  <Input
                    id="otDuration"
                    type="number"
                    min={1}
                    max={20}
                    value={settings.overtimeDurationMins}
                    onChange={(e) =>
                      update(
                        "overtimeDurationMins",
                        clampInt(e.target.value, 1, 20, 5),
                      )
                    }
                  />
                </Field>

                <Field label="Default capture mode" htmlFor="captureMode">
                  <Select
                    value={settings.captureMode}
                    onValueChange={(v) =>
                      update("captureMode", v as AppSettings["captureMode"])
                    }
                  >
                    <SelectTrigger id="captureMode">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="complex">Complex (full stats)</SelectItem>
                      <SelectItem value="simple">Simple (score only)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                Scoring
              </h2>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="confirmFinalize" className="text-sm font-medium">
                    Confirm before finalizing a game
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ask for confirmation before a game is marked final.
                  </p>
                </div>
                <Switch
                  id="confirmFinalize"
                  checked={settings.confirmBeforeFinalize}
                  onCheckedChange={(v) => update("confirmBeforeFinalize", v)}
                />
              </div>
            </CardContent>
          </Card>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
            <Button variant="outline" className="gap-2" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
              Reset to FIBA defaults
            </Button>
            <Button className="gap-2" onClick={handleSave}>
              <Save className="w-4 h-4" />
              Save settings
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}

function clampInt(
  raw: string,
  min: number,
  max: number,
  fallback: number,
): number {
  const n = parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}
