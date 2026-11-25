import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWorkItem } from "../hulane/scripts/lib/state-machine.mjs";
import { writeStore } from "../hulane/scripts/lib/state-store.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function managedRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-hooks-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = { ...createWorkItem({
    id: "REQ-66",
    issue_number: 66,
    title: "Hook state",
    risk_level: "low",
    delivery_required: true,
    skip_allowed: false,
  }), status: "doing" };
  writeStore(root, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  return root;
}

test("session context reports active canonical state", () => {
  const root = managedRepository();
  const script = path.join(repositoryRoot, "hulane", "hooks", "context.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: root }),
    encoding: "utf8",
  });
  const output = JSON.parse(result.stdout);
  assert.match(output.hookSpecificOutput.additionalContext, /REQ-66:doing/);
});

test("stop hook rejects a false completion claim", () => {
  const root = managedRepository();
  const script = path.join(repositoryRoot, "hulane", "hooks", "stop.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ hook_event_name: "Stop", cwd: root, last_assistant_message: "REQ-66 is completed." }),
    encoding: "utf8",
  });
  const output = JSON.parse(result.stdout);
  assert.equal(output.decision, "block");
  assert.match(output.reason, /REQ-66 is doing/);
});

// REQ-14:abandoned 是终态——不进活跃清单、不触发 Stop 完成声明拦截(AC-13)
test("session context omits abandoned items from the active list", () => {
  const root = managedRepository();
  const store = JSON.parse(fs.readFileSync(path.join(root, ".hulane", "state.json"), "utf8"));
  store.items["REQ-66"].status = "abandoned";
  fs.writeFileSync(path.join(root, ".hulane", "state.json"), JSON.stringify(store, null, 2));
  const script = path.join(repositoryRoot, "hulane", "hooks", "context.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ hook_event_name: "SessionStart", cwd: root }),
    encoding: "utf8",
  });
  const output = JSON.parse(result.stdout);
  assert.doesNotMatch(output.hookSpecificOutput.additionalContext, /REQ-66:abandoned/);
  assert.match(output.hookSpecificOutput.additionalContext, /no active local Work Items/);
});

test("stop hook treats an abandoned item as terminal and does not block completion claims", () => {
  const root = managedRepository();
  const store = JSON.parse(fs.readFileSync(path.join(root, ".hulane", "state.json"), "utf8"));
  store.items["REQ-66"].status = "abandoned";
  fs.writeFileSync(path.join(root, ".hulane", "state.json"), JSON.stringify(store, null, 2));
  const script = path.join(repositoryRoot, "hulane", "hooks", "stop.mjs");
  const result = spawnSync(process.execPath, [script], {
    cwd: root,
    input: JSON.stringify({ hook_event_name: "Stop", cwd: root, last_assistant_message: "REQ-66 is completed." }),
    encoding: "utf8",
  });
  assert.equal(result.stdout.trim(), "");
});
