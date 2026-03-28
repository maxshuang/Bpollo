import { GRAPH_SERVICE_URL } from "@/lib/config"

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
  llm_description: string
  sla_hours:       number | null
  downstream:      DownstreamEdge[]
}

interface GlobalGraph {
  version: string
  name:    string
  nodes:   GraphNode[]
}

async function fetchGraph(): Promise<GlobalGraph | null> {
  try {
    const res = await fetch(`${GRAPH_SERVICE_URL}/graph/definition`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export default async function GraphPage() {
  const graph = await fetchGraph()

  if (!graph) {
    return (
      <div className="text-center py-20">
        <p className="text-red-400 text-sm">Graph Service unavailable — is it running on port 3002?</p>
      </div>
    )
  }

  // Build upstream index for display
  const upstreamOf = new Map<string, string[]>()
  for (const node of graph.nodes) {
    for (const edge of node.downstream) {
      const list = upstreamOf.get(edge.node) ?? []
      list.push(node.id)
      upstreamOf.set(edge.node, list)
    }
  }

  const nodeById = new Map(graph.nodes.map((n) => [n.id, n]))

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-xl font-bold text-white">{graph.name}</h1>
        <p className="text-xs text-gray-500 mt-1">v{graph.version} · {graph.nodes.length} nodes</p>
      </div>

      <div className="grid gap-4">
        {graph.nodes.map((node) => {
          const upstream = upstreamOf.get(node.id) ?? []
          return (
            <div key={node.id} className="border border-gray-800 rounded-lg p-5 bg-gray-900 hover:border-gray-700 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-white font-semibold">{node.label}</span>
                    {node.event_type && (
                      <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded font-mono">
                        {node.event_type}
                      </span>
                    )}
                    {node.sla_hours && (
                      <span className="text-xs bg-yellow-900 text-yellow-300 px-2 py-0.5 rounded">
                        SLA {node.sla_hours}h
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{node.description}</p>
                  <p className="text-xs text-gray-600 italic">{node.llm_description}</p>
                </div>
              </div>

              <div className="mt-4 flex gap-8 text-xs text-gray-500">
                {upstream.length > 0 && (
                  <div>
                    <span className="text-gray-600 uppercase tracking-wider">From</span>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      {upstream.map((id) => (
                        <span key={id} className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                          {nodeById.get(id)?.label ?? id}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {node.downstream.length > 0 && (
                  <div>
                    <span className="text-gray-600 uppercase tracking-wider">Next</span>
                    <div className="mt-1 flex gap-2 flex-wrap">
                      {node.downstream.map((edge) => (
                        <span key={edge.node} className="bg-gray-800 text-gray-300 px-2 py-0.5 rounded">
                          {edge.label}
                          {edge.sla_hours && <span className="text-gray-500 ml-1">·{edge.sla_hours}h</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {node.downstream.length === 0 && (
                  <span className="text-gray-700 italic">terminal node</span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
