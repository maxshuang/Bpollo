/**
 * Unit tests for LLM Orchestrator tool guardrails.
 *
 * All external HTTP calls are mocked via vi.stubGlobal("fetch", ...).
 * These tests verify the business constraint logic in each tool, not
 * the actual Mastra/Claude integration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { WatchObject } from "@bpollo/schemas";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date();
const FUTURE_ISO = new Date(NOW.getTime() + 86_400_000).toISOString();

function makeWatch(overrides: Partial<WatchObject> = {}): WatchObject {
  return {
    watch_id: "00000000-0000-0000-0000-000000000001",
    entity_id: "entity-1",
    tenant_id: "tenant-1",
    status: "triggered",
    risk_level: "medium",
    scope: "entity",
    reason: "Test watch",
    graph_snapshot: { current_node: "action_overdue" },
    trigger_conditions: [
      { type: "event_match", event_type: "action.resolved" },
    ],
    expected_signals: [],
    created_at: NOW.toISOString(),
    expires_at: FUTURE_ISO,
    triggered_at: NOW.toISOString(),
    history: [],
    ...overrides,
  };
}

// Helper to call a tool's execute bypassing Mastra's type wrapper
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function callTool(
  tool: { execute?: unknown },
  ctx: Record<string, unknown>,
): Promise<any> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (tool.execute as any)({
    context: ctx,
    runId: "test",
    threadId: "test",
    runtimeContext: {},
  });
}

function mockFetchWith(watch: WatchObject) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      const method = init?.method?.toUpperCase() ?? "GET";
      const urlStr = String(url);

      if (method === "GET" && urlStr.match(/\/watches\/[^/]+$/)) {
        return { ok: true, json: async () => watch } as Response;
      }
      if (method === "PATCH") {
        return {
          ok: true,
          json: async () => ({ watch_id: watch.watch_id, status: "resolved" }),
        } as Response;
      }
      if (method === "POST" && urlStr.includes("/watches")) {
        return {
          ok: true,
          json: async () => ({
            watch_id: "00000000-0000-0000-0000-000000000099",
          }),
        } as Response;
      }
      if (method === "POST" && urlStr.includes("/alerts")) {
        return {
          ok: true,
          json: async () => ({ alert_id: "alert-1" }),
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    }),
  );
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// resolveWatch
// ---------------------------------------------------------------------------

describe("resolveWatchTool", () => {
  it("calls PATCH and returns success", async () => {
    mockFetchWith(makeWatch());
    const { resolveWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(resolveWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      reason: "Case closed successfully",
    });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// escalateWatch
// ---------------------------------------------------------------------------

describe("escalateWatchTool", () => {
  it("succeeds when new level is higher than current", async () => {
    mockFetchWith(makeWatch({ risk_level: "medium" }));
    const { escalateWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(escalateWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newRiskLevel: "high",
      reason: "Multiple violations detected — escalating now",
    });
    expect(result.success).toBe(true);
    expect(result.newRiskLevel).toBe("high");
  });

  it("rejects when new level equals current", async () => {
    mockFetchWith(makeWatch({ risk_level: "high" }));
    const { escalateWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(escalateWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newRiskLevel: "high",
      reason: "Staying at the same level",
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("not higher");
  });

  it("rejects a downgrade", async () => {
    mockFetchWith(makeWatch({ risk_level: "critical" }));
    const { escalateWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(escalateWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newRiskLevel: "medium",
      reason: "Attempting downgrade",
    });
    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// extendWatch
// ---------------------------------------------------------------------------

describe("extendWatchTool", () => {
  it("succeeds within 7-day limit with no prior extensions", async () => {
    mockFetchWith(makeWatch({ history: [] }));
    const { extendWatchTool } = await import("../tools/watch.tools.js");
    const newExpiresAt = new Date(Date.now() + 3 * 86_400_000).toISOString();
    const result = await callTool(extendWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newExpiresAt,
      reason: "Investigation still in progress — need more time",
    });
    expect(result.success).toBe(true);
  });

  it("rejects extension beyond 7 days from now", async () => {
    mockFetchWith(makeWatch({ history: [] }));
    const { extendWatchTool } = await import("../tools/watch.tools.js");
    const tooFar = new Date(Date.now() + 10 * 86_400_000).toISOString();
    const result = await callTool(extendWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newExpiresAt: tooFar,
      reason: "Extending too far into the future",
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("max allowed");
  });

  it("rejects when 3 extensions already used", async () => {
    mockFetchWith(
      makeWatch({
        history: [
          { action: "extended", at: NOW.toISOString() },
          { action: "extended", at: NOW.toISOString() },
          { action: "extended", at: NOW.toISOString() },
        ],
      }),
    );
    const { extendWatchTool } = await import("../tools/watch.tools.js");
    const newExpiresAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
    const result = await callTool(extendWatchTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      newExpiresAt,
      reason: "Trying a fourth extension",
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("already been extended");
  });
});

// ---------------------------------------------------------------------------
// spawnWatch
// ---------------------------------------------------------------------------

describe("spawnWatchTool", () => {
  it("succeeds when spawn depth is below the limit", async () => {
    mockFetchWith(
      makeWatch({
        graph_snapshot: { current_node: "action_overdue", spawn_depth: 0 },
      }),
    );
    const { spawnWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(spawnWatchTool, {
      parentWatchId: "00000000-0000-0000-0000-000000000001",
      reason: "Insurance claim follow-up needs separate monitoring",
      riskLevel: "medium",
      expiresInHours: 48,
      expectedEventTypes: ["insurance.claim_submitted"],
    });
    expect(result.success).toBe(true);
    expect(result.childWatchId).toBe("00000000-0000-0000-0000-000000000099");
  });

  it("rejects when spawn depth limit is reached", async () => {
    mockFetchWith(
      makeWatch({
        graph_snapshot: { current_node: "action_overdue", spawn_depth: 3 },
      }),
    );
    const { spawnWatchTool } = await import("../tools/watch.tools.js");
    const result = await callTool(spawnWatchTool, {
      parentWatchId: "00000000-0000-0000-0000-000000000001",
      reason: "Trying to spawn at max depth",
      riskLevel: "low",
      expiresInHours: 24,
      expectedEventTypes: ["some.event"],
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("depth limit");
  });
});

// ---------------------------------------------------------------------------
// dispatchAlert
// ---------------------------------------------------------------------------

describe("dispatchAlertTool", () => {
  it("succeeds when priority matches watch risk level", async () => {
    mockFetchWith(makeWatch({ risk_level: "high" }));
    const { dispatchAlertTool } = await import("../tools/alert.tools.js");
    const result = await callTool(dispatchAlertTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      priority: "high",
      message:
        "Action has been overdue for 12 hours with no investigation opened.",
      recommendation:
        "Open an investigation immediately and contact the assigned team.",
    });
    expect(result.success).toBe(true);
    expect(result.alertId).toBe("alert-1");
  });

  it("rejects when priority exceeds watch risk level", async () => {
    mockFetchWith(makeWatch({ risk_level: "low" }));
    const { dispatchAlertTool } = await import("../tools/alert.tools.js");
    const result = await callTool(dispatchAlertTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      priority: "critical",
      message: "Trying to send a critical alert on a low-risk watch.",
      recommendation: "Take action now.",
    });
    expect(result.success).toBe(false);
    expect(String(result.error)).toContain("exceeds watch risk level");
  });
});

// ---------------------------------------------------------------------------
// standDown
// ---------------------------------------------------------------------------

describe("standDownTool", () => {
  it("always succeeds and records the reason", async () => {
    const { standDownTool } = await import("../tools/control.tools.js");
    const result = await callTool(standDownTool, {
      watchId: "00000000-0000-0000-0000-000000000001",
      reason: "The investigation opened on time — situation is under control.",
    });
    expect(result.success).toBe(true);
    expect(result.action).toBe("stand_down");
  });
});
