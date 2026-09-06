import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWorkItem } from "../cmdb-dev/scripts/lib/state-machine.mjs";
import { writeStore } from "../cmdb-dev/scripts/lib/state-store.mjs";
import { evaluateCommand } from "../cmdb-dev/hooks/guard.mjs";

const EXEMPT_REMOTE = "https://github.com/hutong236/hutong-zcode-marketplace.git";

function managedRepository({ allowlist } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmdb-guard-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = { ...createWorkItem({
    id: "REQ-66",
    issue_number: 66,
    title: "Hook state",
    risk_level: "low",
    delivery_required: true,
  }), status: "doing" };
  writeStore(root, { schema_version: 2, repository: "acme/cmdb", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  if (allowlist) {
    fs.mkdirSync(path.join(root, ".cmdb-dev"), { recursive: true });
    fs.writeFileSync(path.join(root, ".cmdb-dev", "guard-allowlist.json"), JSON.stringify(allowlist));
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
  assert.match(result.reason, /requires a single-use CMDB authorization token/);
});

test("push to a remote outside the allowlist still requires a single-use token", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = "git push https://github.com/hutong236/hutong-project-cmdb.git main";
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use CMDB authorization token/);
});

test("missing allowlist file fails closed for explicit remote pushes", () => {
  const root = managedRepository();
  const command = `git push ${EXEMPT_REMOTE} main`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use CMDB authorization token/);
});

test("allowlist never exempts git tag or merge operations", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const tagResult = evaluateCommand({ cwd: root, command: "git tag -a v1.0.0 -m msg" });
  assert.equal(tagResult.allowed, false);
  assert.match(tagResult.reason, /git-tag requires a single-use CMDB authorization token/);
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
  assert.match(result.reason, /requires a single-use CMDB authorization token/);
});

test("command substitution inside a commit message stays visible to the guard", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git commit -m "$(git push origin main)"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use CMDB authorization token/);
});

test("tag message bodies no longer trip the one-action rule", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git tag -a v1.0.0 -m "match upstream push"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /git-tag requires a single-use CMDB authorization token/);
});
