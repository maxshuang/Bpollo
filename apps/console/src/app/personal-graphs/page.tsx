import Link from "next/link"
import { personalGraphs } from "@/data/personalGraphs"

const TAG_COLORS = [
  "bg-indigo-900/40 text-indigo-300",
  "bg-purple-900/40 text-purple-300",
  "bg-teal-900/40 text-teal-300",
  "bg-orange-900/40 text-orange-300",
]

export default function PersonalGraphsPage() {
  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
          <Link href="/" className="hover:text-gray-400">Home</Link>
          <span>/</span>
          <span className="text-gray-400">Personal Graphs</span>
        </div>
        <h1 className="text-xl font-bold text-white">Personal Graphs</h1>
        <p className="text-sm text-gray-500 mt-1">
          Team-defined workflow graphs — custom process views owned by individual teams.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {personalGraphs.map((pg, i) => (
          <Link key={pg.id} href={`/personal-graphs/${pg.id}`}>
            <div className="border border-gray-800 bg-gray-900 rounded-xl p-6 hover:border-gray-600 hover:bg-gray-800/60 transition-all group cursor-pointer h-full flex flex-col">
              <div className="flex items-start justify-between mb-3">
                <h2 className="text-white font-semibold text-sm leading-tight group-hover:text-indigo-300 transition-colors">
                  {pg.name}
                </h2>
                <span className="text-gray-600 group-hover:text-indigo-400 transition-colors ml-2 text-xs flex-shrink-0">→</span>
              </div>

              <p className="text-xs text-gray-500 leading-relaxed flex-1 mb-4">{pg.description}</p>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-[10px] text-gray-600">
                  <span>Owner: <span className="text-gray-400">{pg.owner}</span></span>
                  <span>{pg.nodes.length} nodes · {pg.edges.length} edges</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {pg.tags.map((tag, j) => (
                    <span
                      key={tag}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${TAG_COLORS[(i * 3 + j) % TAG_COLORS.length]}`}
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
