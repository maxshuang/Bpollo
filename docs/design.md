# System Design Document

## Overview

> **An event-driven business copilot that maps real-time events onto a business flow graph, detects abnormal patterns, creates dynamic watch graphs for important cases, and proactively follows up on future signals.**

---

## 1. System Architecture

```mermaid
flowchart LR
    subgraph A[Business Systems / Event Sources]
        A1[Inspection System]
        A2[Issue System]
        A3[Action System]
        A4[Investigation System]
        A5[Market / External Signals]
        A6[Insurance / Claim System]
    end

    subgraph B[Event Ingestion Layer]
        B1[Event Bus / Stream]
        B2[Event Normalizer]
        B3[Event Router]
    end

    subgraph C[Core Runtime]
        C1[Business Flow Graph Service]
        C2[Pattern / Insight Engine]
        C3[Watch Graph Generator]
        C4[Active Watch Manager]
        C5[Rule / Policy Engine]
    end

    subgraph D[Context & Retrieval Layer]
        D1[OpenSearch / Event History]
        D2[Operational DB]
        D3[Graph / Relationship Store]
    end

    subgraph E[Reasoning Layer]
        E1[LLM Reasoning Agent]
        E2[Prompt Builder / Context Assembler]
    end

    subgraph F[Action Layer]
        F1[Recommendation Engine]
        F2[Alert / Notification Service]
        F3[Workflow Trigger / Task Creator]
        F4[UI Copilot / Timeline View]
    end

    A1 --> B1
    A2 --> B1
    A3 --> B1
    A4 --> B1
    A5 --> B1
    A6 --> B1

    B1 --> B2
    B2 --> B3

    B3 --> C1
    B3 --> C2
    B3 --> C4
    B3 --> D2
    B3 --> D1

    C1 --> E2
    C2 --> E2
    C3 --> C4
    C4 --> E2
    C5 --> C3

    D1 --> E2
    D2 --> E2
    D3 --> E2

    E2 --> E1
    E1 --> F1
    E1 --> F2
    E1 --> F3
    E1 --> F4

    C2 --> C3
    C1 --> C3
    D1 --> C2
    D2 --> C1
```

---

## 2. Layer Breakdown

The system is organized into 6 layers.

### A. Business Systems / Event Sources

Real-world business event origins:

- Inspection submissions
- Issue creation
- Action creation / overdue
- Investigation opened
- Market signals
- Insurance claims

These systems do not require AI — they simply produce a continuous stream of business facts.

### B. Event Ingestion Layer

Receives and normalizes raw business events:

- **Event Bus / Stream** — collects real-time or near-real-time events
- **Event Normalizer** — standardizes event format
- **Event Router** — dispatches events to downstream modules

This is the entry point of the runtime.

### C. Core Runtime

The most critical layer.

#### 1) Business Flow Graph Service

Maintains the primary business flow graph:

```
inspection → issue / action → investigation → market → insurance
```

Responsibilities:
- Locate where a given event sits within the business flow
- Define upstream / downstream relationships
- Identify normal paths vs. abnormal paths

#### 2) Pattern / Insight Engine

Detects patterns such as:

- Repeated issues
- Missing expected actions
- Anomalies
- Escalating risk

#### 3) Watch Graph Generator

The key innovation of this system. When an event warrants ongoing attention, this component dynamically generates a temporary watch graph, e.g.:

- Was an action created within 24h?
- Did the issue recur within 7 days?
- Did it escalate to an investigation?

#### 4) Active Watch Manager

Manages all cases currently under monitoring:

- `active`
- `resolved`
- `escalated`
- `expired`

#### 5) Rule / Policy Engine

Encodes deterministic rules, e.g.:

- A flagged issue should normally have a corresponding action
- An overdue action after X hours triggers escalation
- Severe issue types require stronger monitoring windows

### D. Context & Retrieval Layer

Provides evidence to support reasoning.

#### OpenSearch / Event History

Queries historical events, similar patterns, and time-window aggregations:

- How many times has this type of issue occurred in the past 90 days?
- Has it ever escalated to a major incident?
- Is this site a repeat offender?

#### Operational DB

Stores structured state: watch objects, current case data.

#### Graph / Relationship Store

For later complexity, stores:

- Issue-to-action relationships
- Site-to-incident relationships
- Dependencies between business nodes

This layer can be simplified for MVP.

### E. Reasoning Layer

The LLM is not responsible for managing the whole system. Its role is to:

- Traverse the business flow graph to understand the current event
- Combine historical evidence to assess risk
- Decide whether a watch is needed
- Explain why an alert should be raised
- Recommend next steps

The **Prompt Builder / Context Assembler** is critical — it packages:

- The current event
- Its position in the business flow
- Active watches
- Retrieved historical evidence
- Pattern summaries

...into a context the LLM can reason over.

### F. Action Layer

Final output to users or downstream systems:

- Recommendations
- Alerts
- Workflow triggers
- UI timeline / copilot view

This is the layer where proactive interaction becomes visible to users.

---

## 3. Data Flow

