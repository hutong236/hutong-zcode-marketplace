const ID_PATTERN = /^(REQ|BUG)-(\d+)$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/i;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i;
const SEMVER_TAG_PATTERN = /^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

export const STATES = Object.freeze([
  "waiting_approval",
  "ready",
  "planning",
  "doing",
  "testing",
  "review",
  "pr_open",
  "pr_checking",
  "waiting_human_merge",
  "merging",
  "waiting_tag_confirm",
  "building",
  "waiting_close",
  "blocked",
  "done",
]);

export const RISKS = Object.freeze(["low", "medium", "high"]);
export const MERGE_GUARD_MODES = Object.freeze([
  "unverified",
  "github_required_checks",
  "control_plane_verified",
]);
export const DEFAULT_REWORK_LIMIT = 3;
export const HUMAN_EVENTS = new Set([
  "approve_requirement",
  "approve_merge",
  "approve_tag",
  "approve_skip",
]);

const REWORK_EVENTS = new Set(["tests_failed", "changes_requested", "checks_failed"]);

const STATIC_TRANSITIONS = Object.freeze({
  waiting_approval: { approve_requirement: "ready" },
  ready: { start_planning: "planning" },
  planning: { plan_complete: "doing" },
  doing: { code_complete: "testing" },
  testing: { tests_failed: "doing", tests_passed: "review" },
  review: { changes_requested: "doing", review_approved: "pr_open" },
  pr_open: { pr_created: "pr_checking" },
  pr_checking: { checks_failed: "doing" },
  waiting_human_merge: { approve_merge: "merging" },
  merging: { pr_merged: "waiting_tag_confirm" },
  waiting_tag_confirm: { approve_tag: "building", approve_skip: "waiting_close" },
  building: { image_verified: "waiting_close" },
  waiting_close: { issue_closed: "done" },
});

const PATCH_FIELDS = new Set([
  "agent_owner",
  "block_reason",
  "branch",
  "build_status",
  "github_issue_url",
  "github_pr_url",
  "image",
  "image_digest",
  "image_tag",
  "issue_state",
  "merged_sha",
  "next_action",
  "pr_checks",
  "pr_check_name",
  "pr_check_run_url",
  "pr_head_sha",
  "merge_guard_mode",
  "required_checks_enforced",
  "pr_number",
  "provenance_status",
  "provenance_digest",
  "registry_verified",
  "release_url",
  "sbom_status",
  "sbom_digest",
  "tag_confirmation",
  "workflow_run_url",
  "worktree_path",
]);

function nowIso(now) {
  return (typeof now === "function" ? now() : new Date()).toISOString();
}

function asBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(`Expected boolean, received ${String(value)}`);
}

function requireHumanActor(event, actor) {
  if (HUMAN_EVENTS.has(event) && !/^human:[A-Za-z0-9_.@-]+$/.test(actor ?? "")) {
    throw new Error(`${event} requires actor in human:<identity> form`);
  }
}

function filteredPatch(patch = {}) {
  const result = {};
  for (const [key, value] of Object.entries(patch)) {
    if (!PATCH_FIELDS.has(key)) throw new Error(`Unsupported state patch field: ${key}`);
    result[key] = value;
  }
  return result;
}

export function mergeGuardSatisfied(item) {
  const evidenceComplete = SHA_PATTERN.test(String(item.pr_head_sha ?? ""))
    && /^https:\/\/github\.com\//.test(String(item.pr_check_run_url ?? ""))
    && Boolean(String(item.pr_check_name ?? "").trim());
  if (!evidenceComplete) return false;
  if (item.merge_guard_mode === "github_required_checks") {
    return item.required_checks_enforced === true;
  }
  return item.merge_guard_mode === "control_plane_verified"
    && item.required_checks_enforced === false;
}

