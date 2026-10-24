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
import { RotateCcw, Save, Moon, Sun } from "lucide-react";
import { getTheme, setTheme, type Theme } from "@/lib/theme";
import {
  type AppSettings,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  CAPTURE_MODES,
} from "@/lib/app-settings";

export default function Settings() {
  const [theme, setThemeState] = useState<Theme>(getTheme);
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
            <p className="sa-eyebrow mb-2">Preferences</p>
            <h1 className="text-4xl md:text-5xl font-bold">Settings</h1>
            <p className="text-muted-foreground mt-1">
              Default game format and capture preferences. These apply when you
              create new games.
            </p>
          </div>

          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <h2 className="sa-eyebrow-muted font-sans">
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
                      {(["complex", "simple"] as const).map((m) => (
                        <SelectItem key={m} value={m}>
                          {CAPTURE_MODES[m].name} — {CAPTURE_MODES[m].description}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <h2 className="sa-eyebrow-muted font-sans">
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
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Shot court (Pro)</div>
                  <p className="text-xs text-muted-foreground">
                    Full court is drawn the way you see the floor, and the basket you tap tells the app
                    which team shot. Half court is one larger basket, for small screens.
                  </p>
                </div>
                <div className="inline-flex p-[3px] gap-0.5 rounded-[10px] bg-secondary border border-border" role="radiogroup" aria-label="Shot court">
                  {(["full", "half"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={settings.courtView === v}
                      onClick={() => update("courtView", v)}
                      className={`px-3 h-8 rounded-[7px] text-sm font-medium transition-colors ${
                        settings.courtView === v
                          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--border))]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`court-${v}`}
                    >
                      {v === "full" ? "Full court" : "Half court"}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="followUpPrompts" className="text-sm font-medium">
                    Ask for assists and rebounds
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    After a made shot, prompt for the assist; after a miss, prompt for the rebound.
                    One tap on the player records it — or carry on and the prompt goes away.
                  </p>
                </div>
                <Switch
                  id="followUpPrompts"
                  checked={settings.followUpPrompts}
                  onCheckedChange={(v) => update("followUpPrompts", v)}
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <Label htmlFor="detailPrompts" className="text-sm font-medium">
                    Record turnover and shot types
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Ask what kind of turnover it was (travel, bad pass…) and offer layup, dunk and
                    fast break on shots. Richer stats for one extra tap — leave off if you're scoring alone.
                  </p>
                </div>
                <Switch
                  id="detailPrompts"
                  checked={settings.detailPrompts}
                  onCheckedChange={(v) => update("detailPrompts", v)}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 sm:p-8 space-y-6">
              <h2 className="sa-eyebrow-muted font-sans">Appearance</h2>
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="space-y-0.5">
                  <div className="text-sm font-medium">Theme</div>
                  <p className="text-xs text-muted-foreground">
                    Dark matches Swish Assistant. Light is easier to read in a bright gym or outdoors.
                    Applies straight away, on this device.
                  </p>
                </div>
                <div className="inline-flex p-[3px] gap-0.5 rounded-[10px] bg-secondary border border-border" role="radiogroup" aria-label="Theme">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      role="radio"
                      aria-checked={theme === t}
                      onClick={() => { setTheme(t); setThemeState(t); }}
                      className={`inline-flex items-center gap-1.5 px-3 h-8 rounded-[7px] text-sm font-medium capitalize transition-colors ${
                        theme === t
                          ? "bg-card text-foreground shadow-[0_1px_2px_rgba(0,0,0,.3),0_0_0_1px_hsl(var(--border))]"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                      data-testid={`theme-${t}`}
                    >
                      {t === "dark" ? <Moon className="w-4 h-4" /> : <Sun className="w-4 h-4" />}
                      {t}
                    </button>
                  ))}
                </div>
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
