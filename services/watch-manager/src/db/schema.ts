import { pgTable, text, timestamp, uuid, jsonb } from "drizzle-orm/pg-core";

/**
 * watch_objects — persistent store for all watch lifecycle state.
 * trigger_conditions and expected_signals stored as JSONB for flexibility.
 */
export const watchObjects = pgTable("watch_objects", {
  watchId: uuid("watch_id").defaultRandom().primaryKey(),
  entityId: text("entity_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  status: text("status").notNull().default("waiting"),
  riskLevel: text("risk_level").notNull(),
  scope: text("scope").notNull().default("entity"),
  reason: text("reason").notNull(),
  graphSnapshot: jsonb("graph_snapshot").notNull(),
  triggerConditions: jsonb("trigger_conditions").notNull(),
  expectedSignals: jsonb("expected_signals").notNull(),
  history: jsonb("history").notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  triggeredAt: timestamp("triggered_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
});
