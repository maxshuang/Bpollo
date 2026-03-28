import { Hono } from "hono"
import { eq, and, desc } from "drizzle-orm"
import { z } from "zod"
import { AlertRequestSchema } from "@bpollo/schemas"
import { db } from "./db/client.js"
import { alerts } from "./db/schema.js"
import { logger } from "./logger.js"

const GetQuerySchema = z.object({
  tenant_id: z.string(),
  entity_id: z.string().optional(),
  unread:    z.enum(["true", "false"]).optional(),
})

export function buildRouter() {
  const router = new Hono()

  router.get("/health", (c) => c.json({ status: "ok" }))

  /**
   * POST /alerts — create a new alert
   */
  router.post("/alerts", async (c) => {
    let body: unknown
    try { body = await c.req.json() } catch {
      return c.json({ error: "invalid JSON" }, 400)
    }

    const parsed = AlertRequestSchema.safeParse(body)
    if (!parsed.success) {
      return c.json({ error: "validation failed", issues: parsed.error.issues }, 422)
    }

    const req = parsed.data

    const [row] = await db
      .insert(alerts)
      .values({
        entityId:       req.entity_id,
        tenantId:       req.tenant_id,
        watchId:        req.watch_id ?? null,
        priority:       req.priority,
        message:        req.message,
        recommendation: req.recommendation,
        read:           false,
        createdAt:      new Date(),
      })
      .returning()

    logger.info({ alertId: row.alertId, entityId: req.entity_id }, "alert created")

    return c.json({ alert_id: row.alertId }, 201)
  })

  /**
   * GET /alerts?tenant_id=&entity_id=&unread=
   */
  router.get("/alerts", async (c) => {
    const query = GetQuerySchema.safeParse(c.req.query())
    if (!query.success) {
      return c.json({ error: "validation failed", issues: query.error.issues }, 422)
    }

    const { tenant_id, entity_id, unread } = query.data

    const conditions = [eq(alerts.tenantId, tenant_id)]
    if (entity_id) conditions.push(eq(alerts.entityId, entity_id))
    if (unread === "true")  conditions.push(eq(alerts.read, false))
    if (unread === "false") conditions.push(eq(alerts.read, true))

    const rows = await db
      .select()
      .from(alerts)
      .where(and(...conditions))
      .orderBy(desc(alerts.createdAt))

    return c.json({
      alerts: rows.map((r) => ({
        alert_id:       r.alertId,
        entity_id:      r.entityId,
        tenant_id:      r.tenantId,
        watch_id:       r.watchId,
        priority:       r.priority,
        message:        r.message,
        recommendation: r.recommendation,
        read:           r.read,
        created_at:     r.createdAt.toISOString(),
      })),
    })
  })

  /**
   * PATCH /alerts/:id/read — mark alert as read
   */
  router.patch("/alerts/:id/read", async (c) => {
    const id = c.req.param("id")

    const [row] = await db
      .update(alerts)
      .set({ read: true })
      .where(eq(alerts.alertId, id))
      .returning()

    if (!row) return c.json({ error: "alert not found" }, 404)

    return c.json({ alert_id: row.alertId, read: true })
  })

  /**
   * GET /alerts/:id
   */
  router.get("/alerts/:id", async (c) => {
    const id = c.req.param("id")

    const [row] = await db
      .select()
      .from(alerts)
      .where(eq(alerts.alertId, id))

    if (!row) return c.json({ error: "alert not found" }, 404)

    return c.json({
      alert_id:       row.alertId,
      entity_id:      row.entityId,
      tenant_id:      row.tenantId,
      watch_id:       row.watchId,
      priority:       row.priority,
      message:        row.message,
      recommendation: row.recommendation,
      read:           row.read,
      created_at:     row.createdAt.toISOString(),
    })
  })

  return router
}
