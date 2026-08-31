import fs from "node:fs";
import path from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { findControlRoot, findRepositoryRoot, getItem } from "./state-store.mjs";
import { mergeGuardSatisfied } from "./state-machine.mjs";

export const AUTHORIZATION_ACTIONS = Object.freeze([
  "git-push",
  "git-tag",
  "pr-merge",
  "issue-close",
]);

const REQUIRED_STATE = Object.freeze({
  "git-push": ["pr_open", "building"],
  "git-tag": ["building"],
  "pr-merge": ["merging"],
  "issue-close": ["waiting_close"],
});

function authorizationDirectory(root) {
  return path.join(root, ".cmdb-dev", "authorizations");
}

function authorizationPath(root, token) {
  if (!/^[0-9a-f]{64}$/.test(token ?? "")) throw new Error("Invalid authorization token");
  return path.join(authorizationDirectory(root), `${token}.json`);
}

function atomicWrite(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = path.join(path.dirname(file), `.authorization-${randomUUID()}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, file);
}

function assertActionState(item, action) {
  if (!AUTHORIZATION_ACTIONS.includes(action)) throw new Error(`Unsupported authorization action: ${action}`);
  if (!REQUIRED_STATE[action].includes(item.status)) {
    throw new Error(`${action} is forbidden while ${item.id} is ${item.status}`);
  }
  if (action === "pr-merge" && (item.pr_checks !== "passed" || !mergeGuardSatisfied(item))) {
    throw new Error("PR merge requires passed checks and a verified merge guard");
  }
  if (action === "pr-merge" && !Number.isInteger(item.pr_number)) throw new Error("PR merge requires a recorded pr_number");
  if (action === "git-tag" && item.tag_confirmation !== "approved") throw new Error("git tag requires Gate C approval");
  if (action === "git-tag" && !/^[0-9a-f]{40}$/i.test(String(item.merged_sha ?? ""))) throw new Error("git tag requires merged_sha");
  if (action === "git-push" && item.status === "building" && item.tag_confirmation !== "approved") {
    throw new Error("tag push requires Gate C approval");
  }
  if (action === "git-push" && item.status === "pr_open" && (!item.branch || !item.worktree_path)) {
    throw new Error("Branch push requires recorded branch and worktree_path");
  }
  if (["git-tag", "git-push"].includes(action) && item.status === "building" && !item.image_tag) {
    throw new Error("Tag operation requires the confirmed image_tag");
  }
}

function commandHasNumber(command, number) {
  return new RegExp(`(?:^|\\s)${number}(?:\\s|$)`).test(command);
}

function assertExecutionScope(root, item, action, cwd, command) {
  if (!cwd || !command) throw new Error("Authorization consumption requires command context");
  if (path.resolve(findControlRoot(cwd)) !== path.resolve(root)) throw new Error("Protected command targets a different repository");
  if (action === "git-push" && item.status === "pr_open") {
    if (path.resolve(findRepositoryRoot(cwd)) !== path.resolve(item.worktree_path ?? "")) {
      throw new Error(`Branch push must run in ${item.worktree_path}`);
    }
    const branch = spawnSync("git", ["branch", "--show-current"], { cwd, encoding: "utf8" }).stdout.trim();
    if (branch !== item.branch) throw new Error(`Branch push requires ${item.branch}, found ${branch || "detached HEAD"}`);
  }
  if (["git-tag", "git-push"].includes(action) && item.status === "building" && !String(command).includes(item.image_tag)) {
    throw new Error(`Tag operation must name ${item.image_tag}`);
  }
  if (action === "git-tag" && !String(command).includes(item.merged_sha)) {
    throw new Error("Annotated tag command must name the verified merged SHA");
  }
  if (action === "pr-merge" && !commandHasNumber(String(command), item.pr_number)) {
    throw new Error(`PR merge command must name PR ${item.pr_number}`);
  }
  if (action === "pr-merge" && !new RegExp(`--match-head-commit(?:=|\\s+)${item.pr_head_sha}(?:\\s|$)`).test(String(command))) {
    throw new Error(`PR merge command must pin verified head SHA ${item.pr_head_sha}`);
  }
  if (action === "issue-close" && !commandHasNumber(String(command), item.issue_number)) {
    throw new Error(`Issue close command must name Issue ${item.issue_number}`);
  }
}

export function issueAuthorization(root, { id, action, actor, ttlSeconds = 120 }, now = () => new Date()) {
  if (actor !== "orchestrator") throw new Error("Only the Primary Agent orchestrator may issue execution authorization");
  if (!Number.isInteger(ttlSeconds) || ttlSeconds < 10 || ttlSeconds > 600) {
    throw new Error("Authorization TTL must be an integer from 10 to 600 seconds");
  }
  const item = getItem(root, id);
  assertActionState(item, action);
  const issuedAt = now();
  const token = randomBytes(32).toString("hex");
  const authorization = {
    schema_version: 1,
    token,
    work_item: id,
    action,
    actor,
    state_revision: item.revision,
    target: {
      branch: item.branch,
      worktree_path: item.worktree_path,
      pr_number: item.pr_number,
      pr_head_sha: item.pr_head_sha,
      issue_number: item.issue_number,
      image_tag: item.image_tag,
      merged_sha: item.merged_sha,
    },
    issued_at: issuedAt.toISOString(),
    expires_at: new Date(issuedAt.getTime() + ttlSeconds * 1000).toISOString(),
    used_at: null,
  };
  atomicWrite(authorizationPath(root, token), authorization);
  return authorization;
}

export function consumeAuthorization(root, { token, action, cwd, command }, now = () => new Date()) {
  const file = authorizationPath(root, token);
  if (!fs.existsSync(file)) throw new Error("Authorization token was not found");
  const authorization = JSON.parse(fs.readFileSync(file, "utf8"));
  if (authorization.action !== action) throw new Error(`Authorization is for ${authorization.action}, not ${action}`);
  if (authorization.used_at) throw new Error("Authorization token has already been used");
  if (Date.parse(authorization.expires_at) <= now().getTime()) throw new Error("Authorization token has expired");

  const item = getItem(root, authorization.work_item);
  if (item.revision !== authorization.state_revision) throw new Error("Authorization state revision is stale");
  assertActionState(item, action);
  assertExecutionScope(root, item, action, cwd, command);

  authorization.used_at = now().toISOString();
  atomicWrite(file, authorization);
  return authorization;
}
