# cmdb-dev V2 ZCode Plugin

CMDB 项目专用 AI 研发插件。

V2 bundles a local `cmdb-control` MCP server. Slash commands orchestrate its
typed tools; plugin subagents remain capability-limited workers and cannot call
the control plane. GitHub Issue state is canonical, while local JSON and
Obsidian Markdown are recoverable caches/projections.

```text
Requirement → Issue → Human Approval → Isolated Worktree → Coder → Tester → Reviewer → PR → Merge
  → Tag Confirm（人工 Gate：打 tag 触发镜像构建，或按需批量发版前人工 skip）→ Actions Image → Close Issue → Done
```

Commands: `/cmdb_check`, `/cmdb_init`, `/cmdb_dev`, `/cmdb_approve`, `/cmdb_merge_approve`, `/cmdb_tag_approve`, `/cmdb_status`, `/cmdb_resume`.

Prerequisites in ZCode terminal:

```bash
git --version
gh --version
gh auth status
git remote -v
```

Repository should have a usable Dockerfile. Primary Agent is Orchestrator; plugin subagents do not call each other. Obsidian is read-only.

`skip` is the default delivery outcome under the on-demand release cadence:
Planner persists `delivery_required: false` and `skip_allowed: true` unless the
user explicitly asks to release an image with the item. Releases are batched on
demand — one tag on a small maintenance release item covers every accumulated
merge (see `docs/IMAGE_DELIVERY.md`).

Each Work Item runs in `.cmdb-dev/worktrees/<ID>`. Automatic implementation
rework is limited to three rounds. A state-aware hook requires a short-lived,
single-use authorization for `git push`, tag mutation, PR merge, and Issue close.

Image delivery is complete only after the Actions artifact and GitHub Release
metadata agree with the merged SHA and an independent GHCR digest lookup. The
tag-only workflow generates SBOM and provenance attestations. See
`docs/IMAGE_DELIVERY.md`.
