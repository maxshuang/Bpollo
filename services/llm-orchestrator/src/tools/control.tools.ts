import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import { logger } from "../logger.js";

// ---------------------------------------------------------------------------
// standDown — explicit no-op escape valve
//
// When the agent determines that no action is warranted, it calls standDown
// instead of quietly doing nothing. This produces an audit trail entry and
// prevents the agent from looping on uncertainty.
// ---------------------------------------------------------------------------

export const standDownTool = createTool({
  id: "standDown",
  description:
    "Explicitly take no action on this watch. Call this when the situation does not warrant intervention — the watch will continue running normally. This produces an audit entry so the decision is recorded.",
  inputSchema: z.object({
    watchId: z.string().uuid(),
    reason: z.string().min(10).describe("Why no action is needed right now"),
  }),
  execute: async ({ context }) => {
    const { watchId, reason } = context;
    logger.info({ watchId, reason }, "standDown tool called — no action taken");
    return { success: true, watchId, action: "stand_down", reason };
  },
});
