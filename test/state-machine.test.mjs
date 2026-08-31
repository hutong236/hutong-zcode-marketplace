import test from "node:test";
import assert from "node:assert/strict";
import { applyEvent, createWorkItem, validateWorkItem } from "../cmdb-dev/scripts/lib/state-machine.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const githubGuard = {
  pr_check_name: "CMDB PR Checks / verify",
  pr_check_run_url: "https://github.com/acme/cmdb/actions/runs/456",
  pr_head_sha: sha,
  merge_guard_mode: "github_required_checks",
  required_checks_enforced: true,
};
const deliveryPatch = {
  image: "ghcr.io/acme/cmdb",
  image_tag: "v1.4.0",
  image_digest: digest,
  workflow_run_url: "https://github.com/acme/cmdb/actions/runs/123",
  registry_verified: true,
  release_url: "https://github.com/acme/cmdb/releases/tag/v1.4.0",
  sbom_status: "verified",
  provenance_status: "verified",
  sbom_digest: `sha256:${"c".repeat(64)}`,
  provenance_digest: `sha256:${"d".repeat(64)}`,
};
const clock = () => new Date("2026-08-31T12:00:00Z");

function runtimeItem(overrides = {}) {
  return createWorkItem({
    id: "REQ-12",
    issue_number: 12,
    title: "Runtime change",
    risk_level: "low",
    delivery_required: true,
    skip_allowed: false,
    ...overrides,
  }, clock);
}

function move(item, event, patch = {}, actor = "orchestrator") {
  return applyEvent(item, event, { actor, evidence: `${event} evidence`, patch }, clock);
}

test("human gates reject agent actors", () => {
  const item = runtimeItem();
  assert.throws(() => move(item, "approve_requirement"), /human:<identity>/);
  const approved = move(item, "approve_requirement", {}, "human:owner");
  assert.equal(approved.status, "ready");
  assert.equal(approved.human_approval, "approved");
});

test("runtime work cannot skip image delivery", () => {
  const item = { ...runtimeItem(), status: "waiting_tag_confirm", human_approval: "approved" };
  assert.throws(() => move(item, "approve_skip", {}, "human:owner"), /skip is forbidden/);
});

test("non-runtime work may complete through an explicit human skip", () => {
  let item = runtimeItem({
    delivery_required: false,
    delivery_reason: "Documentation only",
    skip_allowed: true,
  });
  item = { ...item, status: "waiting_tag_confirm", human_approval: "approved", tester_result: "passed", reviewer_result: "approved", pr_checks: "passed", ...githubGuard, merged_sha: sha };
  item = move(item, "approve_skip", {}, "human:owner");
  assert.equal(item.status, "waiting_close");
  assert.equal(item.build_status, "skipped");
  item = move(item, "issue_closed");
  assert.equal(item.status, "done");
  assert.equal(validateWorkItem(item), true);
});

test("image verification requires a digest", () => {
  const item = { ...runtimeItem(), status: "building", human_approval: "approved", tester_result: "passed", reviewer_result: "approved", pr_checks: "passed", ...githubGuard, merged_sha: sha };
  assert.throws(() => move(item, "image_verified"), /image_digest/);
  const verified = move(item, "image_verified", deliveryPatch);
  assert.equal(verified.status, "waiting_close");
  assert.equal(verified.build_status, "passed");
});

test("Gate C persists the exact SemVer tag before tag authorization", () => {
  const item = { ...runtimeItem(), status: "waiting_tag_confirm", human_approval: "approved", merged_sha: sha };
  assert.throws(() => move(item, "approve_tag", {}, "human:owner"), /image_tag/);
  const approved = move(item, "approve_tag", { image_tag: "v2.0.0" }, "human:owner");
  assert.equal(approved.status, "building");
  assert.equal(approved.image_tag, "v2.0.0");
});

test("checks_passed requires persisted merge-guard evidence", () => {
  const item = {
    ...runtimeItem(),
    status: "pr_checking",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_number: 42,
  };
  assert.throws(() => move(item, "checks_passed"), /merge-guard evidence/);
  const checked = move(item, "checks_passed", githubGuard);
  assert.equal(checked.status, "merging");
  assert.equal(checked.required_checks_enforced, true);
});

test("private-repository control-plane checks always stop at human Gate B", () => {
  const item = {
    ...runtimeItem(),
    status: "pr_checking",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_number: 42,
  };
  const checked = move(item, "checks_passed", {
    ...githubGuard,
    merge_guard_mode: "control_plane_verified",
    required_checks_enforced: false,
  });
  assert.equal(checked.status, "waiting_human_merge");
  assert.equal(checked.merge_guard_mode, "control_plane_verified");
});

test("planning requires an isolated branch and worktree", () => {
  let item = move(runtimeItem(), "approve_requirement", {}, "human:owner");
  assert.throws(() => move(item, "start_planning"), /requires branch/);
  item = move(item, "start_planning", { branch: "cmdb/req-12", worktree_path: "/repo/.cmdb-dev/worktrees/REQ-12" });
  assert.equal(item.status, "planning");
  assert.equal(item.branch, "cmdb/req-12");
});

test("fourth rework failure blocks and human resume resets the budget", () => {
  let item = move(runtimeItem(), "approve_requirement", {}, "human:owner");
  item = move(item, "start_planning", { branch: "cmdb/req-12", worktree_path: "/repo/.cmdb-dev/worktrees/REQ-12" });
  item = move(item, "plan_complete");
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    item = move(item, "code_complete");
    item = move(item, "tests_failed");
    if (attempt <= 3) assert.equal(item.status, "doing");
  }
  assert.equal(item.status, "blocked");
  assert.equal(item.rework_count, 4);
  item = applyEvent(item, "resume", {
    actor: "human:owner",
    evidence: "Human reviewed repeated failures",
    to: "testing",
  }, clock);
  assert.equal(item.status, "testing");
  assert.equal(item.rework_count, 0);
});
