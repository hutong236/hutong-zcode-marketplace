---
description: Explicitly approve a high-risk CMDB PR merge, then stop for the human tag/image confirmation gate.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
The user explicitly authorizes high-risk merge for $ARGUMENTS. Call `cmdb_status` with GitHub refresh and verify waiting_human_merge, passed Tester/Reviewer/required checks, and no blocker. Call `cmdb_transition(approve_merge, actor=human:<identity>)` to persist Gate B; approval never bypasses checks. Call `cmdb_authorize(pr-merge)` and use its token for exactly one repository-compatible merge command. Verify merged SHA, call `cmdb_transition(pr_merged)` with that SHA, and STOP at waiting_tag_confirm. Show skip only when persisted delivery policy allows it. Never invoke the legacy state CLI.
