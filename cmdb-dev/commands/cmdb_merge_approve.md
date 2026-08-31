---
description: Explicitly approve a high-risk CMDB PR merge, then stop for the human tag/image confirmation gate.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
The user explicitly authorizes merge for $ARGUMENTS. This command covers high-risk work and every private-repository control-plane merge. Call `cmdb_status` with GitHub refresh and verify waiting_human_merge, passed Tester/Reviewer/workflow checks, persisted `pr_head_sha`, a verified merge guard, and no blocker. Call `cmdb_transition(approve_merge, actor=human:<identity>)` to persist Gate B; approval never bypasses checks. Call `cmdb_authorize(pr-merge)` and use its token for exactly one repository-compatible merge command that includes `--match-head-commit <persisted-pr-head-sha>`. Verify merged SHA, call `cmdb_transition(pr_merged)` with that SHA, and STOP at waiting_tag_confirm. Show skip only when persisted delivery policy allows it. Never invoke the legacy state CLI.
