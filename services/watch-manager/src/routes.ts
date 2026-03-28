import { Hono } from "hono";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { WatchCreationRequestSchema } from "@bpollo/schemas";
import type { TriggerCondition } from "@bpollo/schemas";
import { db } from "./db/client.js";
import { watchObjects } from "./db/schema.js";
import { indexWatch } from "./redis.js";
import { logger } from "./logger.js";

const PatchSchema = z.object({
  status: z
    .enum([
      "waiting",
      "triggered",
      "running",
      "resolved",
      "escalated",
      "expired",
    ])
    .optional(),
  expected_signals: z.array(z.unknown()).optional(),
  expires_at: z.string().datetime().optional(),
});

const GetQuerySchema = z.object({
  entity_id: z.string(),
  tenant_id: z.string(),
  status: z.string().optional(),
});

export function buildRouter() {
  const router = new Hono();

  router.get("/health", (c) => c.json({ status: "ok" }));

  /**
   * GET /watches/recent?limit=&status= — list most recent watches (for console)
   */
  router.get("/watches/recent", async (c) => {
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200);
    const status = c.req.query("status");

    const conditions = status ? [eq(watchObjects.status, status)] : [];

    const rows = await db
      .select()
      .from(watchObjects)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(watchObjects.createdAt))
      .limit(limit);

    return c.json({
      watches: rows.map((r) => ({
        watch_id: r.watchId,
        entity_id: r.entityId,
        tenant_id: r.tenantId,
        status: r.status,
        risk_level: r.riskLevel,
        scope: r.scope,
        reason: r.reason,
        trigger_conditions: r.triggerConditions,
        expected_signals: r.expectedSignals,
        graph_snapshot: r.graphSnapshot,
        history: r.history,
        created_at: r.createdAt.toISOString(),
        expires_at: r.expiresAt.toISOString(),
        triggered_at: r.triggeredAt?.toISOString() ?? null,
      })),
    });
  });

  /**
   * POST /watches — create a new watch
   */
  router.post("/watches", async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = WatchCreationRequestSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const req = parsed.data;
    const now = new Date();

    const [row] = await db
      .insert(watchObjects)
      .values({
        entityId: req.entity_id,
        tenantId: req.tenant_id,
        status: "waiting",
        riskLevel: req.risk_level,
        scope: req.scope ?? "entity",
        reason: req.reason,
        graphSnapshot: req.graph_snapshot,
        triggerConditions: req.trigger_conditions,
        expectedSignals: req.expected_signals,
        history: [],
        createdAt: now,
        expiresAt: new Date(req.expires_at),
        updatedAt: now,
      })
      .returning();

    // Index event_match conditions in Redis
    const eventTypes = (req.trigger_conditions as TriggerCondition[])
      .filter((c) => c.type === "event_match")
      .map((c) => (c as { event_type: string }).event_type);

    await indexWatch(row.watchId, eventTypes);

    logger.info(
      { watchId: row.watchId, entityId: req.entity_id },
      "watch created",
    );

    return c.json({ watch_id: row.watchId, status: "waiting" }, 201);
  });

  /**
   * PATCH /watches/:id — update status / expected_signals / expires_at
   */
  router.patch("/watches/:id", async (c) => {
    const id = c.req.param("id");

    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "invalid JSON" }, 400);
    }

    const parsed = PatchSchema.safeParse(body);
    if (!parsed.success) {
      return c.json(
        { error: "validation failed", issues: parsed.error.issues },
        422,
      );
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (parsed.data.status) updates.status = parsed.data.status;
    if (parsed.data.expected_signals)
      updates.expectedSignals = parsed.data.expected_signals;
    if (parsed.data.expires_at)
      updates.expiresAt = new Date(parsed.data.expires_at);

    const [row] = await db
      .update(watchObjects)
      .set(updates as Parameters<typeof db.update>[0])
      .where(eq(watchObjects.watchId, id))
      .returning();

    if (!row) return c.json({ error: "watch not found" }, 404);

    return c.json({ watch_id: row.watchId, status: row.status });
  });

  /**
   * GET /watches?entity_id=&tenant_id=&status=
   */
  router.get("/watches", async (c) => {
    const query = GetQuerySchema.safeParse(c.req.query());
    if (!query.success) {
      return c.json(
        { error: "validation failed", issues: query.error.issues },
        422,
      );
    }

    const { entity_id, tenant_id, status } = query.data;

    const conditions = [
      eq(watchObjects.entityId, entity_id),
      eq(watchObjects.tenantId, tenant_id),
    ];
    if (status) conditions.push(eq(watchObjects.status, status));

    const rows = await db
      .select()
      .from(watchObjects)
      .where(and(...conditions));

    const watches = rows.map((r) => ({
      watch_id: r.watchId,
      entity_id: r.entityId,
      tenant_id: r.tenantId,
      status: r.status,
      risk_level: r.riskLevel,
      scope: r.scope,
      reason: r.reason,
      trigger_conditions: r.triggerConditions,
      expected_signals: r.expectedSignals,
      graph_snapshot: r.graphSnapshot,
      history: r.history,
      created_at: r.createdAt.toISOString(),
      expires_at: r.expiresAt.toISOString(),
      triggered_at: r.triggeredAt?.toISOString() ?? null,
    }));

    return c.json({ watches });
  });

  /**
   * GET /watches/:id — get a single watch by id
   */
  router.get("/watches/:id", async (c) => {
    const id = c.req.param("id");

    const [row] = await db
      .select()
      .from(watchObjects)
      .where(eq(watchObjects.watchId, id));

    if (!row) return c.json({ error: "watch not found" }, 404);

    return c.json({
      watch_id: row.watchId,
      entity_id: row.entityId,
      tenant_id: row.tenantId,
      status: row.status,
      risk_level: row.riskLevel,
      scope: row.scope,
      reason: row.reason,
      trigger_conditions: row.triggerConditions,
      expected_signals: row.expectedSignals,
      graph_snapshot: row.graphSnapshot,
      history: row.history,
      created_at: row.createdAt.toISOString(),
      expires_at: row.expiresAt.toISOString(),
      triggered_at: row.triggeredAt?.toISOString() ?? null,
    });
  });

  return router;
}
