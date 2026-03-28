"use client"

import { useCallback, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { PersonalGraph, PersonalNode } from "@/data/personalGraphs"

// ---------------------------------------------------------------------------
// Color mapping
// ---------------------------------------------------------------------------

const NODE_STYLES: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  indigo: { border: "border-indigo-700",  bg: "bg-indigo-950/60",  text: "text-indigo-200", dot: "#4f46e5" },
  green:  { border: "border-green-700",   bg: "bg-green-950/60",   text: "text-green-200",  dot: "#16a34a" },
  orange: { border: "border-orange-700",  bg: "bg-orange-950/60",  text: "text-orange-200", dot: "#ea580c" },
  red:    { border: "border-red-700",     bg: "bg-red-950/60",     text: "text-red-200",    dot: "#dc2626" },
  purple: { border: "border-purple-700",  bg: "bg-purple-950/60",  text: "text-purple-200", dot: "#9333ea" },
}

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

interface NodeData extends Record<string, unknown> {
  label:       string
  description: string
  color:       string
}

function PersonalNode({ data, selected }: NodeProps) {
  const d      = data as NodeData
  const styles = NODE_STYLES[d.color] ?? NODE_STYLES.indigo
  return (
    <div className={`rounded-lg border px-4 py-3 w-48 transition-all ${styles.border} ${styles.bg} ${selected ? "ring-2 ring-white/30" : ""}`}>
      <Handle type="target" position={Position.Top}    className="!bg-gray-500 !border-gray-600 !w-2 !h-2" />
      <div className={`font-semibold text-sm leading-tight mb-1 ${styles.text}`}>{d.label}</div>
      <div className="text-[11px] text-gray-400 leading-snug">{d.description}</div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !border-gray-600 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { personal: PersonalNode }

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

const NODE_W = 200
const NODE_H = 100
const H_GAP  = 60
const V_GAP  = 70

function computeLayout(nodes: PersonalNode[], edges: { from: string; to: string }[]) {
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (const e of edges) {
    inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
  }

  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    const list = adjacency.get(e.from) ?? []
    list.push(e.to)
    adjacency.set(e.from, list)
  }

  const layers = new Map<string, number>()
  const queue  = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id)
  for (const id of queue) layers.set(id, 0)

  // Use visited set to prevent infinite loops in graphs with cycles
  const visited = new Set<string>(queue)
  let head = 0
  while (head < queue.length) {
    const id = queue[head++]
    for (const next of adjacency.get(id) ?? []) {
      const depth = (layers.get(id) ?? 0) + 1
      if (!layers.has(next) || (layers.get(next) ?? 0) < depth) {
        layers.set(next, depth)
      }
      if (!visited.has(next)) {
        visited.add(next)
        queue.push(next)
      }
    }
  }

  const byLayer = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    const arr = byLayer.get(layer) ?? []; arr.push(id); byLayer.set(layer, arr)
  }

  const positions: { id: string; x: number; y: number }[] = []
  for (const [layer, ids] of byLayer) {
    const totalW = ids.length * NODE_W + (ids.length - 1) * H_GAP
    ids.forEach((id, i) => {
      positions.push({
        id,
        x: i * (NODE_W + H_GAP) - totalW / 2 + NODE_W / 2,
        y: layer * (NODE_H + V_GAP),
      })
    })
  }
  return positions
}

// ---------------------------------------------------------------------------
// Canvas
// ---------------------------------------------------------------------------

export default function PersonalGraphCanvas({ graph }: { graph: PersonalGraph }) {
  const [selected, setSelected] = useState<PersonalNode | null>(null)

  const positions = computeLayout(graph.nodes, graph.edges)
  const posMap    = new Map(positions.map((p) => [p.id, p]))
  const nodeMap   = new Map(graph.nodes.map((n) => [n.id, n]))

  const initialNodes: Node[] = graph.nodes.map((n) => ({
    id:       n.id,
    type:     "personal",
    position: posMap.get(n.id) ?? { x: 0, y: 0 },
    data: { label: n.label, description: n.description, color: n.color } satisfies NodeData,
  }))

  const initialEdges: Edge[] = graph.edges.map((e, i) => ({
    id:           `e-${i}`,
    source:       e.from,
    target:       e.to,
    label:        e.label,
    labelStyle:   { fill: "#6b7280", fontSize: 10 },
    labelBgStyle: { fill: "#111827" },
    style:        { stroke: "#4b5563", strokeWidth: 1.5 },
  }))

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => setSelected(nodeMap.get(node.id) ?? null),
    [nodeMap],
  )

  const styles = NODE_STYLES[selected?.color ?? "indigo"]

  return (
    <div className="flex gap-4 flex-1 min-h-0">
      <div className="flex-1 rounded-lg border border-gray-800 overflow-hidden bg-gray-950">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          colorMode="dark"
          minZoom={0.3}
          maxZoom={2}
        >
          <Background color="#1f2937" gap={20} />
          <Controls className="!bg-gray-900 !border-gray-700" />
          <MiniMap
            nodeColor={(n) => NODE_STYLES[(n.data as NodeData).color]?.dot ?? "#4f46e5"}
            maskColor="rgba(0,0,0,0.6)"
            className="!bg-gray-900 !border-gray-700"
          />
        </ReactFlow>
      </div>

      {/* Detail panel */}
      <div className="w-64 flex-shrink-0 rounded-lg border border-gray-800 bg-gray-900 p-5 overflow-y-auto">
        {selected ? (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className={`font-bold text-sm leading-tight ${styles.text}`}>{selected.label}</h3>
              <button onClick={() => setSelected(null)} className="text-gray-600 hover:text-gray-300 text-xs ml-2">✕</button>
            </div>
            <p className="text-xs text-gray-400 leading-relaxed">{selected.description}</p>

            {/* Outgoing edges */}
            {(() => {
              const outgoing = graph.edges.filter((e) => e.from === selected.id)
              if (outgoing.length === 0) return (
                <p className="text-xs text-purple-400 italic mt-4">Terminal node</p>
              )
              return (
                <div className="mt-4">
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Leads to</p>
                  <div className="flex flex-col gap-1.5">
                    {outgoing.map((e, i) => {
                      const target = nodeMap.get(e.to)
                      const ts     = NODE_STYLES[target?.color ?? "indigo"]
                      return (
                        <div
                          key={i}
                          className={`text-xs px-2 py-1.5 rounded border cursor-pointer ${ts.border} ${ts.bg} hover:opacity-80`}
                          onClick={() => setSelected(target ?? null)}
                        >
                          <span className={ts.text}>{target?.label ?? e.to}</span>
                          {e.label && <span className="text-gray-600 ml-1 text-[10px]">· {e.label}</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-600 text-xs">Click a node to inspect it</p>
          </div>
        )}
      </div>
    </div>
  )
}
