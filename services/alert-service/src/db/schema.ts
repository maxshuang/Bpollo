import { pgTable, text, timestamp, uuid, boolean } from "drizzle-orm/pg-core"

export const alerts = pgTable("alerts", {
  alertId:        uuid("alert_id").defaultRandom().primaryKey(),
  entityId:       text("entity_id").notNull(),
  tenantId:       text("tenant_id").notNull(),
  watchId:        uuid("watch_id"),
  priority:       text("priority").notNull(),
  message:        text("message").notNull(),
  recommendation: text("recommendation").notNull(),
  read:           boolean("read").notNull().default(false),
  createdAt:      timestamp("created_at", { withTimezone: true }).notNull(),
})
