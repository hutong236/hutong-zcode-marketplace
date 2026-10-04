import test from "node:test";
import assert from "node:assert/strict";
import { applyEvent, createWorkItem, normalizeWorkItem, validateWorkItem } from "../hulane/scripts/lib/state-machine.mjs";

const sha = "a".repeat(40);
const digest = `sha256:${"b".repeat(64)}`;
const githubGuard = {
  pr_check_name: "Hulane PR Checks / verify",
  pr_check_run_url: "https://github.com/acme/demo/actions/runs/456",
  pr_head_sha: sha,
  merge_guard_mode: "github_required_checks",
  required_checks_enforced: true,
};
const deliveryPatch = {
  image: "ghcr.io/acme/demo",
  image_tag: "v1.4.0",
  image_digest: digest,
  workflow_run_url: "https://github.com/acme/demo/actions/runs/123",
  registry_verified: true,
  release_url: "https://github.com/acme/demo/releases/tag/v1.4.0",
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

const specSyncPatch = { specs_commit_sha: sha, spec_delta_dir: "openspec/changes/archive/REQ-12" };

// 非运行时条目停在 waiting_close:与 skip 路径同构,免受镜像交付不变式干扰
function waitingCloseItem(overrides = {}, fieldOverrides = {}) {
  return {
    ...runtimeItem({
      delivery_required: false,
      delivery_reason: "Documentation and specs; on-demand batched release",
      skip_allowed: true,
      ...overrides,
    }),
    status: "waiting_close",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_checks: "passed",
    ...githubGuard,
    merged_sha: sha,
    ...fieldOverrides,
  };
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
  item = move(item, "specs_synced", specSyncPatch);
  item = move(item, "issue_closed");
  assert.equal(item.status, "done");
  assert.equal(validateWorkItem(item), true);
});

test("skip-allowed work closes itself via policy_skip after merge", () => {
  let item = runtimeItem({
    risk_level: "low",
    delivery_required: false,
    delivery_reason: "UI tweak; on-demand batched release",
    skip_allowed: true,
  });
  item = { ...item, status: "waiting_tag_confirm", human_approval: "approved", tester_result: "passed", reviewer_result: "approved", pr_checks: "passed", ...githubGuard, merged_sha: sha };
  item = move(item, "policy_skip", {}, "orchestrator");
  assert.equal(item.status, "waiting_close");
  assert.equal(item.tag_confirmation, "skipped_by_policy");
  assert.equal(item.build_status, "skipped");
  assert.equal(item.next_action, "close_issue");
  item = move(item, "specs_synced", specSyncPatch);
  item = move(item, "issue_closed");
  assert.equal(item.status, "done");
  assert.equal(validateWorkItem(item), true);
});

test("policy_skip stays bound to the persisted skip policy and Gate A approval", () => {
  const runtime = { ...runtimeItem(), status: "waiting_tag_confirm", human_approval: "approved" };
  assert.throws(() => move(runtime, "policy_skip"), /skip is forbidden/);

  const unapproved = runtimeItem({
    delivery_required: false,
    delivery_reason: "Documentation only",
    skip_allowed: true,
  });
  const pending = { ...unapproved, status: "waiting_tag_confirm" };
  assert.throws(() => move(pending, "policy_skip"), /Gate A approval/);

  const midMerge = { ...unapproved, status: "merging", human_approval: "approved" };
  assert.throws(() => move(midMerge, "policy_skip"), /Invalid transition/);
});

