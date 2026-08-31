import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { issueAuthorization, consumeAuthorization } from "../cmdb-dev/scripts/lib/authorization.mjs";
import { createWorkItem } from "../cmdb-dev/scripts/lib/state-machine.mjs";
import { writeStore } from "../cmdb-dev/scripts/lib/state-store.mjs";
import { analyzeCommand, evaluateCommand } from "../cmdb-dev/hooks/guard.mjs";

const clock = () => new Date("2026-08-31T12:00:00Z");

function repositoryWithItem(status, overrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmdb-auth-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = { ...createWorkItem({
    id: "REQ-25",
    issue_number: 25,
    title: "Authorization test",
    risk_level: "low",
    delivery_required: true,
  }, clock), status, ...overrides };
  writeStore(root, { schema_version: 2, repository: "acme/cmdb", revision: 0, updated_at: clock().toISOString(), items: { [item.id]: item } });
  return { root, item };
}

test("execution authorizations are state-bound and single-use", () => {
  const { root } = repositoryWithItem("waiting_close");
  const authorization = issueAuthorization(root, {
    id: "REQ-25",
    action: "issue-close",
    actor: "orchestrator",
    ttlSeconds: 120,
  }, clock);
  const consumed = consumeAuthorization(root, {
    token: authorization.token,
    action: "issue-close",
    cwd: root,
    command: `CMDB_AUTH_TOKEN=${authorization.token} gh issue close 25`,
  }, clock);
  assert.equal(consumed.work_item, "REQ-25");
  assert.throws(() => consumeAuthorization(root, {
    token: authorization.token,
    action: "issue-close",
    cwd: root,
    command: `CMDB_AUTH_TOKEN=${authorization.token} gh issue close 25`,
  }, clock), /already been used/);
});

test("authorization rejects the wrong lifecycle state and non-orchestrators", () => {
  const { root } = repositoryWithItem("doing");
  assert.throws(() => issueAuthorization(root, {
    id: "REQ-25",
    action: "git-push",
    actor: "orchestrator",
  }, clock), /forbidden while/);
  assert.throws(() => issueAuthorization(root, {
    id: "REQ-25",
    action: "git-push",
    actor: "cmdb-coder",
  }, clock), /Primary Agent/);
});

test("PR merge authorization pins the control-plane-verified head SHA", () => {
  const sha = "a".repeat(40);
  const { root } = repositoryWithItem("merging", {
    pr_number: 42,
    reviewer_result: "approved",
    pr_checks: "passed",
    pr_check_name: "CMDB PR Checks / verify",
    pr_check_run_url: "https://github.com/acme/cmdb/actions/runs/456",
    pr_head_sha: sha,
    merge_guard_mode: "control_plane_verified",
    required_checks_enforced: false,
  });
  const authorization = issueAuthorization(root, {
    id: "REQ-25",
    action: "pr-merge",
    actor: "orchestrator",
  }, clock);
  assert.throws(() => consumeAuthorization(root, {
    token: authorization.token,
    action: "pr-merge",
    cwd: root,
    command: "gh pr merge 42 --squash",
  }, clock), /pin verified head SHA/);
  const consumed = consumeAuthorization(root, {
    token: authorization.token,
    action: "pr-merge",
    cwd: root,
    command: `gh pr merge 42 --squash --match-head-commit ${sha}`,
  }, clock);
  assert.equal(consumed.target.pr_head_sha, sha);
});

test("guard classifies protected shell operations", () => {
  assert.deepEqual(analyzeCommand("git status && git push origin cmdb/req-25"), ["git-push"]);
  assert.deepEqual(analyzeCommand("gh pr merge 42 --squash"), ["pr-merge"]);
  assert.deepEqual(analyzeCommand("git tag --list 'v*'"), []);
  assert.deepEqual(analyzeCommand("git tag -a v2.0.0 -m release"), ["git-tag"]);
  assert.deepEqual(analyzeCommand("gh issue close 25"), ["issue-close"]);
  const { root } = repositoryWithItem("waiting_close");
  assert.match(evaluateCommand({ cwd: root, command: "cd /tmp && git push origin main" }).reason, /working directory directly/);
});
