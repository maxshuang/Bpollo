import type {
  BpolloEvent,
  GraphLocation,
  TriggerResult,
} from "@bpollo/schemas";
import type { Trigger } from "./interface.js";
import { RuleTrigger } from "./triggers/rule.trigger.js";
import { PatternTrigger } from "./triggers/pattern.trigger.js";

/**
 * TriggerRegistry — runs all registered triggers against an event.
 *
 * All triggers evaluate in parallel. Returns the full result list so callers
 * can inspect which triggers fired and which didn't. Only non-null
 * watch_creation_request entries represent actual watches to create.
 */
export class TriggerRegistry {
  private triggers: Trigger[] = [];

  register(trigger: Trigger): this {
    this.triggers.push(trigger);
    return this;
  }

  async evaluate(
    event: BpolloEvent,
    graphLocation: GraphLocation,
  ): Promise<TriggerResult[]> {
    const results = await Promise.all(
      this.triggers.map(async (t) => {
        try {
          const req = await t.evaluate(event, graphLocation);
          return { trigger_name: t.name, watch_creation_request: req };
        } catch (err) {
          // A single trigger failure must not block the others
          return {
            trigger_name: t.name,
            watch_creation_request: null,
            error: String(err),
          };
        }
      }),
    );
    return results;
  }
}

// ---------------------------------------------------------------------------
// Singleton registry with all built-in triggers registered
// ---------------------------------------------------------------------------
export const registry = new TriggerRegistry()
  .register(new RuleTrigger())
  .register(new PatternTrigger());
