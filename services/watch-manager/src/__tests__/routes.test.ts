import { describe, it, expect, vi, beforeEach } from "vitest"
import { Hono } from "hono"

// Mock dependencies before importing routes
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("../redis.js", () => ({
  indexWatch:   vi.fn().mockResolvedValue(undefined),
  deindexWatch: vi.fn().mockResolvedValue(undefined),
  lookupWatches: vi.fn().mockResolvedValue([]),
  redis:         { connect: vi.fn(), disconnect: vi.fn() },
}))

const { buildRouter } = await import("../routes.js")
const { db }         = await import("../db/client.js")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString()

const BASE_WATCH_REQUEST = {
  entity_id:     "entity-1",
  tenant_id:     "tenant-1",
  risk_level:    "high",
  scope:         "entity",
  reason:        "Inspector hasn't submitted in 24h",
  graph_snapshot: { current_node: "inspection_submitted" },
  trigger_conditions: [
    { type: "event_match", event_type: "action.created" },
  ],
  expected_signals: [],
  expires_at: FUTURE_ISO,
}

const DB_ROW = {
  watchId:           "watch-uuid-1",
  entityId:          "entity-1",
  tenantId:          "tenant-1",
  status:            "waiting",
  riskLevel:         "high",
  scope:             "entity",
  reason:            "reason",
  graphSnapshot:     {},
  triggerConditions: [],
  expectedSignals:   [],
  history:           [],
  createdAt:         new Date(),
  expiresAt:         new Date(Date.now() + 86_400_000),
  triggeredAt:       null,
  updatedAt:         new Date(),
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
// POST /watches
// ---------------------------------------------------------------------------

describe("POST /watches", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/watches", {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "not json",
    })
    expect(res.status).toBe(400)
  })

  it("returns 422 for missing required fields", async () => {
    const res = await app.request("/watches", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ entity_id: "e1" }), // missing required fields
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("validation failed")
  })

  it("creates a watch and returns 201 with watch_id", async () => {
    vi.mocked(db.insert).mockReturnValue({
      values: vi.fn().mockReturnValue({
        returning: vi.fn().mockResolvedValue([{ ...DB_ROW, watchId: "new-watch-id" }]),
      }),
    } as any)

    const res = await app.request("/watches", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(BASE_WATCH_REQUEST),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.watch_id).toBe("new-watch-id")
    expect(body.status).toBe("waiting")
  })

  it("rejects invalid risk_level enum", async () => {
    const res = await app.request("/watches", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ ...BASE_WATCH_REQUEST, risk_level: "extreme" }),
    })
    expect(res.status).toBe(422)
  })

  it("rejects expires_at in the past (invalid datetime format)", async () => {
    const res = await app.request("/watches", {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ ...BASE_WATCH_REQUEST, expires_at: "not-a-date" }),
    })
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// PATCH /watches/:id
// ---------------------------------------------------------------------------

describe("PATCH /watches/:id", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/watches/some-id", {
      method: "PATCH",
      body:   "bad",
    })
    expect(res.status).toBe(400)
  })

  it("returns 404 when watch does not exist", async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([]),
        }),
      }),
    } as any)

    const res = await app.request("/watches/nonexistent", {
      method:  "PATCH",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ status: "resolved" }),
    })
    expect(res.status).toBe(404)
  })

  it("updates status and returns updated watch", async () => {
    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          returning: vi.fn().mockResolvedValue([{ ...DB_ROW, status: "resolved" }]),
        }),
      }),
    } as any)

    const res = await app.request("/watches/watch-uuid-1", {
      method:  "PATCH",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ status: "resolved" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("resolved")
  })

  it("returns 422 for invalid status value", async () => {
    const res = await app.request("/watches/watch-uuid-1", {
      method:  "PATCH",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ status: "invalid_status" }),
    })
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// GET /watches
// ---------------------------------------------------------------------------

describe("GET /watches", () => {
  it("returns 422 when entity_id or tenant_id missing", async () => {
    const res = await app.request("/watches?entity_id=e1")
    expect(res.status).toBe(422)
  })

  it("returns list of watches for entity", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([DB_ROW]),
      }),
    } as any)

    const res = await app.request("/watches?entity_id=entity-1&tenant_id=tenant-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(Array.isArray(body.watches)).toBe(true)
    expect(body.watches).toHaveLength(1)
    expect(body.watches[0].watch_id).toBe("watch-uuid-1")
  })

  it("returns empty list when no watches found", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    const res = await app.request("/watches?entity_id=entity-x&tenant_id=tenant-x")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.watches).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// GET /watches/:id
// ---------------------------------------------------------------------------

describe("GET /watches/:id", () => {
  it("returns 404 for unknown watch", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([]),
      }),
    } as any)

    const res = await app.request("/watches/nonexistent")
    expect(res.status).toBe(404)
  })

  it("returns watch object by id", async () => {
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([DB_ROW]),
      }),
    } as any)

    const res = await app.request("/watches/watch-uuid-1")
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.watch_id).toBe("watch-uuid-1")
    expect(body.entity_id).toBe("entity-1")
    expect(body.status).toBe("waiting")
  })
})
