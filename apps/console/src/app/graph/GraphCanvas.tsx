"use client"

import { useCallback, useMemo, useState } from "react"
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  type Node,
  type Edge,
  type NodeProps,
  Handle,
  Position,
  useNodesState,
  useEdgesState,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DownstreamEdge {
  node:      string
  label:     string
  sla_hours: number | null
}

interface GraphNode {
  id:              string
  label:           string
  event_type:      string | null
  description:     string
  sla_hours:       number | null
  downstream:      DownstreamEdge[]
}

interface NodeData extends Record<string, unknown> {
  label:       string
  event_type:  string | null
  description: string
  sla_hours:   number | null
  isTerminal:  boolean
  isSelected:  boolean
}

// ---------------------------------------------------------------------------
// Custom node
// ---------------------------------------------------------------------------

function ProcessNode({ data, selected }: NodeProps) {
  const d = data as NodeData
  return (
    <div
      className={`
        rounded-lg border px-4 py-3 w-52 text-left transition-all
        ${d.isTerminal
          ? "border-purple-700 bg-purple-950/60"
          : "border-indigo-700 bg-indigo-950/60"}
        ${selected ? "ring-2 ring-white/40" : ""}
      `}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-500 !border-gray-600 !w-2 !h-2" />

      <div className="font-semibold text-sm text-white leading-tight mb-1">{d.label}</div>

      {d.event_type && (
        <div className="text-[10px] font-mono text-indigo-300 bg-indigo-900/50 px-1.5 py-0.5 rounded inline-block mb-1.5">
          {d.event_type}
        </div>
      )}

      <div className="text-[11px] text-gray-400 leading-snug">{d.description}</div>

      {d.sla_hours && (
        <div className="mt-2 text-[10px] text-yellow-400 bg-yellow-900/30 px-1.5 py-0.5 rounded inline-block">
          SLA {d.sla_hours}h
        </div>
      )}

      {d.isTerminal && (
        <div className="mt-2 text-[10px] text-purple-400 italic">terminal</div>
      )}

      <Handle type="source" position={Position.Bottom} className="!bg-gray-500 !border-gray-600 !w-2 !h-2" />
    </div>
  )
}

const nodeTypes = { process: ProcessNode }

// ---------------------------------------------------------------------------
// Layout: topological layers → evenly spaced x/y
// ---------------------------------------------------------------------------

const NODE_W = 210
const NODE_H = 140
const H_GAP  = 60
const V_GAP  = 80

