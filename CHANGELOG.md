# Changelog

All notable changes to `cmdb-dev` are recorded here. Versions follow Semantic
Versioning.

## [Unreleased]

## [2.4.2] - 2026-09-18

### Changed

- PR-check waiting is now asynchronous, mirroring the tag-build watch. The
  skill, `/cmdb_approve`, and `/cmdb_resume` no longer leave the wait between
  `pr_created` and `cmdb_verify_pr_checks` undefined — the gap that produced a
  6-minute blocking `gh run watch` in the REQ-122 v2.2.32 release session.
  While the check run is in progress the Orchestrator starts one background
  `gh run watch <run-id> --exit-status --interval 30` task, tells the user the
  checks are running, and ends the turn; a resume or `cmdb_status` finding the
  item `pr_checking` runs one `gh run list` query and re-arms the watch or
  proceeds straight to verification when the run has concluded.
- An early `/cmdb_tag_approve` issued while the item still sits at
  `waiting_human_merge` now counts as one explicit human confirmation covering
  Gate B plus Gate C: after `cmdb_verify_pr_checks` passes, the Orchestrator
  records `approve_merge`, performs one authorized
  `--match-head-commit` merge, records `pr_merged`, and continues the tag path
  in the same turn. Checks are never bypassed; previously this ordering forced
  the model to improvise the gate interpretation mid-session.

## [2.4.1] - 2026-09-16

### Fixed

- Authorization scope checks no longer reject protected operations when the
  control root or worktree path contains a symlink: both sides of the
  repository/worktree comparison are canonicalized with `realpath` before
  comparing, so git's resolved output (`/private/var/...` on macOS) matches
  the path recorded in state. This also un-breaks the three macOS-only test
  failures (authorization ×2, worktree ×1) that made every local tester gate
  fail while CI stayed green; test fixtures now build under the resolved
  temp path.

## [2.4.0] - 2026-09-15

### Added

- Small-change fast lane (`size: small`): trivial requests — pure
  frontend/UI or docs work, few expected files, no schema/API/auth/data-path
  change, low risk — skip the read-only planner subagent dispatch. The
  Orchestrator writes the planner summary, risk, delivery policy, and
  acceptance criteria inline and passes `size: "small"` to
  `cmdb_open_work_item`; the Issue body marks the fast lane. Everything else
  keeps `size: "standard"` with the full Planner analysis. If small-scope
  work balloons, the item patches back to `standard`. The state machine
  requires `size: small` to pair with `risk_level: low` and backfills
  `size: "standard"` for pre-existing items via `normalizeWorkItem`.

### Changed

- Skip-allowed items close themselves after merge. A new internal
  `policy_skip` transition (orchestrator actor, not in `HUMAN_EVENTS`) moves
  `waiting_tag_confirm → waiting_close` immediately after `pr_merged` when
  the persisted policy is `delivery_required: false` and
  `skip_allowed: true`, recording `tag_confirmation: "skipped_by_policy"`.
  Its authority is the Gate A approval that persisted the delivery policy —
  the transition refuses to fire without it, so the human who approved the
  requirement remains the authorizing party. This removes the third
  per-item human stop (`/cmdb_tag_approve <ID> skip`) that merely re-confirmed
  a policy already approved at Gate A. Human `approve_skip` remains as the
  manual override for items already parked at `waiting_tag_confirm` (for
  example a session resumed between merge and close), and every
  tag-delivery path (`approve_tag`, Gate C stop) is unchanged.

## [2.3.0] - 2026-09-09

### Changed

- Tag/image delivery no longer blocks the session on the image build. After
  the tag push the Orchestrator starts one background
  `gh run watch --exit-status` Bash task, tells the user the build is running,
  and ends the turn — the session stays usable for other work items while the
  build runs (up to 30 minutes). Build Checker is dispatched only once the run
  has concluded: either when the background-task notification arrives, or on a
  later resume that finds the item `building` and one `gh run list` shows the
  run finished. `cmdb-build-checker` never blocks or polls: a still-running
  build returns `build_result: running` with a re-dispatch recommendation.
  State machine, Gate C human confirmation, and the image evidence chain are
  unchanged; the persisted `building` state already supported this resume path.

## [2.2.0] - 2026-09-09

### Changed

- Release cadence is now on-demand and batched. The persisted delivery policy
  default flips to `delivery_required: false` + `skip_allowed: true`: a merged
  change closes as a human-confirmed skip instead of demanding a tag and image
  every time. `delivery_required: true` is reserved for items where the user
  explicitly asks to ship an image now. State machine, Gate C human
  confirmation, and the image evidence chain are unchanged. To ship a batch,
  open a small `maintenance` release item that only bumps the project version
  and confirm its tag — one verified image covers every accumulated merge,
  which respects GitHub free-plan quotas (Actions minutes, GHCR storage) on
  private repositories.
- The tag-triggered image workflow is adapted to free-plan limits: the Docker
  layer cache moves from a GHCR `buildcache` image (private Packages storage)
  to the free, auto-evicted GitHub Actions cache; the redundant `sha-*` image
  tag is dropped; the delivery-metadata artifact retention drops from 90 to 7
  days (the Release asset stays the permanent copy); the job timeout drops
  from 60 to 30 minutes so a hung run burns fewer billable minutes.
