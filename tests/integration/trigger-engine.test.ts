/**
 * Integration tests for trigger-engine service.
 *
 * The POST /triggers/evaluate endpoint is self-contained — it runs all
 * registered triggers against a supplied event + graph_location without
 * calling any external service. No containers needed.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { spawnService, type ServiceHandle } from "../helpers/service.js"

const PORT     = 15005
const BASE_URL = `http://localhost:${PORT}`

let service: ServiceHandle

// Minimal graph location used across tests
function makeGraphLocation(overrides: Record<string, unknown> = {}) {
  return {
    current_node: "inspection_submitted",
    upstream: [],
    downstream_expected: [
      { node: "action_created", sla_hours: 24, expected: true },
    ],
    sla_violations: [],
    ...overrides,
  }
}

// Typed event factories matching BpolloEventSchema discriminated union

function makeActionOverdueEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id:        crypto.randomUUID(),
    event_type:      "action.overdue" as const,
    entity_id:       `entity-${Date.now()}`,
    tenant_id:       "tenant-test",
    source_system:   "test",
    timestamp:       new Date().toISOString(),
    action_id:       crypto.randomUUID(),
    overdue_by_hours: 12,
    ...overrides,
  }
}

function makeInspectionIssueFlaggedEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id:      crypto.randomUUID(),
    event_type:    "inspection.issue_flagged" as const,
    entity_id:     `entity-${Date.now()}`,
    tenant_id:     "tenant-test",
    source_system: "test",
    timestamp:     new Date().toISOString(),
    site_id:       "site-1",
    issue_id:      crypto.randomUUID(),
    issue_type:    "structural",
    severity:      "critical" as const,
    ...overrides,
  }
}

function makeInspectionSubmittedEvent(overrides: Record<string, unknown> = {}) {
  return {
    event_id:      crypto.randomUUID(),
    event_type:    "inspection.submitted" as const,
    entity_id:     `entity-${Date.now()}`,
    tenant_id:     "tenant-test",
    source_system: "test",
    timestamp:     new Date().toISOString(),
    site_id:       "site-1",
    inspector_id:  "inspector-1",
    ...overrides,
  }
}

beforeAll(async () => {
  service = await spawnService(
    "services/trigger-engine/src/index.ts",
    { PORT: String(PORT) },
    `${BASE_URL}/health`,
    30_000,
  )
}, 40_000)

afterAll(() => {
  service?.kill()
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
// POST /triggers/evaluate — validation
// ---------------------------------------------------------------------------

describe("POST /triggers/evaluate — validation", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "bad",
    })
    expect(res.status).toBe(400)
  })

  it("returns 422 for missing fields", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ event: {} }),
    })
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// POST /triggers/evaluate — no triggers fire on a normal event
// ---------------------------------------------------------------------------

describe("POST /triggers/evaluate — no triggers fire", () => {
  it("returns empty results for a clean graph location", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event:          makeInspectionSubmittedEvent(),
        graph_location: makeGraphLocation(),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.results).toBeInstanceOf(Array)
    // Both rule and pattern triggers should be null — no violations, no high-risk node
    const fired = body.results.filter((r: { watch_creation_request: unknown }) => r.watch_creation_request !== null)
    expect(fired.length).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// POST /triggers/evaluate — RuleTrigger fires on action.overdue
// ---------------------------------------------------------------------------

describe("POST /triggers/evaluate — RuleTrigger", () => {
  it("fires on action.overdue event", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event: makeActionOverdueEvent(),
        graph_location: makeGraphLocation({
          current_node: "action_overdue",
          downstream_expected: [
            { node: "investigation_opened", sla_hours: 48, expected: true },
          ],
        }),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const ruleFired = body.results.find(
      (r: { trigger_name: string; watch_creation_request: unknown }) =>
        r.trigger_name === "rule" && r.watch_creation_request !== null
    )
    expect(ruleFired).toBeDefined()
    expect(ruleFired.watch_creation_request.risk_level).toBe("medium")
  })

  it("fires on inspection.issue_flagged with critical severity", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event: makeInspectionIssueFlaggedEvent({ severity: "critical" }),
        graph_location: makeGraphLocation({
          current_node: "inspection_submitted",
          downstream_expected: [
            { node: "action_created", sla_hours: 24, expected: true },
          ],
        }),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const ruleFired = body.results.find(
      (r: { trigger_name: string; watch_creation_request: unknown }) =>
        r.trigger_name === "rule" && r.watch_creation_request !== null
    )
    expect(ruleFired).toBeDefined()
    expect(ruleFired.watch_creation_request.risk_level).toBe("critical")
  })
})

// ---------------------------------------------------------------------------
// POST /triggers/evaluate — PatternTrigger fires on multiple SLA violations
// ---------------------------------------------------------------------------

describe("POST /triggers/evaluate — PatternTrigger", () => {
  it("fires on multiple SLA violations", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event: makeInspectionSubmittedEvent(),
        graph_location: makeGraphLocation({
          sla_violations: [
            { node: "action_created", overdue_hours: 12, violation_description: "overdue" },
            { node: "investigation_opened", overdue_hours: 6, violation_description: "overdue" },
          ],
          downstream_expected: [
            { node: "investigation_opened", sla_hours: 48, expected: true },
          ],
        }),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const patternFired = body.results.find(
      (r: { trigger_name: string; watch_creation_request: unknown }) =>
        r.trigger_name === "pattern" && r.watch_creation_request !== null
    )
    expect(patternFired).toBeDefined()
    expect(patternFired.watch_creation_request.risk_level).toBe("high")
  })

  it("fires when entity is at action_overdue node with one SLA violation", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event: makeActionOverdueEvent(),
        graph_location: makeGraphLocation({
          current_node: "action_overdue",
          sla_violations: [
            { node: "action_created", overdue_hours: 5, violation_description: "overdue" },
          ],
        }),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    const patternFired = body.results.find(
      (r: { trigger_name: string; watch_creation_request: unknown }) =>
        r.trigger_name === "pattern" && r.watch_creation_request !== null
    )
    expect(patternFired).toBeDefined()
  })
})

// ---------------------------------------------------------------------------
// POST /triggers/evaluate — both triggers can fire simultaneously
// ---------------------------------------------------------------------------

describe("POST /triggers/evaluate — multiple triggers", () => {
  it("returns results for all triggers, both may fire", async () => {
    const res = await fetch(`${BASE_URL}/triggers/evaluate`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({
        event: makeActionOverdueEvent(),
        graph_location: makeGraphLocation({
          current_node: "action_overdue",
          sla_violations: [
            { node: "action_created", overdue_hours: 10, violation_description: "overdue" },
            { node: "investigation_opened", overdue_hours: 3, violation_description: "overdue" },
          ],
          downstream_expected: [
            { node: "investigation_opened", sla_hours: 48, expected: true },
          ],
        }),
      }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    // Should have one result per registered trigger
    expect(body.results.length).toBeGreaterThanOrEqual(2)
    const names = body.results.map((r: { trigger_name: string }) => r.trigger_name)
    expect(names).toContain("rule")
    expect(names).toContain("pattern")
  })
})
