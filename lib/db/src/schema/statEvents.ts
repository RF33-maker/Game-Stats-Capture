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
  "sub_in",
  "sub_out",
  "timeout",
  "period_start",
  "period_end",
  "jump_ball",
] as const;
export type StatEventType = (typeof STAT_EVENT_TYPES)[number];

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
