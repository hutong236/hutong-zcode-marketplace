---
name: cmdb-development
description: Use for CMDB project feature, bug, refactor, GitHub Issue, Pull Request, test, review, GitHub Actions, and Docker image delivery tasks. The ZCode primary Agent is the orchestrator and plugin subagents handle planning, coding, testing, review, and build verification.
when_to_use: Use whenever the user asks to create, approve, resume, implement, test, review, or check the delivery status of a CMDB requirement or bug.
metadata:
  author: CMDB Project
  version: 2.0.0
---

# CMDB Development Skill

The active ZCode Primary Agent is the Orchestrator. Dispatch plugin subagents: `cmdb-planner`, `cmdb-coder`, `cmdb-tester`, `cmdb-reviewer`, `cmdb-build-checker`. A subagent must never be asked to spawn another subagent.

## Human gates

1. New work always stops for requirement approval before business code changes.
2. High-risk PR merge requires explicit human approval.
3. Tag/image delivery after merge requires explicit human confirmation (`waiting_tag_confirm` + `/cmdb_tag_approve`); never create or push a git tag without it — not every change ships an image.
4. Scope changes and irrecoverable blockers require human input.
5. No human confirmation is required between Coder -> Tester -> Reviewer.

## Truth precedence

GitHub Issue machine state comment plus actual Issue/PR/Actions facts > Git branch/commit state > `.cmdb-dev/state.json` cache > local Markdown projection > inference. Persist each transition through the bundled state runtime and sync the same Issue comment; never hand-edit canonical state.

## V2 control plane

Use the bundled `cmdb-control` MCP tools for preflight, initialization, Issue-first Work Item creation, transitions, validation, GitHub hydrate/sync, isolated worktree creation, PR-check verification, privileged-action authorization, and delivery verification. Slash commands are orchestration prompts; they never hand-edit state or use the compatibility CLI for mutations. On resume/status request GitHub refresh before trusting cache. State comments use `cmdb-dev-state:v2` and labels use `cmdb:<state>`.

The state CLI remains a diagnostic/compatibility surface only. MCP validates inputs and lifecycle invariants server-side. Plugin subagents have exhaustive tool lists without MCP tools and must never be given control-plane access.

## Isolation and authority

After Gate A, create exactly one worktree with the state runtime `worktree` command and record both `branch` and `worktree_path`. Planner remains read-only; Coder, Tester and Reviewer must operate only in that path. Never dispatch two writers to one worktree. Automatic `tests_failed`, `changes_requested`, or `checks_failed` rework is limited to three rounds; the next failure blocks for human intervention.

The PreToolUse guard protects push, tag mutation, PR merge and Issue close. Immediately before one protected command, the Primary Agent calls `cmdb_authorize` for the exact Work Item and action, then supplies `CMDB_AUTH_TOKEN=<token>` to that one command. Never reuse or expose tokens, batch protected operations, or ask a subagent to issue authorization.

## Work Item identity

Create GitHub Issue first, then derive `REQ-<issue-number>` for feature/refactor/maintenance or `BUG-<issue-number>` for bug. Update the Issue title accordingly.

## New request lifecycle

1. Inspect repository and classify request.
2. If it is not development work, do not create an Issue.
3. Dispatch `cmdb-planner` read-only.
4. Call `cmdb_open_work_item`; it creates the GitHub Issue first, derives REQ/BUG ID, persists machine state, and writes the projection.
5. Verify the returned Issue title/body and waiting_approval state.
6. Persist Planner delivery policy: runtime-impacting work uses `delivery_required: true` and `skip_allowed: false`; only non-runtime documentation, projection templates, or marketplace metadata may use `delivery_required: false` and `skip_allowed: true`.
7. Write/update local read-only Markdown projection.
8. Set `status: waiting_approval`, `human_approval: required`.
9. STOP. Do not create branch or edit business code.

## After explicit approval

