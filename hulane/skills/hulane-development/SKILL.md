---
name: hulane-development
description: Use for Hulane project feature, bug, refactor, GitHub Issue, Pull Request, test, review, GitHub Actions, and Docker image delivery tasks. The ZCode primary Agent is the orchestrator and plugin subagents handle planning, coding, testing, review, and build verification.
when_to_use: Use whenever the user asks to create, approve, resume, implement, test, review, or check the delivery status of a Hulane requirement or bug.
metadata:
  author: Hulane Project
  version: 3.0.0
---

# Hulane Development Skill

The active ZCode Primary Agent is the Orchestrator. Dispatch plugin subagents: `hulane-planner`, `hulane-coder`, `hulane-tester`, `hulane-reviewer`, `hulane-build-checker`. A subagent must never be asked to spawn another subagent.

## Human gates

1. New work always stops for requirement approval before business code changes.
2. High-risk PR merge requires explicit human approval.
3. Tag/image delivery after merge requires explicit human confirmation (`waiting_tag_confirm` + `/hulane_tag_approve`); never create or push a git tag without it — not every change ships an image. The stop exists only for tag delivery: an item whose persisted policy is `delivery_required: false` and `skip_allowed: true` closes itself via the `policy_skip` transition right after merge, because Gate A already approved that policy.
4. Scope changes and irrecoverable blockers require human input.
5. No human confirmation is required between Coder -> Tester/Reviewer; Tester and Reviewer are dispatched in parallel.

## Truth precedence

GitHub Issue machine state comment plus actual Issue/PR/Actions facts > Git branch/commit state > `.hulane/state.json` cache > local Markdown projection > inference. Persist each transition through the bundled state runtime and sync the same Issue comment; never hand-edit canonical state.

## V2 control plane

Use the bundled `hulane-control` MCP tools for preflight, initialization, Issue-first Work Item creation, transitions, validation, GitHub hydrate/sync, isolated worktree creation, PR-check verification, privileged-action authorization, and delivery verification. Slash commands are orchestration prompts; they never hand-edit state or use the compatibility CLI for mutations. On resume/status request GitHub refresh before trusting cache. State comments use `cmdb-dev-state:v2` and labels use `hulane:<state>`.

The state CLI remains a diagnostic/compatibility surface only. MCP validates inputs and lifecycle invariants server-side. Plugin subagents have exhaustive tool lists without MCP tools and must never be given control-plane access.

## Isolation and authority

After Gate A, create exactly one worktree with the state runtime `worktree` command and record both `branch` and `worktree_path`. Planner remains read-only; Coder, Tester and Reviewer must operate only in that path. Never dispatch two writers to one worktree. Automatic `tests_failed`, `changes_requested`, or `checks_failed` rework is limited to three rounds; the next failure blocks for human intervention.

The PreToolUse guard protects push, tag mutation, PR merge and Issue close. Push and tag mutation require a one-use token: immediately before the command, the Primary Agent calls `hulane_authorize` for the exact Work Item and action, then supplies `HULANE_AUTH_TOKEN=<token>` to that one command. PR merge and Issue close are state-verified instead — no token call — because an item can only sit in `merging`/`waiting_close` after every check has passed; the guard itself re-validates the state, the exact PR/Issue number, and (for merges) the pinned head SHA. Never reuse or expose tokens, batch protected operations, or ask a subagent to issue authorization. The accepted shape is exact for every protected command — one Bash call whose working directory is set directly on the tool to the managed repository (never via `cd`, `git -C`, or a subshell) running exactly one operation:

    HULANE_AUTH_TOKEN=<token> git push origin HEAD
    HULANE_AUTH_TOKEN=<token> git tag -a v2.2.33 -m "Release v2.2.33" <merged-sha>
    gh pr merge 122 --squash --match-head-commit <persisted-pr-head-sha>
    gh issue close 122 --repo <owner/repo> --comment "Done"

A guard rejection — cwd indirection, more than one operation in the call, a token issued for a different action, a reused/expired token, or failed state verification — is fixed only by retrying the single corrected command (for push/tag, after re-issuing `hulane_authorize`); never widen the command, chain a repair, or reuse an old token.

## Work Item identity

Create GitHub Issue first, then derive `REQ-<issue-number>` for feature/refactor/maintenance or `BUG-<issue-number>` for bug. Update the Issue title accordingly.

## New request lifecycle

