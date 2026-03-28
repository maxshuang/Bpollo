export interface PersonalNode {
  id:          string
  label:       string
  description: string
  color:       "indigo" | "green" | "orange" | "red" | "purple"
}

export interface PersonalEdge {
  from:  string
  to:    string
  label?: string
}

export interface PersonalGraph {
  id:          string
  name:        string
  description: string
  owner:       string
  tags:        string[]
  nodes:       PersonalNode[]
  edges:       PersonalEdge[]
}

export const personalGraphs: PersonalGraph[] = [
  {
    id:          "safety-audit-flow",
    name:        "Safety Audit Flow",
    description: "End-to-end workflow for field safety auditors — from site arrival to closure sign-off.",
    owner:       "Safety Team",
    tags:        ["safety", "audit", "field"],
    nodes: [
      { id: "arrival",       label: "Site Arrival",           description: "Inspector arrives and checks in at the site.",                    color: "indigo" },
      { id: "walkthrough",   label: "Safety Walkthrough",     description: "Inspector conducts a structured walkthrough of all risk zones.",  color: "indigo" },
      { id: "hazard_found",  label: "Hazard Identified",      description: "A hazard or non-compliance is found and documented.",            color: "orange" },
      { id: "no_hazard",     label: "All Clear",              description: "No hazards found — inspection passes.",                          color: "green"  },
      { id: "remediation",   label: "Remediation Ordered",    description: "Site manager is instructed to remediate the identified hazard.",  color: "red"    },
      { id: "re_inspect",    label: "Re-Inspection",          description: "Follow-up visit to confirm remediation was completed correctly.", color: "orange" },
      { id: "closed",        label: "Audit Closed",           description: "Audit is formally closed and sign-off issued.",                  color: "purple" },
    ],
    edges: [
      { from: "arrival",      to: "walkthrough"  },
      { from: "walkthrough",  to: "hazard_found", label: "issue found"   },
      { from: "walkthrough",  to: "no_hazard",    label: "clear"         },
      { from: "hazard_found", to: "remediation"                          },
      { from: "no_hazard",    to: "closed"                               },
      { from: "remediation",  to: "re_inspect"                           },
      { from: "re_inspect",   to: "closed",       label: "remediated"    },
      { from: "re_inspect",   to: "remediation",  label: "still failing" },
    ],
  },
  {
    id:          "issue-resolution-path",
    name:        "Issue Resolution Path",
    description: "Tracks an identified issue from logging to verified closure, owned by the site manager.",
    owner:       "Operations Team",
    tags:        ["issues", "resolution", "operations"],
    nodes: [
      { id: "logged",     label: "Issue Logged",       description: "Issue is captured with photos and description.",                color: "orange" },
      { id: "assigned",   label: "Action Assigned",    description: "Responsible person is assigned with a deadline.",              color: "indigo" },
      { id: "in_progress",label: "Work In Progress",   description: "Corrective action is underway.",                              color: "indigo" },
      { id: "blocked",    label: "Blocked",            description: "Work is blocked — awaiting parts, approval, or contractor.",  color: "red"    },
      { id: "resolved",   label: "Resolved",           description: "Corrective action completed and documented.",                 color: "green"  },
      { id: "verified",   label: "Verified & Closed",  description: "Inspector or manager has verified the fix is effective.",    color: "purple" },
    ],
    edges: [
      { from: "logged",      to: "assigned"                                 },
      { from: "assigned",    to: "in_progress"                              },
      { from: "in_progress", to: "blocked",    label: "blocked"            },
      { from: "in_progress", to: "resolved",   label: "done"               },
      { from: "blocked",     to: "in_progress",label: "unblocked"          },
      { from: "resolved",    to: "verified"                                 },
      { from: "verified",    to: "assigned",   label: "rejected — re-do"   },
    ],
  },
  {
    id:          "compliance-review",
    name:        "Compliance Review",
    description: "Lightweight review cycle used by the compliance team for regulatory sign-off on inspection reports.",
    owner:       "Compliance Team",
    tags:        ["compliance", "regulatory", "sign-off"],
    nodes: [
      { id: "submitted",  label: "Report Submitted",    description: "Inspector submits a completed inspection report.",              color: "indigo" },
      { id: "reviewing",  label: "Under Review",        description: "Compliance officer reviews for regulatory completeness.",      color: "orange" },
      { id: "query",      label: "Query Raised",        description: "Compliance officer requests clarification from inspector.",    color: "red"    },
      { id: "approved",   label: "Approved",            description: "Report meets all regulatory requirements.",                    color: "green"  },
      { id: "rejected",   label: "Rejected",            description: "Report fails compliance — must be re-submitted.",             color: "red"    },
      { id: "archived",   label: "Archived",            description: "Approved report is filed in the regulatory record system.",   color: "purple" },
    ],
    edges: [
      { from: "submitted", to: "reviewing"                              },
      { from: "reviewing", to: "query",     label: "needs info"       },
      { from: "reviewing", to: "approved",  label: "pass"             },
      { from: "reviewing", to: "rejected",  label: "fail"             },
      { from: "query",     to: "reviewing", label: "answered"         },
      { from: "approved",  to: "archived"                              },
      { from: "rejected",  to: "submitted", label: "re-submit"        },
    ],
  },
]
