#!/usr/bin/env node

import fs from "node:fs";
import process from "node:process";
import { findControlRoot, readStore, storePath } from "../scripts/lib/state-store.mjs";
import { isTerminalState } from "../scripts/lib/state-machine.mjs";

let raw = "";
process.stdin.setEncoding("utf8");
for await (const chunk of process.stdin) raw += chunk;
const input = JSON.parse(raw || "{}");

let context = "hulane V2 is enabled. Use the hulane-control MCP tools for state and authority; GitHub is canonical. Preserve Gates A/B/C and never let plugin subagents spawn subagents.";
try {
  const root = findControlRoot(input.cwd ?? process.cwd());
  try {
    if (fs.existsSync(storePath(root))) {
      // 终态(done 已交付 / abandoned 已作废)不进活跃工单清单
      const items = Object.values(readStore(root, { allowMissing: false }).items)
        .filter((item) => !isTerminalState(item.status))
        .map((item) => `${item.id}:${item.status}@r${item.revision}`)
        .slice(0, 20);
      context += items.length ? ` Active Work Items: ${items.join(", ")}. Hydrate GitHub before resuming one.` : " There are no active local Work Items.";
    } else {
      context += " This repository is not initialized; run hulane_preflight before hulane_initialize.";
    }
  } catch (error) {
    // store 读取/校验失败单独归因(BUG-15):脏 store 报「加载失败 + 原因 +
    // 先修 store」,不得再借 catch-all 误报 not a Git worktree;fail-closed
    // 语义不变(不列活跃工单、不误称已初始化)
    context += ` The hulane state store failed to load: ${error.message}. Fix the store before running hulane operations.`;
  }
} catch {
  context += " The current directory is not a Git worktree.";
}

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName: input.hook_event_name ?? "SessionStart",
    additionalContext: context,
  },
}));
