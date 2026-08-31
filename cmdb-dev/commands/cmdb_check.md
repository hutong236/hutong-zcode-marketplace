---
description: Read-only preflight check for the CMDB ZCode/GitHub/Docker-image workflow.
argument-hint: "[optional notes]"
skills: cmdb-development
---
Run a strictly read-only preflight in the current workspace. Check git version/status/remote/branch; gh version/auth/repo; read 5 Issues/PRs/Actions runs; Dockerfile; build-image workflow or equivalent; uncommitted product-code changes. Do not create/edit/close/push/merge/modify anything. Return Check/Result/Evidence/Required action and READY, READY_WITH_WARNINGS or NOT_READY. Notes: $ARGUMENTS
