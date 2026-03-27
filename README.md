<p align="center">
  <img src="assets/icon.png" width="120" alt="Bpollo">
</p>

<h1 align="center">Bpollo</h1>

<p align="center">
  An event-driven business copilot that maps real-time events onto a business flow graph, detects abnormal patterns, creates dynamic watch graphs for important cases, and proactively follows up on future signals.
</p>

---

## What is Bpollo?

Bpollo (inspired by Apollo) is a proactive business intelligence layer that sits on top of your operational systems. Instead of waiting for humans to notice problems, Bpollo watches your business flow in real time — and speaks up before things go wrong.

It understands the natural flow of business events. For example:

```
inspection → issue / action → investigation → market → insurance
```

When something deviates from that flow, Bpollo doesn't just log it. It reasons over the deviation, looks up historical patterns, and decides whether to create a **dynamic watch** — a temporary monitor that tracks whether the expected follow-up events happen. If they don't, Bpollo alerts proactively.

---

## Key Capabilities

- **Business Flow Graph** — models the causal structure of your business events so every incoming signal is understood in context
- **Pattern & Insight Engine** — detects repeated issues, missing actions, anomalies, and escalating risk
- **Dynamic Watch Graphs** — automatically creates time-bounded monitors when an event warrants ongoing attention
- **LLM Reasoning Agent** — traverses the business graph to explain risk and recommend next steps, grounded in historical evidence
- **Proactive Alerts** — surfaces reminders and recommendations before situations escalate, not after

---

## How It Works

1. A business event arrives (e.g. a flagged issue with no action)
2. The system maps it to its position in the business flow graph
3. The pattern engine checks for anomalies; retrieval pulls historical evidence
4. The LLM reasons over the context and decides if monitoring is needed
5. If yes, a **watch object** is created with expected future signals and a risk level
6. When future events arrive, they are matched against active watches
7. If expected signals are missing or risk escalates, the user is notified proactively

---

## Docs

- [System Design](docs/design.md)
