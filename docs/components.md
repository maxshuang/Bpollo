# Component Breakdown

> Tech stack: TypeScript across all services, [Mastra](https://mastra.ai) as the agent framework.

---

## Architecture Diagram

```mermaid
flowchart TD
    subgraph Sources[Business Event Sources]
        S1[Inspection]
        S2[Issue / Action]
        S3[Investigation]
        S4[Market / Insurance]
    end

    subgraph Ingestion[Event Ingestion]
        EI[Event Ingestion Service]
        ER[Event Router]
    end

    subgraph Runtime[Core Runtime]
        GS[Graph Service]
        PE[Pattern Engine]
        WM[Watch Manager]
        RP[Rule / Policy Engine]
    end

    subgraph AI[AI Orchestrator - Mastra Agent]
        PB[Prompt Builder]
        AG[LLM Reasoning Agent]
    end

    subgraph Stores[Data Stores]
        PG[(Postgres)]
        OS[(OpenSearch)]
        RD[(Redis)]
    end

    subgraph Output[Action Layer]
        AL[Alert Service]
        API[REST API]
        WEB[Web UI]
    end

    S1 --> EI
    S2 --> EI
    S3 --> EI
    S4 --> EI

    EI --> ER
    ER --> GS
    ER --> PE
    ER --> WM
    ER --> PG
    ER --> OS

    GS -->|node mapping| PB
    PE -->|pattern summary| PB
    WM -->|active watches| PB
    OS -->|historical evidence| PB
    RP -->|policy hints| PB

    PB --> AG
    AG -->|create / update watch| WM
    AG -->|dispatch alert| AL
    AG -->|recommendation| API

    WM -->|expiry / match trigger| AG
    WM --> PG
    WM --> RD

    AL --> WEB
    API --> WEB
```

---

## Infrastructure

| Component | Tech | MVP |
|---|---|---|
| Message Broker | Kafka (Redis Streams for local dev) | Yes |
| Container Orchestration | Docker Compose (dev), Kubernetes (prod) | Compose only |
| API Gateway | Nginx (MVP), Kong (prod) | Nginx |

---

## Backend Services

| Component | Responsibility | Tech | MVP |
|---|---|---|---|
| Event Ingestion Service | Receives webhooks from upstream systems, validates, normalizes, deduplicates, publishes to event bus | TypeScript / Hono, Zod schemas, Redis (dedup) | Yes |
| Event Router | Consumes normalized events, fans out to typed topics / downstream consumers | TypeScript Kafka consumer | Yes |
| Business Flow Graph Service | Loads the business flow DAG from config, maps each event to its node position and expected transitions | TypeScript / Hono, graph-lib, YAML graph config | Yes |
| Pattern / Insight Engine | Detects missing actions, recurrence, anomalies by querying event history | TypeScript / Hono, OpenSearch client | Yes (2–3 checks) |
| Watch Graph Generator | Builds `WatchObject` from LLM + policy output; co-located with Watch Manager | TypeScript module | Yes |
| Active Watch Manager | Persists watches, runs time-based expiry checks, matches future events against active watches, triggers re-reasoning on match | TypeScript / Hono, node-cron, Postgres, Redis | Yes |
| Rule / Policy Engine | Deterministic rules evaluated before LLM to short-circuit clear-cut cases and reduce noise | TypeScript module, YAML-defined rules | Yes |
| LLM Orchestrator | Coordinates the reasoning pipeline: assembles context → calls LLM via Mastra → parses structured output → dispatches watch/alert | **Mastra agent** | Yes |
| Alert / Notification Service | Receives structured alerts, routes to Slack and in-app notifications | TypeScript / Hono, Slack SDK | Yes (Slack + in-app) |
| Workflow Trigger Service | Creates tasks in external systems (Jira, Linear) from LLM recommendations | TypeScript / Hono, outbound webhooks | Deferred |

---

## Data Stores

| Store | Responsibility | Tech | MVP |
|---|---|---|---|
| Operational DB | Mutable state: events, watches, alerts, recommendations | Postgres 15, Drizzle ORM | Yes |
| Event History | Historical event search, time-range aggregations, pattern queries | OpenSearch 2.x (or Postgres stub) | Yes / stub first |
| Graph Store | Entity relationship graph (site ↔ issue ↔ incident) for multi-hop queries | Neo4j | Deferred (Postgres FK + CTEs at MVP) |
| Cache | Idempotency keys, session tokens, LLM response cache, pub/sub | Redis 7 | Yes |

---

## AI / LLM Layer (Mastra)

| Component | Responsibility | Tech | MVP |
|---|---|---|---|
| Reasoning Agent | The core Mastra agent: traverses business flow, assesses risk, decides watch vs. direct recommendation, explains why | Mastra agent + Claude (claude-sonnet-4-6) | Yes |
| Prompt Builder / Context Assembler | Assembles structured context (event, node mapping, pattern summary, active watches, history) into the agent's input | Mastra tool inputs + prompt templates | Yes |
| RAG Pipeline | Fetches relevant historical events from OpenSearch before each reasoning call | Mastra tool calling OpenSearch client | Yes (structured queries; vector/semantic deferred) |
| Watch Tool | Mastra tool that creates or updates a `WatchObject` in the Watch Manager | Mastra tool → Watch Manager API | Yes |
| Alert Tool | Mastra tool that dispatches a recommendation or alert | Mastra tool → Alert Service API | Yes |
| LLM Eval Harness | Regression tests for prompt/model changes against golden-labeled fixtures | Vitest, JSON fixtures | Deferred |

---

## Frontend / API

| Component | Responsibility | Tech | MVP |
|---|---|---|---|
| External REST API | Aggregates data from Postgres + OpenSearch; exposes endpoints for timeline, watches, alerts, copilot | TypeScript / Hono, Drizzle | Yes |
| Timeline + Watch Dashboard | Entity event timeline annotated with watches and alerts; watch list sortable by risk/expiry | React 18, TypeScript, TanStack Query, Tailwind | Yes |
| Copilot Panel | Conversational interface for ad-hoc questions ("Why is site_9 flagged?") | React chat UI → Mastra agent stream | Deferred |

---

## Cross-Cutting

| Component | Tech | MVP |
|---|---|---|
| Auth | Auth0 (managed JWT, tenant isolation) | Yes |
| Structured Logging | `pino` → Datadog / Grafana Loki | Yes |
| Metrics + Tracing | OpenTelemetry SDK hooks | Hooks only at MVP |
| CI/CD | GitHub Actions, Vitest, ESLint, Prettier | Yes |

---

## Implementation Sequence

| Phase | Scope |
|---|---|
| 1 | Kafka + Postgres + Event Ingestion Service + canonical `Event` schema |
| 2 | Business Flow Graph Service + Pattern Engine (2 checks) + Watch Manager (storage only) |
| 3 | Mastra Reasoning Agent + Prompt Builder + full sync reasoning path (event in → LLM → watch created) |
| 4 | Watch lifecycle scheduler + Alert Service (Slack) + proactive alert path |
| 5 | REST API + Timeline UI + Watch Dashboard |
| 6 | OTel tracing + LLM eval harness + OpenSearch (if on Postgres stub) + Kong |

---

## Event Processing Paths

When an event enters the system, it falls into one of four paths. The triage happens in priority order — an event can match multiple paths simultaneously, in which case all signals are combined into the LLM context.

```
Incoming Event
      │
      ▼
Does it match an active watch?
  ├─ Yes → Path 4: Watch Match       (LLM re-reasons with watch context)
  └─ No  ↓
Does a deterministic rule fire?
  ├─ Yes → Path 3: Policy Violation  (LLM invoked for explanation only)
  └─ No  ↓
Does the Pattern Engine flag it?
  ├─ Yes → Path 2: Flagged           (LLM invoked to decide watch vs. direct recommendation)
  └─ No  ↓
         Path 1: Normal              (no LLM invoked — store and move on)
```

### Path 1 — Normal Operation
Event is in the expected position in the business flow. No rules fire, no anomaly detected, no watch match. The event is persisted and acknowledged. **LLM is not invoked.** This should be the majority of traffic.

### Path 2 — Flagged / Worth Investigating
Something is off but not a clear violation — a missing downstream action, a weak anomaly signal, an unusual gap. The LLM is invoked to weigh historical evidence and decide: create a watch, issue a direct recommendation, or stand down.

### Path 3 — Pattern Violation
A deterministic rule fires (e.g. critical issue + no action within 1h). The watch is created by the policy engine directly — **the LLM does not decide whether to act**. The LLM is still invoked to generate the risk explanation and recommendation text.

### Path 4 — Watch Match
The Watch Manager intercepts the event first. It routes to the LLM with full watch context: what was being monitored, what was expected, and what just arrived. The LLM decides: resolve the watch, escalate it, or keep monitoring. This path takes priority over all others.

### Stacking
An event can trigger multiple paths simultaneously — e.g. it matches an active watch (Path 4) *and* fires a new policy rule (Path 3). In this case both signals are passed to the LLM context assembler together. The LLM reasons over the combined picture.

---

## Event Schema Design

Business events are diverse — an inspection event looks nothing like an insurance claim. Bpollo uses a **base event + domain extension** pattern via Zod discriminated unions, living in `packages/schemas`.

### Base Event

Fields every service needs, regardless of event type:

| Field | Type | Purpose |
|---|---|---|
| `event_id` | `uuid` | Dedup and tracing |
| `event_type` | `string` | Discriminator for routing and graph mapping |
| `entity_id` | `string` | Primary business entity this event relates to |
| `tenant_id` | `string` | Multi-tenancy isolation |
| `source_system` | `string` | Which upstream system emitted this |
| `timestamp` | `datetime` | ISO 8601 UTC |
| `correlation_id` | `uuid?` | Links a chain of related events |

`site_id` and all other domain-specific fields are **not** on the base — they live only on domain events that need them.

### Domain Events

Each event type extends the base with a `z.literal()` on `event_type` and its own typed fields:

```
BaseEventSchema
  ├── inspection.issue_flagged  { site_id, issue_type, severity }
  ├── action.created            { action_id, assigned_to?, due_date? }
  ├── action.overdue            { action_id, overdue_by_hours }
  ├── investigation.opened      { investigation_id, linked_issue_ids }
  └── ...
```

All domain schemas are combined into a single `BpolloEventSchema` discriminated union. **Unknown event types are rejected at the ingestion boundary** — no catch-all fallback.

### How services use it

| Service | What it reads |
|---|---|
| Event Router | `BaseEvent` (`event_type` only) |
| Graph Service | `BaseEvent` (`event_type` + `entity_id`) |
| Pattern Engine | Full narrowed domain type |
| LLM Orchestrator | Full `BpolloEvent` |
| Event Ingestion | Calls `BpolloEventSchema.parse()` — the only validation boundary |

### What is NOT in the event

- Business graph position (`business_node`, `upstream`, `downstream_expected`) — computed by the Graph Service
- Pattern signals — computed by the Pattern Engine
- Watch state — managed by the Watch Manager

---

## Critical Files

| File | Why it matters |
|---|---|
| `services/graph-service/graph-definition.yaml` | Business flow DAG config — wrong node names cascade across Pattern Engine, Watch Generator, and Prompt Builder |
| `services/llm-orchestrator/agent.ts` | The Mastra agent definition — tool bindings, model config, system prompt |
| `services/llm-orchestrator/prompts/reasoning.md` | Core prompt template — determines LLM output quality; must be versioned independently from code |
| `services/watch-manager/schema.ts` | `WatchObject` Zod/Drizzle schema — central contract shared across LLM Orchestrator, Watch Manager, Alert Service, and frontend |
| `services/event-ingestion/schema.ts` | Canonical `Event` Zod schema — every downstream service depends on this shape |
