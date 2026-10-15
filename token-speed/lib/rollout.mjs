import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export function rolloutDir() {
  return process.env.ZCODE_ROLLOUT_DIR || path.join(os.homedir(), ".zcode", "cli", "rollout");
}

export function listSessionFiles(dir = rolloutDir()) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => /^model-io-sess_.+\.jsonl$/.test(name))
    .map((name) => {
      const full = path.join(dir, name);
      return { name, sessionId: sessionIdFromName(name), path: full, mtimeMs: fs.statSync(full).mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function sessionIdFromName(name) {
  const match = /^model-io-(sess_.+)\.jsonl$/.exec(name);
  return match ? match[1] : name.replace(/\.jsonl$/, "");
}

export function resolveSessionFile(sessionId, dir = rolloutDir()) {
  const files = listSessionFiles(dir);
  if (sessionId) {
    const wanted = sessionId.replace(/^sess_/, "").toLowerCase();
    const hit = files.find((file) => file.sessionId.toLowerCase().includes(wanted));
    if (!hit) {
      const known = files.map((file) => file.sessionId).join(", ") || "(none)";
      throw new Error(`No rollout file matches session "${sessionId}" in ${dir}. Known: ${known}`);
    }
    return hit;
  }
  if (!files.length) throw new Error(`No rollout files found in ${dir}`);
  return files[0];
}

export function readModelIoRecords(filePath) {
  const records = [];
  for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
    if (!line.trim()) continue;
    let parsed;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue;
    }
    if (parsed?.type !== "model_io" || !parsed?.response?.usage) continue;
    records.push(parsed);
  }
  return records;
}

function toRow(record) {
  const usage = record.response.usage;
  const seconds = (record.durationMs ?? 0) / 1000;
  const outputTokens = usage.outputTokens ?? 0;
  return {
    completedAt: record.completedAt ?? record.startedAt ?? null,
    tokPerSec: seconds > 0 ? outputTokens / seconds : 0,
    outputTokens,
    inputTokens: usage.inputTokens ?? 0,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
    durationMs: record.durationMs ?? 0,
    model: record.model?.modelId ?? "unknown",
    providerId: record.model?.providerId ?? null,
    querySource: record.querySource ?? null,
    attempt: record.attempt ?? null,
  };
}

function round(value, digits = 2) {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildStats(records, { recent = 10 } = {}) {
  const rows = records.map(toRow).sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt)));
  const totalOutput = rows.reduce((sum, row) => sum + row.outputTokens, 0);
  const totalInput = rows.reduce((sum, row) => sum + row.inputTokens, 0);
  const totalCacheRead = rows.reduce((sum, row) => sum + row.cacheReadTokens, 0);
  const totalCacheWrite = rows.reduce((sum, row) => sum + row.cacheWriteTokens, 0);
  const totalDurationMs = rows.reduce((sum, row) => sum + row.durationMs, 0);
  const rates = rows.filter((row) => row.tokPerSec > 0).map((row) => row.tokPerSec).sort((a, b) => a - b);
  const median = rates.length ? rates[Math.floor(rates.length / 2)] : 0;

  const byModel = new Map();
  for (const row of rows) {
    const bucket = byModel.get(row.model) ?? { model: row.model, requests: 0, outputTokens: 0, durationMs: 0 };
    bucket.requests += 1;
    bucket.outputTokens += row.outputTokens;
    bucket.durationMs += row.durationMs;
    byModel.set(row.model, bucket);
  }

  return {
    session: { records: rows.length },
    last: rows[0] ?? null,
    summary: {
      requests: rows.length,
      avgTokPerSec: totalDurationMs > 0 ? round((totalOutput / totalDurationMs) * 1000) : 0,
      medianTokPerSec: round(median),
      bestTokPerSec: rates.length ? round(rates[rates.length - 1]) : 0,
      outputTokens: totalOutput,
      inputTokens: totalInput,
      cacheReadTokens: totalCacheRead,
      cacheWriteTokens: totalCacheWrite,
      durationMs: totalDurationMs,
      firstAt: rows.length ? rows[rows.length - 1].completedAt : null,
      lastAt: rows.length ? rows[0].completedAt : null,
    },
    models: [...byModel.values()].map((bucket) => ({
      model: bucket.model,
      requests: bucket.requests,
      avgTokPerSec: bucket.durationMs > 0 ? round((bucket.outputTokens / bucket.durationMs) * 1000) : 0,
      outputTokens: bucket.outputTokens,
    })),
    recent: rows.slice(0, recent).map((row) => ({ ...row, tokPerSec: round(row.tokPerSec) })),
  };
}
