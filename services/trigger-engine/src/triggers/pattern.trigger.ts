import type {
  BpolloEvent,
  GraphLocation,
  WatchCreationRequest,
} from "@bpollo/schemas";
import type { Trigger } from "../interface.js";

/**
 * PatternTrigger — graph-signal based escalation patterns.
 *
 * Fires on structural signals visible in the GraphLocation, without requiring
 * historical queries. Designed to catch compound risk situations that
 * individual rules miss.
 *
 * MVP patterns:
 *   P1: Multiple SLA violations (>= 2) → escalated risk watch
 *   P2: Entity at a known high-risk terminal-adjacent node with violations
 *
 * Post-MVP: add OpenSearch history queries for recurrence patterns
 * (e.g. "this entity has had 3+ overdue actions in the last 30 days").
 */
export class PatternTrigger implements Trigger {
  readonly name = "pattern";

  async evaluate(
    event: BpolloEvent,
    graphLocation: GraphLocation,
  ): Promise<WatchCreationRequest | null> {
    const snapshot = buildSnapshot(graphLocation);
    const now = new Date();
    const violations = graphLocation.sla_violations;

    // -------------------------------------------------------------------------
    // Pattern 1: Multiple SLA violations → entity may be stuck, escalate risk
    // -------------------------------------------------------------------------
    if (violations.length >= 2) {
      const violationSummary = violations
        .map((v) => `"${v.node}" (${v.overdue_hours}h overdue)`)
        .join(", ");

      const expiresAt = new Date(
        now.getTime() + 72 * 3600 * 1000,
      ).toISOString();
      const expectedEventTypes = graphLocation.downstream_expected
        .filter((d) => d.expected)
        .map((d) => d.node);

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: "high",
        reason: `Multiple SLA violations detected: ${violationSummary} — entity may be stuck, escalated monitoring`,
        graph_snapshot: snapshot,
        trigger_conditions:
          expectedEventTypes.length > 0
            ? expectedEventTypes.map((et) => ({
                type: "event_match" as const,
                event_type: et,
              }))
            : [{ type: "event_match" as const, event_type: event.event_type }],
        expected_signals:
          expectedEventTypes.length > 0
            ? expectedEventTypes.map((et) => ({
                event_type: et,
                deadline: new Date(
                  now.getTime() + 48 * 3600 * 1000,
                ).toISOString(),
                required: false,
                received: false,
              }))
            : [],
        expires_at: expiresAt,
      };
    }

    // -------------------------------------------------------------------------
    // Pattern 2: High-risk node + at least one SLA violation
    // -------------------------------------------------------------------------
    const highRiskNodes = new Set(["action_overdue", "investigation_opened"]);

    if (
      highRiskNodes.has(graphLocation.current_node) &&
      violations.length >= 1
    ) {
      const expiresAt = new Date(
        now.getTime() + 48 * 3600 * 1000,
      ).toISOString();

      return {
        entity_id: event.entity_id,
        tenant_id: event.tenant_id,
        scope: "entity",
        risk_level: "high",
        reason: `Entity is at high-risk node "${graphLocation.current_node}" with ${violations.length} SLA violation(s) — proactive escalation watch`,
        graph_snapshot: snapshot,
        trigger_conditions: [
          { type: "event_match", event_type: "action.resolved" },
          { type: "event_match", event_type: "investigation.closed" },
        ],
        expected_signals: [],
        expires_at: expiresAt,
      };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildSnapshot(graphLocation: GraphLocation): Record<string, unknown> {
  return {
    current_node: graphLocation.current_node,
    upstream: graphLocation.upstream,
    downstream_expected: graphLocation.downstream_expected,
    sla_violations: graphLocation.sla_violations,
  };
}
