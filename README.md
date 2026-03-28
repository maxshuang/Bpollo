<p align="center">
  <img src="assets/icon.png" width="120" alt="Bpollo">
</p>

<h1 align="center">Bpollo</h1>

<p align="center">
  <strong>AI-Native Business Copilot</strong>
</p>

<p align="center">
  An event-driven business copilot — where an LLM reasoning agent is the orchestrator, not a plugin.
</p>

<p align="center">
  <strong>⚠️ Active development — v0.1 in progress. Core pipeline is functional; LLM orchestration and trigger engine are not yet built.</strong>
</p>

---

## What is Bpollo?

Bpollo (inspired by Apollo) is a proactive business intelligence framework where **AI reasoning sits at the center of the system**, not at the edge. Instead of using an LLM to summarize outputs after the fact, Bpollo's agent actively orchestrates the entire decision pipeline: it reads the business flow, weighs historical evidence, decides what needs watching, and tells the rest of the system what to do.

The result is a system that understands *why* something matters — not just *that* something happened.

It models any business process as a flow graph — a sequence of states and expected transitions. For example:

```
inspection → issue / action → investigation → market → insurance
```

When an event deviates from the expected flow, the AI agent reasons over the deviation, retrieves historical patterns, and decides whether to create a **dynamic watch** — a time-bounded monitor tracking whether expected follow-up events arrive. If they don't, Bpollo acts proactively.

Bpollo is domain-agnostic: any business process expressible as a flow graph can be monitored this way.

---

## What's Built (v0.1)

| Service | Status | Description |
|---|---|---|
| `event-ingestion` | ✅ done | Webhook receiver — validates, deduplicates, publishes to Kafka |
| `event-router` | ✅ done | Fans out raw events to graph / pattern / watch topics |
| `graph-service` | ✅ done | Tracks entity positions in the business graph, SLA violations, LLM context |
| `watch-manager` | ✅ done | CRUD for watches, Redis event index, Kafka-driven triggering |
| `alert-service` | ✅ done | Alert storage and read/unread lifecycle |
| `console` | ✅ done | Internal dashboard — business graph, personal graphs, watch inspector |
| `trigger-engine` | 🔧 planned | Pattern matching on event sequences |
| `llm-orchestrator` | 🔧 planned | Mastra-based agent — assembles context, reasons, decides |

**174 tests** — unit, integration (real Docker containers), and E2E across the full event pipeline.

---

## AI as the Orchestrator

Most systems treat AI as a post-processing step — events are analyzed by rules, then an LLM adds a summary. Bpollo inverts this.

The **LLM reasoning agent is the orchestrator**. Every non-trivial decision flows through it:

- Should this event be monitored? The agent decides.
- What follow-up signals matter? The agent defines them.
- Has the situation escalated? The agent reassesses.
- What should the user do next? The agent recommends.

The agent reasons over structured inputs assembled by the system:

| Input | Source |
|---|---|
| Current event and its position in the business flow graph | Graph Service |
| Detected anomalies and pattern signals | Trigger Engine |
| Existing active watches for this entity | Watch Manager |

---

## How It Works

1. A business event arrives and is mapped to its position in the flow graph
2. The pattern engine detects anomalies and signals
3. **The AI agent reasons over all inputs** — business position, patterns, active watches
4. The agent decides: monitor this case, or surface a direct recommendation
5. If monitoring: a **watch object** is created with expected signals, deadlines, and risk level
6. Incoming events are matched against active watches in real time
7. If expected signals are missing or risk escalates, the agent reassesses and alerts proactively

---

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org) 20+
- [pnpm](https://pnpm.io) 9+
- [Docker](https://www.docker.com) (for local infrastructure and integration tests)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Start local infrastructure

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **Redis** on `localhost:6379`
- **Kafka** on `localhost:9092`
- **Postgres** on `localhost:5433` (db: `bpollo`, user: `bpollo`, pass: `bpollo`)

> Port 5433 is used to avoid conflicts with any existing Postgres on 5432.

### 3. Start services

Each service can be started independently. Open a terminal per service:

```bash
# Graph Service (port 3002)
PORT=3002 \
DATABASE_URL=postgres://bpollo:bpollo@localhost:5433/bpollo \
KAFKA_BROKERS=localhost:9092 \
KAFKA_TOPIC=bpollo.events.graph \
pnpm --filter @bpollo/graph-service dev

# Watch Manager (port 3004)
PORT=3004 \
DATABASE_URL=postgres://bpollo:bpollo@localhost:5433/bpollo \
REDIS_URL=redis://localhost:6379 \
KAFKA_BROKERS=localhost:9092 \
KAFKA_TOPIC=bpollo.events.watch \
pnpm --filter @bpollo/watch-manager dev

# Alert Service (port 3005)
PORT=3005 \
DATABASE_URL=postgres://bpollo:bpollo@localhost:5433/bpollo \
pnpm --filter @bpollo/alert-service dev

# Event Ingestion (port 3001)
PORT=3001 \
REDIS_URL=redis://localhost:6379 \
KAFKA_BROKERS=localhost:9092 \
KAFKA_TOPIC=bpollo.events.raw \
pnpm --filter @bpollo/event-ingestion dev

# Event Router (port 3003)
HEALTH_PORT=3003 \
KAFKA_BROKERS=localhost:9092 \
KAFKA_INBOUND_TOPIC=bpollo.events.raw \
KAFKA_GRAPH_TOPIC=bpollo.events.graph \
KAFKA_PATTERN_TOPIC=bpollo.events.pattern \
KAFKA_WATCH_TOPIC=bpollo.events.watch \
pnpm --filter @bpollo/event-router dev
```

### 4. Start the console

```bash
pnpm --filter @bpollo/console dev
```

Open **http://localhost:3100** — the console shows the business graph, personal graphs, and active watches.

---

## Running Tests

```bash
# All unit tests (no Docker required)
pnpm test

# Integration tests (requires Docker)
pnpm test:integration

# End-to-end tests (requires Docker)
pnpm test:e2e
```

Integration and E2E tests spin up real Redis, Kafka, and Postgres containers via [testcontainers](https://testcontainers.com) and spawn actual service processes.

---

## Project Structure

```
bpollo/
├── services/
│   ├── event-ingestion/     Webhook ingest — validate, deduplicate, publish
│   ├── event-router/        Fan-out raw events to downstream Kafka topics
│   ├── graph-service/       Business graph — entity state, SLA, LLM context
│   ├── watch-manager/       Watch lifecycle — create, match, trigger
│   ├── alert-service/       Alert storage and read/unread lifecycle
│   ├── trigger-engine/      (planned) Pattern matching on event sequences
│   └── llm-orchestrator/    (planned) Mastra agent — reason and decide
├── packages/
│   └── schemas/             Shared Zod schemas across all services
├── apps/
│   └── console/             Next.js internal dashboard (port 3100)
├── tests/
│   ├── helpers/             Shared test utilities (containers, service spawn)
│   ├── integration/         Per-service integration tests
│   └── e2e/                 Full pipeline end-to-end tests
└── docker-compose.dev.yml   Local infrastructure (Redis, Kafka, Postgres)
```

---

## Docs

- [System Design](docs/design.md)
- [Component Breakdown](docs/components.md)
- [Repo Structure](docs/repo-structure.md)
