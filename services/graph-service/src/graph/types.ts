export interface DownstreamEdge {
  node: string;
  label: string;
  sla_hours: number | null;
}

export interface GraphNode {
  id: string;
  label: string;
  event_type: string | null; // null for terminal nodes not triggered by events
  description: string;
  llm_description: string;
  sla_hours: number | null;
  downstream: DownstreamEdge[];
}

export interface GlobalGraph {
  version: string;
  name: string;
  nodes: GraphNode[];
}

/** In-memory index structures for O(1) lookup */
export interface GraphIndex {
  byId: Map<string, GraphNode>;
  byEventType: Map<string, GraphNode>; // event_type → node
  upstreamOf: Map<string, string[]>; // node_id → list of node_ids that point to it
}
