#!/usr/bin/env node

import process from "node:process";
import { buildStats, readModelIoRecords, resolveSessionFile } from "../lib/rollout.mjs";

function parseArgs(argv) {
  const options = { session: null, last: 10, json: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--session" || arg === "-s") options.session = argv[++index] ?? null;
    else if (arg === "--last" || arg === "-n") options.last = Math.max(1, Number.parseInt(argv[++index] ?? "10", 10) || 10);
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") options.help = true;
    else if (!options.session && !arg.startsWith("-")) options.session = arg;
    else {
      process.stderr.write(`未知参数: ${arg}\n`);
      process.exit(2);
    }
  }
  return options;
}

const fmtInt = (value) => value.toLocaleString("en-US");
const fmtRate = (value) => (value >= 100 ? value.toFixed(0) : value.toFixed(1));
const fmtDuration = (ms) => {
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60_000);
  return `${minutes}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, "0")}s`;
};
const fmtClock = (iso) => {
  if (!iso) return "--:--:--";
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? String(iso) : date.toLocaleTimeString("sv-SE");
};

function printReport(session, stats, last) {
  const { summary } = stats;
  const lines = [];
  lines.push(`Token 速度 — ${session.id} (${fmtInt(summary.requests)} 次请求, 最近 ${fmtClock(summary.lastAt)})`);
  lines.push("");
  lines.push(
    `最近一次  ${fmtRate(last.tokPerSec)} tok/s   输出 ${fmtInt(last.outputTokens)} tok / ${fmtDuration(last.durationMs)}   ${last.model}`
  );
  lines.push(
    `会话平均  ${fmtRate(summary.avgTokPerSec)} tok/s (中位 ${fmtRate(summary.medianTokPerSec)} · 峰值 ${fmtRate(
      summary.bestTokPerSec
    )})   输出合计 ${fmtInt(summary.outputTokens)} tok / ${fmtDuration(summary.durationMs)}`
  );
  const cacheHit = summary.inputTokens > 0 ? Math.round((summary.cacheReadTokens / summary.inputTokens) * 100) : 0;
  lines.push(
    `输入合计  ${fmtInt(summary.inputTokens)} tok (cache 读 ${fmtInt(summary.cacheReadTokens)} · 写 ${fmtInt(
      summary.cacheWriteTokens
    )} · 命中 ${cacheHit}%)`
  );

  if (stats.models.length > 1) {
    lines.push("");
    lines.push("按模型:");
    for (const model of stats.models) {
      lines.push(`  ${model.model.padEnd(24)} ${fmtRate(model.avgTokPerSec)} tok/s   ${model.requests} 次 / 输出 ${fmtInt(model.outputTokens)} tok`);
    }
  }

  lines.push("");
  lines.push(`最近 ${stats.recent.length} 次请求 (新→旧):`);
  lines.push(`  ${"#".padEnd(4)}${"time".padEnd(11)}${"tok/s".padStart(8)}   ${"out-tok".padStart(9)}   ${"dur".padStart(8)}   model`);
  stats.recent.forEach((row, index) => {
    lines.push(
      `  ${String(index + 1).padEnd(4)}${fmtClock(row.completedAt).padEnd(11)}${fmtRate(row.tokPerSec).padStart(8)}   ${fmtInt(
        row.outputTokens
      ).padStart(9)}   ${fmtDuration(row.durationMs).padStart(8)}   ${row.model}`
    );
  });
  lines.push("");
  lines.push("说明: tok/s = 输出 tokens ÷ 请求总时长(含首 token 等待与网络开销),真实流式速度略高于此值。数据只读自 ~/.zcode/cli/rollout/。");
  return lines.join("\n");
}

const options = parseArgs(process.argv.slice(2));
if (options.help) {
  process.stdout.write(
    "用法: node tps.mjs [--session <sess_id>] [--last <N>] [--json]\n" +
      "读取 ~/.zcode/cli/rollout/ 的模型请求记录,输出 Token 速度(tok/s)与用量统计。\n" +
      "缺省取最近活跃会话;--json 输出机器可读结果。\n"
  );
  process.exit(0);
}

try {
  const file = resolveSessionFile(options.session);
  const records = readModelIoRecords(file.path);
  if (!records.length) {
    process.stdout.write(`${file.sessionId}: 还没有带用量记录的模型请求。\n`);
    process.exit(0);
  }
  const stats = buildStats(records, { recent: options.last });
  stats.session = { id: file.sessionId, file: file.path, ...stats.session };
  if (options.json) {
    process.stdout.write(`${JSON.stringify(stats, null, 2)}\n`);
  } else {
    process.stdout.write(`${printReport(stats.session, stats, stats.last)}\n`);
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exit(1);
}
