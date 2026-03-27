<p align="center">
  <img src="assets/icon.png" width="120" alt="Bpollo">
</p>

<h1 align="center">Bpollo</h1>

<p align="center">
  An AI-native, event-driven business copilot — where an LLM reasoning agent is the orchestrator, not a plugin.
</p>

---

## What is Bpollo?

Bpollo (inspired by Apollo) is a proactive business intelligence framework where **AI reasoning sits at the center of the system**, not at the edge. Instead of using an LLM to summarize outputs after the fact, Bpollo's agent actively orchestrates the entire decision pipeline: it reads the business flow, weighs historical evidence, decides what needs watching, and tells the rest of the system what to do.

The result is a system that understands *why* something matters — not just *that* something happened.

It models any business process as a flow graph — a sequence of states and expected transitions. For example:

```
inspection → issue / action → investigation → market → insurance
```

When an event deviates from the expected flow, the AI agent reasons over the deviation, retrieves historical patterns, and decides whether to create a **dynamic watch** — a time-bounded monitor tracking whether expected follow-up events arrive. If they don't, Bpollo acts proactively.

Bpollo is domain-agnostic: any business process expressible as a flow graph can be monitored this way.

---

## AI as the Orchestrator

Most systems treat AI as a post-processing step — events are analyzed by rules, then an LLM adds a summary. Bpollo inverts this.

The **LLM reasoning agent is the orchestrator**. Every non-trivial decision flows through it:

- Should this event be monitored? The agent decides.
- What follow-up signals matter? The agent defines them.
- Has the situation escalated? The agent reassesses.
- What should the user do next? The agent recommends.

The agent is not guessing. It reasons over structured inputs assembled by the system:

| Input | Source |
|---|---|
| Current event and its position in the business flow graph | Business Flow Graph Service |
| Detected anomalies and pattern signals | Pattern / Insight Engine |
| Historical outcomes for similar cases | Retrieval (OpenSearch) |
| Existing active watches for this entity | Watch Manager |

With this context, the agent produces structured decisions — not free text — which downstream services (Watch Manager, Alert Service) act on directly.

---

## Key Capabilities

- **Business Flow Graph** — models the causal structure of your business events so every signal is understood in context
- **Pattern & Insight Engine** — detects missing actions, repeated failures, anomalies, and escalating risk
- **AI Reasoning Agent** — the central orchestrator: traverses the business graph, weighs evidence, and decides what to watch and why
- **Dynamic Watch Graphs** — agent-created, time-bounded monitors that track whether expected future events arrive
- **Proactive Alerts** — surfaces reminders and follow-ups before situations escalate, not after

---

## How It Works

1. A business event arrives and is mapped to its position in the flow graph
2. The pattern engine detects anomalies; retrieval fetches relevant historical evidence
3. **The AI agent reasons over all inputs** — business position, patterns, history, active watches
4. The agent decides: monitor this case, or surface a direct recommendation
5. If monitoring: a **watch object** is created with expected signals, deadlines, and risk level
6. Incoming events are matched against active watches in real time
7. If expected signals are missing or risk escalates, the agent reassesses and alerts proactively

---

## Docs

- [System Design](docs/design.md)
- [Component Breakdown](docs/components.md)
- [Repo Structure](docs/repo-structure.md)
