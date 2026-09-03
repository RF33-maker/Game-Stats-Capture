import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { gamesTable } from "./games";
import { teamsTable } from "./teams";
import { playersTable } from "./players";

// Event types — matches the values used by the play-by-play state machine.
// Made / attempted (missed) / blocked variants for FG, plus rebounds, fouls, etc.
export const STAT_EVENT_TYPES = [
  "2ptm",
  "2pta",
  "2ptb",
  "3ptm",
  "3pta",
  "3ptb",
  "ftm",
  "fta",
  "oreb",
  "dreb",
  "ast",
  "stl",
  "tov",
  "blk",
  "pf",
  "tf",
  "flagrant",
  "plus",
  "minus",
  "sub_in",
  "sub_out",
  "timeout",
  "period_start",
  "period_end",
  "jump_ball",
] as const;
export type StatEventType = (typeof STAT_EVENT_TYPES)[number];

// Coarse shot-location zones for a standardized halfcourt shot chart.
// Only meaningful for field-goal make/miss events (2ptm/2pta/3ptm/3pta).
// Kept simple and independently extensible so a future precise x/y
// coordinate system can be added without breaking this column.
export const SHOT_ZONES = [
  "paint",
  "left_short_corner",
  "right_short_corner",
  "left_corner_three",
  "right_corner_three",
  "left_baseline_midrange",
  "right_baseline_midrange",
  "top_key_midrange",
  "left_wing_three",
  "right_wing_three",
  "top_arc_three",
] as const;
export type ShotZone = (typeof SHOT_ZONES)[number];

// Point value each zone is worth. Mirrors the frontend's own copy in
// swish-stats/src/components/court-zones.tsx (kept independent so that file
// stays free of server-only imports) — used here to reject stat events where
// the event type (2PT/3PT) doesn't match the shot zone's point value.
export const ZONE_SHOT_VALUE: Record<ShotZone, 2 | 3> = {
  paint: 2,
  left_short_corner: 2,
  right_short_corner: 2,
  left_baseline_midrange: 2,
  right_baseline_midrange: 2,
  top_key_midrange: 2,
  left_corner_three: 3,
  right_corner_three: 3,
  left_wing_three: 3,
  right_wing_three: 3,
  top_arc_three: 3,
};

export const SHOT_ZONE_LABELS: Record<ShotZone, string> = {
  paint: "Paint",
  left_short_corner: "Left Short Corner",
  right_short_corner: "Right Short Corner",
  left_corner_three: "Left Corner 3",
  right_corner_three: "Right Corner 3",
  left_baseline_midrange: "Left Baseline Mid-Range",
  right_baseline_midrange: "Right Baseline Mid-Range",
  top_key_midrange: "Top of Key Mid-Range",
  left_wing_three: "Left Wing 3",
  right_wing_three: "Right Wing 3",
  top_arc_three: "Top of the Arc 3",
};

export const statEventsTable = pgTable("stat_events", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => gamesTable.id, { onDelete: "cascade" }),
  teamId: integer("team_id").references(() => teamsTable.id, {
    onDelete: "cascade",
  }),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  period: integer("period").notNull(),
  clockSeconds: integer("clock_seconds").notNull(),
  eventType: text("event_type").notNull(),
  value: integer("value").notNull().default(1),
  // Free-throw sequencing — tracks which shot in a multi-FT trip this is (1, 2, 3) and how many in total.
  ftSequenceIndex: integer("ft_sequence_index"),
  ftSequenceTotal: integer("ft_sequence_total"),
  possessionTeamId: integer("possession_team_id"),
  // Coarse shot-location zone (see SHOT_ZONES). Only set for FG make/miss events.
  shotZone: text("shot_zone"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertStatEventSchema = createInsertSchema(statEventsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertStatEvent = z.infer<typeof insertStatEventSchema>;
export type StatEvent = typeof statEventsTable.$inferSelect;
