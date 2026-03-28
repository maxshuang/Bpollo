import {
  pgTable,
  text,
  timestamp,
  uuid,
  jsonb,
  integer,
} from "drizzle-orm/pg-core";

/**
 * reasoning_cycles — audit trail for every LLM decision.
 *
 * Each row represents one complete agent run triggered by a watch firing.
 * Stored before and after the agent executes so we can detect and skip
 * duplicate runs (idempotency via reasoning_cycle_id).
 */
export const reasoningCycles = pgTable("reasoning_cycles", {
  id: uuid("id").defaultRandom().primaryKey(),
  // Deterministic key: hash of watch_id + triggered_at — used for idempotency
  reasoningCycleId: text("reasoning_cycle_id").notNull().unique(),
  watchId: uuid("watch_id").notNull(),
  entityId: text("entity_id").notNull(),
  tenantId: text("tenant_id").notNull(),
  // Snapshot of context assembled before the agent ran
  contextSnapshot: jsonb("context_snapshot").notNull(),
  // The agent's textual reasoning (captured from final step)
  agentReasoning: text("agent_reasoning"),
  // Ordered list of tool calls the agent made
  toolsCalled: jsonb("tools_called").notNull().default([]),
  // Number of agent steps taken
  stepsUsed: integer("steps_used"),
  // Final status of this cycle
  status: text("status").notNull().default("running"), // running | completed | failed
  errorMessage: text("error_message"),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});
