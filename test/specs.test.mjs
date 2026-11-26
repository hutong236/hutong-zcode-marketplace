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
  // 扫描本仓全部主规格:新增 capability 自动纳入校验
  const specsRoot = path.join(repositoryRoot, SPECS_DIR);
  const capabilities = fs.readdirSync(specsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(capabilities, ["hulane-execution-discipline", "hulane-release-workflow", "hulane-spec-layer", "hulane-work-item-lifecycle"]);
  const requirementCounts = {};
  for (const capability of capabilities) {
    const spec = validateSpecFile(
      `${SPECS_DIR}/${capability}/${CAPABILITY_SPEC_FILE}`,
      fs.readFileSync(path.join(specsRoot, capability, CAPABILITY_SPEC_FILE), "utf8"),
    );
    assert.equal(spec.kind, "capability");
    assert.equal(spec.capability, capability);
    assert.ok(spec.requirements.length >= 1);
    for (const requirement of spec.requirements) assert.ok(requirement.scenarios.length >= 1);
    requirementCounts[capability] = spec.requirements.length;
  }
  assert.equal(requirementCounts["hulane-release-workflow"], 7);
  assert.equal(requirementCounts["hulane-work-item-lifecycle"], 6);
  assert.equal(requirementCounts["hulane-execution-discipline"], 5);

  // 扫描全部决策史归档 delta:新增归档自动纳入校验
  const archiveRoot = path.join(repositoryRoot, "openspec", "changes", "archive");
  const archivedIds = fs.readdirSync(archiveRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  assert.deepEqual(archivedIds, ["BUG-15", "BUG-16", "REQ-11", "REQ-14", "REQ-3", "REQ-5", "REQ-7", "REQ-9"]);
  // REQ-7 的 delta 是首个 MODIFIED 归档:两个能力各一个 MODIFIED 组;
  // REQ-11 的 delta:新能力四个 ADDED + 两个能力各展期一个 MODIFIED 条目;
  // REQ-14 的 delta:两个能力各一个 ADDED 组(互补不变量 + 作废终态);
  // BUG-15 的 delta:lifecycle 一个 MODIFIED(作废终态整块重写)+ 一个 ADDED;
  // BUG-16 的 delta:lifecycle 一个 MODIFIED 组(作废终态 + 特权操作单调用
  // 两个需求)+ release-workflow 一个 MODIFIED 组(release 令牌约束)
  const expectedGroups = { "REQ-3": ["ADDED"], "REQ-5": ["ADDED"], "REQ-7": ["MODIFIED", "MODIFIED"], "REQ-9": ["ADDED"], "REQ-11": ["ADDED", "MODIFIED"], "REQ-14": ["ADDED", "ADDED"], "BUG-15": ["MODIFIED", "ADDED"], "BUG-16": ["MODIFIED", "MODIFIED"] };
  for (const id of archivedIds) {
    const delta = validateSpecFile(
      `openspec/changes/archive/${id}/${DELTA_SPEC_FILE}`,
      fs.readFileSync(path.join(archiveRoot, id, DELTA_SPEC_FILE), "utf8"),
    );
    assert.equal(delta.kind, "delta");
    assert.deepEqual(delta.groups.map((group) => group.group), expectedGroups[id]);
  }
  const req7 = validateSpecFile(
    `openspec/changes/archive/REQ-7/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(archiveRoot, "REQ-7", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(req7.groups.flatMap((group) => group.requirements), [
    "Gate A 预授权同轮放行",
    "预授权硬边界（状态机强制）",
    "approval_source 留痕与写入通道收口",
    "delta 全文进 Gate A 审批包",
  ]);
  // REQ-9 的 delta 是执行纪律守卫新能力:五个 ADDED 需求
  const req9 = validateSpecFile(
    `openspec/changes/archive/REQ-9/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(archiveRoot, "REQ-9", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(req9.groups.flatMap((group) => group.requirements), [
    "git 钩子绕过拦截",
    "lint/formatter 配置保护",
    "提交内容卫生检查",
    "全局生效、逃生口与 fail-closed",
    "接线方式与既有守卫不变",
  ]);
  // REQ-14 的 delta:两能力各追加一个 ADDED 需求(交付政策互补不变量 + 作废终态)
  const req14 = validateSpecFile(
    `openspec/changes/archive/REQ-14/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(archiveRoot, "REQ-14", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(req14.groups.flatMap((group) => group.requirements), [
    "交付政策互补不变量",
    "作废终态(abandoned)",
  ]);
  // BUG-15 的 delta:lifecycle 一个 MODIFIED(作废终态整块重写,补 3 个
  // reason 解析 scenario)+ 一个 ADDED(特权操作单调用与受控形态零误拒)
  const bug15 = validateSpecFile(
    `openspec/changes/archive/BUG-15/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(archiveRoot, "BUG-15", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(bug15.groups.flatMap((group) => group.requirements), [
    "作废终态(abandoned)",
    "特权操作单调用与受控形态零误拒",
  ]);
  // BUG-16 的 delta:两个能力各一个 MODIFIED 组——lifecycle 两个需求
  // (重复旗标歧义 + 钉定锚定)+ release-workflow 一个需求(令牌约束锚定)
  const bug16 = validateSpecFile(
    `openspec/changes/archive/BUG-16/${DELTA_SPEC_FILE}`,
    fs.readFileSync(path.join(archiveRoot, "BUG-16", DELTA_SPEC_FILE), "utf8"),
  );
  assert.deepEqual(bug16.groups.flatMap((group) => group.requirements), [
    "作废终态(abandoned)",
    "特权操作单调用与受控形态零误拒",
    "release 令牌约束",
  ]);
  // 主规格智能合并落位:两个需求块都在 lifecycle 主规格里,MODIFIED 块的
  // 3 个 reason 解析 scenario 与 ADDED 块的 7 个 scenario 齐全
  const lifecycle = validateSpecFile(
    `${SPECS_DIR}/hulane-work-item-lifecycle/${CAPABILITY_SPEC_FILE}`,
    fs.readFileSync(path.join(specsRoot, "hulane-work-item-lifecycle", CAPABILITY_SPEC_FILE), "utf8"),
  );
  const abandonedRequirement = lifecycle.requirements.find((requirement) => requirement.name === "作废终态(abandoned)");
  assert.deepEqual(abandonedRequirement.scenarios, [
    "任意非终态人工作废",
    "非人类 actor 被拒",
    "终态不可再作废或阻塞",
    "守卫认可 not planned 关单",
    "守卫强制关单 reason",
    "issue_closed 自环回填",
    "pending 工单作废",
    "标签与钩子终态语义",
    "注释体 reason 字样不构成携带",
    "注释体 reason 字样对 waiting_close 亦 fail-closed",
    "重复 reason 旗标按歧义拒绝",
    "旗标值内嵌 reason 字样按歧义拒绝",
    "受控关单形态与注释并存零误拒",
  ]);
  const guardRequirement = lifecycle.requirements.find((requirement) => requirement.name === "特权操作单调用与受控形态零误拒");
  assert.deepEqual(guardRequirement.scenarios, [
    "链式同动作被拒",
    "链式异动作仍拒",
    "SKILL 受控形态零误拒",
    "release 双令牌形态零误拒",
    "消息体剥离与只读 tag 保持不计数",
    "白名单远端推送回归",
    "注释体数字不构成点名",
    "钉死 SHA 与 tag 名锚定引号外",
    "状态自证目标号取首个引号外点名",
  ]);
  // BUG-16 主规格合并落位(release 侧):令牌约束补引号外锚定条款与
  // 消息体字样/受控形态两 scenario,其余 scenario 逐字保持
  const release = validateSpecFile(
    `${SPECS_DIR}/hulane-release-workflow/${CAPABILITY_SPEC_FILE}`,
    fs.readFileSync(path.join(specsRoot, "hulane-release-workflow", CAPABILITY_SPEC_FILE), "utf8"),
  );
  const releaseTokenRequirement = release.requirements.find((requirement) => requirement.name === "release 令牌约束");
  assert.deepEqual(releaseTokenRequirement.scenarios, [
    "scope 钉死",
    "annotated 形态保持",
    "轻量蒙混拒",
    "单次使用",
    "TTL 过期",
    "裸 tag 无令牌仍拒",
    "工单 tag 路径回归不变",
    "消息体字样不构成 release 点名",
    "受控 release 形态零误拒保持",
  ]);
});
