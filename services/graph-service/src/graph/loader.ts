import { readFileSync } from "fs"
import yaml from "js-yaml"
import type { GlobalGraph, GraphIndex, GraphNode } from "./types.js"

export function loadGraph(yamlPath: string): { graph: GlobalGraph; index: GraphIndex } {
  const raw    = readFileSync(yamlPath, "utf8")
  const parsed = yaml.load(raw) as GlobalGraph

  const byId        = new Map<string, GraphNode>()
  const byEventType = new Map<string, GraphNode>()
  const upstreamOf  = new Map<string, string[]>()

  for (const node of parsed.nodes) {
    byId.set(node.id, node)
    if (node.event_type) {
      byEventType.set(node.event_type, node)
    }
    // ensure every node has an entry in upstreamOf (even if no one points to it)
    if (!upstreamOf.has(node.id)) {
      upstreamOf.set(node.id, [])
    }
    for (const edge of node.downstream) {
      const list = upstreamOf.get(edge.node) ?? []
      list.push(node.id)
      upstreamOf.set(edge.node, list)
    }
  }

  return { graph: parsed, index: { byId, byEventType, upstreamOf } }
}
