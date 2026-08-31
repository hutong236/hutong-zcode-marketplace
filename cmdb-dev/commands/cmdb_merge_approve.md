---
description: Explicitly approve a high-risk CMDB PR merge, then verify final Docker image build and close Issue only on success.
argument-hint: "<REQ-123 or BUG-123>"
skills: cmdb-development
---
The user explicitly authorizes high-risk merge for $ARGUMENTS. Verify Work Item, Issue, PR, waiting_human_merge, Tester passed, Reviewer approved, required PR checks passed and no merge blocker. Merge with repository-compatible `gh pr merge`. Then set building, identify merged SHA, wait/check image-build workflow, dispatch Build Checker. Only after image push evidence store image/tag/digest/run URL, close Issue and mark done. On build failure leave Issue open and Blocked.
