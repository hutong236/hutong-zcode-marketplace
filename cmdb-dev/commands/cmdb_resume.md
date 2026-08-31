---
description: Resume an interrupted CMDB AI development Work Item from verified Git/GitHub state instead of chat memory.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
Resume $ARGUMENTS as Primary Agent Orchestrator. Do not trust chat memory. Reconstruct from GitHub Issue, PR, Actions, Git branch/commit, then local projection. Determine exact next lifecycle step. waiting_approval => stop for approve; doing => Coder; testing => Tester; review pre-PR => Reviewer; failed PR checks => Coder->Tester->Reviewer; waiting_human_merge => stop; merged/building => Build Checker; image pushed + Issue open => close and done; build failed => blocked. Verify evidence before skipping any gate.
