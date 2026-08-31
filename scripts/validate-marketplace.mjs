#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const errors = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  try {
    return JSON.parse(read(relativePath));
  } catch (error) {
    errors.push(`${relativePath}: invalid JSON (${error.message})`);
    return {};
  }
}

function assert(condition, message) {
  if (!condition) errors.push(message);
}

function filesIn(relativePath, suffix = "") {
  const directory = path.join(root, relativePath);
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory)
    .filter((name) => !suffix || name.endsWith(suffix))
    .sort();
}

function frontmatter(relativePath) {
  const content = read(relativePath);
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    errors.push(`${relativePath}: missing YAML frontmatter`);
    return "";
  }
  return match[1];
}

function walk(relativePath = "") {
  const absolute = path.join(root, relativePath);
  const results = [];
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const child = path.join(relativePath, entry.name);
    if (entry.isDirectory()) results.push(...walk(child));
    else results.push(child.split(path.sep).join("/"));
  }
  return results;
}

const marketplace = readJson("marketplace.json");
const plugin = readJson("cmdb-dev/.zcode-plugin/plugin.json");
const packageJson = readJson("package.json");
const hooks = readJson("cmdb-dev/hooks/hooks.json");
const mcp = readJson("cmdb-dev/.mcp.json");
const entry = marketplace.plugins?.find((item) => item.name === "cmdb-dev");

assert(marketplace.name === "cmdb-dev-marketplace", "marketplace name is invalid");
assert(entry?.source === "./cmdb-dev", "cmdb-dev marketplace source must be ./cmdb-dev");
assert(entry?.strict === true, "cmdb-dev marketplace entry must use strict validation");
assert(entry?.version === plugin.version, "marketplace and plugin versions differ");
assert(plugin.version === packageJson.version, "plugin and package versions differ");
assert(plugin.mcpServers === ".mcp.json", "plugin must declare the bundled MCP configuration");
assert(hooks.hooks?.PreToolUse?.some((entry) => entry.matcher === "Bash"), "Bash PreToolUse guard is missing");
assert(Array.isArray(hooks.hooks?.SessionStart), "SessionStart context hook is missing");
assert(Array.isArray(hooks.hooks?.Stop), "Stop completion guard is missing");
assert(hooks.hooks.PreToolUse.every((entry) => entry.hooks?.every((hook) => hook.type === "process")), "PreToolUse hooks must use the process executor");
assert(mcp.mcpServers?.["cmdb-control"]?.type === "stdio", "cmdb-control stdio MCP server is missing");
assert(mcp.mcpServers?.["cmdb-control"]?.args?.some((value) => value.includes("mcp/server.mjs")), "MCP server entrypoint is invalid");

for (const [field, fallback] of [["commands", "commands"], ["skills", "skills"], ["agents", "agents"]]) {
  const componentPath = plugin[field] ?? fallback;
  assert(typeof componentPath === "string" && fs.existsSync(path.join(root, "cmdb-dev", componentPath)),
    `plugin component path is missing: ${field}`);
}

const commands = filesIn("cmdb-dev/commands", ".md");
const agents = filesIn("cmdb-dev/agents", ".md");
const skillFiles = walk("cmdb-dev/skills").filter((name) => name.endsWith("/SKILL.md"));

assert(commands.length === 8, `expected 8 commands, found ${commands.length}`);
assert(agents.length === 5, `expected 5 agents, found ${agents.length}`);
assert(skillFiles.length === 1, `expected 1 skill, found ${skillFiles.length}`);

for (const name of commands) {
  const fm = frontmatter(`cmdb-dev/commands/${name}`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: command description is required`);
  assert(/^skills:\s*cmdb-development\s*$/m.test(fm), `${name}: cmdb-development skill is required`);
}

for (const name of agents) {
  const fm = frontmatter(`cmdb-dev/agents/${name}`);
  assert(/^name:\s*\S+/m.test(fm), `${name}: agent name is required`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: agent description is required`);
}

