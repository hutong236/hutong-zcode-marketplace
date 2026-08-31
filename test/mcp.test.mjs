import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { TOOL_DEFINITIONS, callTool } from "../cmdb-dev/mcp/tools.mjs";
import { validateInput } from "../cmdb-dev/mcp/validate.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const server = path.join(repositoryRoot, "cmdb-dev", "mcp", "server.mjs");

function gitRepository() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "cmdb-mcp-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "test@example.com"], { cwd: root });
  execFileSync("git", ["config", "user.name", "CMDB Test"], { cwd: root });
  fs.writeFileSync(path.join(root, "README.md"), "test\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  return root;
}

test("MCP tool catalog is deterministic and input schemas reject extra fields", () => {
  assert.equal(TOOL_DEFINITIONS.length, 12);
  assert.equal(new Set(TOOL_DEFINITIONS.map((tool) => tool.name)).size, 12);
  const preflight = TOOL_DEFINITIONS.find((tool) => tool.name === "cmdb_preflight");
  assert.deepEqual(validateInput(preflight.inputSchema, { unexpected: true }), ["arguments.unexpected is not allowed"]);
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
    { jsonrpc: "2.0", id: 3, method: "tools/call", params: { name: "cmdb_initialize", arguments: {} } },
    { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "cmdb_validate", arguments: {} } },
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
  assert.equal(responses.find((response) => response.id === 2).result.tools.length, 12);
  assert.equal(responses.find((response) => response.id === 3).result.isError, undefined);
  assert.equal(responses.find((response) => response.id === 4).result.structuredContent.valid, true);
  assert.ok(fs.existsSync(path.join(root, ".cmdb-dev", "state.json")));
});

test("MCP server returns a protocol error for malformed tool input", () => {
  const root = gitRepository();
  const request = { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "cmdb_transition", arguments: { id: "bad" } } };
  const result = spawnSync(process.execPath, [server], { cwd: root, input: `${JSON.stringify(request)}\n`, encoding: "utf8" });
  const response = JSON.parse(result.stdout.trim());
  assert.equal(response.error.code, -32602);
});

test("generic transitions cannot bypass dedicated worktree, PR-check, or delivery evidence tools", () => {
  const root = gitRepository();
  assert.throws(() => callTool("cmdb_transition", {
    id: "REQ-1",
    event: "image_verified",
    actor: "orchestrator",
    evidence: "forged",
    sync: false,
  }, { cwd: root, pluginRoot: path.join(repositoryRoot, "cmdb-dev") }), /reserved/);
  assert.throws(() => callTool("cmdb_transition", {
    id: "REQ-1",
    event: "checks_passed",
    actor: "orchestrator",
    evidence: "forged",
    sync: false,
  }, { cwd: root, pluginRoot: path.join(repositoryRoot, "cmdb-dev") }), /reserved/);
});
