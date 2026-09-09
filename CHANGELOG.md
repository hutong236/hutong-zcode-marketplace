# Changelog

All notable changes to `cmdb-dev` are recorded here. Versions follow Semantic
Versioning.

## [Unreleased]

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
