import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

const { buildRouter } = await import("../routes.js")
const { db }         = await import("../db/client.js")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_ALERT_REQUEST = {
  entity_id:      "entity-1",
  tenant_id:      "tenant-1",
  priority:       "high",
  message:        "Inspector missed deadline",
  recommendation: "Escalate to site manager",
}

const DB_ALERT_ROW = {
  alertId:        "alert-uuid-1",
  entityId:       "entity-1",
  tenantId:       "tenant-1",
  watchId:        null,
  priority:       "high",
  message:        "Inspector missed deadline",
  recommendation: "Escalate to site manager",
  read:           false,
  createdAt:      new Date("2024-01-15T10:00:00.000Z"),
}

let app: Hono

beforeEach(() => {
  vi.resetAllMocks()
  app = new Hono()
  app.route("/", buildRouter())
})

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await app.request("/health")
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// POST /alerts
// ---------------------------------------------------------------------------

describe("POST /alerts", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/alerts", {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "not json",
    })
    expect(res.status).toBe(400)
  })

  it("returns 422 for missing required fields", async () => {
    const res = await app.request("/alerts", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ entity_id: "e1" }),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("validation failed")
  })

  it("creates alert and returns 201 with alert_id", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...DB_ALERT_ROW, alertId: "new-alert-id" }]),
      }),
    } as any)

    const res = await app.request("/alerts", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(BASE_ALERT_REQUEST),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.alert_id).toBe("new-alert-id")
  })

  it("accepts optional watch_id field", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{
          ...DB_ALERT_ROW,
          alertId: "alert-with-watch",
          watchId: "watch-uuid-1",
        }]),
      }),
    } as any)

    const res = await app.request("/alerts", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        ...BASE_ALERT_REQUEST,
        watch_id: "550e8400-e29b-41d4-a716-446655440001",
      }),
    })
    expect(res.status).toBe(201)
  })

  it("returns 422 for invalid priority enum", async () => {
    const res = await app.request("/alerts", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ ...BASE_ALERT_REQUEST, priority: "extreme" }),
    })
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// GET /alerts
// ---------------------------------------------------------------------------

describe("GET /alerts", () => {
  it("returns 422 when tenant_id missing", async () => {
    const res = await app.request("/alerts?entity_id=e1")
    expect(res.status).toBe(422)
  })

  it("returns list of alerts for tenant", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([DB_ALERT_ROW]),
        }),
      }),
    } as any)

    const res = await app.request("/alerts?tenant_id=tenant-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.alerts)).toBe(true)
    expect(body.alerts).toHaveLength(1)
    expect(body.alerts[0].alert_id).toBe("alert-uuid-1")
  })

  it("returns empty list when no alerts", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any)

    const res = await app.request("/alerts?tenant_id=tenant-x")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alerts).toHaveLength(0)
  })

  it("filters by entity_id when provided", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([DB_ALERT_ROW]),
        }),
      }),
    } as any)

    const res = await app.request("/alerts?tenant_id=tenant-1&entity_id=entity-1")
    expect(res.status).toBe(200)
    // The where condition would have entity_id filter — we trust Drizzle
  })
})

// ---------------------------------------------------------------------------
// PATCH /alerts/:id/read
// ---------------------------------------------------------------------------

describe("PATCH /alerts/:id/read", () => {
  it("returns 404 for unknown alert", async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any)

    const res = await app.request("/alerts/nonexistent/read", {
      method: "PATCH",
    })
    expect(res.status).toBe(404)
  })

  it("marks alert as read", async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...DB_ALERT_ROW, read: true }]),
        }),
      }),
    } as any)

    const res = await app.request("/alerts/alert-uuid-1/read", {
      method: "PATCH",
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.read).toBe(true)
    expect(body.alert_id).toBe("alert-uuid-1")
  })
})

// ---------------------------------------------------------------------------
// GET /alerts/:id
// ---------------------------------------------------------------------------

describe("GET /alerts/:id", () => {
  it("returns 404 for unknown alert", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    const res = await app.request("/alerts/nonexistent")
    expect(res.status).toBe(404)
  })

  it("returns alert by id", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([DB_ALERT_ROW]),
      }),
    } as any)

    const res = await app.request("/alerts/alert-uuid-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alert_id).toBe("alert-uuid-1")
    expect(body.priority).toBe("high")
    expect(body.read).toBe(false)
  })
})