1. Inspect repository and classify request.
2. If it is not development work, do not create an Issue.
3. Classify the intake size. A small change (pure frontend/UI or docs, expected to touch few files, no schema/API/auth/data-path change, risk low) may skip the `hulane-planner` dispatch: write the planner summary, risk, delivery policy, and acceptance criteria inline and pass `size: "small"` to `hulane_open_work_item`. Anything else dispatches `hulane-planner` read-only and uses `size: "standard"`. If small-scope work balloons during Coder, patch `size` back to `standard` and continue with full discipline.
4. Call `hulane_open_work_item`; it creates the GitHub Issue first, derives REQ/BUG ID, persists machine state, and writes the projection.
5. Verify the returned Issue title/body and waiting_approval state.
6. Persist Planner delivery policy with an on-demand release cadence: the default is `delivery_required: false` and `skip_allowed: true`, so a merged change ships no image until the user explicitly asks to release. Use `delivery_required: true` and `skip_allowed: false` only when the user explicitly requests an image/release for this item.
7. Write/update local read-only Markdown projection.
8. Set `status: waiting_approval`, `human_approval: required`.
9. STOP. Do not create branch or edit business code.

## After explicit approval

1. Verify Issue remains open and reconcile remote/local state.
2. Comment approval on the Issue.
3. Create/reuse the Work Item's isolated worktree and branch from the current default branch.
4. Dispatch Coder with the recorded worktree path.
5. Coder complete -> dispatch hulane-tester and hulane-reviewer in the same round. Reviewer is read-only, so parallel dispatch never violates the single-writer rule.
6. Tester failure caused by implementation or Reviewer changes_requested -> Coder, then re-dispatch both in parallel; the stale sibling result is discarded.
7. Only when Tester passed AND Reviewer approved -> Primary Agent commits only related changes, calls `hulane_authorize(git-push)`, and performs one authorized push.
8. Create PR with `gh pr create`; body uses `Refs #<issue>`, never `Closes`/`Fixes`.
9. Call `hulane_verify_pr_checks`. It verifies the exact PR Head SHA and successful `Hulane PR Checks / verify`. Public repositories require GitHub-side enforcement. A private repository without paid branch protection records `control_plane_verified` instead; missing or non-successful checks always block. While the check run is still in progress, wait asynchronously exactly like a tag build: start one background `gh run watch <run-id> --exit-status --interval 30` Bash task — never a blocking call or repeated polling turns — tell the user the checks are running, and end the turn; the completion notification continues with `hulane_verify_pr_checks` and the merge gate. A later resume or `hulane_status` that finds the item `pr_checking` first runs one `gh run list` query for the PR branch: a concluded run goes straight to verification, a still-running one re-arms the background watch.
10. Low/medium risk under either guard mode proceeds with one merge; high risk stops at `waiting_human_merge` for `/hulane_merge_approve`. Every merge command must include `--match-head-commit <persisted-pr-head-sha>` (state-verified, no token); human approval never bypasses checks.
11. After merge record `pr_merged` with the merged SHA, then split by delivery policy. When the persisted policy is `delivery_required: false` and `skip_allowed: true` (the default), immediately record `policy_skip` with orchestrator actor and evidence citing the Gate A approval (Issue number, approving human actor, delivery_reason), then close the exact Issue once (state-verified, no token), record `issue_closed`, and report Done — no human stop. Otherwise STOP at `waiting_tag_confirm` and ask whether to tag; under the on-demand cadence recommend accumulating and shipping via a later batched release. A missing image workflow never authorizes an automatic skip.
12. Tag confirmed via `/hulane_tag_approve <ID> [vX.Y.Z]`: create an annotated tag on the merged SHA (name from the user, else next patch of the latest `v*` tag — state it), push the tag, then wait for the tag-triggered image build asynchronously: start one background `gh run watch <run-id> --exit-status --interval 30` Bash task — never a blocking call or repeated polling turns — tell the user the build is running, and end the turn; the session stays usable for other work items while it runs. When the item still sits at `waiting_human_merge` because the user issued this confirmation early, that single explicit human approval covers Gate B plus Gate C: after `hulane_verify_pr_checks` passes, record `approve_merge`, run exactly one merge with `--match-head-commit <persisted-pr-head-sha>` (state-verified, no token), record `pr_merged`, then continue the tag path in the same turn — checks are never bypassed. When the background task completes, check the run conclusion: success dispatches Build Checker; failure records block and leaves the Issue open. If the session ends before the notification arrives, any later resume or `hulane_status` that finds the item `building` first runs one `gh run list` query for the tag: a finished run goes straight to Build Checker, a still-running one re-arms the background watch.
13. Build Checker downloads both the Actions artifact and GitHub Release `delivery-metadata.json`, independently queries the matching GHCR version/remote manifest, verifies SBOM and provenance attestations, and compares tag commit to merged SHA. Logs alone never prove delivery. Primary Agent calls `hulane_verify_delivery` with both metadata objects and the registry digest.
14. Only when all evidence agrees: record image/tag/digest/SHA/run URL/Release URL and verified registry/SBOM/provenance status, close Issue, mark Done.
15. Skip confirmed via `/hulane_tag_approve <ID> skip`: allow only when `delivery_required: false` and `skip_allowed: true`; record the human confirmation and reason, set `build_status: skipped`, close Issue, mark Done without image evidence. This is the manual override for items already sitting at `waiting_tag_confirm` (for example a session resumed between merge and close); the normal path for skip-allowed items is the automated `policy_skip` in step 11.
16. Housekeeping after Done: once an item reaches `issue_closed`, remove its merged worktree so `.hulane/worktrees/` never accumulates — from the managed repository run plain `git worktree remove <worktree_path>` (never `--force`; a dirty or locked worktree stays and gets reported) followed by `git branch -d <branch>` (lowercase `-d` refuses unmerged branches). Keep the worktree whenever the item is blocked, the branch holds unmerged commits, or delivery evidence may still be needed; a periodic manual cleanup item is never the remedy.