This diagram shows what happens when an event enters the system and how the system decides whether to monitor the future.

```mermaid
sequenceDiagram
    autonumber
    participant S as Business System
    participant I as Event Ingestion
    participant B as Business Flow Graph
    participant P as Pattern Engine
    participant R as Retrieval Layer
    participant W as Watch Manager
    participant L as LLM Agent
    participant A as Action Layer
    participant U as User / UI

    S->>I: Emit event (e.g. flagged issue in inspection)
    I->>B: Map event to business node/path
    I->>P: Check pattern / anomaly signals
    I->>R: Query history and similar past cases

    B-->>L: Current business position
    P-->>L: Pattern summary / anomaly signal
    R-->>L: Historical evidence / prior outcomes
    W-->>L: Existing active watches for this entity

    L->>L: Reason along business flow
    L->>L: Decide if future monitoring is needed

    alt Needs watch
        L->>W: Create / update dynamic watch graph
        W-->>A: Register expected future events
    else No watch needed
        L-->>A: Generate lightweight suggestion only
    end

    L->>A: Output recommendation / alert / next best action
    A->>U: Show proactive reminder or recommendation

    Note over W,I: Future incoming events are matched against active watches

    S->>I: Emit later event (e.g. no action after 24h)
    I->>W: Match event with active watch
    W->>L: Escalate with watch context
    L->>A: Generate follow-up alert
    A->>U: Notify user proactively
```

---

## 4. Core Data Flow Logic

The key insight of this system is not one-time event analysis — it is this chain:

### Step 1: Event occurs

Example: An inspection contains 3 flagged issues, 1 of which has no action.

### Step 2: Locate position in business flow

Business Flow Graph determines:

- Current position: `inspection → issue` node
- Normal downstream: an `action` should follow

### Step 3: Pattern Engine checks for anomaly

Example findings:

- Historically, similar flagged issues almost always produce an action
- This issue type has been linked to major incidents before

### Step 4: Retrieval pulls historical evidence

Example:

- 12 similar issues in the past 6 months
- 10 had a corresponding action created
- 2 escalated to an investigation
- 1 was linked to a major incident

### Step 5: LLM reasons along the business flow

The LLM does not guess — it reasons based on:

- Current business position
- Historical patterns
- Past outcomes
- Whether a critical action is missing

Output:

- This case warrants monitoring
- Create a temporary watch
- Watch for: action creation, repeated issue, investigation opened

### Step 6: Dynamic Watch Graph is created

```json
{
  "watch_id": "watch_001",
  "status": "active",
  "reason": "flagged issue missing expected action",
  "expected_events": [
    "action_created",
    "issue_repeated",
    "investigation_opened"
  ],
  "risk_level": "high"
}
```

### Step 7: Future events are matched against active watches

This is what enables truly proactive interaction:

- No action after 24h → proactive reminder
- Issue recurs within 7 days → escalated alert
- Investigation opened → high-priority alert

---

## 5. MVP Architecture (Simplified)

```mermaid
flowchart TD
    A[Business Event<br/>flagged issue / missing action] --> B[Event Ingestion]

    B --> C[Business Flow Mapper]
    B --> D[Pattern Checker]
    B --> E[History Retrieval]

    C --> F[LLM Agent]
    D --> F
    E --> F

    F --> G{Need Dynamic Watch?}

    G -- Yes --> H[Create / Update Watch Object]
    G -- No --> I[Direct Recommendation]

    H --> J[Watch Event Matcher]
    J --> K[Proactive Alert / Follow-up]

    I --> L[UI Suggestion]
    K --> L
```

---

## 6. Core Data Objects (MVP)

### Event

Raw business event.

```json
{
  "event_id": "evt_001",
  "event_type": "issue_flagged",
  "entity_id": "inspection_123",
  "site_id": "site_9",
  "issue_type": "safety_hazard",
  "timestamp": "2026-03-27T10:00:00Z"
}
```

### Business Node Mapping

Maps an event to its position in the business flow graph.

```json
{
  "event_id": "evt_001",
  "business_node": "inspection.issue",
  "upstream": ["inspection"],
  "downstream_expected": ["action", "investigation"]
}
```

### Pattern Summary

Output from the Pattern / Insight Engine.

```json
{
  "entity_id": "site_9",
  "pattern_type": "missing_expected_action",
  "evidence": {
    "historical_action_rate": 0.9,
    "incident_linked_before": true
  }
}
```

### Watch Object

A dynamically created monitoring target.

```json
{
  "watch_id": "watch_001",
  "status": "active",
  "reason": "flagged issue missing expected action",
  "expected_events": [
    "action_created",
    "issue_repeated",
    "investigation_opened"
  ],
  "risk_level": "high"
}
```

### Recommendation / Alert

Final output surfaced to the user.

```json
{
  "watch_id": "watch_001",
  "message": "This flagged issue is missing an expected action and has historical links to severe incidents. Recommend creating a corrective action within 24 hours.",
  "priority": "high"
}
```

---

## 7. Next Steps

A natural next phase would be a detailed **component diagram + table / schema design** for the engineering implementation.
