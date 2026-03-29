# Bpollo — Usability Analysis

## What the System Does (from the code)

Events come in → get routed → trigger rules/patterns/LLM → watches get created → LLM reasons and dispatches alerts → console shows the result.

The infrastructure is sound. The product surface is thin.

---

## Where Usability Breaks Down

### 1. Watch creation bootstrap
The trigger engine and LLM orchestrator create watches in response to events — but what triggers the very first watch? There is a chicken-and-egg: something has to be flagged before a watch exists, but watches are how you flag things. The initial seeding mechanism is undefined.

### 2. No integration on-ramp
The event ingestion API exists, but there is no SDK, no webhook receiver pattern, no data contract documentation. A new user has no clear path to connect their existing systems.

### 3. The user is a spectator
The console shows watches and reasoning trails — read-only. The LLM resolves, escalates, and extends autonomously. There is no action the user can take from the console. Most monitoring tools expect the human to close the loop.

### 4. "Entity" is undefined as a product concept
`entity_id` is everywhere in the code but it is never defined in product terms. A supplier? A shipment? An order? Generic means concrete for no one.

### 5. Alerts go nowhere actionable
Alerts land in a database that the console reads. There is no Slack notification, no email, no mobile push. Most teams will not live in the console.

---

## Core Concept Assessment

The AI-reasoning-over-business-events idea is sound. The pain point is real: supply chain teams get flooded with signals and need context, not raw data. The three-path routing (rule-based, pattern-based, LLM-based) and the watch lifecycle are good abstractions.

But right now it is a surveillance system without a clear intervention path.

---

## The Key Question

**When an alert fires, what does the user do next, and does this system help them do it?**

Answering this drives what to build next. Options to consider:

- **Human-in-the-loop actions from the console**: let the user resolve, escalate, or dismiss a watch directly rather than waiting for the LLM.
- **Defined entity types**: pick a concrete first use case (e.g. supplier, shipment) and make the UI specific to it.
- **Alert delivery**: integrate at least one outbound channel (Slack webhook, email) so alerts reach people where they work.
- **Integration guide**: document the event contract and provide an example integration so a team can actually connect their system.
- **Seed watch creation**: define how the first watches get created — either a user creates them manually, or the LLM creates them on first-seen entity, or rules bootstrap them at onboarding.
