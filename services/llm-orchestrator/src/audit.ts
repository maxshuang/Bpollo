import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { reasoningCycles } from "./db/schema.js";
import type { OrchestratorContext } from "./context.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// reasoning_cycle_id — deterministic, idempotent key per watch trigger
// ---------------------------------------------------------------------------

export function makeReasoningCycleId(
  watchId: string,
  triggeredAt: string,
): string {
  return crypto
    .createHash("sha256")
    .update(`${watchId}:${triggeredAt}`)
    .digest("hex")
    .slice(0, 32);
}

// ---------------------------------------------------------------------------
// Audit record lifecycle
// ---------------------------------------------------------------------------

/**
 * Opens a reasoning cycle row before the agent runs.
 * Returns false if this cycle_id already exists (idempotency guard).
 */
export async function openCycle(
  reasoningCycleId: string,
  watchId: string,
  entityId: string,
  tenantId: string,
  context: OrchestratorContext,
): Promise<boolean> {
  try {
    await db.insert(reasoningCycles).values({
      reasoningCycleId,
      watchId,
      entityId,
      tenantId,
      contextSnapshot: context as unknown as Record<string, unknown>,
      status: "running",
      startedAt: new Date(),
    });
    return true;
  } catch (err: unknown) {
    // Unique constraint violation → already processed
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes("unique") || message.includes("duplicate")) {
      logger.info(
        { reasoningCycleId },
        "reasoning cycle already processed, skipping",
      );
      return false;
    }
    throw err;
  }
}

export interface CycleCompletion {
  agentReasoning: string;
  toolsCalled: string[];
  stepsUsed: number;
  status: "completed" | "failed";
  errorMessage?: string;
}

export async function closeCycle(
  reasoningCycleId: string,
  completion: CycleCompletion,
): Promise<void> {
  await db
    .update(reasoningCycles)
    .set({
      agentReasoning: completion.agentReasoning,
      toolsCalled: completion.toolsCalled as unknown as Record<string, unknown>,
      stepsUsed: completion.stepsUsed,
      status: completion.status,
      errorMessage: completion.errorMessage ?? null,
      completedAt: new Date(),
    })
    .where(eq(reasoningCycles.reasoningCycleId, reasoningCycleId));
}
