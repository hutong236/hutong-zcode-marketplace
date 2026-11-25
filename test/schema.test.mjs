import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STATES } from "../hulane/scripts/lib/state-machine.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const schema = JSON.parse(
  fs.readFileSync(path.join(repositoryRoot, "hulane", "schemas", "work-item-state.schema.json"), "utf8"),
);

// BUG-15 schema 哨兵(AC-13):status 枚举与状态机 STATES 逐项一致(16 态含
// abandoned),allOf 交付政策互补两分支存在且语义正确——零依赖手写最小
// if/then 求值器(只支持本 schema 用到的 properties.const / required /
// type 的 null 与 integer),验证 {true,false}/{false,true} 通过、
// {true,true}/{false,false} 被拒,不引 ajv

test("schema status enum matches the state machine STATES exactly (16 states including abandoned)", () => {
  assert.deepEqual(schema.properties.status.enum, [...STATES]);
  assert.equal(STATES.length, 16);
  assert.ok(STATES.includes("abandoned"));
  assert.ok(STATES.includes("done"));
});

// 最小求值器:命中 if 子模式才检查 then;仅覆盖本 schema if/then 分支用到的
// 关键字组合(properties 内 const / type null / type integer,required)
function conditionMatches(subschema, instance) {
  if (!subschema) return true;
  for (const key of subschema.required ?? []) {
    if (!(key in instance)) return false;
  }
  for (const [key, rule] of Object.entries(subschema.properties ?? {})) {
    if (!(key in instance)) continue;
    const value = instance[key];
    if (rule.const !== undefined && value !== rule.const) return false;
    if (rule.type === "null" && value !== null) return false;
    if (rule.type === "integer" && !Number.isInteger(value)) return false;
  }
  return true;
}

function evaluateBranch(branch, instance) {
  if (!conditionMatches(branch.if, instance)) return true;
  return conditionMatches(branch.then, instance);
}

test("schema declares both complementary delivery-policy allOf branches", () => {
  const complementary = schema.allOf.filter((branch) => (
    branch.if?.properties?.delivery_required?.const !== undefined
    && branch.if?.required?.includes("delivery_required")
    && branch.then?.properties?.skip_allowed?.const !== undefined
  ));
  assert.equal(complementary.length, 2);
  const whenTrue = complementary.find((branch) => branch.if.properties.delivery_required.const === true);
  const whenFalse = complementary.find((branch) => branch.if.properties.delivery_required.const === false);
  assert.equal(whenTrue.then.properties.skip_allowed.const, false);
  assert.equal(whenFalse.then.properties.skip_allowed.const, true);
});

test("minimal if/then evaluator accepts complementary flag pairs and rejects equal pairs", () => {
  const complementary = schema.allOf.filter((branch) => (
    branch.if?.properties?.delivery_required?.const !== undefined
    && branch.then?.properties?.skip_allowed?.const !== undefined
  ));
  const overall = (deliveryRequired, skipAllowed) => {
    const instance = { delivery_required: deliveryRequired, skip_allowed: skipAllowed };
    return complementary.every((branch) => evaluateBranch(branch, instance));
  };
  // 互补组合通过
  assert.equal(overall(true, false), true);
  assert.equal(overall(false, true), true);
  // 相等组合被拒(true+true 命中 whenTrue 的 then;false+false 命中 whenFalse 的 then)
  assert.equal(overall(true, true), false);
  assert.equal(overall(false, false), false);
});
