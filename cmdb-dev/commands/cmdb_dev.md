---
description: Analyze a new CMDB feature or bug, open the GitHub Issue, create local projection, and stop for human approval before coding.
argument-hint: "<natural-language feature or bug>"
skills: cmdb-development
---
Act as the Primary Agent Orchestrator. Request: $ARGUMENTS. Verify Git/GitHub preconditions. Classify work. For a development item dispatch `cmdb-planner`. Create GitHub Issue. Derive REQ/BUG ID from Issue number, update Issue title/body, create/update local projection with status waiting_approval, human_approval required, github_issue and planner risk, update dashboard, then STOP. Do NOT create branch, edit business code, invoke Coder, create PR or merge. End with Work Item ID, Issue, Planner summary, Risk, Acceptance Criteria, exact next command `/cmdb_approve <ID>`.
