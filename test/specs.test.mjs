import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  CAPABILITY_SPEC_FILE,
  DELTA_SPEC_FILE,
  SPECS_DIR,
  isCapabilitySpecPath,
  isDeltaSpecPath,
  validateCapabilitySpec,
  validateDeltaSpec,
  validateSpecFile,
} from "../hulane/scripts/lib/specs.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const chineseSpec = [
  "# billing Specification",
  "",
  "## Purpose",
  "",
  "中文目的说明：账单能力的行为基线。",
  "",
  "## Requirements",
  "",
  "### Requirement: 开票",
  "",
  "系统 SHALL 按合同金额开具发票。",
  "",
  "#### Scenario: 正常开票",
  "",
  "- WHEN 合同已确认",
  "- THEN 生成等额发票",
  "",
  "#### Scenario: 金额为零",
  "",
  "- WHEN 合同金额为零",
  "- THEN 拒绝开票并提示原因",
].join("\n");

test("a Chinese capability spec with the full heading skeleton validates", () => {
  const result = validateCapabilitySpec(chineseSpec);
  assert.equal(result.capability, "billing");
  assert.deepEqual(result.requirements, [
    { name: "开票", scenarios: ["正常开票", "金额为零"] },
  ]);
});

test("capability spec heading drift is rejected", () => {
  assert.throws(() => validateCapabilitySpec("# billing\n\n## Purpose\n\n## Requirements\n"), /Specification/);
  assert.throws(() => validateCapabilitySpec(`# a Specification\n# b Specification\n\n## Purpose\n\n## Requirements\n`), /exactly one H1/);
  assert.throws(() => validateCapabilitySpec("# billing Specification\n\n## Requirements\n"), /## Purpose/);
  assert.throws(() => validateCapabilitySpec("# billing Specification\n\n## Purpose\n"), /## Requirements/);
  assert.throws(() => validateCapabilitySpec("# billing Specification\n\n## Purpose\n\n## Requirements\n"), /at least one/);
  assert.throws(
    () => validateCapabilitySpec("# billing Specification\n\n## Purpose\n\n## Requirements\n\n### Requirement: 开票\n\n系统 SHALL 开票。\n"),
    /Scenario/,
  );
  assert.throws(() => validateCapabilitySpec(""), /empty/);
});

test("every requirement needs its own scenario", () => {
  const twoRequirements = `${chineseSpec}\n\n### Requirement: 退票\n\n系统 SHALL 支持退票。\n`;
  assert.throws(() => validateCapabilitySpec(twoRequirements), /退票/);
});

test("delta specs need at least one recognized group with entries", () => {
  assert.throws(() => validateDeltaSpec("## Purpose\n\n普通文档。\n"), /ADDED\|MODIFIED\|REMOVED\|RENAMED/);
  assert.throws(() => validateDeltaSpec("## ADDED Requirements\n"), /entries/);
  assert.throws(() => validateDeltaSpec(""), /empty/);
});

test("ADDED and MODIFIED delta entries carry scenarios", () => {
  const result = validateDeltaSpec([
    "## ADDED Requirements",
    "",
    "### Requirement: 开票",
    "",
    "系统 SHALL 开票。",
    "",
    "#### Scenario: 正常开票",
    "",
    "- WHEN 已确认",
    "- THEN 开票",
    "",
    "## MODIFIED Requirements",
    "",
    "### Requirement: 退票",
    "",
    "#### Scenario: 全额退票",
    "",
    "- WHEN 申请在期限内",
    "- THEN 全额退款",
  ].join("\n"));
  assert.deepEqual(result.groups, [
    { group: "ADDED", requirements: ["开票"] },
    { group: "MODIFIED", requirements: ["退票"] },
  ]);
  assert.throws(
    () => validateDeltaSpec("## ADDED Requirements\n\n### Requirement: 开票\n\n系统 SHALL 开票。\n"),
    /Scenario/,
  );
});

test("REMOVED groups need no scenario while RENAMED groups need FROM and TO lines", () => {
  const removed = validateDeltaSpec("## REMOVED Requirements\n\n### Requirement: 作废功能\n\n整块删除。\n");
  assert.deepEqual(removed.groups, [{ group: "REMOVED", requirements: ["作废功能"] }]);

  assert.throws(
    () => validateDeltaSpec("## RENAMED Requirements\n\n### Requirement: 新名称\n\n- FROM: `### Requirement: 旧名称`\n"),
    /"TO:" line/,
  );
  assert.throws(
    () => validateDeltaSpec("## RENAMED Requirements\n\n### Requirement: 新名称\n\n- TO: `### Requirement: 新名称`\n"),
    /"FROM:" line/,
  );
  const renamed = validateDeltaSpec([
    "## RENAMED Requirements",
    "",
    "### Requirement: 账单导出",
    "",
    "- FROM: `### Requirement: 导出账单`",
    "- TO: `### Requirement: 账单导出`",
  ].join("\n"));
  assert.deepEqual(renamed.groups, [{ group: "RENAMED", requirements: ["账单导出"] }]);
});

test("path routing sends main specs and deltas to their validators", () => {
  assert.equal(isCapabilitySpecPath(`${SPECS_DIR}/billing/${CAPABILITY_SPEC_FILE}`), true);
  assert.equal(isCapabilitySpecPath(`${SPECS_DIR}/billing/notes.md`), false);
  assert.equal(isDeltaSpecPath(`openspec/changes/archive/REQ-3/${DELTA_SPEC_FILE}`), true);
  assert.equal(isDeltaSpecPath(`openspec/changes/archive/REQ-3/proposal.md`), false);
  assert.equal(validateSpecFile("README.md", "# Readme\n"), null);

  const capability = validateSpecFile(`${SPECS_DIR}/billing/${CAPABILITY_SPEC_FILE}`, chineseSpec);
  assert.equal(capability.kind, "capability");
  const delta = validateSpecFile(`openspec/changes/archive/REQ-3/${DELTA_SPEC_FILE}`, "## ADDED Requirements\n\n### Requirement: 开票\n\n#### Scenario: 开\n");
  assert.equal(delta.kind, "delta");
});

test("dogfood specs in this repository pass their own validator", () => {
  const spec = validateSpecFile(
    `${SPECS_DIR}/hulane-spec-layer/${CAPABILITY_SPEC_FILE}`,
    fs.readFileSync(path.join(repositoryRoot, SPECS_DIR, "hulane-spec-layer", CAPABILITY_SPEC_FILE), "utf8"),
  );
  assert.equal(spec.capability, "hulane-spec-layer");
  assert.ok(spec.requirements.length >= 1);
  for (const requirement of spec.requirements) assert.ok(requirement.scenarios.length >= 1);

  const delta = validateSpecFile(
    `openspec/changes/archive/REQ-3/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(repositoryRoot, "openspec", "changes", "archive", "REQ-3", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(delta.groups.map((group) => group.group), ["ADDED"]);
});
