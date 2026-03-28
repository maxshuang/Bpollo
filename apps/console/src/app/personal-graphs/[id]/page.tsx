import Link from "next/link"
import { notFound } from "next/navigation"
import { personalGraphs } from "@/data/personalGraphs"
import PersonalGraphCanvas from "./PersonalGraphCanvas"

export default function PersonalGraphDetailPage({ params }: { params: { id: string } }) {
  const graph = personalGraphs.find((g) => g.id === params.id)
  if (!graph) notFound()

  return (
    <div style={{ height: "calc(100vh - 100px)" }} className="flex flex-col">
      {/* Breadcrumb + header */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-2">
          <Link href="/" className="hover:text-gray-400">Home</Link>
          <span>/</span>
          <Link href="/personal-graphs" className="hover:text-gray-400">Personal Graphs</Link>
          <span>/</span>
          <span className="text-gray-400">{graph.name}</span>
        </div>
        <div className="flex items-baseline justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">{graph.name}</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              {graph.owner} · {graph.nodes.length} nodes · {graph.edges.length} edges
            </p>
          </div>
          <div className="flex gap-1">
            {graph.tags.map((tag) => (
              <span key={tag} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400">{tag}</span>
            ))}
          </div>
        </div>
      </div>

      <PersonalGraphCanvas graph={graph} />
    </div>
  )
}