export function normalizeWorkItem(item) {
  const next = structuredClone(item);
  if (next.schema_version !== 2) return next;
  const historicalDone = next.status === "done" && (
    !("required_checks_enforced" in next)
    || !("merge_guard_mode" in next)
    || !("pr_head_sha" in next)
    || !("registry_verified" in next)
    || !("sbom_digest" in next)
    || !("provenance_digest" in next)
  );
  if (!("worktree_path" in next)) next.worktree_path = null;
  if (!("rework_count" in next)) next.rework_count = 0;
  if (!("rework_limit" in next)) next.rework_limit = DEFAULT_REWORK_LIMIT;
  if (!("registry_verified" in next)) next.registry_verified = false;
  if (!("release_url" in next)) next.release_url = null;
  if (!("sbom_status" in next)) next.sbom_status = "unknown";
  if (!("provenance_status" in next)) next.provenance_status = "unknown";
  if (!("sbom_digest" in next)) next.sbom_digest = null;
  if (!("provenance_digest" in next)) next.provenance_digest = null;
  if (!("required_checks_enforced" in next)) next.required_checks_enforced = false;
  if (!("merge_guard_mode" in next)) {
    next.merge_guard_mode = next.required_checks_enforced ? "github_required_checks" : "unverified";
  }
  if (!("pr_head_sha" in next)) next.pr_head_sha = null;
  if (!("pr_check_name" in next)) next.pr_check_name = null;
  if (!("pr_check_run_url" in next)) next.pr_check_run_url = null;
  if (!("legacy_completion" in next)) next.legacy_completion = historicalDone;
  return next;
}

export function createWorkItem(input, now = () => new Date()) {
  const idMatch = String(input.id ?? "").match(ID_PATTERN);
  if (!idMatch) throw new Error("Work Item id must match REQ-<issue> or BUG-<issue>");
  const issueNumber = Number(input.issue_number);
  if (!Number.isInteger(issueNumber) || issueNumber <= 0) throw new Error("issue_number must be a positive integer");
  if (Number(idMatch[2]) !== issueNumber) throw new Error("Work Item id number must equal issue_number");
  if (!RISKS.includes(input.risk_level)) throw new Error(`risk_level must be one of ${RISKS.join(", ")}`);
  if (!String(input.title ?? "").trim()) throw new Error("title is required");

  const deliveryRequired = asBoolean(input.delivery_required, true);
  const skipAllowed = asBoolean(input.skip_allowed, false);
  if (deliveryRequired && skipAllowed) throw new Error("Runtime delivery cannot allow skip");
  if (!deliveryRequired && !String(input.delivery_reason ?? "").trim()) {
    throw new Error("Non-runtime delivery policy requires delivery_reason");
  }

  const timestamp = nowIso(now);
  const item = {
    schema_version: 2,
    id: input.id,
    issue_number: issueNumber,
    github_issue_url: input.github_issue_url ?? null,
    title: String(input.title ?? "").trim(),
    type: idMatch[1] === "BUG" ? "bug" : (input.type ?? "feature"),
    status: "waiting_approval",
    previous_status: null,
    risk_level: input.risk_level,
    delivery_required: deliveryRequired,
    delivery_reason: String(input.delivery_reason ?? "").trim(),
    skip_allowed: skipAllowed,
    human_approval: "required",
    branch: null,
    worktree_path: null,
    pr_number: null,
    github_pr_url: null,
    merged_sha: null,
    issue_state: "open",
    coder_result: "pending",
    tester_result: "pending",
    reviewer_result: "pending",
    pr_checks: "unknown",
    pr_check_name: null,
    pr_check_run_url: null,
    pr_head_sha: null,
    merge_guard_mode: "unverified",
    required_checks_enforced: false,
    legacy_completion: false,
    tag_confirmation: "pending",
    build_status: "unknown",
    image: null,
    image_tag: null,
    image_digest: null,
    workflow_run_url: null,
    registry_verified: false,
    release_url: null,
    sbom_status: "unknown",
    provenance_status: "unknown",
    sbom_digest: null,
    provenance_digest: null,
    blocked: false,
    block_reason: null,
    agent_owner: "orchestrator",
    next_action: "human_approval",
    attempts: { coder: 0, tester: 0, reviewer: 0 },
    rework_count: 0,
    rework_limit: DEFAULT_REWORK_LIMIT,
    revision: 1,
    created_at: timestamp,
    updated_at: timestamp,
    history: [{
      revision: 1,
      event: "created",
      from: null,
      to: "waiting_approval",
      actor: input.actor ?? "orchestrator",
      evidence: input.evidence ?? `GitHub Issue #${issueNumber} created`,
      at: timestamp,
    }],
  };
  validateWorkItem(item);
  return item;
}

