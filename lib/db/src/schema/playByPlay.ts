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
import { statEventsTable } from "./statEvents";

export const playByPlayTable = pgTable("play_by_play", {
  id: serial("id").primaryKey(),
  gameId: integer("game_id")
    .notNull()
    .references(() => gamesTable.id, { onDelete: "cascade" }),
  statEventId: integer("stat_event_id").references(() => statEventsTable.id, {
    onDelete: "set null",
  }),
  teamId: integer("team_id").references(() => teamsTable.id, {
    onDelete: "set null",
  }),
  playerId: integer("player_id").references(() => playersTable.id, {
    onDelete: "set null",
  }),
  period: integer("period").notNull(),
  clockSeconds: integer("clock_seconds").notNull(),
  possessionTeamId: integer("possession_team_id"),
  // Did this event end a possession? Used for possession counting.
  possessionEnded: text("possession_ended").notNull().default("false"),
  homeScore: integer("home_score").notNull().default(0),
  awayScore: integer("away_score").notNull().default(0),
  eventText: text("event_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertPlayByPlaySchema = createInsertSchema(playByPlayTable).omit({
  id: true,
  createdAt: true,
});
export type InsertPlayByPlay = z.infer<typeof insertPlayByPlaySchema>;
export type PlayByPlay = typeof playByPlayTable.$inferSelect;
