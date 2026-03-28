/**
 * Integration tests for watch-manager service.
 *
 * Starts real Postgres and Redis containers via testcontainers.
 * Spawns the actual watch-manager service process.
 * Tests CRUD endpoints and event-driven watch triggering via Kafka.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { Kafka } from "kafkajs"
import {
  startRedis,
  startKafka,
  startPostgres,
  redisUrl,
  kafkaBrokers,
  postgresUrl,
  type StartedTestContainer,
  type StartedKafkaContainer,
  type StartedPostgreSqlContainer,
} from "../helpers/containers.js"
import { spawnService, type ServiceHandle } from "../helpers/service.js"

const PORT     = 15001
const BASE_URL = `http://localhost:${PORT}`
const TOPIC    = "wm.events.watch.test"

let redisContainer: StartedTestContainer
let kafkaContainer: StartedKafkaContainer
let pgContainer:    StartedPostgreSqlContainer
let service:        ServiceHandle
let kafka:          Kafka

const FUTURE_ISO = new Date(Date.now() + 86_400_000).toISOString()

function makeWatchRequest(overrides: Record<string, unknown> = {}) {
  return {
    entity_id:     `entity-${Date.now()}`,
    tenant_id:     "tenant-integration",
    risk_level:    "high",
    scope:         "entity",
    reason:        "Integration test watch",
    graph_snapshot: { current_node: "inspection_submitted" },
    trigger_conditions: [
      { type: "event_match", event_type: "action.created" },
    ],
    expected_signals: [],
    expires_at: FUTURE_ISO,
    ...overrides,
  }
}

beforeAll(async () => {
  ;[redisContainer, kafkaContainer, pgContainer] = await Promise.all([
    startRedis(),
    startKafka(),
    startPostgres(),
  ])

  const brokers = kafkaBrokers(kafkaContainer)
  const dbUrl   = postgresUrl(pgContainer)

  // Pre-create topic
  kafka = new Kafka({ clientId: "wm-test-client", brokers: [brokers] })
  const admin = kafka.admin()
  await admin.connect()
  await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 1 }] })
  await admin.disconnect()

  service = await spawnService(
    "services/watch-manager/src/index.ts",
    {
      PORT:                 String(PORT),
      DATABASE_URL:         dbUrl,
      REDIS_URL:            redisUrl(redisContainer),
      KAFKA_BROKERS:        brokers,
      KAFKA_TOPIC:          TOPIC,
      KAFKA_CONSUMER_GROUP: "wm-integration-test",
    },
    `${BASE_URL}/health`,
  )
}, 120_000)

afterAll(async () => {
  service?.kill()
  await Promise.all([
    redisContainer?.stop(),
    kafkaContainer?.stop(),
    pgContainer?.stop(),
  ])
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
// Watch CRUD
// ---------------------------------------------------------------------------

describe("POST /watches", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "text/plain" },
      body:    "bad",
    })
    expect(res.status).toBe(400)
  })

  it("returns 422 for missing required fields", async () => {
    const res = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ entity_id: "x" }),
    })
    expect(res.status).toBe(422)
  })

  it("creates a watch successfully", async () => {
    const req = makeWatchRequest()
    const res = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(typeof body.watch_id).toBe("string")
    expect(body.status).toBe("waiting")
  })
})

describe("GET /watches/:id", () => {
  it("returns 404 for unknown watch", async () => {
    const res = await fetch(`${BASE_URL}/watches/00000000-0000-0000-0000-000000000000`)
    expect(res.status).toBe(404)
  })

  it("returns the watch after creation", async () => {
    const req = makeWatchRequest({ reason: "Get by ID test" })
    const created = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    const { watch_id } = await created.json()

    const res = await fetch(`${BASE_URL}/watches/${watch_id}`)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.watch_id).toBe(watch_id)
    expect(body.reason).toBe("Get by ID test")
    expect(body.status).toBe("waiting")
  })
})

describe("GET /watches", () => {
  it("returns 422 without required query params", async () => {
    const res = await fetch(`${BASE_URL}/watches`)
    expect(res.status).toBe(422)
  })

  it("returns watches for entity", async () => {
    const entityId = `entity-list-${Date.now()}`
    const req = makeWatchRequest({ entity_id: entityId })

    await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })

    const res = await fetch(
      `${BASE_URL}/watches?entity_id=${entityId}&tenant_id=tenant-integration`,
    )
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.watches.length).toBeGreaterThanOrEqual(1)
    expect(body.watches[0].entity_id).toBe(entityId)
  })
})

describe("PATCH /watches/:id", () => {
  it("returns 404 for unknown watch", async () => {
    const res = await fetch(`${BASE_URL}/watches/00000000-0000-0000-0000-000000000000`, {
      method:  "PATCH",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ status: "resolved" }),
    })
    expect(res.status).toBe(404)
  })

  it("updates watch status", async () => {
    const req = makeWatchRequest({ reason: "PATCH test" })
    const created = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    const { watch_id } = await created.json()

    const res = await fetch(`${BASE_URL}/watches/${watch_id}`, {
      method:  "PATCH",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify({ status: "resolved" }),
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.status).toBe("resolved")

    // Verify persisted
    const getRes  = await fetch(`${BASE_URL}/watches/${watch_id}`)
    const getBody = await getRes.json()
    expect(getBody.status).toBe("resolved")
  })
})

// ---------------------------------------------------------------------------
// Helper: wait for watch-manager consumer group to reach "Stable" state
// ---------------------------------------------------------------------------
async function waitForConsumerGroupStable(groupId: string, timeoutMs = 30_000): Promise<void> {
  const admin   = kafka.admin()
  await admin.connect()
  const deadline = Date.now() + timeoutMs
  try {
    while (Date.now() < deadline) {
      const { groups } = await admin.describeGroups([groupId])
      const group = groups[0]
      if (group?.state === "Stable") return
      await new Promise((r) => setTimeout(r, 500))
    }
    throw new Error(`Consumer group ${groupId} did not reach Stable state within ${timeoutMs}ms`)
  } finally {
    await admin.disconnect()
  }
}

// ---------------------------------------------------------------------------
// Event-driven triggering via Kafka
// ---------------------------------------------------------------------------

describe("Kafka event matching", () => {
  it("triggers a watch when matching event arrives on Kafka topic", async () => {
    const entityId = `entity-kafka-${Date.now()}`

    // Wait for the watch-manager's consumer group to be fully stable
    // before producing — avoids GROUP_JOIN race where fromBeginning:false
    // consumer misses a message produced before partition assignment.
    await waitForConsumerGroupStable("wm-integration-test")

    // Create watch with event_match condition
    const req = makeWatchRequest({
      entity_id: entityId,
      trigger_conditions: [{ type: "event_match", event_type: "action.created" }],
    })
    const created = await fetch(`${BASE_URL}/watches`, {
      method:  "POST",
      headers: { "content-type": "application/json" },
      body:    JSON.stringify(req),
    })
    const { watch_id } = await created.json()

    // Produce an event that matches the condition (all IDs must be valid UUIDs)
    const { randomUUID } = await import("crypto")
    const producer = kafka.producer()
    await producer.connect()
    await producer.send({
      topic: TOPIC,
      messages: [{
        key:   entityId,
        value: JSON.stringify({
          event_id:      randomUUID(),
          event_type:    "action.created",
          entity_id:     entityId,
          tenant_id:     "tenant-integration",
          source_system: "test",
          timestamp:     new Date().toISOString(),
          action_id:     randomUUID(),
          issue_id:      randomUUID(),
        }),
      }],
    })
    await producer.disconnect()

    // Poll until watch becomes triggered (Kafka propagation is async)
    const deadline = Date.now() + 20_000
    let watchStatus = "waiting"
    while (Date.now() < deadline) {
      const res  = await fetch(`${BASE_URL}/watches/${watch_id}`)
      const body = await res.json()
      watchStatus = body.status
      if (watchStatus === "triggered") break
      await new Promise((r) => setTimeout(r, 400))
    }

    expect(watchStatus).toBe("triggered")
  })
})
