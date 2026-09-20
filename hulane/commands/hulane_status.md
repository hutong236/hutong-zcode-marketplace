---
description: 只读对账 Hulane 研发状态，汇总 GitHub、Git、本地投影、PR checks 与镜像构建信息。
argument-hint: "[optional REQ-123/BUG-123]"
skills: hulane-development
---
Read-only reconcile scope $ARGUMENTS through `hulane_status` with GitHub refresh for each requested Work Item, followed by `hulane_validate`. GitHub machine state and live PR/Actions facts outrank cache; MCP may refresh only local cache/projection. Do not alter product code or GitHub objects. Show Waiting Approval, Developing, Testing, Review, PR Checking, Waiting Human Merge, Waiting Tag Confirm, Building, Waiting Close, Blocked, and Recently Done. Include ID/title/Issue/revision/branch/worktree/agent/rework budget/PR/checks/risk/delivery/build/image/next action.
