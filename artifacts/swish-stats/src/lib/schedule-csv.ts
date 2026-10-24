// A league's game schedule as a CSV: one row per game, with the game key a
// scorer types to unlock that game. Built from what is on this device, so it
// needs no connection.

export type ScheduleGame = {
  gameNumber?: number | null;
  roundLabel?: string | null;
  date: string;
  tipoffTime?: string | null;
  homeTeamName?: string | null;
  awayTeamName?: string | null;
  venue?: string | null;
  status: string;
  gameCode?: string | null;
  siteGameKey?: string | null;
};

const HEADER = ["Game no.", "Round", "Date", "Tip-off", "Home", "Away", "Venue", "Status", "Game key", "Swish game ID"];

/** Quote a cell, and stop a spreadsheet running anything typed into a name (=, +, -, @ at the start). */
function cell(value: unknown): string {
  let s = value == null ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const statusText = (s: string) => (s === "setup" ? "Not started" : s === "active" ? "In play" : s === "final" ? "Final" : s);

export function scheduleCsv(games: ScheduleGame[]): string {
  const sorted = [...games].sort((a, b) =>
    a.date.slice(0, 10).localeCompare(b.date.slice(0, 10))
    || (a.tipoffTime ?? "").localeCompare(b.tipoffTime ?? "")
    || (a.gameNumber ?? 0) - (b.gameNumber ?? 0));
  const rows = sorted.map(g => [
    g.gameNumber ?? "", g.roundLabel ?? "", g.date.slice(0, 10), g.tipoffTime?.slice(0, 5) ?? "",
    g.homeTeamName ?? "", g.awayTeamName ?? "", g.venue ?? "", statusText(g.status),
    g.gameCode ?? "", g.siteGameKey ?? "",
  ]);
  return [HEADER, ...rows].map(r => r.map(cell).join(",")).join("\r\n") + "\r\n";
}

export function downloadScheduleCsv(leagueName: string, games: ScheduleGame[]) {
  // The byte-order mark makes Excel read names with accents correctly.
  const blob = new Blob(["﻿", scheduleCsv(games)], { type: "text/csv;charset=utf-8" });
  const name = `${leagueName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "league"}-schedule.csv`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
