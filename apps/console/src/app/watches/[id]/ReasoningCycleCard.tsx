"use client"

import { useState } from "react"

interface ReasoningCycle {
  id:                 string
  reasoning_cycle_id: string
  status:             string
  agent_reasoning:    string | null
  tools_called:       string[]
  steps_used:         number | null
  error_message:      string | null
  started_at:         string
  completed_at:       string | null
}

const STATUS_STYLES: Record<string, string> = {
  completed: "text-green-400",
  failed:    "text-red-400",
  running:   "text-yellow-400",
}

const TOOL_COLORS: Record<string, string> = {
  resolveWatch:   "bg-green-900/40 text-green-300",
  escalateWatch:  "bg-red-900/40 text-red-300",
  extendWatch:    "bg-blue-900/40 text-blue-300",
  spawnWatch:     "bg-purple-900/40 text-purple-300",
  dispatchAlert:  "bg-orange-900/40 text-orange-300",
  standDown:      "bg-gray-800 text-gray-400",
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium", timeStyle: "short",
  })
}

export default function ReasoningCycleCard({ cycle }: { cycle: ReasoningCycle }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-gray-800/60 rounded-lg p-3 text-[10px]">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`font-semibold ${STATUS_STYLES[cycle.status] ?? "text-gray-400"}`}>
            {cycle.status}
          </span>
          {cycle.steps_used != null && (
            <span className="text-gray-600">{cycle.steps_used} step{cycle.steps_used !== 1 ? "s" : ""}</span>
          )}
        </div>
        <span className="text-gray-700">{fmt(cycle.started_at)}</span>
      </div>

      {/* Tools called */}
      {cycle.tools_called.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-2">
          {cycle.tools_called.map((tool, i) => (
            <span
              key={i}
              className={`px-1.5 py-0.5 rounded text-[9px] font-medium ${TOOL_COLORS[tool] ?? "bg-gray-700 text-gray-300"}`}
            >
              {tool}
            </span>
          ))}
        </div>
      )}

      {/* Error */}
      {cycle.error_message && (
        <div className="text-red-400/80 mb-2 font-mono text-[9px] break-words">
          {cycle.error_message}
        </div>
      )}

      {/* Agent reasoning — expandable */}
      {cycle.agent_reasoning && (
        <div>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-indigo-400/70 hover:text-indigo-400 transition-colors text-[9px] mb-1.5"
          >
            {expanded ? "Hide reasoning" : "Show reasoning"}
          </button>
          {expanded && (
            <p className="text-gray-400 leading-relaxed whitespace-pre-wrap border-l-2 border-indigo-900/60 pl-2 mt-1">
              {cycle.agent_reasoning}
            </p>
          )}
        </div>
      )}

      {/* Cycle ID — for debugging */}
      <div className="text-gray-700 font-mono mt-1.5 truncate" title={cycle.reasoning_cycle_id}>
        {cycle.reasoning_cycle_id.slice(0, 16)}…
      </div>
    </div>
  )
}
