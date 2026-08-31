---
description: Resume an interrupted CMDB AI development Work Item from verified Git/GitHub state instead of chat memory.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
Resume $ARGUMENTS as Primary Agent Orchestrator. Do not trust chat memory. Call `cmdb_status` with GitHub refresh and `cmdb_validate`, then use the returned canonical revision to regenerate cache/projection. Verify branch/worktree before dispatch. Follow exactly one next state event: waiting_approval stops; ready creates worktree; doing/testing/review dispatch their pinned agents; pr_checking calls `cmdb_verify_pr_checks`; waiting_human_merge and waiting_tag_confirm stop for humans; building dispatches Build Checker; waiting_close authorizes one Issue close; blocked requires resolution evidence. Every protected operation uses a fresh `cmdb_authorize` token, and every merge pins the persisted PR Head SHA. Never infer a Gate or invoke the legacy state CLI.
