import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createWorkItem } from "../hulane/scripts/lib/state-machine.mjs";
import { initializeRepositoryState, readStore, writeStore } from "../hulane/scripts/lib/state-store.mjs";

test("state store binds once to a GitHub repository", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-store-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  initializeRepositoryState(root);
  const bound = initializeRepositoryState(root, "acme/demo");
  assert.equal(bound.repository, "acme/demo");
  assert.throws(() => initializeRepositoryState(root, "other/repo"), /belongs to acme\/demo/);
});

// REQ-14:store 严格拒绝矛盾两旗工单(AC-4,fail-closed)
test("readStore and writeStore strictly reject contradictory delivery policy flags", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-store-policy-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = createWorkItem({
    id: "REQ-2",
    issue_number: 2,
    title: "Contradictory policy",
    risk_level: "low",
    delivery_required: false,
    delivery_reason: "docs",
    skip_allowed: true,
  });
  const poisoned = { ...item, skip_allowed: false }; // false+false
  // writeStore 在落盘前拒绝
  assert.throws(
    () => writeStore(root, { schema_version: 2, repository: null, revision: 0, updated_at: new Date().toISOString(), items: { [poisoned.id]: poisoned } }),
    /invalid delivery policy/,
  );
  // 手写脏 store 文件绕过 writeStore:readStore 同样拒绝(含脏数据的 store 整体不可读)
  fs.mkdirSync(path.join(root, ".hulane"), { recursive: true });
  fs.writeFileSync(path.join(root, ".hulane", "state.json"), JSON.stringify({
    schema_version: 2,
    repository: null,
    revision: 0,
    updated_at: new Date(0).toISOString(),
    items: { [poisoned.id]: poisoned },
  }));
  assert.throws(() => readStore(root, { allowMissing: false }), /invalid delivery policy/);
});
