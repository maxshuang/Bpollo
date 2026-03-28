import { Hono } from "hono";
import { BpolloEventSchema, GraphLocationSchema } from "@bpollo/schemas";
import { z } from "zod";
import { registry } from "./registry.js";
import { logger } from "./logger.js";

const EvaluateBodySchema = z.object({
  event: BpolloEventSchema,
  graph_location: GraphLocationSchema,
});

export function buildRouter(): Hono {
  const router = new Hono();

  router.get("/health", (c) => c.json({ status: "ok" }));

  /**
   * POST /triggers/evaluate
   *
   * Synchronous endpoint — useful for direct calls from the LLM Orchestrator
   * or integration tests. Returns all trigger results; callers decide which
   * non-null results to act on.
   */
  router.post("/triggers/evaluate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = EvaluateBodySchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const { event, graph_location } = parsed.data;
    const results = await registry.evaluate(event, graph_location);
    const fired = results.filter((r) => r.watch_creation_request !== null);

    logger.info(
      { eventId: event.event_id, fired: fired.length, total: results.length },
      "triggers evaluated",
    );

    return c.json({ results });
  });

  return router;
}
