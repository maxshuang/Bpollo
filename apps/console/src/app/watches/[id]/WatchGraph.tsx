"use client"

import { useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BusinessNode {
  id:         string
  label:      string
  event_type: string | null
  sla_hours:  number | null
  downstream: { node: string; label: string; sla_hours: number | null }[]
}

interface TriggerCondition {
  type:         string
  event_type?:  string
  pattern_name?: string
  deadline?:    string
}

interface WatchGraphProps {
  businessNodes:      BusinessNode[]
  currentNode:        string | null      // entity's current position
  triggerEventTypes:  string[]           // event types that will fire the watch
}

type NodeRole = "current" | "trigger" | "normal"

interface NodeData extends Record<string, unknown> {
  label:     string
  eventType: string | null
  slaHours:  number | null
  role:      NodeRole
}

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

const ROLE_STYLES: Record<NodeRole, { border: string; bg: string; ring: string }> = {
  current: { border: "border-orange-500",  bg: "bg-orange-950/60",  ring: "ring-orange-500/30" },
  trigger: { border: "border-yellow-500",  bg: "bg-yellow-950/60",  ring: "ring-yellow-500/30" },
  normal:  { border: "border-gray-700",    bg: "bg-gray-900",       ring: "" },
}

function WatchNode({ data, selected }: NodeProps) {
  const d      = data as NodeData
  const styles = ROLE_STYLES[d.role]
  return (
    <div className={`rounded-lg border px-3 py-2.5 w-44 transition-all ${styles.border} ${styles.bg} ${d.role !== "normal" ? `ring-2 ${styles.ring}` : ""} ${selected ? "ring-2 ring-white/30" : ""}`}>
      <Handle type="target" position={Position.Top}    className="!bg-gray-600 !border-gray-700 !w-2 !h-2" />

      {d.role === "current" && (
        <div className="text-[9px] text-orange-400 uppercase tracking-wider mb-1 font-medium">● current position</div>
      )}
      {d.role === "trigger" && (
        <div className="text-[9px] text-yellow-400 uppercase tracking-wider mb-1 font-medium">⚡ watch trigger</div>
      )}

      <div className="text-sm font-semibold text-white leading-tight">{d.label}</div>
      {d.eventType && (
        <div className="text-[10px] font-mono text-gray-500 mt-1 truncate">{d.eventType}</div>
      )}
      {d.slaHours && (
        <div className="text-[9px] text-yellow-600 mt-1">SLA {d.slaHours}h</div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-gray-600 !border-gray-700 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { watch: WatchNode }

// ---------------------------------------------------------------------------
// Layout (topological layers)
// ---------------------------------------------------------------------------

function computeLayout(nodes: BusinessNode[]) {
  const inDegree = new Map(nodes.map((n) => [n.id, 0]))
  for (const n of nodes) {
    for (const e of n.downstream) inDegree.set(e.node, (inDegree.get(e.node) ?? 0) + 1)
  }
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const layers  = new Map<string, number>()

  const roots = nodes.filter((n) => inDegree.get(n.id) === 0)
  const seeds = roots.length > 0 ? roots : [nodes.reduce((a, b) => (inDegree.get(a.id)! <= inDegree.get(b.id)! ? a : b))]
  const queue   = seeds.map((n) => n.id)
  const visited = new Set<string>(queue)
  for (const id of queue) layers.set(id, 0)

  let head = 0
  while (head < queue.length) {
    const id = queue[head++]
    for (const e of nodeMap.get(id)?.downstream ?? []) {
      const d = (layers.get(id) ?? 0) + 1
      if (!layers.has(e.node) || (layers.get(e.node) ?? 0) < d) layers.set(e.node, d)
      if (!visited.has(e.node)) { visited.add(e.node); queue.push(e.node) }
    }
  }

  for (const n of nodes) {
    if (!layers.has(n.id)) layers.set(n.id, 0)
  }
  const byLayer = new Map<number, string[]>()
  for (const [id, l] of layers) { const a = byLayer.get(l) ?? []; a.push(id); byLayer.set(l, a) }
  const positions: { id: string; x: number; y: number }[] = []
  const W = 190, H = 100, HG = 50, VG = 70
  for (const [layer, ids] of byLayer) {
    const total = ids.length * W + (ids.length - 1) * HG
    ids.forEach((id, i) => positions.push({ id, x: i * (W + HG) - total / 2 + W / 2, y: layer * (H + VG) }))
  }
  return positions
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export default function WatchGraph({ businessNodes, currentNode, triggerEventTypes }: WatchGraphProps) {
  const [selected, setSelected] = useState<NodeData | null>(null)

  const triggerNodeIds = new Set(
    businessNodes.filter((n) => n.event_type && triggerEventTypes.includes(n.event_type)).map((n) => n.id),
  )

  const positions = computeLayout(businessNodes)
  const posMap    = new Map(positions.map((p) => [p.id, p]))

  const initialNodes: Node[] = businessNodes.map((n) => {
    const role: NodeRole = n.id === currentNode ? "current" : triggerNodeIds.has(n.id) ? "trigger" : "normal"
    return {
      id:       n.id,
      type:     "watch",
      position: posMap.get(n.id) ?? { x: 0, y: 0 },
      data: { label: n.label, eventType: n.event_type, slaHours: n.sla_hours, role } satisfies NodeData,
    }
  })

  const initialEdges: Edge[] = businessNodes.flatMap((n) =>
    n.downstream.map((e) => ({
      id:     `${n.id}->${e.node}`,
      source: n.id,
      target: e.node,
      style:  { stroke: "#374151", strokeWidth: 1.5 },
    })),
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  return (
    <div className="flex flex-col gap-3 flex-1 min-h-0">
      {/* Legend */}
      <div className="flex gap-4 text-[10px] text-gray-500 flex-shrink-0">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-orange-500 inline-block" /> Entity&apos;s current position</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" /> Watch trigger target</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-600 inline-block" /> Other nodes</span>
      </div>

      {/* Flow */}
      <div className="flex-1 rounded-lg border border-gray-800 overflow-hidden bg-gray-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={(_, node) => setSelected(node.data as NodeData)}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          colorMode="dark"
          minZoom={0.25}
          maxZoom={2}
        >
          <Background color="#1f2937" gap={20} />
          <Controls className="!bg-gray-900 !border-gray-700" />
        </ReactFlow>
      </div>
    </div>
  )
}
