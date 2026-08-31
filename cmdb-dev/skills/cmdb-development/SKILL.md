---
name: cmdb-development
description: Use for CMDB project feature, bug, refactor, GitHub Issue, Pull Request, test, review, GitHub Actions, and Docker image delivery tasks. The ZCode primary Agent is the orchestrator and plugin subagents handle planning, coding, testing, review, and build verification.
when_to_use: Use whenever the user asks to create, approve, resume, implement, test, review, or check the delivery status of a CMDB requirement or bug.
metadata:
  author: CMDB Project
  version: 1.1.0
---

# CMDB Development Skill

The active ZCode Primary Agent is the Orchestrator. Dispatch plugin subagents: `cmdb-planner`, `cmdb-coder`, `cmdb-tester`, `cmdb-reviewer`, `cmdb-build-checker`. A subagent must never be asked to spawn another subagent.

## Human gates

1. New work always stops for requirement approval before business code changes.
2. High-risk PR merge requires explicit human approval.
3. Scope changes and irrecoverable blockers require human input.
4. No human confirmation is required between Coder -> Tester -> Reviewer.

## Truth precedence

GitHub actual Issue/PR/Actions state > Git branch/commit state > local Markdown projection > inference.

## Work Item identity

Create GitHub Issue first, then derive `REQ-<issue-number>` for feature/refactor/maintenance or `BUG-<issue-number>` for bug. Update the Issue title accordingly.

## New request lifecycle

1. Inspect repository and classify request.
2. If it is not development work, do not create an Issue.
3. Dispatch `cmdb-planner` read-only.
4. Create GitHub Issue with `gh issue create`.
5. Derive REQ/BUG ID from issue number and update Issue title/body.
6. Write/update local read-only Markdown projection.
7. Set `status: waiting_approval`, `human_approval: required`.
8. STOP. Do not create branch or edit business code.

## After explicit approval

1. Verify Issue remains open and reconcile remote/local state.
2. Comment approval on the Issue.
3. Create/reuse local branch from default branch.
4. Dispatch Coder.
5. Coder complete -> Tester.
6. Tester failure caused by implementation -> Coder -> Tester again.
7. Tester passed -> Reviewer.
8. Reviewer changes_requested -> Coder -> Tester -> Reviewer.
9. Reviewer approved -> Primary Agent commits only related changes and pushes.
10. Create PR with `gh pr create`; body uses `Refs #<issue>`, never `Closes`/`Fixes`.
11. Read PR checks. Failed checks return to Coder with evidence.
12. Low/medium risk: merge automatically when repo rules allow. High risk: stop at `waiting_human_merge`.
13. After merge, find merged SHA and image-build Actions run.
14. Dispatch Build Checker.
15. Only when image build AND push are proven: record image/tag/digest/SHA/run URL, close Issue, mark Done.

## Done definition

Done requires approval, coder completed, tester passed, reviewer approved, PR merged, Docker image built and pushed, digest known, and Issue closed.

## GitHub communication

Use `git` for local code/branch/commit/push; `gh issue` for Issues; `gh pr` for PR/checks/merge; `gh run` for Actions; `gh api` only when needed.

## Obsidian

Obsidian projections are read-only. ALL Obsidian projections MUST live under the target repository's `plan/` directory, never at the repository root: `plan/00_Dashboard/研发控制台.md`, `plan/01_Requirements/`, `plan/02_Bugs/`. Machine state stays at `.cmdb-dev/state.json`. `plan/` may already contain human-maintained planning documents — never modify or delete them; the plugin only manages its own subdirectories and files under `plan/`. Prefer keeping projections out of product-code commits by excluding `plan/` and `.cmdb-dev/` in `.git/info/exclude`, not shared `.gitignore` (already-tracked files in `plan/` are unaffected by this exclude).
