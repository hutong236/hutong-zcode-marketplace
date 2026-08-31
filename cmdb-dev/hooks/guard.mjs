#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { consumeAuthorization } from "../scripts/lib/authorization.mjs";
import { findControlRoot, storePath } from "../scripts/lib/state-store.mjs";

function shellSegments(command) {
  return String(command ?? "").split(/(?:\r?\n|&&|\|\||;)/).map((value) => value.trim()).filter(Boolean);
}

function containsGitSubcommand(segment, subcommand) {
  return new RegExp(`\\bgit\\b[^\\n;&|]*\\b${subcommand}\\b`).test(segment);
}

function isReadOnlyGitTag(segment) {
  const normalized = segment.replace(/^\s*CMDB_AUTH_TOKEN=[^\s]+\s+/, "").trim();
  if (!containsGitSubcommand(normalized, "tag")) return true;
  const after = normalized.replace(/^.*?\bgit\b[^\n;&|]*?\btag\b/, "").trim();
  if (!after) return true;
  return /^(?:-l|--list|--contains|--points-at|--merged|--no-merged|--sort(?:=|\s))\b/.test(after);
}

export function analyzeCommand(command) {
  const actions = [];
  for (const segment of shellSegments(command)) {
    if (/\bgh\s+pr\s+merge\b/.test(segment)) actions.push("pr-merge");
    if (/\bgh\s+issue\s+close\b/.test(segment)) actions.push("issue-close");
    if (containsGitSubcommand(segment, "push")) actions.push("git-push");
    if (containsGitSubcommand(segment, "tag") && !isReadOnlyGitTag(segment)) actions.push("git-tag");
  }
  return [...new Set(actions)];
}

function hookResult(decision, reason) {
  return {
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: decision,
      permissionDecisionReason: reason,
    },
  };
}

export function evaluateCommand({ cwd, command, token }) {
  const actions = analyzeCommand(command);
  if (actions.length === 0) return { allowed: true, reason: "No protected operation" };

  let root;
  try {
    root = findControlRoot(cwd);
  } catch {
    return { allowed: true, reason: "Outside a Git worktree" };
  }
  if (!fs.existsSync(storePath(root))) return { allowed: true, reason: "Repository is not managed by cmdb-dev" };
  if (actions.length > 1) return { allowed: false, reason: "Run exactly one protected operation per Bash call" };
  if (/(?:^|[;&|]\s*)cd\s+|\bgit\s+(?:--git-dir|--work-tree|-C)\b/.test(String(command))) {
    return { allowed: false, reason: "Set the Bash tool working directory directly; protected calls may not change or override repository paths" };
  }
  if (!token) return { allowed: false, reason: `${actions[0]} requires a single-use CMDB authorization token` };

  try {
    const authorization = consumeAuthorization(root, { token, action: actions[0], cwd, command });
    return { allowed: true, reason: `Authorized ${actions[0]} for ${authorization.work_item}` };
  } catch (error) {
    return { allowed: false, reason: error.message };
  }
}

async function main() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  const command = input.tool_input?.command ?? input.tool_input?.cmd ?? "";
  const token = String(command).match(/(?:^|\s)CMDB_AUTH_TOKEN=([0-9a-f]{64})(?:\s|$)/)?.[1];
  const result = evaluateCommand({ cwd: input.cwd ?? process.cwd(), command, token });
  process.stdout.write(`${JSON.stringify(hookResult(result.allowed ? "allow" : "deny", result.reason))}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stdout.write(`${JSON.stringify(hookResult("deny", `CMDB guard failed closed: ${error.message}`))}\n`);
  });
}
