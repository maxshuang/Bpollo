# Repo Structure

Bpollo is a TypeScript monorepo managed with **pnpm workspaces** and **Turborepo**.

```
Bpollo/
│
├── services/                        # Backend microservices (each independently deployable)
│   ├── event-ingestion/             # Receives webhooks, normalizes & deduplicates events, publishes to Kafka
│   ├── event-router/                # Consumes normalized events, fans out to typed Kafka topics
│   ├── graph-service/               # Business flow graph: maps events to DAG node positions
│   ├── trigger-engine/              # Runs registered triggers (PatternTrigger, RuleTrigger, CustomTrigger) against events
│   ├── watch-manager/               # Persists watches, schedules expiry checks, matches future events
│   ├── llm-orchestrator/            # Mastra agent: assembles context, reasons, dispatches watch/alert
│   ├── alert-service/               # Routes structured alerts to Slack and in-app notifications
│   └── api/                         # External REST API (aggregates Postgres + OpenSearch for the UI)
│
├── packages/                        # Shared internal libraries
│   ├── schemas/                     # Canonical Zod schemas: Event, WatchObject, PatternSummary, etc.
│   └── config/                      # Shared config types and environment variable definitions
│
├── apps/                            # User-facing applications
│   └── web/                         # React frontend: Timeline view, Watch Dashboard, Alert Center
│
├── infra/                           # Infrastructure configuration
│   ├── docker/                      # Per-service Dockerfiles
│   ├── docker-compose.yml           # Local dev: Kafka, Postgres, Redis, OpenSearch + all services
│   └── k8s/                         # Kubernetes manifests (Helm charts per service)
│
├── docs/                            # Project documentation
│   ├── design.md                    # System architecture & data flow
│   ├── components.md                # Component breakdown & tech choices
│   └── repo-structure.md            # This file
│
├── .github/
│   └── workflows/                   # GitHub Actions: CI (test, lint, typecheck), CD (deploy to staging)
│
├── assets/                          # Project assets (icons, images)
├── turbo.json                       # Turborepo task pipeline
├── package.json                     # Root pnpm workspace definition
├── tsconfig.base.json               # Shared TypeScript base config
└── README.md
```

---

## Key Conventions

- **Every service** in `services/` is a standalone Hono HTTP server with its own `package.json`, `tsconfig.json`, and `Dockerfile`.
- **Shared types** live only in `packages/schemas` — services never define their own versions of `Event`, `WatchObject`, etc.
- **Graph definition** lives in `services/graph-service/graph-definition.yaml` — this is the source of truth for the business flow DAG and is loaded at runtime, not compiled in.
- **Prompt templates** live in `services/llm-orchestrator/prompts/` as Markdown files — versioned independently from code.
- **Local dev** runs entirely via `docker-compose.yml` — one command starts Kafka, Postgres, Redis, OpenSearch, and all services.

---

## Data Flow Through the Repo

```
apps/web  →  services/api  →  services/watch-manager
                           →  services/llm-orchestrator  (Mastra agent)
                                    ↑
services/event-ingestion  →  [Kafka]  →  services/event-router
                                              ↓
                                 services/graph-service
                                 services/trigger-engine
                                 services/watch-manager
```

All event schemas crossing service boundaries are validated against `packages/schemas`.
