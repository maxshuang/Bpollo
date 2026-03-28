import type {
  BpolloEvent,
  GraphLocation,
  WatchCreationRequest,
} from "@bpollo/schemas";

/**
 * The core Trigger interface.
 *
 * Each trigger receives a fully-typed event and the entity's current position
 * in the business graph. It returns a WatchCreationRequest (including a
 * graph_snapshot) if it decides monitoring is warranted, or null if not.
 *
 * Built-in implementations: RuleTrigger, PatternTrigger.
 * Custom triggers: implement this interface and register with TriggerRegistry.
 */
export interface Trigger {
  /** Unique name used in TriggerResult and logs. */
  readonly name: string;

  /**
   * Evaluate whether this trigger fires for the given event and graph position.
   *
   * @param event         - The incoming business event (fully typed BpolloEvent).
   * @param graphLocation - Entity's current node, upstream, downstream, and any
   *                        SLA violations at the time of the event.
   * @returns A WatchCreationRequest if the trigger fires — this becomes the watch
   *          that the Watch Manager creates. The request must include a
   *          `graph_snapshot` capturing the current graph position so the LLM
   *          Orchestrator has full context when the watch wakes.
   *          Returns null if the trigger does not fire.
   */
  evaluate(
    event: BpolloEvent,
    graphLocation: GraphLocation,
  ): Promise<WatchCreationRequest | null>;
}