function targetFor(item, event, payload) {
  if (event === "block") {
    if (item.status === "done") throw new Error("Done is terminal and cannot be blocked");
    return "blocked";
  }
  if (event === "resume") {
    if (item.status !== "blocked") throw new Error("resume is valid only from blocked");
    const target = payload.to ?? item.previous_status;
    if (!STATES.includes(target) || ["blocked", "done"].includes(target)) {
      throw new Error("Blocked item has no valid resumable previous state");
    }
    return target;
  }
  if (event === "checks_passed") {
    if (item.status !== "pr_checking") throw new Error("checks_passed requires pr_checking");
    const needsHumanMerge = item.risk_level === "high"
      || payload.patch?.merge_guard_mode === "control_plane_verified";
    return needsHumanMerge ? "waiting_human_merge" : "merging";
  }
  const target = STATIC_TRANSITIONS[item.status]?.[event];
  if (!target) throw new Error(`Invalid transition: ${item.status} --${event}--> ?`);
  if (REWORK_EVENTS.has(event) && item.rework_count >= item.rework_limit) return "blocked";
  return target;
}

export function applyEvent(item, event, payload = {}, now = () => new Date()) {
  validateWorkItem(item);
  const actor = payload.actor ?? "orchestrator";
  const evidence = String(payload.evidence ?? "").trim();
  if (!evidence) throw new Error("Every transition requires evidence");
  requireHumanActor(event, actor);

  if (event === "approve_skip" && (item.delivery_required || !item.skip_allowed)) {
    throw new Error("skip is forbidden by the persisted delivery policy");
  }
  if (event === "start_planning") {
    if (!String(payload.patch?.branch ?? "").trim()) throw new Error("start_planning requires branch");
    if (!String(payload.patch?.worktree_path ?? "").trim()) throw new Error("start_planning requires worktree_path");
  }
  if (event === "review_approved" && item.tester_result !== "passed") {
    throw new Error("Reviewer approval requires tester_result=passed");
  }
  if (event === "pr_created") {
    const prNumber = payload.patch?.pr_number;
    if (!Number.isInteger(prNumber) || prNumber <= 0) throw new Error("pr_created requires a positive pr_number");
    if (!/^https:\/\/github\.com\//.test(String(payload.patch?.github_pr_url ?? ""))) throw new Error("pr_created requires github_pr_url");
  }
  if (event === "checks_passed") {
    if (item.tester_result !== "passed" || item.reviewer_result !== "approved") throw new Error("checks_passed requires passed Tester and approved Reviewer");
    const mode = payload.patch?.merge_guard_mode;
    if (!MERGE_GUARD_MODES.includes(mode) || mode === "unverified") {
      throw new Error("checks_passed requires verified merge-guard evidence");
    }
    if (!SHA_PATTERN.test(String(payload.patch?.pr_head_sha ?? ""))) {
      throw new Error("checks_passed requires the verified PR head SHA");
    }
    if (!String(payload.patch?.pr_check_name ?? "").trim()) {
      throw new Error("checks_passed requires the verified PR check name");
    }
    if (!/^https:\/\/github\.com\//.test(String(payload.patch?.pr_check_run_url ?? ""))) {
      throw new Error("checks_passed requires a GitHub PR check URL");
    }
    if (mode === "github_required_checks" && payload.patch?.required_checks_enforced !== true) {
      throw new Error("GitHub merge guard requires enforced server-side checks evidence");
    }
    if (mode === "control_plane_verified" && payload.patch?.required_checks_enforced !== false) {
      throw new Error("Control-plane merge guard must not claim GitHub enforcement");
    }
  }
  if (event === "pr_merged" && !SHA_PATTERN.test(String(payload.patch?.merged_sha ?? ""))) {
    throw new Error("pr_merged requires a 40-character merged_sha");
  }
  if (event === "pr_merged" && (item.pr_checks !== "passed" || !mergeGuardSatisfied(item) || item.reviewer_result !== "approved")) {
    throw new Error("pr_merged requires approved review and a verified merge guard");
  }
  if (event === "approve_tag" && !SEMVER_TAG_PATTERN.test(String(payload.patch?.image_tag ?? ""))) {
    throw new Error("approve_tag requires the confirmed strict SemVer image_tag");
  }
  if (event === "approve_tag" && !SHA_PATTERN.test(String(item.merged_sha ?? ""))) {
    throw new Error("approve_tag requires merged_sha");
  }
  if (event === "image_verified") {
    if (!DIGEST_PATTERN.test(String(payload.patch?.image_digest ?? ""))) throw new Error("image_verified requires sha256 image_digest");
    const image = String(payload.patch?.image ?? "");
    if (!image.startsWith("ghcr.io/") || image !== image.toLowerCase()) throw new Error("image_verified requires a lowercase GHCR image");
    if (!SEMVER_TAG_PATTERN.test(String(payload.patch?.image_tag ?? ""))) throw new Error("image_verified requires a strict SemVer image_tag");
    if (item.image_tag && payload.patch?.image_tag !== item.image_tag) throw new Error("verified image_tag differs from Gate C confirmation");
    if (!/^https:\/\/github\.com\//.test(String(payload.patch?.workflow_run_url ?? ""))) throw new Error("image_verified requires a GitHub workflow_run_url");
    if (!/^https:\/\/github\.com\//.test(String(payload.patch?.release_url ?? ""))) throw new Error("image_verified requires a GitHub release_url");
    if (payload.patch?.registry_verified !== true) throw new Error("image_verified requires independent registry verification");
    if (payload.patch?.sbom_status !== "verified") throw new Error("image_verified requires verified SBOM evidence");
    if (payload.patch?.provenance_status !== "verified") throw new Error("image_verified requires verified provenance evidence");
    if (!DIGEST_PATTERN.test(String(payload.patch?.sbom_digest ?? ""))) throw new Error("image_verified requires the SBOM attestation digest");
    if (!DIGEST_PATTERN.test(String(payload.patch?.provenance_digest ?? ""))) throw new Error("image_verified requires the provenance attestation digest");
  }

  const from = item.status;
  const to = targetFor(item, event, payload);
  const timestamp = nowIso(now);
  const next = structuredClone(item);
  Object.assign(next, filteredPatch(payload.patch));
  next.status = to;
  next.revision += 1;
  next.updated_at = timestamp;
  next.blocked = to === "blocked";

  if (event === "block") {
    next.previous_status = from;
    next.block_reason = payload.patch?.block_reason ?? evidence;
    next.next_action = "resolve_blocker";
  } else if (event === "resume") {
    next.block_reason = null;
    next.previous_status = null;
    if (String(item.block_reason ?? "").startsWith("Rework limit ")) next.rework_count = 0;
  }

  if (REWORK_EVENTS.has(event)) next.rework_count += 1;

  if (event === "approve_requirement") {
    next.human_approval = "approved";
    next.next_action = "start_planning";
  } else if (event === "code_complete") {
    next.coder_result = "completed";
    next.tester_result = "pending";
    next.reviewer_result = "pending";
    next.attempts.coder += 1;
    next.next_action = "run_tests";
  } else if (event === "tests_failed") {
    next.tester_result = "failed";
    next.reviewer_result = "pending";
    next.attempts.tester += 1;
    next.next_action = "return_to_coder";
  } else if (event === "tests_passed") {
    next.tester_result = "passed";
    next.attempts.tester += 1;
    next.next_action = "review";
  } else if (event === "changes_requested") {
    next.reviewer_result = "changes_requested";
    next.attempts.reviewer += 1;
    next.next_action = "return_to_coder";
  } else if (event === "review_approved") {
    next.reviewer_result = "approved";
    next.attempts.reviewer += 1;
    next.next_action = "create_pr";
  } else if (event === "pr_created") {
    next.pr_checks = "unknown";
    next.pr_check_name = null;
    next.pr_check_run_url = null;
    next.pr_head_sha = null;
    next.merge_guard_mode = "unverified";
    next.required_checks_enforced = false;
    next.next_action = "verify_pr_checks";
  } else if (event === "checks_failed") {
    next.pr_checks = "failed";
    next.pr_check_name = null;
    next.pr_check_run_url = null;
    next.pr_head_sha = null;
    next.merge_guard_mode = "unverified";
    next.required_checks_enforced = false;
    next.next_action = "return_to_coder";
  } else if (event === "checks_passed") {
    next.pr_checks = "passed";
    next.next_action = to === "waiting_human_merge" ? "human_merge_approval" : "merge_pr";
  } else if (event === "pr_merged") {
    next.next_action = "human_tag_confirmation";
  } else if (event === "approve_tag") {
    next.tag_confirmation = "approved";
    next.build_status = "running";
    next.next_action = "verify_image";
  } else if (event === "approve_skip") {
    next.tag_confirmation = "skipped_by_human";
    next.build_status = "skipped";
    next.next_action = "close_issue";
  } else if (event === "image_verified") {
    next.build_status = "passed";
    next.next_action = "close_issue";
  } else if (event === "issue_closed") {
    next.issue_state = "closed";
    next.next_action = "none";
  }

  if (to === "blocked" && REWORK_EVENTS.has(event)) {
    next.previous_status = from;
    next.block_reason = `Rework limit ${next.rework_limit} exhausted after ${event}`;
    next.next_action = "human_intervention";
  }

  next.history.push({
    revision: next.revision,
    event,
    from,
    to,
    actor,
    evidence,
    at: timestamp,
  });
  if (next.history.length > 100) next.history = next.history.slice(-100);
  validateWorkItem(next);
  return next;
}

export function validateWorkItem(item) {
  const errors = [];
  const idMatch = String(item.id ?? "").match(ID_PATTERN);
  if (!idMatch) errors.push("invalid id");
  if (!Number.isInteger(item.issue_number) || item.issue_number <= 0) errors.push("invalid issue_number");
  if (idMatch && Number(idMatch[2]) !== item.issue_number) errors.push("id/issue mismatch");
  if (!STATES.includes(item.status)) errors.push("invalid status");
  if (!RISKS.includes(item.risk_level)) errors.push("invalid risk_level");
  if (!String(item.title ?? "").trim()) errors.push("title required");
  if (typeof item.required_checks_enforced !== "boolean") errors.push("invalid required_checks_enforced");
  if (!MERGE_GUARD_MODES.includes(item.merge_guard_mode)) errors.push("invalid merge_guard_mode");
  if (item.merge_guard_mode === "github_required_checks" && item.required_checks_enforced !== true) {
    errors.push("github merge guard requires required_checks_enforced");
  }
  if (item.merge_guard_mode === "control_plane_verified" && item.required_checks_enforced !== false) {
    errors.push("control-plane guard cannot claim GitHub enforcement");
  }
  if (item.pr_checks === "passed" && !item.legacy_completion && !mergeGuardSatisfied(item)) {
    errors.push("passed PR checks require complete merge-guard evidence");
  }
  if (typeof item.legacy_completion !== "boolean") errors.push("invalid legacy_completion");
  if (item.delivery_required && item.skip_allowed) errors.push("runtime delivery cannot allow skip");
  if (!item.delivery_required && !String(item.delivery_reason ?? "").trim()) errors.push("delivery_reason required");
  if (!Array.isArray(item.history)) errors.push("history must be an array");
  if (!Number.isInteger(item.revision) || item.revision < 1) errors.push("invalid revision");
  if (!Number.isInteger(item.rework_limit) || item.rework_limit < 1) errors.push("invalid rework_limit");
  if (!Number.isInteger(item.rework_count) || item.rework_count < 0) errors.push("invalid rework_count");
  if (item.rework_count > item.rework_limit + 1) errors.push("rework_count exceeds terminal allowance");
  if (item.status === "done") {
    if (item.issue_state !== "closed") errors.push("done requires closed Issue");
    if (item.human_approval !== "approved") errors.push("done requires requirement approval");
    if (item.tester_result !== "passed") errors.push("done requires passed tests");
    if (item.reviewer_result !== "approved") errors.push("done requires reviewer approval");
    if (item.pr_checks !== "passed") errors.push("done requires passed PR checks");
    if (!item.legacy_completion && !mergeGuardSatisfied(item)) errors.push("done requires a verified merge guard");
    if (!SHA_PATTERN.test(String(item.merged_sha ?? ""))) errors.push("done requires merged_sha");
    if (item.delivery_required) {
      if (item.build_status !== "passed") errors.push("runtime delivery requires passed image build");
      if (!DIGEST_PATTERN.test(String(item.image_digest ?? ""))) errors.push("runtime delivery requires image digest");
      if (!item.legacy_completion) {
        if (item.registry_verified !== true) errors.push("runtime delivery requires registry verification");
        if (item.sbom_status !== "verified") errors.push("runtime delivery requires verified SBOM");
        if (item.provenance_status !== "verified") errors.push("runtime delivery requires verified provenance");
        if (!DIGEST_PATTERN.test(String(item.sbom_digest ?? ""))) errors.push("runtime delivery requires SBOM attestation digest");
        if (!DIGEST_PATTERN.test(String(item.provenance_digest ?? ""))) errors.push("runtime delivery requires provenance attestation digest");
        if (!String(item.release_url ?? "").startsWith("https://github.com/")) errors.push("runtime delivery requires release URL");
      }
    } else if (item.build_status === "skipped" && !item.skip_allowed) {
      errors.push("skip is not allowed");
    }
  }
  if (errors.length) throw new Error(`Invalid Work Item ${item.id ?? "<unknown>"}: ${errors.join("; ")}`);
  return true;
}
