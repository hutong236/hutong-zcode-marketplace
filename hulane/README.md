# hulane V2 ZCode Plugin

Hulane 项目专用 AI 研发插件。

V2 bundles a local `hulane-control` MCP server. Slash commands orchestrate its
typed tools; plugin subagents remain capability-limited workers and cannot call
the control plane. GitHub Issue state is canonical, while local JSON and
Obsidian Markdown are recoverable caches/projections.

```text
Requirement → Issue（含 spec delta 进 Gate A 审批包，仅 spec_sync_required 工单）→ Designer → Design Critic（截图评分回环，锚定 Awwwards/Webby/FWA 获奖品质，仅页面级工单）→ Human Approval → Isolated Worktree → Coder（PR 内完成 delta→主规格智能合并 + 决策史归档）→ Tester → Reviewer → PR → Merge
  → Tag Confirm（人工 Gate：打 tag 触发镜像构建，或按需批量发版前人工 skip）→ Actions Image → Spec Sync 校验（hulane_record_specs_synced，specs_commit_sha=merged_sha）→ Close Issue → Done
```

Commands: `/hulane_check`, `/hulane_init`, `/hulane_dev`, `/hulane_approve`, `/hulane_merge_approve`, `/hulane_tag_approve`, `/hulane_release`, `/hulane_status`, `/hulane_resume`.

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
demand — `/hulane_release vX.Y.Z` ships every accumulated merge with no work
item: the command shows the merged-PR batch, `hulane_authorize_release` pins
the version and the origin/main HEAD SHA into a single-use release token pair
(tag creation + tag push), and Build Checker verifies the image (see
`docs/IMAGE_DELIVERY.md`).

Each Work Item runs in `.hulane/worktrees/<ID>`. Automatic implementation
rework is limited to three rounds. A state-aware hook requires a short-lived,
single-use authorization for `git push`, tag mutation, PR merge, and Issue close.

Native capability specs (V3.6.0): behavior baselines live at
`openspec/specs/<capability>/spec.md`; the Planner drafts an
ADDED/MODIFIED/REMOVED/RENAMED delta into the Gate A package, Coder merges the
delta into the main specs inside the implementation PR (decision history
archived at `openspec/changes/archive/<ID>/`), and after merge
`hulane_record_specs_synced` validates the capability main specs touched by the
delta inside the merged tree (falling back to the full specs tree when the
delta carries no specs/ snapshots) before any Issue close.
`spec_sync_required` defaults to true for standard items (explicit Planner
exemption for pure-infra/docs), is always false for small ones, and legacy
items are grandfathered — the state machine and the guard both reject closing
an unsynced required item.

Image delivery is complete only after the Actions artifact and GitHub Release
metadata agree with the merged SHA and an independent GHCR digest lookup. The
tag-only workflow generates SBOM and provenance attestations. See
`docs/IMAGE_DELIVERY.md`.
