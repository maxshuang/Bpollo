import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { WatchObject } from "@bpollo/schemas";
import { config } from "../config.js";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// In-memory rate limiter: entity_id → last alert timestamp
// Shared within a single process; sufficient for MVP single-instance deploy.
// ---------------------------------------------------------------------------

const lastAlertAt = new Map<string, number>();

const RISK_RANK: Record<string, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

async function getWatch(watchId: string): Promise<WatchObject | null> {
  try {
    const res = await fetch(`${config.watchManagerUrl}/watches/${watchId}`);
    if (!res.ok) return null;
    return (await res.json()) as WatchObject;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// dispatchAlert — send an alert to the user
// ---------------------------------------------------------------------------

export const dispatchAlertTool = createTool({
  id: "dispatchAlert",
  description:
    "Send an alert to the user about this entity. Priority must not exceed the watch risk level. Rate limited to one alert per entity per hour.",
  inputSchema: z.object({
    watchId: z.string().uuid(),
    priority: z
      .enum(["low", "medium", "high", "critical"])
      .describe("Must not exceed the watch's current risk_level"),
    message: z
      .string()
      .min(20)
      .describe("Clear explanation of what happened and why it matters"),
    recommendation: z
      .string()
      .min(10)
      .describe("Specific, actionable next step for the user"),
  }),
  execute: async ({ context }) => {
    const { watchId, priority, message, recommendation } = context;

    const watch = await getWatch(watchId);
    if (!watch) {
      return { success: false, error: "watch not found" };
    }

    // Guardrail: priority must not exceed risk level
    if (RISK_RANK[priority] > RISK_RANK[watch.risk_level]) {
      return {
        success: false,
        error: `Alert priority ${priority} exceeds watch risk level ${watch.risk_level}`,
      };
    }

    // Guardrail: rate limit — 1 alert per entity per hour
    const lastTime = lastAlertAt.get(watch.entity_id) ?? 0;
    const elapsed = Date.now() - lastTime;
    if (elapsed < config.alertRateLimitMs) {
      const waitSec = Math.ceil((config.alertRateLimitMs - elapsed) / 1000);
      return {
        success: false,
        error: `Rate limited: entity already alerted recently — retry in ${waitSec}s`,
      };
    }

    try {
      const res = await fetch(`${config.alertServiceUrl}/alerts`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          entity_id: watch.entity_id,
          tenant_id: watch.tenant_id,
          watch_id: watchId,
          priority,
          message,
          recommendation,
        }),
      });

      if (res.ok) {
        lastAlertAt.set(watch.entity_id, Date.now());
        const data = (await res.json()) as { alert_id: string };
        logger.info(
          { watchId, priority, alertId: data.alert_id },
          "alert dispatched",
        );
        return { success: true, alertId: data.alert_id };
      }

      return { success: false, error: `alert-service returned ${res.status}` };
    } catch (err) {
      return { success: false, error: String(err) };
    }
  },
});