## On-demand batched releases

Releases are explicit, batched events, not a per-merge ritual — this respects GitHub free-plan quotas (Actions minutes and GHCR storage) on private repositories. Skipped items accumulate on the default branch; a skip-allowed item closes itself via `policy_skip` right after merge, so no per-item confirmation stands between merge and Done. When the user asks to ship, open a small `maintenance` release item whose only code change bumps the project version, run the standard flow, and confirm the tag at its Gate C: the tagged commit contains every previously merged SHA, so one verified image covers the whole batch. To ship one item immediately instead, confirm the tag at that item's own Gate C.

## Done definition

Done requires approval, coder completed, tester passed, reviewer approved, successful PR workflow evidence, a verified GitHub or control-plane merge guard, PR merged, Issue closed, and exactly one of: a human-confirmed tag whose image build, GHCR digest, Release metadata, SBOM, and provenance are verified, or a skip with `build_status: skipped` that is either policy-applied (`policy_skip` under the Gate-A-approved persisted policy) or human-confirmed (`approve_skip`).

## GitHub communication

Use MCP for Work Item Issue creation, canonical state, projection, authorization, and delivery verification. Use `git` only for code/commit plus individually authorized push/tag operations; use read-only `gh` queries for PR/check/Actions facts. PR creation remains the Primary Agent's responsibility. Merge and Issue close are state-verified by the guard. Subagents never perform GitHub writes.

## Obsidian

Obsidian projections are read-only. ALL Obsidian projections MUST live under the target repository's `plan/` directory, never at the repository root: `plan/00_Dashboard/` (`首页.md` entry page, `研发控制台.md`, `研发看板.md`, `需求列表.md` — all pure Dataview views over frontmatter, never hand-written state), `plan/01_Requirements/`, `plan/02_Bugs/`. Machine state stays at `.hulane/state.json`. `plan/` may already contain human-maintained planning documents — never modify or delete them. Prefer keeping projections out of product-code commits by excluding only `/plan/00_Dashboard/`, `/plan/01_Requirements/`, `/plan/02_Bugs/`, and `/.hulane/` in `.git/info/exclude`; never exclude all of `plan/`.

Work item notes follow `templates/obsidian/work-item-template.md`: H1 is `<ID> <中文标题>`; fixed Chinese H2 skeleton 背景/目标/功能范围/非范围/验收标准/Planner 摘要/GitHub/关联/Agent 执行记录; acceptance criteria are checkboxes and may only be checked with code, test, or Actions evidence; relations use `[[wikilinks]]` to other work items; no tags — classification comes from the `type` field plus directory. File names stay stable (`REQ-<issue-number>.md`, `BUG-<issue-number>.md`). Frontmatter is the single record: keep every field current, refresh `updated` on each sync, and query it in views instead of duplicating status in page text.
