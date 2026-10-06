import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TOOL_DEFINITIONS, callTool } from "../hulane/mcp/tools.mjs";
import { validateInput } from "../hulane/mcp/validate.mjs";
import { createWorkItem } from "../hulane/scripts/lib/state-machine.mjs";
import { writeStore } from "../hulane/scripts/lib/state-store.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(repositoryRoot, "hulane", "mcp", "server.mjs");
const pluginRoot = path.join(repositoryRoot, "hulane");

function gitRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-mcp-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "Hulane Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  return root;
}

const validCapabilitySpec = [
  "# billing Specification",
  "",
  "## Purpose",
  "",
  "中文目的。",
  "",
  "## Requirements",
  "",
  "### Requirement: 开票",
  "",
  "系统 SHALL 开票。",
  "",
  "#### Scenario: 正常开票",
  "",
  "- WHEN 已确认",
  "- THEN 开票",
].join("\n");

const validDeltaSpec = "## ADDED Requirements\n\n### Requirement: 开票\n\n#### Scenario: 正常开票\n";

// 提交树内含合法 openspec 规格,并把 REQ-1 停在 waiting_close(merged_sha=该提交)
function specsRepository({ malformed = false, withSpecs = true } = {}) {
  const root = gitRepository();
  if (withSpecs) {
    fs.mkdirSync(path.join(root, "openspec", "specs", "billing"), { recursive: true });
    fs.writeFileSync(
      path.join(root, "openspec", "specs", "billing", "spec.md"),
      malformed
        ? "# billing Specification\n\n## Purpose\n\n## Requirements\n\n### Requirement: 开票\n\n系统 SHALL 开票。\n"
        : validCapabilitySpec,
    );
    fs.mkdirSync(path.join(root, "openspec", "changes", "archive", "REQ-1"), { recursive: true });
    fs.writeFileSync(path.join(root, "openspec", "changes", "archive", "REQ-1", "delta.md"), validDeltaSpec);
    execFileSync("git", ["add", "-A"], { cwd: root });
    execFileSync("git", ["commit", "-qm", "specs"], { cwd: root });
  }
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  const item = {
    ...createWorkItem({
      id: "REQ-1",
      issue_number: 1,
      title: "Spec sync",
      risk_level: "low",
      delivery_required: false,
      delivery_reason: "Docs only",
      skip_allowed: true,
    }),
    status: "waiting_close",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_checks: "passed",
    pr_check_name: "Hulane PR Checks / verify",
    pr_check_run_url: "https://github.com/acme/demo/actions/runs/456",
    pr_head_sha: "b".repeat(40),
    merge_guard_mode: "github_required_checks",
    required_checks_enforced: true,
    merged_sha: sha,
  };
  writeStore(root, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  return { root, sha, item };
}

test("MCP tool catalog is deterministic and input schemas reject extra fields", () => {
  assert.equal(TOOL_DEFINITIONS.length, 14);
  assert.equal(new Set(TOOL_DEFINITIONS.map((tool) => tool.name)).size, 14);
  const preflight = TOOL_DEFINITIONS.find((tool) => tool.name === "hulane_preflight");
  assert.deepEqual(validateInput(preflight.inputSchema, { unexpected: true }), ["arguments.unexpected is not allowed"]);
});

test("hulane_authorize_release validates version, sha, actor, evidence, and ttl bounds", () => {
  const tool = TOOL_DEFINITIONS.find((entry) => entry.name === "hulane_authorize_release");
  assert.ok(tool, "hulane_authorize_release must exist in the catalog");
  const base = { version: "v1.2.3", sha: "a".repeat(40), actor: "orchestrator", evidence: "user asked to release" };
  assert.deepEqual(validateInput(tool.inputSchema, base), []);
  for (const field of ["version", "sha", "evidence"]) {
    const { [field]: omitted, ...rest } = base;
    assert.ok(
      validateInput(tool.inputSchema, rest).some((error) => error.includes(`.${field}`)),
      `missing ${field} must be rejected`,
    );
  }
  assert.ok(validateInput(tool.inputSchema, { ...base, actor: "hulane-coder" }).some((error) => error.includes("actor")));
  assert.ok(validateInput(tool.inputSchema, { ...base, sha: "short" }).some((error) => error.includes("sha")));
  assert.ok(validateInput(tool.inputSchema, { ...base, ttl_seconds: 9 }).some((error) => error.includes("ttl_seconds")));
  assert.ok(validateInput(tool.inputSchema, { ...base, ttl_seconds: 601 }).some((error) => error.includes("ttl_seconds")));
  assert.ok(validateInput(tool.inputSchema, { ...base, unexpected: true }).some((error) => error.includes("unexpected")));
});

test("MCP server supports modern discovery and legacy initialization", () => {
  const root = gitRepository();
  const modernMeta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientInfo": { name: "test", version: "1" },
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const messages = [
    { jsonrpc: "2.0", id: "discover", method: "server/discover", params: { _meta: modernMeta } },
    { jsonrpc: "2.0", id: "modern-list", method: "tools/list", params: { _meta: modernMeta } },
    { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "test", version: "1" } } },
    { jsonrpc: "2.0", method: "notifications/initialized" },
    { jsonrpc: "2.0", id: 2, method: "tools/list", params: {} },
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "hulane_initialize", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "hulane_validate", arguments: {} } },
  ];
  const result = spawnSync(process.execPath, [server], {
    cwd: root,
    input: `${messages.map((message) => JSON.stringify(message)).join("\n")}\n`,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const responses = result.stdout.trim().split("\n").map((line) => JSON.parse(line));
  assert.ok(responses.find((response) => response.id === "discover").result.supportedVersions.includes("2026-07-28"));
  assert.equal(responses.find((response) => response.id === "modern-list").result.resultType, "complete");
  assert.equal(responses.find((response) => response.id === 1).result.protocolVersion, "2025-11-25");
  assert.equal(responses.find((response) => response.id === 2).result.tools.length, 14);
  assert.equal(responses.find((response) => response.id === 3).result.isError, undefined);
  assert.equal(responses.find((response) => response.id === 4).result.structuredContent.valid, true);
  assert.ok(fs.existsSync(path.join(root, ".hulane", "state.json")));
});

