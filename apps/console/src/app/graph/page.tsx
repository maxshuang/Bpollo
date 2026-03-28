import { GRAPH_SERVICE_URL } from "@/lib/config"
import GraphCanvas from "./GraphCanvas"

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

  return (
    <div style={{ height: "calc(100vh - 100px)" }}>
      <GraphCanvas
        graphNodes={graph.nodes}
        graphName={graph.name}
        version={graph.version}
      />
    </div>
  )
}
