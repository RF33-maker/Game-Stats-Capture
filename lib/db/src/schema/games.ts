import {
  pgTable,
  serial,
  text,
  integer,
  timestamp,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { leaguesTable } from "./leagues";

export const gamesTable = pgTable("games", {
  id: serial("id").primaryKey(),
  leagueId: integer("league_id").references(() => leaguesTable.id, {
    onDelete: "set null",
  }),
  competition: text("competition"),
  date: timestamp("date", { withTimezone: true }).notNull().defaultNow(),
  venue: text("venue"),
  status: text("status").notNull().default("setup"),
  captureMode: text("capture_mode").notNull().default("complex"),
  periodCount: integer("period_count").notNull().default(4),
  periodDurationMins: integer("period_duration_mins").notNull().default(10),
  overtimeCount: integer("overtime_count").notNull().default(0),
  currentPeriod: integer("current_period").notNull().default(1),
  clockSeconds: integer("clock_seconds").notNull().default(600),
  possessionTeamId: integer("possession_team_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertGameSchema = createInsertSchema(gamesTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertGame = z.infer<typeof insertGameSchema>;
export type Game = typeof gamesTable.$inferSelect;