test("MCP server returns a protocol error for malformed tool input", () => {
  const root = gitRepository();
  const request = { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "hulane_transition", arguments: { id: "bad" } } };
  const result = spawnSync(process.execPath, [server], { cwd: root, input: `${JSON.stringify(request)}\n`, encoding: "utf8" });
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.error.code, -32602);
});

test("generic transitions cannot bypass dedicated worktree, PR-check, or delivery evidence tools", () => {
  const root = gitRepository();
  assert.throws(() => callTool("hulane_transition", {
    id: "REQ-1",
    event: "image_verified",
    actor: "orchestrator",
    evidence: "forged",
    sync: false,
  }, { cwd: root, pluginRoot: path.join(repositoryRoot, "hulane") }), /reserved/);
  assert.throws(() => callTool("hulane_transition", {
    id: "REQ-1",
    event: "checks_passed",
    actor: "orchestrator",
    evidence: "forged",
    sync: false,
  }, { cwd: root, pluginRoot: path.join(repositoryRoot, "hulane") }), /reserved/);
  assert.throws(() => callTool("hulane_transition", {
    id: "REQ-1",
    event: "specs_synced",
    actor: "orchestrator",
    evidence: "forged",
    patch: { specs_commit_sha: "a".repeat(40), spec_delta_dir: "openspec/changes/archive/REQ-1" },
    sync: false,
  }, { cwd: root, pluginRoot: path.join(repositoryRoot, "hulane") }), /reserved/);
});

test("hulane_record_specs_synced validates the merged tree then records the evidence", () => {
  const { root, sha } = specsRepository();
  const result = callTool("hulane_record_specs_synced", {
    id: "REQ-1",
    actor: "orchestrator",
    evidence: "merged tree spec structure validated",
    specs_commit_sha: sha,
    spec_delta_dir: "openspec/changes/archive/REQ-1",
    sync: false,
  }, { cwd: root, pluginRoot });
  assert.equal(result.item.status, "waiting_close");
  assert.equal(result.item.specs_synced, true);
  assert.equal(result.item.specs_commit_sha, sha);
  assert.equal(result.specs_validation.commit, sha);
  assert.deepEqual(result.specs_validation.specs, [{ file: "openspec/specs/billing/spec.md", capability: "billing", requirements: 1 }]);
  assert.throws(() => callTool("hulane_record_specs_synced", {
    id: "REQ-1",
    actor: "orchestrator",
    evidence: "double record",
    specs_commit_sha: sha,
    spec_delta_dir: "openspec/changes/archive/REQ-1",
    sync: false,
  }, { cwd: root, pluginRoot }), /already recorded/);
});

test("hulane_record_specs_synced rejects malformed trees and mismatched SHAs", () => {
  const malformed = specsRepository({ malformed: true });
  assert.throws(() => callTool("hulane_record_specs_synced", {
    id: "REQ-1",
    actor: "orchestrator",
    evidence: "malformed",
    specs_commit_sha: malformed.sha,
    spec_delta_dir: "openspec/changes/archive/REQ-1",
    sync: false,
  }, { cwd: malformed.root, pluginRoot }), /Scenario/);

  const bare = specsRepository({ withSpecs: false });
  assert.throws(() => callTool("hulane_record_specs_synced", {
    id: "REQ-1",
    actor: "orchestrator",
    evidence: "no specs",
    specs_commit_sha: bare.sha,
    spec_delta_dir: "openspec/changes/archive/REQ-1",
    sync: false,
  }, { cwd: bare.root, pluginRoot }), /no openspec\/specs/);

  const { root, sha } = specsRepository();
  assert.throws(() => callTool("hulane_record_specs_synced", {
    id: "REQ-1",
    actor: "orchestrator",
    evidence: "wrong sha",
    specs_commit_sha: "c".repeat(40),
    spec_delta_dir: "openspec/changes/archive/REQ-1",
    sync: false,
  }, { cwd: root, pluginRoot }), /must equal the recorded merged_sha/);
});
