import { describe, it, expect, vi, beforeEach } from "vitest";
import { Hono } from "hono";

// Mock side-effectful modules before importing the router
vi.mock("../kafka.js", () => ({
  producer: { send: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock("../dedup.js", () => ({
  isDuplicate: vi.fn().mockResolvedValue(false),
}));

const { ingestRouter } = await import("../ingest.js");
const { producer } = await import("../kafka.js");
const { isDuplicate } = await import("../dedup.js");

const VALID_EVENT = {
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  event_type: "inspection.submitted",
  entity_id: "entity-1",
  tenant_id: "tenant-1",
  source_system: "test",
  timestamp: "2024-01-15T10:00:00.000Z",
  site_id: "site-1",
  inspector_id: "user-1",
};

let app: Hono;

beforeEach(() => {
  vi.clearAllMocks();
  app = new Hono();
  app.route("/", ingestRouter);
});

// ---------------------------------------------------------------------------
// GET /health
// ---------------------------------------------------------------------------
describe("GET /health", () => {
  it("returns 200 ok", async () => {
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// POST /ingest/webhook — error cases
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — error handling", () => {
  it("returns 400 for non-JSON body", async () => {
    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "not json",
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid JSON");
  });

  it("returns 422 for unknown event_type", async () => {
    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_EVENT, event_type: "unknown.type" }),
    });
    expect(res.status).toBe(422);
    const body = await res.json();
    expect(body.error).toBe("validation failed");
    expect(body.issues).toBeDefined();
  });

  it("returns 422 for missing required domain fields", async () => {
    // inspection.submitted requires site_id and inspector_id
    const { site_id: _, inspector_id: __, ...incomplete } = VALID_EVENT;
    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(incomplete),
    });
    expect(res.status).toBe(422);
  });

  it("returns 422 for invalid event_id (non-UUID)", async () => {
    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...VALID_EVENT, event_id: "not-a-uuid" }),
    });
    expect(res.status).toBe(422);
  });
});

// ---------------------------------------------------------------------------
// POST /ingest/webhook — success path
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — success", () => {
  it("returns 202 and event_id for valid event", async () => {
    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_EVENT),
    });
    expect(res.status).toBe(202);
    const body = await res.json();
    expect(body.status).toBe("accepted");
    expect(body.event_id).toBe(VALID_EVENT.event_id);
  });

  it("calls producer.send with entity_id as key", async () => {
    await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_EVENT),
    });
    expect(vi.mocked(producer.send)).toHaveBeenCalledOnce();
    const call = vi.mocked(producer.send).mock.calls[0][0];
    expect(call.messages[0].key).toBe(VALID_EVENT.entity_id);
    const value = JSON.parse(call.messages[0].value as string);
    expect(value.event_id).toBe(VALID_EVENT.event_id);
  });

  it("calls isDuplicate with the event_id", async () => {
    await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_EVENT),
    });
    expect(vi.mocked(isDuplicate)).toHaveBeenCalledWith(VALID_EVENT.event_id);
  });
});

// ---------------------------------------------------------------------------
// POST /ingest/webhook — deduplication
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — deduplication", () => {
  it("returns 200 duplicate when isDuplicate returns true", async () => {
    vi.mocked(isDuplicate).mockResolvedValueOnce(true);

    const res = await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_EVENT),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("duplicate");
  });

  it("does NOT call producer.send for duplicates", async () => {
    vi.mocked(isDuplicate).mockResolvedValueOnce(true);
    await app.request("/ingest/webhook", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(VALID_EVENT),
    });
    expect(vi.mocked(producer.send)).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// All valid event types are accepted
// ---------------------------------------------------------------------------
describe("POST /ingest/webhook — all event types", () => {
  const events = [
    { event_type: "inspection.submitted", site_id: "s1", inspector_id: "u1" },
    {
      event_type: "inspection.issue_flagged",
      site_id: "s1",
      issue_id: "i1",
      issue_type: "elec",
      severity: "high",
    },
    { event_type: "action.created", action_id: "a1", issue_id: "i1" },
    { event_type: "action.overdue", action_id: "a1", overdue_by_hours: 12 },
    { event_type: "action.resolved", action_id: "a1", resolved_by: "u2" },
    {
      event_type: "investigation.opened",
      investigation_id: "inv1",
      linked_issue_ids: ["i1"],
      severity: "low",
    },
    {
      event_type: "investigation.closed",
      investigation_id: "inv1",
      outcome: "resolved",
    },
  ];

  for (const extra of events) {
    it(`accepts ${extra.event_type}`, async () => {
      const res = await app.request("/ingest/webhook", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...VALID_EVENT, ...extra }),
      });
      expect(res.status).toBe(202);
    });
  }
});
