"use client"

import { useState } from "react"

interface SLAViolation {
  node:                  string
  overdue_hours:         number
  violation_description: string
}

interface DownstreamNode {
  node:      string
  sla_hours?: number
  expected:  boolean
}

interface GraphLocation {
  current_node:        string
  upstream:            string[]
  downstream_expected: DownstreamNode[]
  sla_violations:      SLAViolation[]
}

export default function EntitiesPage() {
  const [entityId, setEntityId] = useState("")
  const [tenantId, setTenantId] = useState("")
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState<string | null>(null)
  const [location, setLocation] = useState<GraphLocation | null>(null)

  async function lookup() {
    if (!entityId || !tenantId) return
    setLoading(true)
    setError(null)
    setLocation(null)

    try {
      // We need a minimal event to call /graph/locate — use a synthetic one
      const res = await fetch("/api/locate", {
        method:  "POST",
        headers: { "content-type": "application/json" },
        body:    JSON.stringify({ entity_id: entityId, tenant_id: tenantId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? `HTTP ${res.status}`)
        return
      }
      setLocation(await res.json())
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-white mb-6">Entity Inspector</h1>

      <div className="flex gap-3 mb-8">
        <input
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-64"
          placeholder="entity_id"
          value={entityId}
          onChange={(e) => setEntityId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <input
          className="bg-gray-900 border border-gray-700 rounded px-3 py-2 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 w-48"
          placeholder="tenant_id"
          value={tenantId}
          onChange={(e) => setTenantId(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && lookup()}
        />
        <button
          onClick={lookup}
          disabled={loading || !entityId || !tenantId}
          className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm px-4 py-2 rounded transition-colors"
        >
          {loading ? "..." : "Locate"}
        </button>
      </div>

      {error && (
        <div className="border border-red-800 bg-red-950 rounded p-4 text-sm text-red-300 mb-6">
          {error}
        </div>
      )}

      {location && (
        <div className="space-y-6">
          {/* Current state */}
          <div className="border border-indigo-800 bg-indigo-950/30 rounded-lg p-5">
            <div className="text-xs text-indigo-400 uppercase tracking-wider mb-1">Current State</div>
            <div className="text-2xl font-bold text-white font-mono">{location.current_node}</div>
          </div>

          {/* SLA violations */}
          {location.sla_violations.length > 0 && (
            <div className="border border-red-800 bg-red-950/20 rounded-lg p-5">
              <div className="text-xs text-red-400 uppercase tracking-wider mb-3">
                SLA Violations ({location.sla_violations.length})
              </div>
              <div className="space-y-2">
                {location.sla_violations.map((v, i) => (
                  <div key={i} className="text-sm text-red-300">
                    <span className="text-red-500 font-bold">+{v.overdue_hours}h</span>{" "}
                    {v.violation_description}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Graph position */}
          <div className="grid grid-cols-2 gap-4">
            <div className="border border-gray-800 bg-gray-900 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Upstream</div>
              {location.upstream.length === 0 ? (
                <span className="text-sm text-gray-600 italic">origin node</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {location.upstream.map((node) => (
                    <span key={node} className="text-sm bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">
                      {node}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="border border-gray-800 bg-gray-900 rounded-lg p-4">
              <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">Expected Next</div>
              {location.downstream_expected.length === 0 ? (
                <span className="text-sm text-gray-600 italic">terminal node</span>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {location.downstream_expected.map((d) => (
                    <span key={d.node} className="text-sm bg-gray-800 text-gray-300 px-2 py-1 rounded font-mono">
                      {d.node}
                      {d.sla_hours && <span className="text-gray-500 text-xs ml-1">·{d.sla_hours}h</span>}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
