import { describe, it, expect } from "vitest";
import { RuleTrigger } from "../triggers/rule.trigger.js";
import type { BpolloEvent, GraphLocation } from "@bpollo/schemas";

const trigger = new RuleTrigger();

const BASE_EVENT_FIELDS = {
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  entity_id: "entity-1",
  tenant_id: "tenant-1",
  source_system: "test",
  timestamp: new Date().toISOString(),
};

const EMPTY_GRAPH: GraphLocation = {
  current_node: "action_created",
  upstream: ["issue_flagged"],
  downstream_expected: [],
  sla_violations: [],
};

// ---------------------------------------------------------------------------
// action.overdue
// ---------------------------------------------------------------------------

describe("RuleTrigger — action.overdue", () => {
  const event: BpolloEvent = {
    ...BASE_EVENT_FIELDS,
    event_type: "action.overdue",
    action_id: "550e8400-e29b-41d4-a716-446655440001",
    overdue_by_hours: 48,
  };

  it("fires and returns a watch creation request", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result).not.toBeNull();
    expect(result!.reason).toContain("overdue");
  });

  it("sets risk_level to high when overdue_by_hours > 24", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result!.risk_level).toBe("high");
  });

  it("sets risk_level to medium when overdue_by_hours <= 24", async () => {
    const result = await trigger.evaluate(
      { ...event, overdue_by_hours: 12 },
      EMPTY_GRAPH,
    );
    expect(result!.risk_level).toBe("medium");
  });

  it("includes action.resolved as expected signal", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result!.expected_signals[0].event_type).toBe("action.resolved");
    expect(result!.expected_signals[0].required).toBe(true);
  });

  it("includes graph_snapshot with current_node", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result!.graph_snapshot.current_node).toBe("action_created");
  });
});

// ---------------------------------------------------------------------------
// inspection.issue_flagged
// ---------------------------------------------------------------------------

describe("RuleTrigger — inspection.issue_flagged", () => {
  const baseEvent: BpolloEvent = {
    ...BASE_EVENT_FIELDS,
    event_type: "inspection.issue_flagged",
    site_id: "site-1",
    issue_id: "issue-1",
    issue_type: "electrical",
    severity: "high",
  };

  it("fires for high severity", async () => {
    const result = await trigger.evaluate(baseEvent, EMPTY_GRAPH);
    expect(result).not.toBeNull();
    expect(result!.risk_level).toBe("high");
  });

  it("fires for critical severity and sets critical risk", async () => {
    const result = await trigger.evaluate(
      { ...baseEvent, severity: "critical" },
      EMPTY_GRAPH,
    );
    expect(result).not.toBeNull();
    expect(result!.risk_level).toBe("critical");
  });

  it("does NOT fire for low severity", async () => {
    const result = await trigger.evaluate(
      { ...baseEvent, severity: "low" },
      EMPTY_GRAPH,
    );
    expect(result).toBeNull();
  });

  it("does NOT fire for medium severity", async () => {
    const result = await trigger.evaluate(
      { ...baseEvent, severity: "medium" },
      EMPTY_GRAPH,
    );
    expect(result).toBeNull();
  });

  it("filters trigger condition by issue_id", async () => {
    const result = await trigger.evaluate(baseEvent, EMPTY_GRAPH);
    const cond = result!.trigger_conditions[0];
    expect(cond.type).toBe("event_match");
    if (cond.type === "event_match") {
      expect(cond.filters?.issue_id).toBe("issue-1");
    }
  });
});

// ---------------------------------------------------------------------------
// investigation.opened
// ---------------------------------------------------------------------------

describe("RuleTrigger — investigation.opened", () => {
  const event: BpolloEvent = {
    ...BASE_EVENT_FIELDS,
    event_type: "investigation.opened",
    investigation_id: "inv-1",
    linked_issue_ids: ["issue-1"],
    severity: "critical",
  };

  it("fires and sets risk_level to critical", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result).not.toBeNull();
    expect(result!.risk_level).toBe("critical");
  });

  it("expects investigation.closed signal", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result!.expected_signals[0].event_type).toBe("investigation.closed");
  });

  it("does NOT fire for low severity investigation", async () => {
    const result = await trigger.evaluate(
      { ...event, severity: "low" },
      EMPTY_GRAPH,
    );
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// SLA violation rule
// ---------------------------------------------------------------------------

describe("RuleTrigger — SLA violation", () => {
  const event: BpolloEvent = {
    ...BASE_EVENT_FIELDS,
    event_type: "action.created",
    action_id: "550e8400-e29b-41d4-a716-446655440002",
    issue_id: "issue-1",
  };

  const graphWithViolation: GraphLocation = {
    current_node: "action_created",
    upstream: ["issue_flagged"],
    downstream_expected: [
      { node: "action_resolved", sla_hours: 72, expected: true },
    ],
    sla_violations: [
      {
        node: "issue_flagged",
        overdue_hours: 30,
        violation_description: "Corrective action not created within 24h",
      },
    ],
  };

  it("fires when SLA violation is present and downstream exists", async () => {
    const result = await trigger.evaluate(event, graphWithViolation);
    expect(result).not.toBeNull();
    expect(result!.reason).toContain("SLA violation");
  });

  it("does NOT fire when SLA violation present but no downstream expected", async () => {
    const result = await trigger.evaluate(event, {
      ...graphWithViolation,
      downstream_expected: [],
    });
    expect(result).toBeNull();
  });

  it("does NOT fire when no SLA violations and no matching event type", async () => {
    const result = await trigger.evaluate(event, EMPTY_GRAPH);
    expect(result).toBeNull();
  });
});
