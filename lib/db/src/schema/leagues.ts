import { pgTable, serial, text, varchar, timestamp, integer, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./auth";

export const LEAGUE_ROLES = ["viewer", "scorer", "admin"] as const;
export type LeagueRole = (typeof LEAGUE_ROLES)[number];

export const leaguesTable = pgTable("leagues", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  season: text("season"),
  logoUrl: text("logo_url"),
  ownerUserId: varchar("owner_user_id").references(() => usersTable.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const insertLeagueSchema = createInsertSchema(leaguesTable).omit({
  id: true,
  createdAt: true,
});
export type InsertLeague = z.infer<typeof insertLeagueSchema>;
export type League = typeof leaguesTable.$inferSelect;

export const leagueMembershipsTable = pgTable(
  "league_memberships",
  {
    id: serial("id").primaryKey(),
    leagueId: integer("league_id")
      .notNull()
      .references(() => leaguesTable.id, { onDelete: "cascade" }),
    userId: varchar("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    role: text("role").notNull().$type<LeagueRole>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("league_memberships_league_user_unique").on(
      table.leagueId,
      table.userId,
    ),
  ],
);

export const insertLeagueMembershipSchema = createInsertSchema(
  leagueMembershipsTable,
).omit({ id: true, createdAt: true });
export type InsertLeagueMembership = z.infer<typeof insertLeagueMembershipSchema>;
export type LeagueMembership = typeof leagueMembershipsTable.$inferSelect;
