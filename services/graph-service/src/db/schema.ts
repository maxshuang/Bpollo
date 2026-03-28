import { pgTable, text, timestamp, uuid, integer, primaryKey } from "drizzle-orm/pg-core"

/** Current node for each (entity, tenant) pair */
export const entityState = pgTable("entity_state", {
  entityId:    text("entity_id").notNull(),
  tenantId:    text("tenant_id").notNull(),
  currentNode: text("current_node").notNull(),
  enteredAt:   timestamp("entered_at", { withTimezone: true }).notNull(),
  updatedAt:   timestamp("updated_at", { withTimezone: true }).notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.entityId, t.tenantId] }),
}))

/** Full transition history for audit + SLA computation */
export const entityHistory = pgTable("entity_history", {
  id:        uuid("id").defaultRandom().primaryKey(),
  entityId:  text("entity_id").notNull(),
  tenantId:  text("tenant_id").notNull(),
  fromNode:  text("from_node"),          // null on first event
  toNode:    text("to_node").notNull(),
  eventId:   text("event_id").notNull(),
  eventType: text("event_type").notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
})
