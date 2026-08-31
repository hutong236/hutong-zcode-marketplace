import { applyEvent, createWorkItem, validateWorkItem } from "../scripts/lib/state-machine.mjs";
import { findControlRoot, getItem, initializeRepositoryState, putItem, readStore } from "../scripts/lib/state-store.mjs";
import { hydrateItemFromGitHub, resolveRepository, runGh, syncItemToGitHub } from "../scripts/lib/github-state.mjs";
import { createWorktree } from "../scripts/lib/worktree.mjs";
import { issueAuthorization } from "../scripts/lib/authorization.mjs";
import { validateDeliveryEvidence } from "../scripts/lib/delivery.mjs";
import { runPreflight } from "../scripts/lib/preflight.mjs";
import { initializeTargetRepository } from "../scripts/lib/initializer.mjs";
import { writeProjection } from "../scripts/lib/projection.mjs";
import { DEFAULT_PR_CHECK, verifyPullRequestChecks } from "../scripts/lib/pr-checks.mjs";

const objectSchema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });
const text = { type: "string", minLength: 1 };
const id = { type: "string", pattern: "^(REQ|BUG)-[1-9][0-9]*$" };

export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "cmdb_preflight",
    description: "Read-only readiness check for Git, GitHub, the applicable PR merge guard, and verifiable image delivery.",
    inputSchema: objectSchema({}),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "cmdb_initialize",
    description: "Initialize cmdb-dev state, Obsidian projections, PR checks, and tag-only image workflow without touching business code.",
    inputSchema: objectSchema({ repository: { type: "string", pattern: "^[^/]+/[^/]+$" } }),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_open_work_item",
    description: "Create the GitHub Issue first, then canonical Work Item state and its local read-only projection. Stops at Gate A.",
    inputSchema: objectSchema({
      title: text,
      type: { enum: ["feature", "bug", "refactor", "maintenance"] },
      risk_level: { enum: ["low", "medium", "high"] },
      delivery_required: { type: "boolean" },
      delivery_reason: { type: "string" },
      skip_allowed: { type: "boolean" },
      planner_summary: { type: "string" },
      acceptance_criteria: { type: "array", items: text, minItems: 1 },
      repository: { type: "string", pattern: "^[^/]+/[^/]+$" },
    }, ["title", "type", "risk_level", "delivery_required", "skip_allowed", "planner_summary", "acceptance_criteria"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_transition",
    description: "Apply one evidence-bearing state-machine event, update projection, and normally sync the GitHub Issue.",
    inputSchema: objectSchema({
      id, event: text, actor: text, evidence: text, patch: { type: "object" }, to: { type: "string" },
      sync: { type: "boolean", default: true }, repository: { type: "string" },
    }, ["id", "event", "actor", "evidence"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_status",
    description: "Read canonical Work Item status; optionally hydrate GitHub first so remote truth wins.",
    inputSchema: objectSchema({ id, refresh_from_github: { type: "boolean", default: false }, repository: { type: "string" } }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "cmdb_validate",
    description: "Validate one or all local Work Items against the V2 state invariants.",
    inputSchema: objectSchema({ id }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "cmdb_sync",
    description: "Sync a validated local Work Item to its GitHub Issue state label and machine comment.",
    inputSchema: objectSchema({ id, repository: { type: "string" } }, ["id"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_hydrate",
    description: "Hydrate canonical state from a GitHub Issue and refresh the local cache/projection.",
    inputSchema: objectSchema({ issue_number: { type: "integer", minimum: 1 }, repository: { type: "string" } }, ["issue_number"]),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
  {
    name: "cmdb_worktree_create",
    description: "Create the approved Work Item's isolated branch/worktree, transition ready to planning, and sync state.",
    inputSchema: objectSchema({
      id, actor: { const: "orchestrator" }, evidence: text, branch: { type: "string" }, base: { type: "string" },
      sync: { type: "boolean", default: true }, repository: { type: "string" },
    }, ["id", "actor", "evidence", "base"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_verify_pr_checks",
    description: "Verify the exact PR head and successful workflow check; use GitHub enforcement when available or the private-repository control-plane guard otherwise.",
    inputSchema: objectSchema({
      id, check_name: { type: "string", minLength: 1, default: DEFAULT_PR_CHECK },
      actor: { const: "orchestrator" }, evidence: text,
      sync: { type: "boolean", default: true }, repository: { type: "string" },
    }, ["id", "actor", "evidence"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_authorize",
    description: "Primary-Agent-only issuance of a state-bound, short-lived, single-use token for one protected operation.",
    inputSchema: objectSchema({
      id, action: { enum: ["git-push", "git-tag", "pr-merge", "issue-close"] },
      actor: { const: "orchestrator" }, ttl_seconds: { type: "integer", minimum: 10, maximum: 600 },
    }, ["id", "action", "actor"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
  {
    name: "cmdb_verify_delivery",
    description: "Cross-check Actions, Release, registry digest, merged SHA, SBOM and provenance; then record image_verified.",
    inputSchema: objectSchema({
      id, workflow_metadata: { type: "object" }, release_metadata: { type: "object" }, registry_digest: text,
      release_url: text, sbom_digest: text, provenance_digest: text, actor: { const: "orchestrator" }, evidence: text,
      sync: { type: "boolean", default: true }, repository: { type: "string" },
    }, ["id", "workflow_metadata", "release_metadata", "registry_digest", "release_url", "sbom_digest", "provenance_digest", "actor", "evidence"]),
    annotations: { readOnlyHint: false, destructiveHint: false },
  },
]);

function repositoryFor(root, explicit) {
  const configured = readStore(root).repository;
  if (explicit && configured && explicit !== configured) throw new Error(`State store belongs to ${configured}, not ${explicit}`);
  if (explicit) return explicit;
  return configured || resolveRepository(root);
}

function persist(root, item, { sync = true, repository, projection = {} } = {}) {
  putItem(root, item);
  const projectionFile = writeProjection(root, item, projection);
  const github = sync ? syncItemToGitHub(item, { repository: repositoryFor(root, repository), cwd: root }) : null;
  return { item, projection_file: projectionFile, github };
}

function liveFacts(root, item, repository) {
  const facts = { issue: { number: item.issue_number, state: item.issue_state, url: item.github_issue_url }, pr: null, image_runs: [] };
  if (item.pr_number) {
    try {
      facts.pr = JSON.parse(runGh([
        "pr", "view", String(item.pr_number), "--repo", repository,
        "--json", "number,state,url,isDraft,mergeable,headRefName,baseRefName,mergeCommit,statusCheckRollup",
      ], { cwd: root }));
    } catch (error) {
      facts.pr = { error: error.message };
    }
  }
  if (item.image_tag) {
    try {
      facts.image_runs = JSON.parse(runGh([
        "run", "list", "--repo", repository, "--workflow", "CMDB Build Image", "--branch", item.image_tag,
        "--limit", "10", "--json", "databaseId,status,conclusion,url,headSha,event,workflowName,headBranch",
      ], { cwd: root }) || "[]");
    } catch (error) {
      facts.image_runs = [{ error: error.message }];
    }
  }
  return facts;
}

function issueBody(args) {
  const criteria = args.acceptance_criteria.map((value) => `- [ ] ${value}`).join("\n");
  return `<!-- cmdb-dev-work-item:v2 -->\n\n## Planner summary\n${args.planner_summary}\n\n## Acceptance criteria\n${criteria}\n\n## Delivery policy\n- delivery_required: ${args.delivery_required}\n- skip_allowed: ${args.skip_allowed}\n- reason: ${args.delivery_reason || "Runtime delivery required"}\n`;
}

export function callTool(name, args = {}, context = {}) {
  const root = findControlRoot(context.cwd ?? process.cwd());

  if (name === "cmdb_preflight") return runPreflight(root);
  if (name === "cmdb_initialize") return initializeTargetRepository(root, context.pluginRoot, args.repository ?? null);

  if (name === "cmdb_open_work_item") {
    const repository = repositoryFor(root, args.repository);
    const issueUrl = runGh(["issue", "create", "--repo", repository, "--title", args.title, "--body", issueBody(args)], { cwd: root });
    try {
      const issueNumber = Number(issueUrl.match(/\/issues\/(\d+)(?:\?.*)?$/)?.[1]);
      if (!Number.isInteger(issueNumber)) throw new Error(`Could not parse Issue number from: ${issueUrl}`);
      const prefix = args.type === "bug" ? "BUG" : "REQ";
      const workItemId = `${prefix}-${issueNumber}`;
      runGh(["issue", "edit", String(issueNumber), "--repo", repository, "--title", `${workItemId} ${args.title}`], { cwd: root });
      initializeRepositoryState(root, repository);
      const item = createWorkItem({
        id: workItemId,
        issue_number: issueNumber,
        github_issue_url: issueUrl,
        title: args.title,
        type: args.type,
        risk_level: args.risk_level,
        delivery_required: args.delivery_required,
        delivery_reason: args.delivery_reason,
        skip_allowed: args.skip_allowed,
        actor: "orchestrator",
        evidence: `GitHub Issue #${issueNumber} created before implementation`,
      });
      const result = persist(root, item, {
        sync: true,
        repository,
        projection: { plannerSummary: args.planner_summary, acceptanceCriteria: args.acceptance_criteria },
      });
      return { ...result, issue_url: issueUrl };
    } catch (error) {
      throw new Error(`Issue was created at ${issueUrl}, but Work Item initialization failed: ${error.message}`);
    }
  }

  if (name === "cmdb_transition") {
    if (["start_planning", "checks_passed", "image_verified"].includes(args.event)) {
      throw new Error(`${args.event} is reserved for its dedicated MCP evidence tool`);
    }
    const item = getItem(root, args.id);
    const next = applyEvent(item, args.event, { actor: args.actor, evidence: args.evidence, patch: args.patch ?? {}, to: args.to });
    return persist(root, next, { sync: args.sync !== false, repository: args.repository });
  }

  if (name === "cmdb_status") {
    if (!args.id) return readStore(root, { allowMissing: false });
    let item = getItem(root, args.id);
    let repository = null;
    if (args.refresh_from_github) {
      repository = repositoryFor(root, args.repository);
      item = hydrateItemFromGitHub({ repository, issueNumber: item.issue_number, cwd: root });
      putItem(root, item);
      writeProjection(root, item);
    }
    return { item, facts: repository ? liveFacts(root, item, repository) : null };
  }

  if (name === "cmdb_validate") {
    if (args.id) validateWorkItem(getItem(root, args.id));
    else for (const item of Object.values(readStore(root, { allowMissing: false }).items)) validateWorkItem(item);
    return { valid: true, id: args.id ?? null };
  }

  if (name === "cmdb_sync") {
    const item = getItem(root, args.id);
    return syncItemToGitHub(item, { repository: repositoryFor(root, args.repository), cwd: root });
  }

  if (name === "cmdb_hydrate") {
    const item = hydrateItemFromGitHub({ repository: repositoryFor(root, args.repository), issueNumber: args.issue_number, cwd: root });
    putItem(root, item);
    return { item, projection_file: writeProjection(root, item) };
  }

  if (name === "cmdb_worktree_create") {
    const item = getItem(root, args.id);
    if (item.status !== "ready") throw new Error("Worktree creation requires ready state");
    const worktree = createWorktree(root, { id: args.id, branch: args.branch, base: args.base });
    const next = applyEvent(item, "start_planning", {
      actor: args.actor,
      evidence: args.evidence,
      patch: { branch: worktree.branch, worktree_path: worktree.path },
    });
    return { worktree, ...persist(root, next, { sync: args.sync !== false, repository: args.repository }) };
  }

  if (name === "cmdb_verify_pr_checks") {
    const item = getItem(root, args.id);
    const repository = repositoryFor(root, args.repository);
    const verification = verifyPullRequestChecks({
      root,
      repository,
      item,
      checkName: args.check_name ?? DEFAULT_PR_CHECK,
    });
    const next = applyEvent(item, "checks_passed", {
      actor: args.actor,
      evidence: args.evidence,
      patch: verification.patch,
    });
    return { verification, ...persist(root, next, { sync: args.sync !== false, repository }) };
  }

  if (name === "cmdb_authorize") {
    return issueAuthorization(root, { id: args.id, action: args.action, actor: args.actor, ttlSeconds: args.ttl_seconds });
  }

  if (name === "cmdb_verify_delivery") {
    const item = getItem(root, args.id);
    if (item.status !== "building") throw new Error("Delivery verification requires building state");
    const patch = validateDeliveryEvidence({
      item,
      workflowMetadata: args.workflow_metadata,
      releaseMetadata: args.release_metadata,
      registryDigest: args.registry_digest,
      releaseUrl: args.release_url,
      sbomDigest: args.sbom_digest,
      provenanceDigest: args.provenance_digest,
    });
    const next = applyEvent(item, "image_verified", { actor: args.actor, evidence: args.evidence, patch });
    return persist(root, next, { sync: args.sync !== false, repository: args.repository });
  }

  throw new Error(`Unknown MCP tool: ${name}`);
}
