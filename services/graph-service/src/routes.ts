import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { BaseEventSchema } from "@bpollo/schemas";
import type { GraphLocation } from "@bpollo/schemas";
import { db } from "./db/client.js";
import { entityState, entityHistory } from "./db/schema.js";
import type { GlobalGraph, GraphIndex } from "./graph/types.js";
import { logger } from "./logger.js";

export function buildRouter(graph: GlobalGraph, index: GraphIndex) {
  const router = new Hono();

  /** GET /graph/definition — full graph as JSON (used by console) */
  router.get("/graph/definition", (c) => c.json(graph));

  /** GET /health */
  router.get("/health", (c) => c.json({ status: "ok" }));

  /**
   * POST /graph/locate
   * Body: { event: BaseEvent }
   * Reply: GraphLocation
   *
   * Locates an entity in the global graph and computes SLA violations
   * from its history.
   */
  router.post("/graph/locate", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = z.object({ event: BaseEventSchema }).safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const { event } = parsed.data;

    const [state] = await db
      .select()
      .from(entityState)
      .where(
        and(
          eq(entityState.entityId, event.entity_id),
          eq(entityState.tenantId, event.tenant_id),
        ),
      );

    // If no state yet, use the current event's node
    const currentNodeId =
      state?.currentNode ?? index.byEventType.get(event.event_type)?.id ?? null;

    if (!currentNodeId) {
      return c.json({ error: "entity not found in graph" }, 404);
    }

    const currentNode = index.byId.get(currentNodeId)!;
    const upstream = index.upstreamOf.get(currentNodeId) ?? [];

    // Compute SLA violations from history
    const history = await db
      .select()
      .from(entityHistory)
      .where(
        and(
          eq(entityHistory.entityId, event.entity_id),
          eq(entityHistory.tenantId, event.tenant_id),
        ),
      )
      .orderBy(desc(entityHistory.occurredAt));

    const now = Date.now();
    const slaViolations: GraphLocation["sla_violations"] = [];

    for (const row of history) {
      const node = index.byId.get(row.toNode);
      if (!node?.sla_hours) continue;
      const ageHours = (now - row.occurredAt.getTime()) / 3_600_000;
      if (ageHours > node.sla_hours) {
        slaViolations.push({
          node: node.id,
          overdue_hours: Math.round(ageHours - node.sla_hours),
          violation_description: `${node.label} has been in this state for ${Math.round(ageHours)}h (SLA: ${node.sla_hours}h)`,
        });
      }
    }

    const location: GraphLocation = {
      current_node: currentNodeId,
      upstream,
      downstream_expected: currentNode.downstream.map((e) => ({
        node: e.node,
        sla_hours: e.sla_hours ?? undefined,
        expected: true,
      })),
      sla_violations: slaViolations,
    };

    return c.json(location);
  });

  /**
   * POST /graph/render-context
   * Body: { graph_location: GraphLocation, tenant_id: string }
   * Reply: { context_block: string }
   *
   * Produces a natural-language context block for the LLM prompt.
   */
  router.post("/graph/render-context", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = z
      .object({
        graph_location: z.object({
          current_node: z.string(),
          upstream: z.array(z.string()),
          downstream_expected: z.array(
            z.object({
              node: z.string(),
              sla_hours: z.number().optional(),
              expected: z.boolean(),
            }),
          ),
          sla_violations: z.array(
            z.object({
              node: z.string(),
              overdue_hours: z.number(),
              violation_description: z.string(),
            }),
          ),
        }),
        tenant_id: z.string(),
      })
      .safeParse(body);

    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const { graph_location: loc } = parsed.data;
    const currentNode = index.byId.get(loc.current_node);

    if (!currentNode) {
      return c.json({ error: "unknown graph node" }, 404);
    }

    const lines: string[] = [];

    lines.push(`## Business Graph Context`);
    lines.push(``);
    lines.push(`**Current state:** ${currentNode.label}`);
    lines.push(currentNode.llm_description);
    lines.push(``);

    if (loc.upstream.length > 0) {
      const upstreamLabels = loc.upstream
        .map((id) => index.byId.get(id)?.label ?? id)
        .join(", ");
      lines.push(`**Preceded by:** ${upstreamLabels}`);
    }

    if (loc.downstream_expected.length > 0) {
      lines.push(`**Expected next steps:**`);
      for (const edge of loc.downstream_expected) {
        const node = index.byId.get(edge.node);
        const sla = edge.sla_hours ? ` (within ${edge.sla_hours}h)` : "";
        lines.push(`  - ${node?.label ?? edge.node}${sla}`);
      }
    }

    if (loc.sla_violations.length > 0) {
      lines.push(``);
      lines.push(`**SLA violations (${loc.sla_violations.length}):**`);
      for (const v of loc.sla_violations) {
        lines.push(`  - ${v.violation_description}`);
      }
    }

    return c.json({ context_block: lines.join("\n") });
  });

  return router;
}
