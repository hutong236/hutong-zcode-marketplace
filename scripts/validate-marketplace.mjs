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
const plugin = readJson("hulane/.zcode-plugin/plugin.json");
const packageJson = readJson("package.json");
const hooks = readJson("hulane/hooks/hooks.json");
const mcp = readJson("hulane/.mcp.json");
const entry = marketplace.plugins?.find((item) => item.name === "hulane");

assert(marketplace.name === "hulane-marketplace", "marketplace name is invalid");
assert(entry?.source === "./hulane", "hulane marketplace source must be ./hulane");
assert(entry?.strict === true, "hulane marketplace entry must use strict validation");
assert(entry?.version === plugin.version, "marketplace and plugin versions differ");
assert(plugin.version === packageJson.version, "plugin and package versions differ");

// 版本号全锁:除上面三处 JSON,README 插件表、流程规范文档头、SKILL frontmatter、
// CHANGELOG 最新版本标题也必须与 plugin.version 一致,消除手工同步翻车
function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const version = escapeRegExp(plugin.version);
assert(new RegExp(`\\|\\s*\`hulane\`\\s*\\|\\s*${version}\\s*\\|`).test(read("README.md")),
  "README plugin table version differs from plugin.json");
assert(new RegExp(`^\\*\\*版本：\\*\\*\\s*V${version}\\s*$`, "m").test(read("Hulane_ZCode_AI_Dev_Workflow.md")),
  "Hulane_ZCode_AI_Dev_Workflow.md header version differs from plugin.json");
assert(new RegExp(`^\\s*version:\\s*${version}\\s*$`, "m").test(read("hulane/skills/hulane-development/SKILL.md")),
  "SKILL.md frontmatter version differs from plugin.json");
assert(new RegExp(`^## \\[${version}\\]`, "m").test(read("CHANGELOG.md")),
  "CHANGELOG.md is missing the current version heading");

// 策略哨兵:默认交付策略的载重令牌在四处文档中必须原样出现,漂移即失败
for (const policyDoc of ["README.md", "INSTALL.md", "Hulane_ZCode_AI_Dev_Workflow.md", "hulane/skills/hulane-development/SKILL.md"]) {
  const content = read(policyDoc);
  assert(content.includes("`delivery_required: false`"), `${policyDoc}: default delivery policy token \`delivery_required: false\` is missing`);
  assert(content.includes("`skip_allowed: true`"), `${policyDoc}: default delivery policy token \`skip_allowed: true\` is missing`);
}
assert(plugin.mcpServers === ".mcp.json", "plugin must declare the bundled MCP configuration");
assert(hooks.hooks?.PreToolUse?.some((entry) => entry.matcher === "Bash"), "Bash PreToolUse guard is missing");
assert(Array.isArray(hooks.hooks?.SessionStart), "SessionStart context hook is missing");
assert(Array.isArray(hooks.hooks?.Stop), "Stop completion guard is missing");
assert(hooks.hooks.PreToolUse.every((entry) => entry.hooks?.every((hook) => hook.type === "process")), "PreToolUse hooks must use the process executor");
assert(mcp.mcpServers?.["hulane-control"]?.type === "stdio", "hulane-control stdio MCP server is missing");
assert(mcp.mcpServers?.["hulane-control"]?.args?.some((value) => value.includes("mcp/server.mjs")), "MCP server entrypoint is invalid");

for (const [field, fallback] of [["commands", "commands"], ["skills", "skills"], ["agents", "agents"]]) {
  const componentPath = plugin[field] ?? fallback;
  assert(typeof componentPath === "string" && fs.existsSync(path.join(root, "hulane", componentPath)),
    `plugin component path is missing: ${field}`);
}

const commands = filesIn("hulane/commands", ".md");
const agents = filesIn("hulane/agents", ".md");
const skillFiles = walk("hulane/skills").filter((name) => name.endsWith("/SKILL.md"));

assert(commands.length === 8, `expected 8 commands, found ${commands.length}`);
assert(agents.length === 5, `expected 5 agents, found ${agents.length}`);
assert(skillFiles.length === 1, `expected 1 skill, found ${skillFiles.length}`);

for (const name of commands) {
  const fm = frontmatter(`hulane/commands/${name}`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: command description is required`);
  assert(/^skills:\s*hulane-development\s*$/m.test(fm), `${name}: hulane-development skill is required`);
}

for (const name of agents) {
  const fm = frontmatter(`hulane/agents/${name}`);
  assert(/^name:\s*\S+/m.test(fm), `${name}: agent name is required`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: agent description is required`);
}

for (const name of skillFiles) {
  const fm = frontmatter(name);
  assert(/^name:\s*hulane-development\s*$/m.test(fm), `${name}: skill name is invalid`);
  assert(/^description:\s*\S+/m.test(fm), `${name}: skill description is required`);
}

const buildWorkflow = read("hulane/templates/github-actions/build-image.yml");
assert(/tags:\s*\["v\*"\]/.test(buildWorkflow), "image workflow must be tag-triggered");
assert(!/workflow_dispatch:/.test(buildWorkflow), "image workflow must not bypass Gate C with workflow_dispatch");
assert(/git merge-base --is-ancestor/.test(buildWorkflow), "image workflow must verify default-branch ancestry");
assert(/sbom:\s*true/.test(buildWorkflow), "image workflow must generate an SBOM");
assert(/provenance:\s*mode=max/.test(buildWorkflow), "image workflow must generate maximum provenance");
assert(/actions\/upload-artifact@v4/.test(buildWorkflow), "image workflow must upload delivery metadata");
assert(/gh release upload/.test(buildWorkflow), "image workflow must publish delivery metadata with the Release");

const prWorkflow = read("hulane/templates/github-actions/pr-checks.yml");
assert(/pull_request:/.test(prWorkflow), "PR checks workflow must run on pull_request");
assert(/Hulane PR Checks/.test(prWorkflow), "PR checks workflow name must remain stable");
assert(fs.existsSync(path.join(root, "hulane/templates/github-actions/hulane-pr-checks.sh")),
  "PR checks runner template is missing");

const board = read("hulane/templates/obsidian/研发看板.md");
for (const state of ["pr_checking", "waiting_human_merge", "waiting_tag_confirm", "waiting_close"]) {
  assert(board.includes(`\"${state}\"`), `Obsidian board is missing ${state}`);
}

for (const requiredFile of [
  "hulane/scripts/hulane-state.mjs",
  "hulane/scripts/lib/state-machine.mjs",
  "hulane/scripts/lib/state-store.mjs",
  "hulane/scripts/lib/github-state.mjs",
  "hulane/scripts/lib/worktree.mjs",
  "hulane/scripts/lib/authorization.mjs",
  "hulane/scripts/lib/delivery.mjs",
  "hulane/scripts/lib/preflight.mjs",
  "hulane/scripts/lib/pr-checks.mjs",
  "hulane/scripts/lib/projection.mjs",
  "hulane/scripts/lib/initializer.mjs",
  "hulane/mcp/server.mjs",
  "hulane/mcp/tools.mjs",
  "hulane/mcp/validate.mjs",
  "hulane/.mcp.json",
  "hulane/hooks/guard.mjs",
  "hulane/schemas/work-item-state.schema.json",
]) {
  assert(fs.existsSync(path.join(root, requiredFile)), `required state runtime file is missing: ${requiredFile}`);
}

const { TOOL_DEFINITIONS } = await import(new URL("../hulane/mcp/tools.mjs", import.meta.url));
assert(TOOL_DEFINITIONS.length === 12, `expected 12 MCP tools, found ${TOOL_DEFINITIONS.length}`);
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
