---
description: Read-only CMDB development status reconciliation from GitHub, Git, local projections, PR checks and image builds.
argument-hint: "[optional REQ-123/BUG-123]"
skills: cmdb-development
---
Read-only reconcile scope $ARGUMENTS through `cmdb_status` with GitHub refresh for each requested Work Item, followed by `cmdb_validate`. GitHub machine state and live PR/Actions facts outrank cache; MCP may refresh only local cache/projection. Do not alter product code or GitHub objects. Show Waiting Approval, Developing, Testing, Review, PR Checking, Waiting Human Merge, Waiting Tag Confirm, Building, Waiting Close, Blocked, and Recently Done. Include ID/title/Issue/revision/branch/worktree/agent/rework budget/PR/checks/risk/delivery/build/image/next action.
