import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { WatchObject } from "@bpollo/schemas";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function getWatch(watchId: string): Promise<WatchObject | null> {
  try {
    const res = await fetch(`${config.watchManagerUrl}/watches/${watchId}`);
    if (!res.ok) return null;
    return (await res.json()) as WatchObject;
  } catch {
    return null;
  }
}

async function patchWatch(
  watchId: string,
  updates: Record<string, unknown>,
): Promise<boolean> {
  try {
    const res = await fetch(`${config.watchManagerUrl}/watches/${watchId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(updates),
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function postWatch(
  body: Record<string, unknown>,
): Promise<{ watch_id: string } | null> {
  try {
    const res = await fetch(`${config.watchManagerUrl}/watches`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    return (await res.json()) as { watch_id: string };
  } catch {
    return null;
  }
}

const RISK_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// ---------------------------------------------------------------------------
// resolveWatch — marks the watch as resolved, safe to call always
// ---------------------------------------------------------------------------

export const resolveWatchTool = createTool({
  id: "resolveWatch",
  description:
    "Mark the watch as resolved. Use this when the situation has been handled and no further monitoring is needed.",
  inputSchema: z.object({
    watchId: z.string().uuid().describe("The watch to resolve"),
    reason: z.string().describe("Why this watch is being resolved"),
  }),
  execute: async ({ context }) => {
    const { watchId, reason } = context;
    const ok = await patchWatch(watchId, {
      status: "resolved",
      history_entry: {
        action: "resolved",
        reason,
        at: new Date().toISOString(),
      },
    });
    logger.info({ watchId, ok }, "resolveWatch tool called");
    return { success: ok, watchId };
  },
});

// ---------------------------------------------------------------------------
// escalateWatch — raises risk level; new level must be >= current
// ---------------------------------------------------------------------------

export const escalateWatchTool = createTool({
  id: "escalateWatch",
  description:
    "Escalate the watch to a higher risk level. The new risk level must be strictly higher than the current one.",
  inputSchema: z.object({
    watchId: z.string().uuid(),
    newRiskLevel: z
      .enum(["low", "medium", "high", "critical"])
      .describe("Must be higher than the current risk level"),
    reason: z.string().min(10).describe("Required — explain the escalation"),
  }),
  execute: async ({ context }) => {
    const { watchId, newRiskLevel, reason } = context;
    const watch = await getWatch(watchId);
    if (!watch) {
      return { success: false, error: "watch not found" };
    }

    if (RISK_RANK[newRiskLevel] <= RISK_RANK[watch.risk_level]) {
      return {
        success: false,
        error: `Cannot escalate: ${newRiskLevel} is not higher than current ${watch.risk_level}`,
      };
    }

    const ok = await patchWatch(watchId, {
      risk_level: newRiskLevel,
      status: "escalated",
      history_entry: {
        action: "escalated",
        from: watch.risk_level,
        to: newRiskLevel,
        reason,
        at: new Date().toISOString(),
      },
    });

    logger.info({ watchId, newRiskLevel, ok }, "escalateWatch tool called");
    return { success: ok, watchId, newRiskLevel };
  },
});

// ---------------------------------------------------------------------------
// extendWatch — extends expiry; max +7 days, max 3 extensions total
// ---------------------------------------------------------------------------

export const extendWatchTool = createTool({
  id: "extendWatch",
  description:
    "Extend the watch expiry deadline. Maximum +7 days per extension; at most 3 total extensions per watch.",
  inputSchema: z.object({
    watchId: z.string().uuid(),
    newExpiresAt: z
      .string()
      .datetime()
      .describe("ISO datetime — must be within 7 days from now"),
    reason: z.string().min(10),
  }),
  execute: async ({ context }) => {
    const { watchId, newExpiresAt, reason } = context;
    const watch = await getWatch(watchId);
    if (!watch) {
      return { success: false, error: "watch not found" };
    }

    // Count prior extensions from history
    const extensionCount = watch.history.filter(
      (h) => (h as Record<string, unknown>).action === "extended",
    ).length;

    if (extensionCount >= config.maxExtensions) {
      return {
        success: false,
        error: `Watch has already been extended ${extensionCount} times (max ${config.maxExtensions})`,
      };
    }

    const maxExpiresAt = new Date(
      Date.now() + config.maxExtensionDays * 24 * 3_600_000,
    );
    if (new Date(newExpiresAt) > maxExpiresAt) {
      return {
        success: false,
        error: `Extension exceeds max allowed (${config.maxExtensionDays} days from now)`,
      };
    }

    const ok = await patchWatch(watchId, {
      expires_at: newExpiresAt,
      history_entry: {
        action: "extended",
        new_expires_at: newExpiresAt,
        reason,
        at: new Date().toISOString(),
      },
    });

    logger.info({ watchId, newExpiresAt, ok }, "extendWatch tool called");
    return { success: ok, watchId, newExpiresAt };
  },
});

// ---------------------------------------------------------------------------
// spawnWatch — creates a child watch; max spawn depth = 3
// ---------------------------------------------------------------------------

export const spawnWatchTool = createTool({
  id: "spawnWatch",
  description:
    "Spawn a child watch for a related concern. The spawned watch inherits the entity and tenant. Spawn depth is limited to 3.",
  inputSchema: z.object({
    parentWatchId: z.string().uuid(),
    reason: z.string().min(10).describe("Why a child watch is needed"),
    riskLevel: z.enum(["low", "medium", "high", "critical"]),
    expiresInHours: z
      .number()
      .int()
      .min(1)
      .max(168)
      .describe("Hours until the child watch expires (max 168 = 7 days)"),
    expectedEventTypes: z
      .array(z.string())
      .describe("Event types the child watch is waiting for"),
  }),
  execute: async ({ context }) => {
    const {
      parentWatchId,
      reason,
      riskLevel,
      expiresInHours,
      expectedEventTypes,
    } = context;

    const parent = await getWatch(parentWatchId);
    if (!parent) {
      return { success: false, error: "parent watch not found" };
    }

    // Enforce spawn depth limit
    const spawnDepth =
      ((parent.graph_snapshot as Record<string, unknown>)
        .spawn_depth as number) ?? 0;
    if (spawnDepth >= config.maxSpawnDepth) {
      return {
        success: false,
        error: `Spawn depth limit (${config.maxSpawnDepth}) reached`,
      };
    }

    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + expiresInHours * 3_600_000,
    ).toISOString();

    const body = {
      entity_id: parent.entity_id,
      tenant_id: parent.tenant_id,
      scope: parent.scope,
      risk_level: riskLevel,
      reason,
      graph_snapshot: {
        ...parent.graph_snapshot,
        parent_watch_id: parentWatchId,
        spawn_depth: spawnDepth + 1,
      },
      trigger_conditions: expectedEventTypes.map((et) => ({
        type: "event_match",
        event_type: et,
      })),
      expected_signals: expectedEventTypes.map((et) => ({
        event_type: et,
        deadline: expiresAt,
        required: false,
        received: false,
      })),
      expires_at: expiresAt,
    };

    const result = await postWatch(body);
    logger.info(
      { parentWatchId, childWatchId: result?.watch_id },
      "spawnWatch tool called",
    );
    return result
      ? { success: true, childWatchId: result.watch_id }
      : { success: false, error: "failed to create child watch" };
  },
});
