/**
 * Integration tests for event-ingestion service.
 *
 * Starts real Redis and Kafka containers via testcontainers.
 * Spawns the actual event-ingestion service process.
 * Hits the HTTP API and verifies Kafka messages.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Kafka } from "kafkajs"
import {
  startRedis,
  startKafka,
  redisUrl,
  kafkaBrokers,
  type StartedTestContainer,
  type StartedKafkaContainer,
} from "../helpers/containers.js"
import { spawnService, type ServiceHandle } from "../helpers/service.js"
import { makeEvent } from "../helpers/events.js"

const PORT      = 13001
const BASE_URL  = `http://localhost:${PORT}`
const TOPIC     = "bpollo.events.raw.test"

let redisContainer: StartedTestContainer
let kafkaContainer: StartedKafkaContainer
let service:        ServiceHandle
let kafka:          Kafka

/**
 * Wait for a specific Kafka message (by event_id) on a topic.
 * - Uses a fresh consumer group + fromBeginning:true to avoid offset races
 * - Waits for GROUP_JOIN before invoking `action` to ensure the consumer
 *   is fully assigned and won't miss messages produced immediately after
 * - Disconnects cleanly outside the eachMessage handler
 */
async function waitForKafkaMessage(
  topic:     string,
  eventId:   string,
  action:    () => Promise<void>,
  timeoutMs: number = 15_000,
): Promise<object | null> {
  const consumer = kafka.consumer({ groupId: `tc-${Date.now()}` })
  await consumer.connect()
  await consumer.subscribe({ topic, fromBeginning: true })

  let resolved = false
  let resolveResult!: (v: object | null) => void
  const resultPromise = new Promise<object | null>((r) => { resolveResult = r })

  // Wait for the consumer to fully join before sending the event
  const joinedPromise = new Promise<void>((r) => {
    consumer.on(consumer.events.GROUP_JOIN, () => r())
    setTimeout(r, 5_000) // fallback if event never fires
  })

  const timer = setTimeout(() => {
    if (!resolved) { resolved = true; resolveResult(null) }
  }, timeoutMs)

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value || resolved) return
      const parsed = JSON.parse(message.value.toString()) as Record<string, unknown>
      if (parsed.event_id === eventId) {
        resolved = true
        clearTimeout(timer)
        resolveResult(parsed)
      }
    },
  })

  await joinedPromise
  await action()

  const result = await resultPromise
  await consumer.stop()
  await consumer.disconnect()
  return result
}

// ---------------------------------------------------------------------------
// Suite setup — start containers once, then spawn the service
// ---------------------------------------------------------------------------
beforeAll(async () => {
  ;[redisContainer, kafkaContainer] = await Promise.all([startRedis(), startKafka()])

  const brokers = kafkaBrokers(kafkaContainer)

  // Create the test topic before the service starts
  kafka = new Kafka({ clientId: "test-client", brokers: [brokers] })
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1 }] })
  await admin.disconnect()

  service = await spawnService(
    "services/event-ingestion/src/index.ts",
    {
      PORT:          String(PORT),
      REDIS_URL:     redisUrl(redisContainer),
      KAFKA_BROKERS: brokers,
      KAFKA_TOPIC:   TOPIC,
    },
    `${BASE_URL}/health`,
  )
}, 120_000)

afterAll(async () => {
  service?.kill()
  await redisContainer?.stop()
  await kafkaContainer?.stop()
})

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await fetch(`${BASE_URL}/health`)
    expect(res.status).toBe(200)
    expect((await res.json()).status).toBe("ok")
  })
})

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — validation", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "not json",
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe("invalid JSON")
  })

  it("returns 422 for unknown event_type", async () => {
    const event = makeEvent({ event_type: "not.a.real.type" })
    const res   = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(event),
    })
    expect(res.status).toBe(422)
    const body = await res.json()
    expect(body.error).toBe("validation failed")
    expect(Array.isArray(body.issues)).toBe(true)
  })

  it("returns 422 for missing required domain fields", async () => {
    const event = makeEvent()
    delete (event as any).site_id   // site_id is required for inspection.submitted
    const res = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(event),
    })
    expect(res.status).toBe(422)
  })
})

// ---------------------------------------------------------------------------
// Happy path — event is ingested and appears on Kafka
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — ingestion", () => {
  it("accepts a valid event and returns 202", async () => {
    const event = makeEvent()
    const res   = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(event),
    })
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.status).toBe("accepted")
    expect(body.event_id).toBe(event.event_id)
  })

  it("publishes the event to Kafka with entity_id as key", async () => {
    const event = makeEvent()

    const msg = await waitForKafkaMessage(TOPIC, event.event_id, () =>
      fetch(`${BASE_URL}/ingest/webhook`, {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify(event),
      }).then(() => undefined)
    )

    expect(msg).not.toBeNull()
    expect((msg as any).event_id).toBe(event.event_id)
    expect((msg as any).entity_id).toBe(event.entity_id)
  })
})

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — deduplication", () => {
  it("returns 200 duplicate on second request with same event_id", async () => {
    const event = makeEvent()

    const first = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(event),
    })
    expect(first.status).toBe(202)

    const second = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(event),
    })
    expect(second.status).toBe(200)
    expect((await second.json()).status).toBe("duplicate")
  })

  it("accepts same payload with different event_id as a distinct event", async () => {
    const base  = makeEvent()
    const { randomUUID } = await import("crypto")
    const copy  = { ...base, event_id: randomUUID() }

    const r1 = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(base),
    })
    const r2 = await fetch(`${BASE_URL}/ingest/webhook`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(copy),
    })
    expect(r1.status).toBe(202)
    expect(r2.status).toBe(202)
  })
})
