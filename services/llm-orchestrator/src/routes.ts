import { Hono } from "hono";
import { z } from "zod";
import { eq, desc } from "drizzle-orm";
import { WatchTriggerSchema } from "@bpollo/schemas";
import { runReasoningCycle } from "./agent.js";
import { db } from "./db/client.js";
import { reasoningCycles } from "./db/schema.js";
import { logger } from "./logger.js";

export function buildRouter(): Hono {
  const router = new Hono();

  router.get("/health", (c) => c.json({ status: "ok" }));

  /**
   * GET /reasoning-cycles?watch_id=<uuid>
   *
   * Returns all reasoning cycles for a given watch, newest first.
   * Used by the console to display the agent's audit trail.
   */
  router.get("/reasoning-cycles", async (c) => {
    const parsed = z
      .object({ watch_id: z.string().uuid() })
      .safeParse(c.req.query());

    if (!parsed.success) {
      return c.json({ error: "watch_id query param required (UUID)" }, 422);
    }

    const rows = await db
      .select()
      .from(reasoningCycles)
      .where(eq(reasoningCycles.watchId, parsed.data.watch_id))
      .orderBy(desc(reasoningCycles.startedAt));

    const cycles = rows.map((r) => ({
      id: r.id,
      reasoning_cycle_id: r.reasoningCycleId,
      watch_id: r.watchId,
      status: r.status,
      agent_reasoning: r.agentReasoning,
      tools_called: r.toolsCalled,
      steps_used: r.stepsUsed,
      error_message: r.errorMessage,
      started_at: r.startedAt.toISOString(),
      completed_at: r.completedAt?.toISOString() ?? null,
    }));

    return c.json({ cycles });
  });

  /**
   * POST /reason
   *
   * Synchronous entry point — useful for direct calls from integration tests
   * or the console. Accepts a WatchTrigger and runs one reasoning cycle.
   */
  router.post("/reason", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = WatchTriggerSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const trigger = parsed.data;

    logger.info(
      { watchId: trigger.watch_id },
      "POST /reason — running reasoning cycle",
    );

    await runReasoningCycle(trigger);

    return c.json({ status: "ok", watchId: trigger.watch_id });
  });

  return router;
}