- Delivery-policy wording synced across the skill, `/cmdb_dev`,
  `cmdb-planner`, the Obsidian work-item template, and all documentation.

## [2.1.0] - 2026-09-07

### Changed

- Execution-time optimizations across the delivery pipeline. The tag-triggered
  image workflow is a single job with Docker layer caching (registry-backed
  `buildcache` ref on GHCR); PR checks gain npm/Go/pip caches, Buildx, and a
  GHA-cached Docker build. Neither template changes its gate semantics.
- `syncItemToGitHub` drops from five serial `gh` calls per transition to a
  steady-state two (label edit + comment PATCH) using a non-canonical
  `.cmdb-dev/github-meta.json` accelerator that caches the managed comment id
  and last-synced label; first sync, meta loss, or a 404 fall back to the
  conservative full path, which keeps the remote-revision guard and now lists
  only the first comment page before paginating.
- Slash gate commands (`/cmdb_approve`, `/cmdb_merge_approve`,
  `/cmdb_tag_approve`) refresh from GitHub only when resuming or in doubt; a
  transition performed in the same session is already revision-guarded.
  `/cmdb_init` no longer runs a second preflight.
- Tester and Reviewer are dispatched in parallel after the Coder completes
  (Reviewer is read-only, so the single-writer rule holds); the state machine
  is unchanged and `review_approved` still requires passed tests.
- Build Checker waits for the image build with one blocking
  `gh run watch --exit-status` call instead of repeated polling turns.
- `cmdb_status` live facts query image runs only for
  building/waiting_close/done.

## [2.0.1] - 2026-09-06

### Fixed

- PreToolUse guard no longer mistakes `push`/`tag` words inside `git commit`
  message bodies for protected operations: `-m`/`-am`/`--message` message
  arguments are stripped before segmented scanning. Message bodies containing
  command substitution stay visible to the guard (fail closed), except for the
  pure-data `$(cat <<EOF ...)` form. The push allowlist and the cd/-C check now
  operate on the stripped text as well, so message content can neither feed the
  allowlist nor trip the one-operation-per-call rule.

## [2.0.0] - 2026-08-31

### Added

- Bundled `cmdb-control` stdio MCP server with 12 typed workflow tools.
- Private-repository merge guard that verifies the successful workflow and
  exact PR head SHA without requiring paid GitHub branch protection.
- Dual-era MCP support for the current 2026-07-28 protocol and legacy ZCode
  clients.
- Session context injection, false-completion Stop guard, deterministic
  projection writer, and repository initializer.

### Changed

- Slash commands now orchestrate through MCP instead of hand-editing state or
  invoking the state CLI directly.
- GitHub Issue machine state is the canonical workflow record; local JSON and
  Markdown are rebuilt caches/projections.

### Security

- MCP inputs are validated server-side and plugin subagents have no MCP control
  tools in their exhaustive tool lists.
- Control-plane merges always require human Gate B and a merge command pinned
  with `--match-head-commit`; public repositories still require GitHub-side
  enforcement.

## [1.4.0] - 2026-08-31

### Added

- Strict SemVer and default-branch ancestry validation for image tags.
- BuildKit SBOM/provenance, immutable delivery metadata artifact, and matching
  GitHub Release asset.
- Cross-source delivery verifier for workflow, Release, GHCR digest, and merged
  commit evidence.

### Changed

- Image names are normalized to lowercase for GHCR.
- A successful Actions run is no longer sufficient to record image delivery.

## [1.3.0] - 2026-08-31

### Added

- Per-Work-Item Git worktree isolation.
- State-aware PreToolUse guard with short-lived, single-use authorization for
  push, tag, PR merge and Issue close operations.
- A three-round automatic rework budget with deterministic blocking.

### Changed

- Coder, Tester and Reviewer are pinned to the recorded worktree path.
- State cache discovery now resolves the shared control root from linked
  worktrees.

## [1.2.0] - 2026-08-31

### Added

- Executable Work Item state machine and JSON Schema.
- GitHub Issue state-label and machine-comment persistence protocol.
- Local state cache with atomic writes and GitHub hydrate/sync commands.
- Tests for human gates, delivery policy, image evidence and state comments.

### Changed

- GitHub state is durable; local Markdown and JSON are projections/caches.

## [1.1.0] - 2026-08-31

### Added

- Mandatory pull-request checks template with repository-aware test discovery.
- Branch-protection operating standard and a stable required-check name.

### Changed

- Missing PR checks now block merge instead of being treated as optional.
- `/cmdb_init` installs PR checks separately from the tag-only image workflow.

## [1.0.5] - 2026-08-31

### Security

- Restrict image-delivery `skip` to work items explicitly classified as not
  requiring a runtime image.
- Remove the manual image-workflow dispatch path that could bypass Gate C.

### Fixed

- Add the missing `waiting_human_merge` Obsidian board column.
- Use repository-root-relative Obsidian links consistently.
- Exclude only plugin-managed projection directories instead of all `plan/`.
- Replace stale installation documentation and remove tracked macOS metadata.

### Added

- Marketplace validation script and GitHub Actions validation workflow.
- MIT license and repository hygiene configuration.

## [1.0.4] - 2026-08-31

- Added mandatory post-merge Tag/image confirmation Gate C.
- Added `/cmdb_tag_approve` with explicit tag and `skip` paths.
