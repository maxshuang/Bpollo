import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";
import type { GraphIndex, GlobalGraph } from "../graph/types.js";

// Mock db/client before importing routes
vi.mock("../db/client.js", () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    execute: vi.fn(),
  },
}));

// Import after mocking
const { buildRouter } = await import("../routes.js");
const { db } = await import("../db/client.js");

// ---------------------------------------------------------------------------
// Test graph fixtures
// ---------------------------------------------------------------------------
const TEST_GRAPH: GlobalGraph = {
  version: "1.0",
  name: "Test Graph",
  nodes: [
    {
      id: "node_a",
      label: "Node A",
      event_type: "event.a",
      description: "First node",
      llm_description: "LLM: First node. It does X and leads to Y.",
      sla_hours: 24,
      downstream: [{ node: "node_b", label: "Node B", sla_hours: 48 }],
    },
    {
      id: "node_b",
      label: "Node B",
      event_type: "event.b",
      description: "Second node",
      llm_description: "LLM: Second node.",
      sla_hours: null,
      downstream: [],
    },
  ],
};

const TEST_INDEX: GraphIndex = {
  byId: new Map([
    ["node_a", TEST_GRAPH.nodes[0]],
    ["node_b", TEST_GRAPH.nodes[1]],
  ]),
  byEventType: new Map([
    ["event.a", TEST_GRAPH.nodes[0]],
    ["event.b", TEST_GRAPH.nodes[1]],
  ]),
  upstreamOf: new Map([
    ["node_a", []],
    ["node_b", ["node_a"]],
  ]),
};

const BASE_EVENT = {
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  event_type: "event.a",
  entity_id: "entity-1",
  tenant_id: "tenant-1",
  source_system: "test",
  timestamp: "2024-01-15T10:00:00.000Z",
};

/**
 * Set up db.select mock for the two calls made by POST /graph/locate:
 *  1st call: entityState query   → .from().where()           → Promise<stateRows>
 *  2nd call: entityHistory query → .from().where().orderBy() → Promise<historyRows>
 *
 * Uses resetAllMocks in beforeEach to prevent stale queue values leaking between tests.
 */
function setupDbMocks(stateRows: object[], historyRows: object[]) {
  vi.mocked(db.select)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockResolvedValue(stateRows),
      }),
    } as any)
    .mockReturnValueOnce({
      from: vi.fn().mockReturnValue({
        where: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue(historyRows),
        }),
      }),
    } as any);
}

// ---------------------------------------------------------------------------
// Setup — resetAllMocks clears mockReturnValueOnce queues between tests
// ---------------------------------------------------------------------------
let app: Hono;

beforeEach(() => {
  vi.resetAllMocks();
  app = new Hono();
  app.route("/", buildRouter(TEST_GRAPH, TEST_INDEX));
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// GET /graph/definition
// ---------------------------------------------------------------------------
describe("GET /graph/definition", () => {
  it("returns the full graph", async () => {
    const res = await app.request("/graph/definition");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Test Graph");
    expect(body.nodes).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// POST /graph/locate
// ---------------------------------------------------------------------------
describe("POST /graph/locate", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("returns 422 for missing event fields", async () => {
    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: { event_type: "event.a" } }), // missing required fields
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 when entity not in DB and event_type not in graph", async () => {
    // Only the entityState query is made before the 404 short-circuit
    setupDbMocks([], []);

    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: { ...BASE_EVENT, event_type: "unknown.event" },
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns location for entity not yet in DB using event_type fallback", async () => {
    setupDbMocks([], []); // entity not in DB, no history

    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: BASE_EVENT }), // event_type: event.a → node_a
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_node).toBe("node_a");
    expect(body.upstream).toEqual([]);
    expect(body.downstream_expected).toHaveLength(1);
    expect(body.downstream_expected[0].node).toBe("node_b");
    expect(body.sla_violations).toEqual([]);
  });

  it("returns location from DB state when entity exists", async () => {
    const stateRow = {
      currentNode: "node_b",
      enteredAt: new Date(),
      updatedAt: new Date(),
    };
    setupDbMocks([stateRow], []);

    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: BASE_EVENT }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.current_node).toBe("node_b");
    expect(body.upstream).toContain("node_a");
    expect(body.downstream_expected).toHaveLength(0); // node_b is terminal
  });

  it("returns SLA violations for nodes that exceeded their SLA", async () => {
    const thirtyHoursAgo = new Date(Date.now() - 30 * 3_600_000);
    setupDbMocks(
      [
        {
          currentNode: "node_a",
          enteredAt: thirtyHoursAgo,
          updatedAt: thirtyHoursAgo,
        },
      ],
      [{ toNode: "node_a", occurredAt: thirtyHoursAgo }], // node_a has sla_hours=24 → overdue
    );

    const res = await app.request("/graph/locate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event: BASE_EVENT }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.sla_violations).toHaveLength(1);
    expect(body.sla_violations[0].node).toBe("node_a");
    expect(body.sla_violations[0].overdue_hours).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// POST /graph/render-context
// ---------------------------------------------------------------------------
describe("POST /graph/render-context", () => {
  const LOCATION = {
    current_node: "node_a",
    upstream: [],
    downstream_expected: [{ node: "node_b", sla_hours: 48, expected: true }],
    sla_violations: [],
  };

  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/graph/render-context", {
      method: "POST",
      body: "bad",
    });
    expect(res.status).toBe(400);
  });

  it("returns 422 for invalid graph_location", async () => {
    const res = await app.request("/graph/render-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ tenant_id: "t1" }), // missing graph_location
    });
    expect(res.status).toBe(422);
  });

  it("returns 404 for unknown node", async () => {
    const res = await app.request("/graph/render-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph_location: { ...LOCATION, current_node: "nonexistent_node" },
        tenant_id: "tenant-1",
      }),
    });
    expect(res.status).toBe(404);
  });

  it("returns context block for a valid location", async () => {
    const res = await app.request("/graph/render-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ graph_location: LOCATION, tenant_id: "tenant-1" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.context_block).toBe("string");
    expect(body.context_block).toContain("Node A");
    expect(body.context_block).toContain("Expected next steps");
  });

  it("includes SLA violation section when violations exist", async () => {
    const locationWithViolation = {
      ...LOCATION,
      sla_violations: [
        {
          node: "node_a",
          overdue_hours: 6,
          violation_description: "Node A has been overdue for 6h",
        },
      ],
    };
    const res = await app.request("/graph/render-context", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph_location: locationWithViolation,
        tenant_id: "tenant-1",
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.context_block).toContain("SLA violations");
    expect(body.context_block).toContain("overdue for 6h");
  });
});