1. Verify Issue remains open and reconcile remote/local state.
2. Comment approval on the Issue.
3. Create/reuse the Work Item's isolated worktree and branch from the current default branch.
4. Dispatch Coder with the recorded worktree path.
5. Coder complete -> Tester.
6. Tester failure caused by implementation -> Coder -> Tester again.
7. Tester passed -> Reviewer.
8. Reviewer changes_requested -> Coder -> Tester -> Reviewer.
9. Reviewer approved -> Primary Agent commits only related changes, calls `cmdb_authorize(git-push)`, and performs one authorized push.
10. Create PR with `gh pr create`; body uses `Refs #<issue>`, never `Closes`/`Fixes`.
11. Call `cmdb_verify_pr_checks`. It verifies the exact PR Head SHA and successful `CMDB PR Checks / verify`. Public repositories require GitHub-side enforcement. A private repository without paid branch protection records `control_plane_verified` instead; missing or non-successful checks always block.
12. GitHub-enforced low/medium risk may perform one authorized merge. High risk and every control-plane-guarded private-repository merge stop at `waiting_human_merge`. After Gate B, the merge command must include `--match-head-commit <persisted-pr-head-sha>`; human approval never bypasses checks.
13. After merge set `waiting_tag_confirm`, record merged SHA, and STOP: ask whether to tag (ship image) or, only when the persisted delivery policy allows it, skip. A missing image workflow never authorizes an automatic skip.
14. Tag confirmed via `/cmdb_tag_approve <ID> [vX.Y.Z]`: create an annotated tag on the merged SHA (name from the user, else next patch of the latest `v*` tag — state it), push the tag, wait for the tag-triggered image build, dispatch Build Checker.
15. Build Checker downloads both the Actions artifact and GitHub Release `delivery-metadata.json`, independently queries the matching GHCR version/remote manifest, verifies SBOM and provenance attestations, and compares tag commit to merged SHA. Logs alone never prove delivery. Primary Agent calls `cmdb_verify_delivery` with both metadata objects and the registry digest.
16. Only when all evidence agrees: record image/tag/digest/SHA/run URL/Release URL and verified registry/SBOM/provenance status, close Issue, mark Done.
17. Skip confirmed via `/cmdb_tag_approve <ID> skip`: allow only when `delivery_required: false` and `skip_allowed: true`; record the human confirmation and reason, set `build_status: skipped`, close Issue, mark Done without image evidence.

## Done definition

Done requires approval, coder completed, tester passed, reviewer approved, successful PR workflow evidence, a verified GitHub or control-plane merge guard, PR merged, Issue closed, and exactly one of: a human-confirmed tag whose image build, GHCR digest, Release metadata, SBOM, and provenance are verified, or a human-confirmed skip with `build_status: skipped`.

## GitHub communication

Use MCP for Work Item Issue creation, canonical state, projection, authorization, and delivery verification. Use `git` only for code/commit plus individually authorized push/tag operations; use read-only `gh` queries for PR/check/Actions facts. PR creation remains the Primary Agent's responsibility. Merge and Issue close require state-bound authorization. Subagents never perform GitHub writes.

## Obsidian

Obsidian projections are read-only. ALL Obsidian projections MUST live under the target repository's `plan/` directory, never at the repository root: `plan/00_Dashboard/` (`首页.md` entry page, `研发控制台.md`, `研发看板.md`, `需求列表.md` — all pure Dataview views over frontmatter, never hand-written state), `plan/01_Requirements/`, `plan/02_Bugs/`. Machine state stays at `.cmdb-dev/state.json`. `plan/` may already contain human-maintained planning documents — never modify or delete them. Prefer keeping projections out of product-code commits by excluding only `/plan/00_Dashboard/`, `/plan/01_Requirements/`, `/plan/02_Bugs/`, and `/.cmdb-dev/` in `.git/info/exclude`; never exclude all of `plan/`.

Work item notes follow `templates/obsidian/work-item-template.md`: H1 is `<ID> <中文标题>`; fixed Chinese H2 skeleton 背景/目标/功能范围/非范围/验收标准/Planner 摘要/GitHub/关联/Agent 执行记录; acceptance criteria are checkboxes and may only be checked with code, test, or Actions evidence; relations use `[[wikilinks]]` to other work items; no tags — classification comes from the `type` field plus directory. File names stay stable (`REQ-<issue-number>.md`, `BUG-<issue-number>.md`). Frontmatter is the single record: keep every field current, refresh `updated` on each sync, and query it in views instead of duplicating status in page text.