for (const name of skillFiles) {
  const fm = frontmatter(name);
  assert(/^name:\s*cmdb-development\s*$/m.test(fm), `${name}: skill name is invalid`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: skill description is required`);
}

const buildWorkflow = read("cmdb-dev/templates/github-actions/build-image.yml");
assert(/tags:\s*\["v\*"\]/.test(buildWorkflow), "image workflow must be tag-triggered");
assert(!/workflow_dispatch:/.test(buildWorkflow), "image workflow must not bypass Gate C with workflow_dispatch");
assert(/git merge-base --is-ancestor/.test(buildWorkflow), "image workflow must verify default-branch ancestry");
assert(/sbom:\s*true/.test(buildWorkflow), "image workflow must generate an SBOM");
assert(/provenance:\s*mode=max/.test(buildWorkflow), "image workflow must generate maximum provenance");
assert(/actions\/upload-artifact@v4/.test(buildWorkflow), "image workflow must upload delivery metadata");
assert(/gh release upload/.test(buildWorkflow), "image workflow must publish delivery metadata with the Release");

const prWorkflow = read("cmdb-dev/templates/github-actions/pr-checks.yml");
assert(/pull_request:/.test(prWorkflow), "PR checks workflow must run on pull_request");
assert(/CMDB PR Checks/.test(prWorkflow), "PR checks workflow name must remain stable");
assert(fs.existsSync(path.join(root, "cmdb-dev/templates/github-actions/cmdb-pr-checks.sh")),
  "PR checks runner template is missing");

const board = read("cmdb-dev/templates/obsidian/研发看板.md");
for (const state of ["pr_checking", "waiting_human_merge", "waiting_tag_confirm", "waiting_close"]) {
  assert(board.includes(`\"${state}\"`), `Obsidian board is missing ${state}`);
}

for (const requiredFile of [
  "cmdb-dev/scripts/cmdb-state.mjs",
  "cmdb-dev/scripts/lib/state-machine.mjs",
  "cmdb-dev/scripts/lib/state-store.mjs",
  "cmdb-dev/scripts/lib/github-state.mjs",
  "cmdb-dev/scripts/lib/worktree.mjs",
  "cmdb-dev/scripts/lib/authorization.mjs",
  "cmdb-dev/scripts/lib/delivery.mjs",
  "cmdb-dev/scripts/lib/preflight.mjs",
  "cmdb-dev/scripts/lib/projection.mjs",
  "cmdb-dev/scripts/lib/initializer.mjs",
  "cmdb-dev/mcp/server.mjs",
  "cmdb-dev/mcp/tools.mjs",
  "cmdb-dev/mcp/validate.mjs",
  "cmdb-dev/.mcp.json",
  "cmdb-dev/hooks/guard.mjs",
  "cmdb-dev/schemas/work-item-state.schema.json",
]) {
  assert(fs.existsSync(path.join(root, requiredFile)), `required state runtime file is missing: ${requiredFile}`);
}

const { TOOL_DEFINITIONS } = await import(new URL("../cmdb-dev/mcp/tools.mjs", import.meta.url));
assert(TOOL_DEFINITIONS.length === 11, `expected 11 MCP tools, found ${TOOL_DEFINITIONS.length}`);
assert(new Set(TOOL_DEFINITIONS.map((tool) => tool.name)).size === TOOL_DEFINITIONS.length, "MCP tool names must be unique");

for (const file of walk()) {
  assert(path.basename(file) !== ".DS_Store", `forbidden macOS metadata: ${file}`);
}

if (errors.length) {
  process.stderr.write(`Marketplace validation failed (${errors.length}):\n`);
  for (const error of errors) process.stderr.write(`- ${error}\n`);
  process.exit(1);
}

process.stdout.write(`Marketplace validation passed: ${commands.length} commands, ${agents.length} agents, ${skillFiles.length} skill.\n`);
