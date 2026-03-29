<p align="center">
  <img src="assets/icon.png" width="120" alt="Bpollo">
</p>

<h1 align="center">Bpollo</h1>

<p align="center">
  <a href="https://github.com/maxshuang/Bpollo/actions/workflows/ci.yml">
    <img src="https://github.com/maxshuang/Bpollo/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
</p>

<p align="center">
  <strong>AI-Native Operational Intelligence System</strong>
</p>

<p align="center">
  An event-driven framework where an LLM reasoning agent orchestrates business monitoring,<br>
  watch creation, and proactive alerting over structured business flow graphs.
</p>

---

## What is Bpollo?

Bpollo models any business process as a **flow graph** — a sequence of states and expected transitions:

```
inspection → issue / action → investigation → market → insurance
```

When real-world events deviate from expected flow, an AI agent reasons over the deviation — weighing business position, historical patterns, and active monitors — to decide whether the situation warrants ongoing attention. If it does, the agent creates a **dynamic watch**: a time-bounded commitment that tracks whether expected follow-up signals arrive. If they don't, Bpollo acts proactively.

The result is a system that understands *why* something matters, not just *that* something happened.

Bpollo is domain-agnostic: any business process expressible as a flow graph can be monitored this way.

---

## Why Not Rules Alone?

Rule engines and anomaly detectors can tell you *what* happened. They can't tell you *what it means* given the current business context.

Consider an inspection that flags a safety issue with no corrective action after 48 hours. A rule engine sees a timeout violation. Bpollo's agent sees something different:

- This entity has had 3 similar issues in the past 90 days
- Two of those escalated to investigations
- There is already an active watch on a related issue at the same site
- The graph position indicates the downstream risk is insurance exposure, not just a compliance flag

A hard-coded rule produces an alert either way. The agent produces a *reasoned judgment* — calibrated to context, history, and risk — and decides whether to escalate, extend the watch, spawn a child watch, or stand down.

The tradeoff is real: LLM orchestration adds latency and is non-deterministic. Bpollo addresses this by using rules and pattern detection as pre-filters — the agent is only invoked when something is worth reasoning about.

---

## End-to-End Example

**Scenario:** An inspection is submitted with a high-risk flagged issue. Normally, a corrective action follows within 24 hours.

1. **Event arrives** — `inspection.issue_flagged` hits the Event Ingestion service and is published to Kafka
2. **Graph Service** maps the event to its position: `inspection → issue` node, downstream expected: `action`
3. **Trigger Engine** evaluates rules — `action_overdue` rule fires at the 24-hour mark with no matching action event
4. **Watch Manager** publishes a `WatchTrigger` to Kafka
5. **LLM Orchestrator** wakes up and assembles context:
   - Graph position: issue at a high-risk node, SLA window closing
   - Pattern signals: this issue type has a 90% historical action rate; this site has had 2 prior escalations
   - Active watches: one existing watch on a related issue at the same site
6. **Agent reasons** — decides the combined risk warrants escalation; calls `escalateWatch` to raise risk level and `dispatchAlert` to notify the user
7. **Alert Service** stores the alert; delivery plugins push it to Slack and the console chat UI
8. **User receives** a proactive message: *"High-risk issue at Site 9 has no corrective action after 48 hours. Historical patterns link this type to investigation escalation. Recommend creating an action immediately."*

No human had to check a dashboard. The system came to them.

---

## Architecture

Five components, each with a distinct role in the system:

| Component | Role |
|---|---|
| **Graph Service** | State understanding — maps events to positions in the business flow graph, surfaces SLA violations and downstream expectations |
| **Trigger Engine** | Signal generation — evaluates rule-based and pattern-based conditions; fires when something is worth reasoning about |
| **LLM Orchestrator** | Contextual reasoning — assembles graph position, patterns, and watch history; agent decides and acts |
| **Watch Manager** | Temporal commitment tracking — holds open questions about the future ("did action X arrive within deadline Y?"); triggers on absence as well as presence |
| **Alert Service** | User-facing intervention — stores alerts and delivers them proactively via registered channels |

See [System Design](docs/design.md) for the full layer architecture and component diagram.

---

## What's Built (v0.1)

| Service | Status | Description |
|---|---|---|
| `event-ingestion` | ✅ | Webhook receiver — validates, deduplicates, publishes to Kafka |
| `event-router` | ✅ | Fans out raw events to graph / pattern / watch topics |
| `graph-service` | ✅ | Entity positions in the business graph, SLA violations, LLM context rendering |
| `watch-manager` | ✅ | Watch lifecycle — create, match, trigger; Redis event index; scheduler for absence detection |
| `alert-service` | ✅ | Alert storage and read/unread lifecycle |
| `trigger-engine` | ✅ | RuleTrigger + PatternTrigger → creates watches via Watch Manager |
| `llm-orchestrator` | ✅ | Mastra-based agent (claude-opus-4-6) — assembles context, reasons, decides, audits every cycle |
| `console` | ✅ | Internal dashboard — business graph, watch inspector, AI reasoning trail |

**174 tests** — unit, integration (real Docker containers), and E2E across the full event pipeline.

> `llm-orchestrator` requires an `ANTHROPIC_API_KEY` environment variable.

---

## How It Works

1. A business event arrives and is mapped to its position in the flow graph
2. Rule and pattern engines evaluate whether the event warrants attention
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

# LLM Orchestrator (port 3006)
PORT=3006 \
DATABASE_URL=postgres://bpollo:bpollo@localhost:5433/bpollo \
KAFKA_BROKERS=localhost:9092 \
KAFKA_TRIGGERED_TOPIC=bpollo.watches.triggered \
GRAPH_SERVICE_URL=http://localhost:3002 \
WATCH_MANAGER_URL=http://localhost:3004 \
ALERT_SERVICE_URL=http://localhost:3005 \
ANTHROPIC_API_KEY=your-key-here \
pnpm --filter @bpollo/llm-orchestrator dev
```

### 4. Start the console

```bash
LLM_ORCHESTRATOR_URL=http://localhost:3006 \
pnpm --filter @bpollo/console dev
```

Open **http://localhost:3100** — the console shows the business graph, active watches, and the AI reasoning trail for each triggered watch.

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
│   ├── watch-manager/       Watch lifecycle — create, match, trigger, schedule
│   ├── alert-service/       Alert storage and read/unread lifecycle
│   ├── trigger-engine/      Pattern matching + rule evaluation → watch creation
│   └── llm-orchestrator/    Mastra agent — reason over triggered watches, decide
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
- [Usability Analysis](docs/usability.md)
