#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
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

// git push 命令中显式给出的远端参数（过滤选项与环境变量赋值，取第一个位置参数）；
// 裸 `git push` 返回空
function pushRemoteTargets(segment) {
  const match = segment.match(/\bgit\b[^\n;&|]*?\bpush\b\s+(.+)$/);
  if (!match) return [];
  const args = match[1]
    .trim()
    .split(/\s+/)
    .filter((arg) => !arg.startsWith("-") && !/^[A-Za-z_][A-Za-z0-9_]*=/.test(arg));
  return args.length > 0 ? [args[0]] : [];
}

// 统一远端写法便于比对：剥协议、user@ 与 .git 后缀（github.com/owner/repo）
function normalizeRemoteTarget(target) {
  return target
    .replace(/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//, "")
    .replace(/^[^@/]+@/, "")
    .replace(/\.git$/i, "")
    .toLowerCase();
}

// 白名单来自控制根 .cmdb-dev/guard-allowlist.json（字符串数组，子串匹配归一化远端）
function readPushAllowlist(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, ".cmdb-dev", "guard-allowlist.json"), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((entry) => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function pushTargetsExempt(root, command) {
  const allowlist = readPushAllowlist(root);
  if (allowlist.length === 0) return { exempt: false };
  const segments = shellSegments(command).filter((segment) => containsGitSubcommand(segment, "push"));
  if (segments.length === 0) return { exempt: false };
  const targets = [];
  for (const segment of segments) {
    const remotes = pushRemoteTargets(segment);
    // 裸 `git push`（推 origin）不受白名单保护，必须走令牌
    if (remotes.length === 0) return { exempt: false };
    targets.push(...remotes);
  }
  const unmatched = targets.filter((target) => {
    const normalized = normalizeRemoteTarget(target);
    return !allowlist.some((entry) => normalized.includes(entry.toLowerCase()));
  });
  return unmatched.length === 0 ? { exempt: true, targets } : { exempt: false };
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
  if (actions[0] === "git-push") {
    // 白名单内的显式远端（如插件市场仓库）不受令牌门禁；必须在 cd/-C 检查前判断，
    // 跨仓推送天然需要切换工作目录
    const exemption = pushTargetsExempt(root, command);
    if (exemption.exempt) {
      return { allowed: true, reason: `Allowed push to exempt remote: ${exemption.targets.join(", ")}` };
    }
  }
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
