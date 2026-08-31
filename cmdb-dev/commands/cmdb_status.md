---
description: Read-only CMDB development status reconciliation from GitHub, Git, local projections, PR checks and image builds.
argument-hint: "[optional REQ-123/BUG-123]"
skills: cmdb-development
---
Read-only reconcile scope $ARGUMENTS. Read local projections, Git branches, Issues, PRs, checks and recent image-build Actions. GitHub facts outrank local state. Update only local read-only projections and the dashboard pages under `plan/00_Dashboard/` (首页/研发控制台/研发看板/需求列表) to reflect verified facts; do not alter product code or GitHub objects. Show Waiting Approval, Developing, Testing, Review, Waiting Human Merge, Building, Blocked, Recently Done. For each active item show ID/title/Issue/branch/agent/PR/checks/risk/build/image/next action.
