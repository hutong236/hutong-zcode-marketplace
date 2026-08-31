---
description: Analyze a new CMDB feature or bug, open the GitHub Issue, create local projection, and stop for human approval before coding.
argument-hint: "<natural-language feature or bug>"
skills: cmdb-development
---
Act as Primary Agent Orchestrator. Request: $ARGUMENTS. Call `cmdb_preflight`; for development work dispatch read-only `cmdb-planner`. Pass its classification, risk, delivery policy, summary, and acceptance criteria to `cmdb_open_work_item`. That MCP tool must create the GitHub Issue before deriving REQ/BUG state and projection. Runtime-impacting work uses delivery_required true and skip_allowed false. Verify the returned state is waiting_approval, then STOP. Do not create a branch, edit business code, invoke Coder, create PR, or merge. End with Work Item ID, Issue, Planner summary, Risk, Delivery Policy, Acceptance Criteria, and `/cmdb_approve <ID>`.
