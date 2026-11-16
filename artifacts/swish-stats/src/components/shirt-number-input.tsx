import { useState } from "react";
import { toast } from "sonner";
import { localApi } from "@/lib/directory";

// The shirt number, editable in place: imported rosters often carry last
// season's number, or none at all.
export function ShirtNumberInput({ player, taken, onSaved, className = "" }: {
  player: { id: number; jerseyNumber: string; firstName: string; lastName: string };
  taken: string[];
  onSaved: () => void;
  className?: string;
}) {
  const [value, setValue] = useState(player.jerseyNumber ?? "");
  const [saving, setSaving] = useState(false);
  // Keep in step when the row changes underneath (a re-import, a link).
  const [shown, setShown] = useState(player.jerseyNumber);
  if (shown !== player.jerseyNumber) { setShown(player.jerseyNumber); setValue(player.jerseyNumber ?? ""); }

  const save = async () => {
    const next = value.trim();
    if (next === (player.jerseyNumber ?? "")) return;
    if (!/^\d{1,2}$/.test(next)) {
      toast.error("A shirt number is 0 to 99");
      setValue(player.jerseyNumber ?? "");
      return;
    }
    if (taken.includes(next)) toast.warning(`Another player on this team already wears #${next}`);
    setSaving(true);
    try {
      await localApi(`/api/players/${player.id}`, "PATCH", { jerseyNumber: next });
      onSaved();
    } catch {
      toast.error("Couldn't change the number");
      setValue(player.jerseyNumber ?? "");
    } finally {
      setSaving(false);
    }
  };

  return (
    <input
      value={value}
      inputMode="numeric"
      maxLength={2}
      placeholder="#"
      disabled={saving}
      onChange={e => setValue(e.target.value.replace(/[^\d]/g, ""))}
      onBlur={() => void save()}
      onKeyDown={e => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") { setValue(player.jerseyNumber ?? ""); (e.target as HTMLInputElement).blur(); }
      }}
      title="Shirt number. Tap to change it"
      aria-label={`Shirt number for ${player.firstName} ${player.lastName}`}
      data-testid="player-number"
      className={`w-9 h-8 rounded-md bg-background border text-center font-mono font-bold text-sm shrink-0 focus:outline-none focus:ring-2 focus:ring-primary hover:border-primary/60 ${!value ? "border-amber-500/70" : ""} ${className}`}
    />
  );
}
