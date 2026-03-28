import Link from "next/link"
import { notFound } from "next/navigation"
import { WATCH_MANAGER_URL, GRAPH_SERVICE_URL } from "@/lib/config"
import WatchGraph from "./WatchGraph"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TriggerCondition {
  type:          string
  event_type?:   string
  pattern_name?: string
  deadline?:     string
  filters?:      Record<string, unknown>
}

interface ExpectedSignal {
  event_type: string
  deadline:   string
  required:   boolean
  received:   boolean
}

interface WatchDetail {
  watch_id:           string
  entity_id:          string
  tenant_id:          string
  status:             string
  risk_level:         string
  scope:              string
  reason:             string
  trigger_conditions: TriggerCondition[]
  expected_signals:   ExpectedSignal[]
  graph_snapshot:     Record<string, unknown>
  history:            Record<string, unknown>[]
  created_at:         string
  expires_at:         string
  triggered_at:       string | null
}

interface BusinessNode {
  id:         string
  label:      string
  event_type: string | null
  sla_hours:  number | null
  downstream: { node: string; label: string; sla_hours: number | null }[]
}

// ---------------------------------------------------------------------------
// Data fetching
// ---------------------------------------------------------------------------

async function fetchWatch(id: string): Promise<WatchDetail | null> {
  try {
    const res = await fetch(`${WATCH_MANAGER_URL}/watches/${id}`, { cache: "no-store" })
    if (!res.ok) return null
    return res.json()
  } catch { return null }
}

async function fetchBusinessNodes(): Promise<BusinessNode[]> {
  try {
    const res = await fetch(`${GRAPH_SERVICE_URL}/graph/definition`, { next: { revalidate: 60 } })
    if (!res.ok) return []
    const body = await res.json()
    return body.nodes ?? []
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
  critical: "text-red-500 font-bold",
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium", timeStyle: "short",
  })
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function WatchDetailPage({ params }: { params: { id: string } }) {
  const [watch, businessNodes] = await Promise.all([
    fetchWatch(params.id),
    fetchBusinessNodes(),
  ])

  if (!watch) notFound()

  // Determine entity's current node from graph_snapshot
  const currentNode = (watch.graph_snapshot?.current_node as string | undefined) ?? null

  // Collect event_types that will trigger this watch
  const triggerEventTypes = watch.trigger_conditions
    .filter((c) => c.type === "event_match" && c.event_type)
    .map((c) => c.event_type!)

  return (
    <div style={{ height: "calc(100vh - 80px)" }} className="flex flex-col">
      {/* Breadcrumb */}
      <div className="flex-shrink-0 mb-4">
        <div className="flex items-center gap-2 text-xs text-gray-600 mb-3">
          <Link href="/" className="hover:text-gray-400">Home</Link>
          <span>/</span>
          <Link href="/watches" className="hover:text-gray-400">Watches</Link>
          <span>/</span>
          <span className="text-gray-400 font-mono truncate max-w-48">{watch.watch_id}</span>
        </div>

        {/* Header row */}
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-1">
              <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${STATUS_COLORS[watch.status] ?? STATUS_COLORS.expired}`}>
                {watch.status}
              </span>
              <span className={`text-xs font-semibold ${RISK_COLORS[watch.risk_level] ?? ""}`}>
                {watch.risk_level} risk
              </span>
              <span className="text-[10px] text-gray-600">{watch.scope} scope</span>
            </div>
            <p className="text-white font-semibold text-base">{watch.reason}</p>
            <p className="text-xs text-gray-500 mt-0.5 font-mono">
              {watch.entity_id} · {watch.tenant_id}
            </p>
          </div>

          {/* Meta */}
          <div className="text-right text-[10px] text-gray-600 space-y-0.5 flex-shrink-0">
            <div>Created: <span className="text-gray-400">{fmt(watch.created_at)}</span></div>
            <div>Expires: <span className="text-gray-400">{fmt(watch.expires_at)}</span></div>
            {watch.triggered_at && (
              <div>Triggered: <span className="text-yellow-400">{fmt(watch.triggered_at)}</span></div>
            )}
          </div>
        </div>
      </div>

      {/* Main content: graph + sidebar */}
      <div className="flex gap-4 flex-1 min-h-0">

        {/* Graph */}
        {businessNodes.length > 0 ? (
          <div className="flex-1 flex flex-col min-h-0">
            <WatchGraph
              businessNodes={businessNodes}
              currentNode={currentNode}
              triggerEventTypes={triggerEventTypes}
            />
          </div>
        ) : (
          <div className="flex-1 border border-gray-800 rounded-xl flex items-center justify-center">
            <p className="text-gray-600 text-sm">Graph Service unavailable — entity position cannot be shown</p>
          </div>
        )}

        {/* Sidebar */}
        <div className="w-72 flex-shrink-0 flex flex-col gap-4 overflow-y-auto">

          {/* Trigger conditions */}
          <div className="border border-gray-800 bg-gray-900 rounded-xl p-4">
            <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
              Trigger Conditions ({watch.trigger_conditions.length})
            </h3>
            <div className="space-y-2">
              {watch.trigger_conditions.map((c, i) => (
                <div key={i} className="bg-gray-800 rounded-lg p-3 text-xs">
                  <span className="text-[9px] uppercase tracking-wider text-yellow-500/70">{c.type}</span>
                  {c.event_type && (
                    <div className="font-mono text-yellow-300 mt-1">{c.event_type}</div>
                  )}
                  {c.pattern_name && (
                    <div className="font-mono text-purple-300 mt-1">{c.pattern_name}</div>
                  )}
                  {c.deadline && (
                    <div className="text-gray-400 mt-1">by {fmt(c.deadline)}</div>
                  )}
                  {c.filters && Object.keys(c.filters).length > 0 && (
                    <div className="mt-1.5 text-[10px] text-gray-500">
                      {Object.entries(c.filters).map(([k, v]) => (
                        <div key={k}>{k}: <span className="text-gray-400">{String(v)}</span></div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Expected signals */}
          {watch.expected_signals.length > 0 && (
            <div className="border border-gray-800 bg-gray-900 rounded-xl p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
                Expected Signals ({watch.expected_signals.length})
              </h3>
              <div className="space-y-2">
                {watch.expected_signals.map((s, i) => (
                  <div key={i} className="bg-gray-800 rounded-lg p-3 text-xs">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-mono text-gray-300">{s.event_type}</span>
                      <span className={`text-[9px] ${s.received ? "text-green-400" : "text-gray-600"}`}>
                        {s.received ? "✓ received" : s.required ? "required" : "optional"}
                      </span>
                    </div>
                    <div className="text-[10px] text-gray-500">by {fmt(s.deadline)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* History */}
          {watch.history.length > 0 && (
            <div className="border border-gray-800 bg-gray-900 rounded-xl p-4">
              <h3 className="text-[10px] uppercase tracking-wider text-gray-500 mb-3">
                History ({watch.history.length})
              </h3>
              <div className="space-y-2">
                {watch.history.map((h, i) => (
                  <div key={i} className="text-[10px] text-gray-500 border-l-2 border-gray-700 pl-2">
                    <span className="text-gray-400">{String(h.type ?? "")}</span>
                    {h.event_type && <span className="ml-1 font-mono text-gray-500">{String(h.event_type)}</span>}
                    {h.occurred_at && <div className="text-gray-700">{fmt(String(h.occurred_at))}</div>}
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  )
}
