import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createWorktree, defaultBranchFor } from "../cmdb-dev/scripts/lib/worktree.mjs";
import { findControlRoot } from "../cmdb-dev/scripts/lib/state-store.mjs";

test("worktree creation isolates a Work Item on its own branch", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmdb-worktree-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "CMDB Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });

  const result = createWorktree(root, { id: "REQ-31" });
  assert.equal(result.branch, defaultBranchFor("REQ-31"));
  assert.equal(findControlRoot(result.path), root);
  assert.equal(execFileSync("git", ["branch", "--show-current"], { cwd: result.path, encoding: "utf8" }).trim(), "cmdb/req-31");
});
