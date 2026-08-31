# Changelog

All notable changes to `cmdb-dev` are recorded here. Versions follow Semantic
Versioning.

## [Unreleased]

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
