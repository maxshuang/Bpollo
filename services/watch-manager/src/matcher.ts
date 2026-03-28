import { eq, and, inArray } from "drizzle-orm";
import type { BpolloEvent, TriggerCondition } from "@bpollo/schemas";
import { db } from "./db/client.js";
import { watchObjects } from "./db/schema.js";
import { lookupWatches, deindexWatch } from "./redis.js";
import { logger } from "./logger.js";

export interface MatchResult {
  watchId: string;
  matchedCondition: TriggerCondition;
  triggerType: "event_match" | "absence" | "pattern";
}

/**
 * Evaluate whether a single trigger condition fires for the given event.
 */
function conditionMatches(cond: TriggerCondition, event: BpolloEvent): boolean {
  if (cond.type === "event_match") {
    if (cond.event_type !== event.event_type) return false;
    if (cond.filters) {
      for (const [key, val] of Object.entries(cond.filters)) {
        if ((event as Record<string, unknown>)[key] !== val) return false;
      }
    }
    return true;
  }

  if (cond.type === "absence") {
    // Absence conditions are evaluated by the scheduler, not the event stream
    return false;
  }

  if (cond.type === "pattern") {
    // Pattern conditions are evaluated by pattern-engine, not here
    return false;
  }

  return false;
}

/**
 * Two-stage matching:
 *  1. Redis index lookup → candidate watch_ids for this event_type
 *  2. Load those watches from Postgres, evaluate all conditions
 *
 * Returns watches that fired + marks them as triggered in DB.
 */
export async function matchAndTrigger(
  event: BpolloEvent,
): Promise<MatchResult[]> {
  // Stage 1: fast Redis lookup
  const candidateIds = await lookupWatches(event.event_type);
  if (candidateIds.length === 0) return [];

  // Stage 2: load candidates from Postgres
  const rows = await db
    .select()
    .from(watchObjects)
    .where(
      and(
        inArray(watchObjects.watchId, candidateIds),
        eq(watchObjects.status, "waiting"),
      ),
    );

  const results: MatchResult[] = [];
  const now = new Date();

  for (const row of rows) {
    // Check expiry
    if (row.expiresAt < now) {
      await db
        .update(watchObjects)
        .set({ status: "expired", updatedAt: now })
        .where(eq(watchObjects.watchId, row.watchId));

      const conditions = row.triggerConditions as TriggerCondition[];
      const eventTypes = conditions
        .filter((c) => c.type === "event_match")
        .map((c) => (c as { event_type: string }).event_type);
      await deindexWatch(row.watchId, eventTypes);
      continue;
    }

    const conditions = row.triggerConditions as TriggerCondition[];
    const matched = conditions.find((c) => conditionMatches(c, event));

    if (matched) {
      const historyEntry = {
        type: "triggered",
        event_id: event.event_id,
        event_type: event.event_type,
        occurred_at: now.toISOString(),
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

      // Remove from Redis index so it doesn't fire again while triggered
      const eventTypes = conditions
        .filter((c) => c.type === "event_match")
        .map((c) => (c as { event_type: string }).event_type);
      await deindexWatch(row.watchId, eventTypes);

      results.push({
        watchId: row.watchId,
        matchedCondition: matched,
        triggerType: "event_match",
      });

      logger.info(
        { watchId: row.watchId, eventId: event.event_id },
        "watch triggered",
      );
    }
  }

  return results;
}
