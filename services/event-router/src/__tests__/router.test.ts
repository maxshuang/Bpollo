import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock the kafka module (singleton producer/consumer with side effects)
vi.mock("../kafka.js", () => ({
  producer: { send: vi.fn().mockResolvedValue(undefined) },
  consumer: {
    connect:     vi.fn().mockResolvedValue(undefined),
    subscribe:   vi.fn().mockResolvedValue(undefined),
    run:         vi.fn(),
    disconnect:  vi.fn().mockResolvedValue(undefined),
  },
}))

const { producer, consumer } = await import("../kafka.js")
const { startRouter }        = await import("../router.js")
const { config }             = await import("../config.js")

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const VALID_EVENT = {
  event_id:      "550e8400-e29b-41d4-a716-446655440000",
  event_type:    "inspection.submitted",
  entity_id:     "entity-1",
  tenant_id:     "tenant-1",
  source_system: "test",
  timestamp:     "2024-01-15T10:00:00.000Z",
  site_id:       "site-1",
  inspector_id:  "user-1",
}

// Extract the eachMessage handler that startRouter registers with consumer.run
async function getMessageHandler() {
  await startRouter()
  const runCall = vi.mocked(consumer.run).mock.calls[0][0] as { eachMessage: Function }
  return runCall.eachMessage
}

function makeMessage(value: unknown) {
  return {
    topic:     config.inboundTopic,
    partition: 0,
    message:   {
      value:  value !== null ? Buffer.from(JSON.stringify(value)) : null,
      key:    null,
      headers: {},
      offset: "0",
      timestamp: Date.now().toString(),
    },
  }
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// startRouter subscribes correctly
// ---------------------------------------------------------------------------
describe("startRouter", () => {
  it("subscribes to the inbound topic", async () => {
    await startRouter()
    expect(vi.mocked(consumer.subscribe)).toHaveBeenCalledWith({
      topic:         config.inboundTopic,
      fromBeginning: false,
    })
  })

  it("calls consumer.run", async () => {
    await startRouter()
    expect(vi.mocked(consumer.run)).toHaveBeenCalledOnce()
  })
})

// ---------------------------------------------------------------------------
// Fan-out behaviour
// ---------------------------------------------------------------------------
describe("eachMessage — fan-out", () => {
  it("publishes to all 3 downstream topics for a valid event", async () => {
    const handler = await getMessageHandler()
    await handler(makeMessage(VALID_EVENT))

    const calls = vi.mocked(producer.send).mock.calls
    const topics = calls.map((c) => c[0].topic)
    expect(topics).toContain(config.graphTopic)
    expect(topics).toContain(config.patternTopic)
    expect(topics).toContain(config.watchTopic)
    expect(calls).toHaveLength(3)
  })

  it("uses entity_id as the partition key on all topics", async () => {
    const handler = await getMessageHandler()
    await handler(makeMessage(VALID_EVENT))

    for (const call of vi.mocked(producer.send).mock.calls) {
      expect(call[0].messages[0].key).toBe(VALID_EVENT.entity_id)
    }
  })

  it("preserves the raw JSON payload on downstream topics", async () => {
    const handler = await getMessageHandler()
    await handler(makeMessage(VALID_EVENT))

    for (const call of vi.mocked(producer.send).mock.calls) {
      const forwarded = JSON.parse(call[0].messages[0].value as string)
      expect(forwarded.event_id).toBe(VALID_EVENT.event_id)
    }
  })
})

// ---------------------------------------------------------------------------
// Error / skip behaviour
// ---------------------------------------------------------------------------
describe("eachMessage — skip conditions", () => {
  it("skips null message value without throwing", async () => {
    const handler = await getMessageHandler()
    await expect(handler({ ...makeMessage(null), message: { value: null } })).resolves.not.toThrow()
    expect(vi.mocked(producer.send)).not.toHaveBeenCalled()
  })

  it("skips non-JSON message without throwing", async () => {
    const handler = await getMessageHandler()
    const msg = {
      topic:     config.inboundTopic,
      partition: 0,
      message:   { value: Buffer.from("not-json"), key: null, headers: {}, offset: "0", timestamp: "0" },
    }
    await expect(handler(msg)).resolves.not.toThrow()
    expect(vi.mocked(producer.send)).not.toHaveBeenCalled()
  })

  it("skips unknown event_type without throwing", async () => {
    const handler = await getMessageHandler()
    const badEvent = { ...VALID_EVENT, event_type: "not.a.real.type" }
    await expect(handler(makeMessage(badEvent))).resolves.not.toThrow()
    expect(vi.mocked(producer.send)).not.toHaveBeenCalled()
  })

  it("skips event with missing required fields without throwing", async () => {
    const handler = await getMessageHandler()
    const incomplete = { event_type: "inspection.submitted" } // missing almost everything
    await expect(handler(makeMessage(incomplete))).resolves.not.toThrow()
    expect(vi.mocked(producer.send)).not.toHaveBeenCalled()
  })
})