test("size classifies the intake lane and stays consistent with risk", () => {
  const small = createWorkItem({
    id: "REQ-31",
    issue_number: 31,
    title: "Button copy tweak",
    risk_level: "low",
    size: "small",
    delivery_required: false,
    delivery_reason: "UI tweak; on-demand batched release",
    skip_allowed: true,
  }, clock);
  assert.equal(small.size, "small");

  assert.throws(() => runtimeItem({ risk_level: "medium", size: "small" }), /size small requires risk_level low/);
  assert.throws(() => runtimeItem({ size: "tiny" }), /size must be one of/);
  assert.equal(runtimeItem().size, "standard");
  assert.equal(runtimeItem().spec_sync_required, true);
  assert.equal(small.spec_sync_required, false);
  assert.throws(
    () => createWorkItem({
      id: "REQ-32",
      issue_number: 32,
      title: "Small with specs",
      risk_level: "low",
      size: "small",
      delivery_required: false,
      delivery_reason: "UI tweak",
      skip_allowed: true,
      spec_sync_required: true,
    }, clock),
    /never requires spec sync/,
  );

  const escalated = move({ ...small, status: "waiting_approval" }, "approve_requirement", { size: "standard" }, "human:owner");
  assert.equal(escalated.size, "standard");
  assert.throws(
    () => validateWorkItem({ ...small, risk_level: "medium" }),
    /size small requires low risk/,
  );
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

test("control-plane checks auto-merge at low/medium risk", () => {
  const item = {
    ...runtimeItem({ risk_level: "medium" }),
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
  assert.equal(checked.status, "merging");
  assert.equal(checked.merge_guard_mode, "control_plane_verified");
  assert.equal(checked.next_action, "merge_pr");
});

test("high-risk checks stop at human Gate B under either guard mode", () => {
  const base = {
    status: "pr_checking",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_number: 42,
  };
  const githubHigh = move(
    { ...runtimeItem({ risk_level: "high" }), ...base },
    "checks_passed",
    githubGuard,
  );
  assert.equal(githubHigh.status, "waiting_human_merge");
  assert.equal(githubHigh.next_action, "human_merge_approval");
  const controlPlaneHigh = move(
    { ...runtimeItem({ risk_level: "high" }), ...base },
    "checks_passed",
    { ...githubGuard, merge_guard_mode: "control_plane_verified", required_checks_enforced: false },
  );
  assert.equal(controlPlaneHigh.status, "waiting_human_merge");
});

test("planning requires an isolated branch and worktree", () => {
  let item = move(runtimeItem(), "approve_requirement", {}, "human:owner");
  assert.throws(() => move(item, "start_planning"), /requires branch/);
  item = move(item, "start_planning", { branch: "hulane/req-12", worktree_path: "/repo/.hulane/worktrees/REQ-12" });
  assert.equal(item.status, "planning");
  assert.equal(item.branch, "hulane/req-12");
});

test("fourth rework failure blocks and human resume resets the budget", () => {
  let item = move(runtimeItem(), "approve_requirement", {}, "human:owner");
  item = move(item, "start_planning", { branch: "hulane/req-12", worktree_path: "/repo/.hulane/worktrees/REQ-12" });
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

test("specs_synced is a waiting_close self-loop gated by full evidence", () => {
  const base = waitingCloseItem();
  assert.throws(() => move({ ...base, merged_sha: null }, "specs_synced", specSyncPatch), /merged_sha/);
  assert.throws(
    () => move(base, "specs_synced", { ...specSyncPatch, specs_commit_sha: "not-a-sha" }),
    /40-character specs_commit_sha/,
  );
  assert.throws(() => move(base, "specs_synced", { ...specSyncPatch, spec_delta_dir: "   " }), /spec_delta_dir/);

  const synced = move(base, "specs_synced", specSyncPatch);
  assert.equal(synced.status, "waiting_close");
  assert.equal(synced.specs_synced, true);
  assert.equal(synced.specs_commit_sha, sha);
  assert.equal(synced.spec_delta_dir, "openspec/changes/archive/REQ-12");
  assert.equal(synced.next_action, "close_issue");
});

test("specs_commit_sha must equal the recorded merged_sha", () => {
  const base = waitingCloseItem();
  assert.throws(
    () => move(base, "specs_synced", { ...specSyncPatch, specs_commit_sha: "b".repeat(40) }),
    /specs_commit_sha to equal the recorded merged_sha/,
  );
  const mismatchedDone = {
    ...base,
    status: "done",
    issue_state: "closed",
    specs_synced: true,
    specs_commit_sha: "b".repeat(40),
    spec_delta_dir: "openspec/changes/archive/REQ-12",
  };
  assert.throws(() => validateWorkItem(mismatchedDone), /specs_commit_sha to equal merged_sha/);
});

test("spec_sync_required items cannot close or reach done without specs_synced", () => {
  const base = waitingCloseItem();
  assert.throws(() => move(base, "issue_closed"), /issue_closed requires recorded specs_synced/);
  assert.throws(
    () => validateWorkItem({ ...base, status: "done", issue_state: "closed" }),
    /done requires recorded specs_synced/,
  );
  // 证据字段只能由 specs_synced 事件写入,不允许借其它事件的 patch 绕过前置
  assert.throws(
    () => move(base, "issue_closed", { specs_synced: true, specs_commit_sha: sha, spec_delta_dir: "x" }),
    /only the specs_synced event may set it/,
  );
  assert.throws(
    () => move(base, "issue_closed", { spec_sync_required: false }),
    /only approve_requirement may set it/,
  );

  const done = move(move(base, "specs_synced", specSyncPatch), "issue_closed");
  assert.equal(done.status, "done");
  assert.equal(validateWorkItem(done), true);
  assert.throws(
    () => validateWorkItem({ ...done, specs_commit_sha: "drifted" }),
    /40-character specs_commit_sha/,
  );
});

test("exempt standard items skip the spec gate", () => {
  const exempt = waitingCloseItem({ spec_sync_required: false });
  const done = move(exempt, "issue_closed");
  assert.equal(done.status, "done");
  assert.equal(done.spec_sync_required, false);
  assert.equal(done.specs_synced, false);
  assert.equal(validateWorkItem(done), true);
});

test("legacy items normalize to grandfathered spec fields and close directly", () => {
  const legacy = waitingCloseItem();
  for (const field of ["spec_sync_required", "specs_synced", "specs_commit_sha", "spec_delta_dir"]) {
    delete legacy[field];
  }
  const normalized = normalizeWorkItem(legacy);
  assert.equal(normalized.spec_sync_required, false);
  assert.equal(normalized.specs_synced, false);
  assert.equal(normalized.specs_commit_sha, null);
  assert.equal(normalized.spec_delta_dir, null);
  const done = move(normalized, "issue_closed");
  assert.equal(done.status, "done");
  assert.equal(validateWorkItem(done), true);
});

test("the tag path is equally constrained by the spec gate", () => {
  let item = {
    ...runtimeItem(),
    status: "waiting_tag_confirm",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_checks: "passed",
    ...githubGuard,
    merged_sha: sha,
  };
  item = move(item, "approve_tag", { image_tag: "v1.4.0" }, "human:owner");
  item = move(item, "image_verified", deliveryPatch);
  assert.equal(item.status, "waiting_close");
  assert.throws(() => move(item, "issue_closed"), /specs_synced/);
  item = move(item, "specs_synced", specSyncPatch);
  item = move(item, "issue_closed");
  assert.equal(item.status, "done");
  assert.equal(validateWorkItem(item), true);
});

test("Gate A approval is the only event that may revise the spec-sync exemption", () => {
  const approved = move(runtimeItem(), "approve_requirement", { spec_sync_required: false }, "human:owner");
  assert.equal(approved.spec_sync_required, false);
  const stillRequired = move(runtimeItem(), "approve_requirement", {}, "human:owner");
  assert.equal(stillRequired.spec_sync_required, true);
});
