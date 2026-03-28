import type {
  BpolloEvent,
  GraphLocation,
  WatchCreationRequest,
} from "@bpollo/schemas";
import type { Trigger } from "../interface.js";

/**
 * RuleTrigger — deterministic, event-type-based rules.
 *
 * Each rule inspects the event + graph position and decides whether to create
 * a watch. Rules are evaluated in order; the first match wins.
 *
 * Built-in rules:
 *   1. action.overdue           → watch for action.resolved
 *   2. inspection.issue_flagged (high/critical) → watch for action.created
 *   3. investigation.opened (high/critical)     → watch for investigation.closed
 *   4. SLA violation present    → watch for expected downstream events
 */
export class RuleTrigger implements Trigger {
  readonly name = "rule";

  async evaluate(
    event: BpolloEvent,
    graphLocation: GraphLocation,
  ): Promise<WatchCreationRequest | null> {
    const snapshot = buildSnapshot(graphLocation);
    const now = new Date();

    // -------------------------------------------------------------------------
    // Rule 1: action.overdue → watch for resolution
    // -------------------------------------------------------------------------
    if (event.event_type === "action.overdue") {
      const overdueHours = event.overdue_by_hours;
      const riskLevel = overdueHours > 24 ? "high" : "medium";
      const resolvedDeadline = hoursFromNow(now, 72);
      const expiresAt = hoursFromNow(now, 7 * 24);

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: riskLevel,
        reason: `Corrective action is overdue by ${overdueHours}h — monitoring for resolution`,
        graph_snapshot: snapshot,
        trigger_conditions: [
          { type: "event_match", event_type: "action.resolved" },
        ],
        expected_signals: [
          {
            event_type: "action.resolved",
            deadline: resolvedDeadline,
            required: true,
            received: false,
          },
        ],
        expires_at: expiresAt,
      };
    }

    // -------------------------------------------------------------------------
    // Rule 2: inspection.issue_flagged (high / critical) → watch for action
    // -------------------------------------------------------------------------
    if (
      event.event_type === "inspection.issue_flagged" &&
      (event.severity === "high" || event.severity === "critical")
    ) {
      const riskLevel = event.severity === "critical" ? "critical" : "high";
      const actionDeadline = hoursFromNow(now, 24);
      const expiresAt = hoursFromNow(now, 3 * 24);

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: riskLevel,
        reason: `${event.severity} severity issue flagged — monitoring for corrective action creation within 24h`,
        graph_snapshot: snapshot,
        trigger_conditions: [
          {
            type: "event_match",
            event_type: "action.created",
            filters: { issue_id: event.issue_id },
          },
        ],
        expected_signals: [
          {
            event_type: "action.created",
            deadline: actionDeadline,
            required: true,
            received: false,
          },
        ],
        expires_at: expiresAt,
      };
    }

    // -------------------------------------------------------------------------
    // Rule 3: investigation.opened (high / critical) → watch for closure
    // -------------------------------------------------------------------------
    if (
      event.event_type === "investigation.opened" &&
      (event.severity === "high" || event.severity === "critical")
    ) {
      const closedDeadline = hoursFromNow(now, 168); // 7 days
      const expiresAt = hoursFromNow(now, 14 * 24);

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: "critical",
        reason: `${event.severity} severity investigation opened — monitoring for closure within 7 days`,
        graph_snapshot: snapshot,
        trigger_conditions: [
          { type: "event_match", event_type: "investigation.closed" },
        ],
        expected_signals: [
          {
            event_type: "investigation.closed",
            deadline: closedDeadline,
            required: true,
            received: false,
          },
        ],
        expires_at: expiresAt,
      };
    }

    // -------------------------------------------------------------------------
    // Rule 4: SLA violation present → watch for expected downstream events
    // -------------------------------------------------------------------------
    if (graphLocation.sla_violations.length > 0) {
      const violation = graphLocation.sla_violations[0];
      const expiresAt = hoursFromNow(now, 48);
      const expectedEventTypes = graphLocation.downstream_expected
        .filter((d) => d.expected)
        .map((d) => d.node);

      if (expectedEventTypes.length === 0) return null;

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: "medium",
        reason: `SLA violation detected at node "${violation.node}" (${violation.overdue_hours}h overdue) — monitoring for expected downstream progress`,
        graph_snapshot: snapshot,
        trigger_conditions: expectedEventTypes.map((et) => ({
          type: "event_match" as const,
          event_type: et,
        })),
        expected_signals: expectedEventTypes.map((et) => ({
          event_type: et,
          deadline: hoursFromNow(now, 48),
          required: false,
          received: false,
        })),
        expires_at: expiresAt,
      };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hoursFromNow(now: Date, hours: number): string {
  return new Date(now.getTime() + hours * 3600 * 1000).toISOString();
}

function buildSnapshot(graphLocation: GraphLocation): Record<string, unknown> {
  return {
    current_node: graphLocation.current_node,
    upstream: graphLocation.upstream,
    downstream_expected: graphLocation.downstream_expected,
    sla_violations: graphLocation.sla_violations,
  };
}
