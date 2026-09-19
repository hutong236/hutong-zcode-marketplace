#!/usr/bin/env node

// 发版版本号同步:唯一手写版本号的位置是 CHANGELOG 的新版本标题,
// 本脚本从标题读出版本(与日期),自动改写其余 6 处,并跑一遍 validate
// 自证没漏。validate 的版本一致性断言继续保留作兜底。

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function fail(message) {
  process.stderr.write(`sync-version failed: ${message}\n`);
  process.exit(1);
}

// 1. 从 CHANGELOG 顶部读版本与日期(跳过 Unreleased,取第一个版本标题)
const changelogHeading = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)\](?: - (\d{4}-\d{2}-\d{2}))?\s*$/m;
const changelogMatch = read("CHANGELOG.md").match(changelogHeading);
if (!changelogMatch) fail("CHANGELOG.md 中找不到版本标题(形如 ## [2.5.1] - 2026-09-20)");
const version = changelogMatch[1];
const releaseDate = changelogMatch[2] ?? null;
process.stdout.write(`CHANGELOG 顶部版本:${version}${releaseDate ? ` (${releaseDate})` : ""}\n`);

// 2. 逐处同步,只在内容变化时写盘
const changedFiles = new Set();

function writeIfChanged(relativePath, next, original, label = "") {
  const suffix = label ? `(${label})` : "";
  if (next === original) {
    process.stdout.write(`- ${relativePath}${suffix}: 已是 ${version}\n`);
    return;
  }
  fs.writeFileSync(path.join(root, relativePath), next);
  changedFiles.add(relativePath);
  process.stdout.write(`- ${relativePath}${suffix}: 已更新\n`);
}

function syncJson(relativePath, pick, assign) {
  const original = read(relativePath);
  const parsed = JSON.parse(original);
  if (pick(parsed) !== version) assign(parsed, version);
  writeIfChanged(relativePath, `${JSON.stringify(parsed, null, 2)}\n`, original);
}

function syncText(relativePath, pattern, build, label = "") {
  const original = read(relativePath);
  if (!pattern.test(original)) fail(`${relativePath} 中找不到待同步字段`);
  writeIfChanged(relativePath, original.replace(pattern, (match, ...groups) => build(match, groups)), original, label);
}

// 三处 JSON
syncJson("marketplace.json",
  (parsed) => parsed.plugins?.find((plugin) => plugin.name === "hulane")?.version,
  (parsed, value) => {
    const entry = parsed.plugins?.find((plugin) => plugin.name === "hulane");
    if (!entry) fail("marketplace.json 中找不到 hulane 插件条目");
    entry.version = value;
  });
syncJson("hulane/.zcode-plugin/plugin.json",
  (parsed) => parsed.version,
  (parsed, value) => { parsed.version = value; });
syncJson("package.json",
  (parsed) => parsed.version,
  (parsed, value) => { parsed.version = value; });

// README 插件表版本列
syncText("README.md",
  /^(\|\s*`hulane`\s*\|\s*)[^|\s]+/m,
  (match, groups) => `${groups[0]}${version}`);

// 流程规范文档头:版本必同步;日期仅当 CHANGELOG 标题带了日期才同步
syncText("Hulane_ZCode_AI_Dev_Workflow.md",
  /^(\*\*版本：\*\*\s*)V[^\s]+/m,
  (match, groups) => `${groups[0]}V${version}`,
  "版本");
if (releaseDate) {
  syncText("Hulane_ZCode_AI_Dev_Workflow.md",
    /^(\*\*日期：\*\*\s*)\d{4}-\d{2}-\d{2}/m,
    (match, groups) => `${groups[0]}${releaseDate}`,
    "日期");
}

// SKILL frontmatter 的 metadata.version(只在 frontmatter 块内替换)
{
  const relativePath = "hulane/skills/hulane-development/SKILL.md";
  const original = read(relativePath);
  const frontmatterPattern = /^---\r?\n([\s\S]*?)\r?\n---/;
  const match = original.match(frontmatterPattern);
  if (!match) fail(`${relativePath} 中找不到 frontmatter`);
  const frontmatter = match[1];
  const versionLine = /^(\s*version:\s*)\S+/m;
  if (!versionLine.test(frontmatter)) fail(`${relativePath} frontmatter 中找不到 version 字段`);
  const nextFrontmatter = frontmatter.replace(versionLine, (line, indent) => `${indent}${version}`);
  writeIfChanged(relativePath, original.replace(frontmatterPattern, `---\n${nextFrontmatter}\n---`), original);
}

// 3. 跑一遍 validate 自证没漏
const validation = spawnSync(process.execPath, [path.join(root, "scripts", "validate-marketplace.mjs")], { stdio: "inherit" });
if (validation.status !== 0) fail("validate 未通过,请检查同步结果");

process.stdout.write(`版本号同步完成:${changedFiles.size === 0 ? "6 处本就一致" : `改写 ${changedFiles.size} 个文件`},validate 通过\n`);
