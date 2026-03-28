import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock DB and Redis before importing matcher
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    update: vi.fn(),
  },
}))

vi.mock("../redis.js", () => ({
  lookupWatches: vi.fn(),
  deindexWatch:  vi.fn().mockResolvedValue(undefined),
}))

const { matchAndTrigger } = await import("../matcher.js")
const { db }              = await import("../db/client.js")
const { lookupWatches }   = await import("../redis.js")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date()
const FUTURE = new Date(NOW.getTime() + 86_400_000)

function makeEvent(eventType = "action.created") {
  return {
    event_id:      "evt-1",
    event_type:    eventType,
    entity_id:     "entity-1",
    tenant_id:     "tenant-1",
    source_system: "test",
    timestamp:     NOW.toISOString(),
    action_id:     "action-1",
    issue_id:      "issue-1",
  } as any
}

function makeWatchRow(overrides: Partial<{
  watchId: string
  status: string
  expiresAt: Date
  triggerConditions: object[]
}> = {}) {
  return {
    watchId:           overrides.watchId ?? "watch-1",
    entityId:          "entity-1",
    tenantId:          "tenant-1",
    status:            overrides.status ?? "waiting",
    riskLevel:         "high",
    scope:             "entity",
    reason:            "test reason",
    graphSnapshot:     {},
    triggerConditions: overrides.triggerConditions ?? [
      { type: "event_match", event_type: "action.created" },
    ],
    expectedSignals:   [],
    history:           [],
    createdAt:         NOW,
    expiresAt:         overrides.expiresAt ?? FUTURE,
    triggeredAt:       null,
    updatedAt:         NOW,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

// ---------------------------------------------------------------------------
// matchAndTrigger
// ---------------------------------------------------------------------------

describe("matchAndTrigger", () => {
  it("returns empty array when no watches in Redis index", async () => {
    vi.mocked(lookupWatches).mockResolvedValue([])

    const results = await matchAndTrigger(makeEvent())
    expect(results).toHaveLength(0)
  })

  it("triggers watch when event_match condition matches", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-1"])

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow()]),
      }),
    } as any)

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent("action.created"))
    expect(results).toHaveLength(1)
    expect(results[0].watchId).toBe("watch-1")
    expect(results[0].triggerType).toBe("event_match")
  })

  it("does not trigger watch when event_type does not match condition", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-1"])

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow({
          triggerConditions: [{ type: "event_match", event_type: "inspection.submitted" }],
        })]),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent("action.created"))
    expect(results).toHaveLength(0)
  })

  it("skips expired watches and marks them expired in DB", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-expired"])

    const pastDate = new Date(NOW.getTime() - 1000)
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow({ expiresAt: pastDate })]),
      }),
    } as any)

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent())
    expect(results).toHaveLength(0)

    // Should have called db.update to mark as expired
    expect(vi.mocked(db.update)).toHaveBeenCalled()
  })

  it("evaluates filter conditions when present", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-filtered"])

    // Condition has a filter that won't match
    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow({
          triggerConditions: [{
            type:       "event_match",
            event_type: "action.created",
            filters:    { site_id: "site-999" }, // event doesn't have this
          }],
        })]),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent("action.created"))
    expect(results).toHaveLength(0)
  })

  it("matches watch when filter conditions are satisfied", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-1"])

    const event = { ...makeEvent("action.created"), site_id: "site-42" }

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow({
          triggerConditions: [{
            type:       "event_match",
            event_type: "action.created",
            filters:    { site_id: "site-42" },
          }],
        })]),
      }),
    } as any)

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    const results = await matchAndTrigger(event)
    expect(results).toHaveLength(1)
    expect(results[0].watchId).toBe("watch-1")
  })

  it("does not trigger absence or pattern conditions", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-1"])

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([makeWatchRow({
          triggerConditions: [
            { type: "absence", event_type: "action.created", deadline: FUTURE.toISOString() },
            { type: "pattern", pattern_name: "rapid_escalation" },
          ],
        })]),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent("action.created"))
    expect(results).toHaveLength(0)
  })

  it("handles multiple watches, triggers only those that match", async () => {
    vi.mocked(lookupWatches).mockResolvedValue(["watch-1", "watch-2"])

    vi.mocked(db.select).mockReturnValue({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue([
          makeWatchRow({ watchId: "watch-1", triggerConditions: [{ type: "event_match", event_type: "action.created" }] }),
          makeWatchRow({ watchId: "watch-2", triggerConditions: [{ type: "event_match", event_type: "inspection.submitted" }] }),
        ]),
      }),
    } as any)

    vi.mocked(db.update).mockReturnValue({
      set: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(undefined),
      }),
    } as any)

    const results = await matchAndTrigger(makeEvent("action.created"))
    expect(results).toHaveLength(1)
    expect(results[0].watchId).toBe("watch-1")
  })
})
