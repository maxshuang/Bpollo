import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import { Agent } from "@mastra/core/agent";
import { createAnthropic } from "@ai-sdk/anthropic";
import { config } from "./config.js";
import { assembleContext } from "./context.js";
import { makeReasoningCycleId, openCycle, closeCycle } from "./audit.js";
import {
  resolveWatchTool,
  escalateWatchTool,
  extendWatchTool,
  spawnWatchTool,
} from "./tools/watch.tools.js";
import { dispatchAlertTool } from "./tools/alert.tools.js";
import { standDownTool } from "./tools/control.tools.js";
import type { WatchTrigger } from "@bpollo/schemas";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Load system prompt from file
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const SYSTEM_PROMPT = readFileSync(
  join(__dirname, "../prompts/reasoning.md"),
  "utf8",
);

// ---------------------------------------------------------------------------
// Mastra agent definition
// ---------------------------------------------------------------------------

const anthropic = createAnthropic({ apiKey: config.anthropicApiKey });

const reasoningAgent = new Agent({
  name: "bpollo-reasoning",
  instructions: SYSTEM_PROMPT,
  model: anthropic(config.llmModel),
  tools: {
    resolveWatch: resolveWatchTool,
    escalateWatch: escalateWatchTool,
    extendWatch: extendWatchTool,
    spawnWatch: spawnWatchTool,
    dispatchAlert: dispatchAlertTool,
    standDown: standDownTool,
  },
});

// ---------------------------------------------------------------------------
// runReasoningCycle — entry point for each triggered watch
// ---------------------------------------------------------------------------

export async function runReasoningCycle(trigger: WatchTrigger): Promise<void> {
  const { watch_id, entity_id, tenant_id, triggered_at, watch_snapshot } =
    trigger;

  const cycleId = makeReasoningCycleId(watch_id, triggered_at);

  // Assemble context from upstream services
  const context = await assembleContext(watch_snapshot);

  // Open audit record — returns false if already processed (idempotency)
  const opened = await openCycle(
    cycleId,
    watch_id,
    entity_id,
    tenant_id,
    context,
  );
  if (!opened) return;

  // Build the user message — structured context the agent reasons over
  const userMessage = buildUserMessage(trigger, context);

  const toolsCalled: string[] = [];
  let agentReasoning = "";
  let stepsUsed = 0;

  try {
    const response = await reasoningAgent.generate(userMessage, {
      maxSteps: config.agentMaxSteps,
      onStepFinish: (step) => {
        stepsUsed++;
        if (step.toolCalls) {
          for (const call of step.toolCalls) {
            toolsCalled.push(call.toolName);
          }
        }
        // Capture the last text output as the agent's reasoning summary
        if (step.text) {
          agentReasoning = step.text;
        }
      },
    });

    // If the final response has text and we didn't capture it in steps
    if (!agentReasoning && response.text) {
      agentReasoning = response.text;
    }

    await closeCycle(cycleId, {
      agentReasoning,
      toolsCalled,
      stepsUsed,
      status: "completed",
    });

    logger.info(
      { cycleId, watchId: watch_id, stepsUsed, toolsCalled },
      "reasoning cycle completed",
    );
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    logger.error({ cycleId, watchId: watch_id, err }, "reasoning cycle failed");

    await closeCycle(cycleId, {
      agentReasoning,
      toolsCalled,
      stepsUsed,
      status: "failed",
      errorMessage,
    });
  }
}

// ---------------------------------------------------------------------------
// buildUserMessage — formats context into a clear agent prompt
// ---------------------------------------------------------------------------

function buildUserMessage(
  trigger: WatchTrigger,
  context: ReturnType<typeof assembleContext> extends Promise<infer T>
    ? T
    : never,
): string {
  const { watch_snapshot: watch, trigger_type, triggered_at } = trigger;

  const lines: string[] = [];

  lines.push(`## Triggered Watch`);
  lines.push(`**Watch ID:** ${watch.watch_id}`);
  lines.push(`**Entity:** ${watch.entity_id} (tenant: ${watch.tenant_id})`);
  lines.push(`**Risk level:** ${watch.risk_level}`);
  lines.push(`**Triggered by:** ${trigger_type} at ${triggered_at}`);
  lines.push(`**Reason this watch was created:** ${watch.reason}`);
  lines.push(`**Expires at:** ${watch.expires_at}`);
  lines.push(``);

  if (context.graphContextBlock) {
    lines.push(context.graphContextBlock);
    lines.push(``);
  } else {
    lines.push(`*Graph context unavailable*`);
    lines.push(``);
  }

  if (watch.expected_signals.length > 0) {
    lines.push(`## Expected Signals`);
    for (const sig of watch.expected_signals) {
      const status = sig.received
        ? "✓ received"
        : new Date(sig.deadline) < new Date()
          ? "✗ OVERDUE"
          : "⏳ pending";
      lines.push(
        `- ${sig.event_type} — deadline ${sig.deadline} — ${status}${sig.required ? " (required)" : ""}`,
      );
    }
    lines.push(``);
  }

  if (context.activeWatches.length > 0) {
    lines.push(`## Other Active Watches on This Entity`);
    for (const w of context.activeWatches) {
      if (w.watch_id === watch.watch_id) continue;
      lines.push(`- ${w.watch_id} | ${w.risk_level} | ${w.reason}`);
    }
    lines.push(``);
  }

  lines.push(
    `Assess the situation and take the appropriate action using your tools.`,
  );

  return lines.join("\n");
}
