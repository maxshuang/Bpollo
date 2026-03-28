import { describe, it, expect } from "vitest";
import { PatternTrigger } from "../triggers/pattern.trigger.js";
import type { BpolloEvent, GraphLocation } from "@bpollo/schemas";

const trigger = new PatternTrigger();

const BASE_EVENT: BpolloEvent = {
  event_id: "550e8400-e29b-41d4-a716-446655440000",
  event_type: "action.created",
  entity_id: "entity-1",
  tenant_id: "tenant-1",
  source_system: "test",
  timestamp: new Date().toISOString(),
  action_id: "550e8400-e29b-41d4-a716-446655440001",
  issue_id: "issue-1",
};

const violation = (node: string, hours: number) => ({
  node,
  overdue_hours: hours,
  violation_description: `${node} overdue by ${hours}h`,
});

// ---------------------------------------------------------------------------
// Pattern 1: multiple SLA violations
// ---------------------------------------------------------------------------

describe("PatternTrigger — multiple SLA violations", () => {
  it("does NOT fire with zero violations", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_created",
      upstream: [],
      downstream_expected: [],
      sla_violations: [],
    });
    expect(result).toBeNull();
  });

  it("does NOT fire with only one violation", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_created",
      upstream: [],
      downstream_expected: [],
      sla_violations: [violation("issue_flagged", 10)],
    });
    expect(result).toBeNull();
  });

  it("fires with two or more violations", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_created",
      upstream: [],
      downstream_expected: [],
      sla_violations: [
        violation("issue_flagged", 10),
        violation("action_created", 5),
      ],
    });
    expect(result).not.toBeNull();
    expect(result!.risk_level).toBe("high");
    expect(result!.reason).toContain("Multiple SLA violations");
  });

  it("includes downstream nodes as trigger conditions when available", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_created",
      upstream: [],
      downstream_expected: [
        { node: "action_resolved", expected: true },
        { node: "action_overdue", expected: true },
      ],
      sla_violations: [violation("a", 1), violation("b", 2)],
    });
    expect(result).not.toBeNull();
    const eventTypes = result!.trigger_conditions.map((c) =>
      c.type === "event_match" ? c.event_type : null,
    );
    expect(eventTypes).toContain("action_resolved");
  });
});

// ---------------------------------------------------------------------------
// Pattern 2: high-risk node + violation
// ---------------------------------------------------------------------------

describe("PatternTrigger — high-risk node with violation", () => {
  it("fires when entity is at action_overdue with violation", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_overdue",
      upstream: [],
      downstream_expected: [],
      sla_violations: [violation("action_overdue", 5)],
    });
    expect(result).not.toBeNull();
    expect(result!.risk_level).toBe("high");
    expect(result!.reason).toContain("action_overdue");
  });

  it("fires when entity is at investigation_opened with violation", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "investigation_opened",
      upstream: [],
      downstream_expected: [],
      sla_violations: [violation("investigation_opened", 12)],
    });
    expect(result).not.toBeNull();
  });

  it("does NOT fire at high-risk node with NO violations", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_overdue",
      upstream: [],
      downstream_expected: [],
      sla_violations: [],
    });
    expect(result).toBeNull();
  });

  it("does NOT fire at a normal node with one violation", async () => {
    const result = await trigger.evaluate(BASE_EVENT, {
      current_node: "action_created",
      upstream: [],
      downstream_expected: [],
      sla_violations: [violation("issue_flagged", 5)],
    });
    expect(result).toBeNull();
  });
});
