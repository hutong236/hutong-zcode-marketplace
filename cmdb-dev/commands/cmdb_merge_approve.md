---
description: Explicitly approve a high-risk CMDB PR merge, then stop for the human tag/image confirmation gate.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
The user explicitly authorizes high-risk merge for $ARGUMENTS. Verify Work Item, Issue, PR, waiting_human_merge, Tester passed, Reviewer approved, required PR checks passed and no merge blocker. Merge with repository-compatible `gh pr merge`. Then record merged SHA, set waiting_tag_confirm and STOP for `/cmdb_tag_approve <ID> [vX.Y.Z | skip]` — code is merged, but tagging and image delivery need explicit human confirmation; do not wait for any build before it.
