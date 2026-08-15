import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const careerSaves = sqliteTable("career_saves", {
  userId: text("user_id").primaryKey(),
  version: integer("version").notNull().default(3),
  payload: text("payload").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull(),
});
