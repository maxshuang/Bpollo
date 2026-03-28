/**
 * Integration tests for alert-service.
 *
 * Starts a real Postgres container via testcontainers.
 * Spawns the actual alert-service process.
 * Tests CRUD endpoints against a real database.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import {
  startPostgres,
  postgresUrl,
  type StartedPostgreSqlContainer,
} from "../helpers/containers.js"
import { spawnService, type ServiceHandle } from "../helpers/service.js"

const PORT     = 15002
const BASE_URL = `http://localhost:${PORT}`

let pgContainer: StartedPostgreSqlContainer
let service:     ServiceHandle

function makeAlertRequest(overrides: Record<string, unknown> = {}) {
  return {
    entity_id:      `entity-${Date.now()}`,
    tenant_id:      "tenant-alert-test",
    priority:       "high",
    message:        "Inspector missed SLA deadline",
    recommendation: "Escalate to site manager immediately",
    ...overrides,
  }
}

beforeAll(async () => {
  pgContainer = await startPostgres()
  const dbUrl = postgresUrl(pgContainer)

  service = await spawnService(
    "services/alert-service/src/index.ts",
    {
      PORT:         String(PORT),
      DATABASE_URL: dbUrl,
    },
    `${BASE_URL}/health`,
  )
}, 120_000)

afterAll(async () => {
  service?.kill()
  await pgContainer?.stop()
})

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------

describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await fetch(`${BASE_URL}/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// POST /alerts
// ---------------------------------------------------------------------------

describe("POST /alerts", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "not json",
    })
    expect(res.status).toBe(400)
  })

  it("returns 422 for missing required fields", async () => {
    const res = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ entity_id: "x" }),
    })
    expect(res.status).toBe(422)
    expect((await res.json()).error).toBe("validation failed")
  })

  it("returns 422 for invalid priority", async () => {
    const res = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ ...makeAlertRequest(), priority: "extreme" }),
    })
    expect(res.status).toBe(422)
  })

  it("creates an alert and returns 201 with alert_id", async () => {
    const req = makeAlertRequest()
    const res = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.alert_id).toBe("string")
  })

  it("creates alert with optional watch_id", async () => {
    const res = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        ...makeAlertRequest(),
        watch_id: "550e8400-e29b-41d4-a716-446655440099",
      }),
    })
    expect(res.status).toBe(201)
  })
})

// ---------------------------------------------------------------------------
// GET /alerts/:id
// ---------------------------------------------------------------------------

describe("GET /alerts/:id", () => {
  it("returns 404 for unknown alert", async () => {
    const res = await fetch(`${BASE_URL}/alerts/00000000-0000-0000-0000-000000000000`)
    expect(res.status).toBe(404)
  })

  it("returns alert after creation", async () => {
    const req = makeAlertRequest({ message: "Fetch by ID test" })
    const created = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    const { alert_id } = await created.json()

    const res = await fetch(`${BASE_URL}/alerts/${alert_id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alert_id).toBe(alert_id)
    expect(body.message).toBe("Fetch by ID test")
    expect(body.read).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// GET /alerts
// ---------------------------------------------------------------------------

describe("GET /alerts", () => {
  it("returns 422 when tenant_id is missing", async () => {
    const res = await fetch(`${BASE_URL}/alerts`)
    expect(res.status).toBe(422)
  })

  it("returns alerts for tenant", async () => {
    const tenantId = `tenant-list-${Date.now()}`
    const req      = makeAlertRequest({ tenant_id: tenantId })

    await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })

    const res = await fetch(`${BASE_URL}/alerts?tenant_id=${tenantId}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alerts.length).toBeGreaterThanOrEqual(1)
    expect(body.alerts[0].tenant_id).toBe(tenantId)
  })

  it("filters by entity_id", async () => {
    const tenantId = `tenant-filter-${Date.now()}`
    const entityId = `entity-filter-${Date.now()}`

    // Create two alerts: one for our entity, one for another
    await Promise.all([
      fetch(`${BASE_URL}/alerts`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(makeAlertRequest({ tenant_id: tenantId, entity_id: entityId })),
      }),
      fetch(`${BASE_URL}/alerts`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(makeAlertRequest({ tenant_id: tenantId, entity_id: "other-entity" })),
      }),
    ])

    const res = await fetch(
      `${BASE_URL}/alerts?tenant_id=${tenantId}&entity_id=${entityId}`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.alerts.every((a: { entity_id: string }) => a.entity_id === entityId)).toBe(true)
  })

  it("filters unread alerts", async () => {
    const tenantId = `tenant-unread-${Date.now()}`
    const req      = makeAlertRequest({ tenant_id: tenantId })

    const created = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    const { alert_id } = await created.json()

    // Mark it read
    await fetch(`${BASE_URL}/alerts/${alert_id}/read`, { method: "PATCH" })

    // Unread filter should return 0 (all alerts for this tenant are now read)
    const unreadRes  = await fetch(`${BASE_URL}/alerts?tenant_id=${tenantId}&unread=true`)
    const unreadBody = await unreadRes.json()
    expect(unreadBody.alerts).toHaveLength(0)
  })
})

// ---------------------------------------------------------------------------
// PATCH /alerts/:id/read
// ---------------------------------------------------------------------------

describe("PATCH /alerts/:id/read", () => {
  it("returns 404 for unknown alert", async () => {
    const res = await fetch(`${BASE_URL}/alerts/00000000-0000-0000-0000-000000000000/read`, {
      method: "PATCH",
    })
    expect(res.status).toBe(404)
  })

  it("marks alert as read", async () => {
    const created = await fetch(`${BASE_URL}/alerts`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(makeAlertRequest()),
    })
    const { alert_id } = await created.json()

    const res = await fetch(`${BASE_URL}/alerts/${alert_id}/read`, { method: "PATCH" })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.read).toBe(true)

    // Verify persisted
    const getRes  = await fetch(`${BASE_URL}/alerts/${alert_id}`)
    const getBody = await getRes.json()
    expect(getBody.read).toBe(true)
  })
})
