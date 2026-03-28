import type { WatchObject, GraphLocation } from "@bpollo/schemas";
import { config } from "./config.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface OrchestratorContext {
  watch: WatchObject;
  graphLocation: GraphLocation | null;
  graphContextBlock: string | null;
  activeWatches: WatchObject[];
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchGraphLocation(
  entityId: string,
  tenantId: string,
  eventType: string,
): Promise<GraphLocation | null> {
  try {
    const res = await fetch(`${config.graphServiceUrl}/graph/locate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        event: {
          entity_id: entityId,
          tenant_id: tenantId,
          event_type: eventType,
        },
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "graph/locate returned non-OK");
      return null;
    }
    return (await res.json()) as GraphLocation;
  } catch (err) {
    logger.warn({ err }, "graph/locate call failed");
    return null;
  }
}

async function fetchGraphContextBlock(
  graphLocation: GraphLocation,
  tenantId: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${config.graphServiceUrl}/graph/render-context`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        graph_location: graphLocation,
        tenant_id: tenantId,
      }),
    });
    if (!res.ok) {
      logger.warn(
        { status: res.status },
        "graph/render-context returned non-OK",
      );
      return null;
    }
    const data = (await res.json()) as { context_block: string };
    return data.context_block;
  } catch (err) {
    logger.warn({ err }, "graph/render-context call failed");
    return null;
  }
}

async function fetchActiveWatches(
  entityId: string,
  tenantId: string,
): Promise<WatchObject[]> {
  try {
    const params = new URLSearchParams({
      entity_id: entityId,
      tenant_id: tenantId,
      status: "waiting",
    });
    const res = await fetch(
      `${config.watchManagerUrl}/watches?${params.toString()}`,
    );
    if (!res.ok) {
      logger.warn({ status: res.status }, "GET /watches returned non-OK");
      return [];
    }
    const data = (await res.json()) as { watches: WatchObject[] };
    return data.watches;
  } catch (err) {
    logger.warn({ err }, "GET /watches call failed");
    return [];
  }
}

// ---------------------------------------------------------------------------
// assembleContext — parallel HTTP calls, best-effort (nulls tolerated)
// ---------------------------------------------------------------------------

export async function assembleContext(
  watch: WatchObject,
): Promise<OrchestratorContext> {
  // Derive a representative event_type from the watch's trigger conditions
  const eventType =
    watch.trigger_conditions.find((c) => c.type === "event_match")
      ?.event_type ?? watch.reason.split(" ")[0];

  const [graphLocation, activeWatches] = await Promise.all([
    fetchGraphLocation(watch.entity_id, watch.tenant_id, eventType),
    fetchActiveWatches(watch.entity_id, watch.tenant_id),
  ]);

  let graphContextBlock: string | null = null;
  if (graphLocation) {
    graphContextBlock = await fetchGraphContextBlock(
      graphLocation,
      watch.tenant_id,
    );
  }

  return { watch, graphLocation, graphContextBlock, activeWatches };
}