function computeLayout(nodes: GraphNode[]): { id: string; x: number; y: number }[] {
  // BFS from roots to compute depth (layer)
  const inDegree = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  for (const n of nodes) {
    for (const e of n.downstream) {
      inDegree.set(e.node, (inDegree.get(e.node) ?? 0) + 1)
    }
  }

  const layers = new Map<string, number>()
  const queue  = nodes.filter((n) => inDegree.get(n.id) === 0).map((n) => n.id)
  for (const id of queue) layers.set(id, 0)

  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  let head = 0
  while (head < queue.length) {
    const id  = queue[head++]
    const node = nodeMap.get(id)!
    for (const e of node.downstream) {
      const newDepth = (layers.get(id) ?? 0) + 1
      if (!layers.has(e.node) || (layers.get(e.node) ?? 0) < newDepth) {
        layers.set(e.node, newDepth)
      }
      queue.push(e.node)
    }
  }

  // Group by layer
  const byLayer = new Map<number, string[]>()
  for (const [id, layer] of layers) {
    const arr = byLayer.get(layer) ?? []
    arr.push(id)
    byLayer.set(layer, arr)
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
// Main canvas
// ---------------------------------------------------------------------------

interface Props {
  graphNodes: GraphNode[]
  graphName:  string
  version:    string
}

export default function GraphCanvas({ graphNodes, graphName, version }: Props) {
  const [selected, setSelected] = useState<GraphNode | null>(null)

  const terminalIds = new Set(
    graphNodes.filter((n) => n.downstream.length === 0).map((n) => n.id),
  )

  const positions = computeLayout(graphNodes)
  const posMap    = new Map(positions.map((p) => [p.id, p]))

  const initialNodes: Node[] = graphNodes.map((n) => {
    const pos = posMap.get(n.id) ?? { x: 0, y: 0 }
    return {
      id:       n.id,
      type:     "process",
      position: { x: pos.x, y: pos.y },
      data: {
        label:       n.label,
        event_type:  n.event_type,
        description: n.description,
        sla_hours:   n.sla_hours,
        isTerminal:  terminalIds.has(n.id),
        isSelected:  false,
      } satisfies NodeData,
    }
  })

  const initialEdges: Edge[] = graphNodes.flatMap((n) =>
    n.downstream.map((e) => ({
      id:            `${n.id}->${e.node}`,
      source:        n.id,
      target:        e.node,
      label:         e.sla_hours ? `${e.sla_hours}h` : undefined,
      labelStyle:    { fill: "#6b7280", fontSize: 10 },
      labelBgStyle:  { fill: "#111827" },
      style:         { stroke: "#4b5563", strokeWidth: 1.5 },
      animated:      false,
    })),
  )

  const [nodes, , onNodesChange] = useNodesState(initialNodes)
  const [edges, , onEdgesChange] = useEdgesState(initialEdges)

  const nodeMap = useMemo(() => new Map(graphNodes.map((n) => [n.id, n])), [graphNodes])

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelected(nodeMap.get(node.id) ?? null)
    },
    [nodeMap],
  )

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-baseline gap-3 mb-4 flex-shrink-0">
        <h1 className="text-xl font-bold text-white">{graphName}</h1>
        <span className="text-xs text-gray-500">v{version} · {graphNodes.length} nodes</span>
      </div>

      {/* Canvas + detail panel */}
      <div className="flex gap-4 flex-1 min-h-0">
        {/* Flow */}
        <div className="flex-1 rounded-lg border border-gray-800 overflow-hidden bg-gray-950">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            colorMode="dark"
            minZoom={0.3}
            maxZoom={2}
          >
            <Background color="#1f2937" gap={20} />
            <Controls className="!bg-gray-900 !border-gray-700 !text-gray-300" />
            <MiniMap
              nodeColor={(n) =>
                (n.data as NodeData).isTerminal ? "#581c87" : "#1e1b4b"
              }
              maskColor="rgba(0,0,0,0.6)"
              className="!bg-gray-900 !border-gray-700"
            />
          </ReactFlow>
        </div>

        {/* Detail panel */}
        <div className="w-72 flex-shrink-0 rounded-lg border border-gray-800 bg-gray-900 p-5 overflow-y-auto">
          {selected ? (
            <>
              <div className="flex items-start justify-between mb-3">
                <h2 className="font-bold text-white text-sm leading-tight">{selected.label}</h2>
                <button
                  onClick={() => setSelected(null)}
                  className="text-gray-600 hover:text-gray-300 text-xs ml-2"
                >✕</button>
              </div>

              {selected.event_type && (
                <div className="font-mono text-xs text-indigo-300 bg-indigo-900/40 px-2 py-1 rounded mb-3">
                  {selected.event_type}
                </div>
              )}

              {selected.sla_hours && (
                <div className="text-xs text-yellow-400 mb-3">
                  SLA deadline: <strong>{selected.sla_hours}h</strong>
                </div>
              )}

              <p className="text-sm text-gray-300 mb-4 leading-relaxed">{selected.description}</p>

              {selected.downstream.length > 0 && (
                <div>
                  <p className="text-[10px] uppercase tracking-wider text-gray-600 mb-2">Transitions to</p>
                  <div className="flex flex-col gap-2">
                    {selected.downstream.map((e) => (
                      <div
                        key={e.node}
                        className="flex items-center justify-between bg-gray-800 rounded px-3 py-2 text-xs cursor-pointer hover:bg-gray-700"
                        onClick={() => setSelected(nodeMap.get(e.node) ?? null)}
                      >
                        <span className="text-gray-200">{e.label}</span>
                        {e.sla_hours && (
                          <span className="text-gray-500">{e.sla_hours}h</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selected.downstream.length === 0 && (
                <div className="text-xs text-purple-400 italic mt-2">Terminal node — no further transitions</div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-600 text-xs">Click a node to see details</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
