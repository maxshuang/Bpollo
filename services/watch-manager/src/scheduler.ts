import cron, { type ScheduledTask } from "node-cron";
import { lt, eq, and } from "drizzle-orm";
import type { TriggerCondition } from "@bpollo/schemas";
import { db } from "./db/client.js";
import { watchObjects } from "./db/schema.js";
import { deindexWatch } from "./redis.js";
import { publishTriggered } from "./kafka.js";
import { config } from "./config.js";
import { logger } from "./logger.js";

interface ExpectedSignal {
  event_type: string;
  deadline: string;
  required: boolean;
  received: boolean;
}

/**
 * Sweep 1 — Expiry
 *
 * Find all waiting watches whose hard TTL has passed and mark them expired.
 * Deindex from Redis so they don't appear as candidates in future event matches.
 */
export async function sweepExpiredForTest(): Promise<void> {
  return sweepExpired();
}

export async function sweepAbsenceForTest(): Promise<void> {
  return sweepAbsence();
}

async function sweepExpired(): Promise<void> {
  const now = new Date();

  const expired = await db
    .select()
    .from(watchObjects)
    .where(
      and(eq(watchObjects.status, "waiting"), lt(watchObjects.expiresAt, now)),
    );

  if (expired.length === 0) return;

  for (const row of expired) {
    await db
      .update(watchObjects)
      .set({ status: "expired", updatedAt: now })
      .where(eq(watchObjects.watchId, row.watchId));

    const conditions = row.triggerConditions as TriggerCondition[];
    const eventTypes = conditions
      .filter((c) => c.type === "event_match")
      .map((c) => (c as { event_type: string }).event_type);
    await deindexWatch(row.watchId, eventTypes);

    logger.info({ watchId: row.watchId }, "watch expired (scheduler)");
  }
}

/**
 * Sweep 2 — Absence detection
 *
 * Find waiting watches that have at least one required expected signal whose
 * deadline has passed without being received. Wake them via the run queue so
 * the LLM Orchestrator can reason over the missing signal.
 */
async function sweepAbsence(): Promise<void> {
  const now = new Date();

  // Load all waiting, not-yet-expired watches — filter in JS because
  // expected_signals is JSONB and the deadline check needs array inspection.
  const candidates = await db
    .select()
    .from(watchObjects)
    .where(eq(watchObjects.status, "waiting"));

  for (const row of candidates) {
    // Already handled by sweepExpired if past TTL
    if (row.expiresAt < now) continue;

    const signals = row.expectedSignals as ExpectedSignal[];
    const overdueRequired = signals.some(
      (s) => s.required && !s.received && new Date(s.deadline) < now,
    );

    if (!overdueRequired) continue;

    const historyEntry = {
      type: "absence_triggered",
      occurred_at: now.toISOString(),
      detail:
        "Required expected signal overdue — absence detected by scheduler",
    };

    await db
      .update(watchObjects)
      .set({
        status: "triggered",
        triggeredAt: now,
        updatedAt: now,
        history: [...(row.history as object[]), historyEntry],
      })
      .where(eq(watchObjects.watchId, row.watchId));

    // Deindex so the watch won't fire again on an incoming event while triggered
    const conditions = row.triggerConditions as TriggerCondition[];
    const eventTypes = conditions
      .filter((c) => c.type === "event_match")
      .map((c) => (c as { event_type: string }).event_type);
    await deindexWatch(row.watchId, eventTypes);

    await publishTriggered(row.watchId, row.entityId, "absence");

    logger.info(
      { watchId: row.watchId, entityId: row.entityId },
      "watch triggered by absence (scheduler)",
    );
  }
}

async function runSweeps(): Promise<void> {
  try {
    await sweepExpired();
    await sweepAbsence();
  } catch (err) {
    logger.error({ err }, "scheduler sweep failed");
  }
}

let task: ScheduledTask | null = null;

export function startScheduler(): void {
  task = cron.schedule(config.schedulerCron, runSweeps);
  logger.info({ cron: config.schedulerCron }, "scheduler started");
}

export function stopScheduler(): void {
  task?.stop();
  logger.info("scheduler stopped");
}
