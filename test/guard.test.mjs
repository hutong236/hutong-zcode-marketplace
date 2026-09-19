import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWorkItem } from "../hulane/scripts/lib/state-machine.mjs";
import { writeStore } from "../hulane/scripts/lib/state-store.mjs";
import { evaluateCommand } from "../hulane/hooks/guard.mjs";

const EXEMPT_REMOTE = "https://github.com/hutong236/hutong-zcode-marketplace.git";

function managedRepository({ allowlist, overrides = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-guard-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = { ...createWorkItem({
    id: "REQ-66",
    issue_number: 66,
    title: "Hook state",
    risk_level: "low",
    delivery_required: true,
  }), status: "doing", ...overrides };
  writeStore(root, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  if (allowlist) {
    fs.mkdirSync(path.join(root, ".hulane"), { recursive: true });
    fs.writeFileSync(path.join(root, ".hulane", "guard-allowlist.json"), JSON.stringify(allowlist));
  }
  return root;
}

test("explicit push to an allowlisted remote is allowed even when the command changes directory", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = `cd /tmp/hutong-zcode-marketplace && git -c credential.helper='!gh auth git-credential' push ${EXEMPT_REMOTE} main`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /exempt remote/);
});

test("bare git push still requires a single-use token", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const result = evaluateCommand({ cwd: root, command: "git push" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("push to a remote outside the allowlist still requires a single-use token", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = "git push https://github.com/hutong236/hutong-project-demo.git main";
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("missing allowlist file fails closed for explicit remote pushes", () => {
  const root = managedRepository();
  const command = `git push ${EXEMPT_REMOTE} main`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("allowlist never exempts git tag or merge operations", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const tagResult = evaluateCommand({ cwd: root, command: "git tag -a v1.0.0 -m msg" });
  assert.equal(tagResult.allowed, false);
  assert.match(tagResult.reason, /git-tag requires a single-use Hulane authorization token/);
});

test("ascii push/tag words inside a quoted commit message are not protected operations", () => {
  const root = managedRepository();
  const command = 'git commit -m "feat(guard): push allowlist exemption for tag workflows"';
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("unquoted hyphenated commit message tokens are not mistaken for git subcommands", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: "git commit -m fix-push-tag-regression" });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("heredoc style commit messages are scanned without the message body", () => {
  const root = managedRepository();
  const command = 'git commit -m "$(cat <<\'EOF\'\nfeat: push allowlist\nsupport tag workflows\nEOF\n)"';
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("a commit message cannot feed the push allowlist for a following bare push", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = `git commit -m "git push ${EXEMPT_REMOTE} main" && git push`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("command substitution inside a commit message stays visible to the guard", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git commit -m "$(git push origin main)"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("tag message bodies no longer trip the one-action rule", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git tag -a v1.0.0 -m "match upstream push"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /git-tag requires a single-use Hulane authorization token/);
});

const mergeGuardEvidence = {
  reviewer_result: "approved",
  pr_checks: "passed",
  pr_check_name: "Hulane PR Checks / verify",
  pr_check_run_url: "https://github.com/acme/demo/actions/runs/456",
  pr_head_sha: "a".repeat(40),
  merge_guard_mode: "control_plane_verified",
  required_checks_enforced: false,
  pr_number: 66,
};

test("issue close without a token is state-verified from waiting_close", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  const result = evaluateCommand({ cwd: root, command: 'gh issue close 66 --repo acme/demo --comment "Done"' });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /State-verified issue-close for REQ-66/);
});

test("issue close state verification rejects unknown numbers and wrong states", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh issue close 999" }).reason,
    /exactly one Work Item/,
  );
  const midFlight = managedRepository();
  assert.match(
    evaluateCommand({ cwd: midFlight, command: "gh issue close 66" }).reason,
    /forbidden while REQ-66 is doing/,
  );
});

test("pr merge without a token is state-verified from merging with the pinned head SHA", () => {
  const root = managedRepository({ overrides: { status: "merging", ...mergeGuardEvidence } });
  const command = `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)}`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /State-verified pr-merge for REQ-66/);
});

test("pr merge state verification rejects mismatched numbers, SHAs, and states", () => {
  const root = managedRepository({ overrides: { status: "merging", ...mergeGuardEvidence } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh pr merge 999 --squash" }).reason,
    /exactly one Work Item/,
  );
  assert.match(
    evaluateCommand({ cwd: root, command: `gh pr merge 66 --squash --match-head-commit ${"b".repeat(40)}` }).reason,
    /pin verified head SHA/,
  );
  const unverified = managedRepository({ overrides: { status: "doing", ...mergeGuardEvidence } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh pr merge 66 --squash" }).reason,
    /pin verified head SHA/,
  );
  assert.match(
    evaluateCommand({ cwd: unverified, command: `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)}` }).reason,
    /forbidden while REQ-66 is doing/,
  );
});

test("state-verified operations still respect the one-operation rule", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  const result = evaluateCommand({ cwd: root, command: 'gh issue close 66 && git push origin main' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /exactly one protected operation/);
});
