import Link from "next/link"
import { GRAPH_SERVICE_URL, WATCH_MANAGER_URL } from "@/lib/config"
import { personalGraphs } from "@/data/personalGraphs"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface WatchSummary {
  watch_id:   string
  entity_id:  string
  tenant_id:  string
  status:     string
  risk_level: string
  reason:     string
  expires_at: string
}

interface BusinessGraph {
  name:    string
  version: string
  nodes:   { id: string }[]
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchBusinessGraph(): Promise<BusinessGraph | null> {
  try {
    const res = await fetch(`${GRAPH_SERVICE_URL}/graph/definition`, {
      next: { revalidate: 30 },
    })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function fetchRecentWatches(): Promise<WatchSummary[]> {
  try {
    const res = await fetch(`${WATCH_MANAGER_URL}/watches/recent`, {
      next: { revalidate: 10 },
    })
    if (!res.ok) return []
    const body = await res.json()
    return body.watches ?? []
  } catch { return [] }
}

// ---------------------------------------------------------------------------
// UI helpers
// ---------------------------------------------------------------------------

const STATUS_COLORS: Record<string, string> = {
  waiting:   "bg-blue-900/40 text-blue-300 border-blue-800",
  triggered: "bg-yellow-900/40 text-yellow-300 border-yellow-800",
  running:   "bg-indigo-900/40 text-indigo-300 border-indigo-800",
  resolved:  "bg-green-900/40 text-green-300 border-green-800",
  escalated: "bg-red-900/40 text-red-300 border-red-800",
  expired:   "bg-gray-800 text-gray-500 border-gray-700",
}

const RISK_COLORS: Record<string, string> = {
  low:      "text-green-400",
  medium:   "text-yellow-400",
  high:     "text-orange-400",
  critical: "text-red-400",
}

const GRAPH_TAG_COLORS = [
  "bg-indigo-900/40 text-indigo-300",
  "bg-purple-900/40 text-purple-300",
  "bg-teal-900/40 text-teal-300",
]

// ---------------------------------------------------------------------------
// Home page
// ---------------------------------------------------------------------------

export default async function HomePage() {
  const [businessGraph, recentWatches] = await Promise.all([
    fetchBusinessGraph(),
    fetchRecentWatches(),
  ])

  return (
    <div className="space-y-14">

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Console</h1>
        <p className="text-sm text-gray-500 mt-1">Bpollo internal state inspector</p>
      </div>

      {/* Business Graph */}
      <section>
        <SectionHeader title="Business Graph" count={1} href="/graph" />
        <div className="mt-4">
          {businessGraph ? (
            <Link href="/graph">
              <div className="border border-indigo-800 bg-indigo-950/20 rounded-xl p-6 hover:border-indigo-600 hover:bg-indigo-950/40 transition-all group cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-white font-semibold text-base group-hover:text-indigo-300 transition-colors">
                      {businessGraph.name}
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">
                      v{businessGraph.version} · {businessGraph.nodes.length} nodes · shared across all tenants
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs bg-indigo-900 text-indigo-300 px-2 py-0.5 rounded">system</span>
                    <span className="text-gray-600 group-hover:text-indigo-400 transition-colors">→</span>
                  </div>
                </div>
                <p className="text-sm text-gray-400 mt-3">
                  The global business process graph — defines every valid state transition an entity can move through.
                  Used by graph-service to track entity positions and compute SLA violations.
                </p>
              </div>
            </Link>
          ) : (
            <div className="border border-gray-800 rounded-xl p-6 text-sm text-gray-600 italic">
              Graph Service unavailable — start it on port 3002
            </div>
          )}
        </div>
      </section>

      {/* Personal Graphs */}
      <section>
        <SectionHeader title="Personal Graphs" count={personalGraphs.length} href="/personal-graphs" />
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {personalGraphs.map((pg, i) => (
            <Link key={pg.id} href={`/personal-graphs/${pg.id}`}>
              <div className="border border-gray-800 bg-gray-900 rounded-xl p-5 hover:border-gray-600 hover:bg-gray-800/60 transition-all group cursor-pointer h-full flex flex-col">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-white font-semibold text-sm group-hover:text-indigo-300 transition-colors leading-tight">
                    {pg.name}
                  </h3>
                  <span className="text-gray-600 group-hover:text-indigo-400 transition-colors text-xs ml-2 flex-shrink-0">→</span>
                </div>
                <p className="text-xs text-gray-500 mb-3 flex-1 leading-relaxed">{pg.description}</p>
                <div className="flex items-center justify-between mt-auto pt-3 border-t border-gray-800">
                  <div className="flex gap-1 flex-wrap">
                    {pg.tags.map((tag, j) => (
                      <span key={tag} className={`text-[10px] px-1.5 py-0.5 rounded ${GRAPH_TAG_COLORS[(i + j) % GRAPH_TAG_COLORS.length]}`}>
                        {tag}
                      </span>
                    ))}
                  </div>
                  <span className="text-[10px] text-gray-600">{pg.nodes.length} nodes</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Watches */}
      <section>
        <SectionHeader title="Watches" count={recentWatches.length} href="/watches" />
        <div className="mt-4">
          {recentWatches.length === 0 ? (
            <div className="border border-gray-800 rounded-xl p-6 text-sm text-gray-600 italic">
              No active watches — Watch Manager may be offline, or no watches have been created yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {recentWatches.map((w) => (
                <Link key={w.watch_id} href={`/watches/${w.watch_id}`}>
                  <div className="border border-gray-800 bg-gray-900 rounded-xl px-5 py-4 hover:border-gray-600 hover:bg-gray-800/60 transition-all group cursor-pointer flex items-center gap-4">
                    <span className={`text-[10px] px-2 py-0.5 rounded border font-medium flex-shrink-0 ${STATUS_COLORS[w.status] ?? STATUS_COLORS.expired}`}>
                      {w.status}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono text-gray-300 truncate">{w.entity_id}</span>
                        <span className="text-[10px] text-gray-600">·</span>
                        <span className="text-[10px] text-gray-500">{w.tenant_id}</span>
                      </div>
                      <p className="text-xs text-gray-500 mt-0.5 truncate">{w.reason}</p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ${RISK_COLORS[w.risk_level] ?? ""}`}>
                      {w.risk_level}
                    </span>
                    <span className="text-gray-600 group-hover:text-indigo-400 transition-colors text-xs">→</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

    </div>
  )
}

function SectionHeader({ title, count, href }: { title: string; count: number; href: string }) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-bold text-white">{title}</h2>
        <span className="text-xs text-gray-600 bg-gray-800 px-2 py-0.5 rounded-full">{count}</span>
      </div>
      <Link href={href} className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors">
        View all →
      </Link>
    </div>
  )
}
