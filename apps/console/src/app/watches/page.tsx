import Link from "next/link"
import { WATCH_MANAGER_URL } from "@/lib/config"

interface Watch {
  watch_id:    string
  entity_id:   string
  tenant_id:   string
  status:      string
  risk_level:  string
  reason:      string
  created_at:  string
  expires_at:  string
  triggered_at: string | null
}

async function fetchWatches(): Promise<Watch[]> {
  try {
    const res = await fetch(`${WATCH_MANAGER_URL}/watches/recent?limit=100`, {
      next: { revalidate: 5 },
    })
    if (!res.ok) return []
    return (await res.json()).watches ?? []
  } catch { return [] }
}

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

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 60)  return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24)   return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

export default async function WatchesPage() {
  const watches = await fetchWatches()

  const byStatus = watches.reduce<Record<string, number>>((acc, w) => {
    acc[w.status] = (acc[w.status] ?? 0) + 1
    return acc
  }, {})

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
          <Link href="/" className="hover:text-gray-400">Home</Link>
          <span>/</span>
          <span className="text-gray-400">Watches</span>
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Watches</h1>
            <p className="text-sm text-gray-500 mt-1">{watches.length} total</p>
          </div>
          {/* Status summary pills */}
          {watches.length > 0 && (
            <div className="flex gap-2">
              {Object.entries(byStatus).map(([status, count]) => (
                <span key={status} className={`text-[10px] px-2 py-0.5 rounded border ${STATUS_COLORS[status] ?? STATUS_COLORS.expired}`}>
                  {count} {status}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      {watches.length === 0 ? (
        <div className="border border-gray-800 rounded-xl p-12 text-center">
          <p className="text-gray-600 text-sm">No watches found</p>
          <p className="text-gray-700 text-xs mt-1">Watch Manager may be offline, or no watches have been created yet.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {watches.map((w) => (
            <Link key={w.watch_id} href={`/watches/${w.watch_id}`}>
              <div className="border border-gray-800 bg-gray-900 rounded-xl px-5 py-4 hover:border-gray-600 hover:bg-gray-800/60 transition-all group cursor-pointer">
                <div className="flex items-center gap-4">
                  {/* Status */}
                  <span className={`text-[10px] px-2 py-0.5 rounded border font-medium flex-shrink-0 w-20 text-center ${STATUS_COLORS[w.status] ?? STATUS_COLORS.expired}`}>
                    {w.status}
                  </span>

                  {/* Entity info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-gray-200 truncate">{w.entity_id}</span>
                      <span className="text-[10px] text-gray-600">·</span>
                      <span className="text-[10px] text-gray-500 truncate">{w.tenant_id}</span>
                    </div>
                    <p className="text-xs text-gray-500 truncate">{w.reason}</p>
                  </div>

                  {/* Risk */}
                  <span className={`text-xs font-semibold flex-shrink-0 ${RISK_COLORS[w.risk_level] ?? ""}`}>
                    {w.risk_level}
                  </span>

                  {/* Time */}
                  <span className="text-[10px] text-gray-600 flex-shrink-0 w-16 text-right">
                    {timeAgo(w.created_at)}
                  </span>

                  <span className="text-gray-700 group-hover:text-indigo-400 transition-colors text-xs">→</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
