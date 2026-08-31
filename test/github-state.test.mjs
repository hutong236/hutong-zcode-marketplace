import test from "node:test";
import assert from "node:assert/strict";
import { createWorkItem } from "../cmdb-dev/scripts/lib/state-machine.mjs";
import { assertRevisionCanSync, parseGitHubState, serializeGitHubState, stateLabel } from "../cmdb-dev/scripts/lib/github-state.mjs";

test("GitHub state comment round-trips", () => {
  const item = createWorkItem({
    id: "BUG-7",
    issue_number: 7,
    title: "Broken pagination",
    risk_level: "medium",
    delivery_required: true,
  });
  assert.deepEqual(parseGitHubState(serializeGitHubState(item)), item);
  assert.equal(stateLabel("waiting_tag_confirm"), "cmdb:waiting-tag-confirm");
});

test("unmanaged comment is ignored", () => {
  assert.equal(parseGitHubState("ordinary comment"), null);
});

test("V1.2 state comments receive V1.3 isolation defaults", () => {
  const legacy = createWorkItem({
    id: "REQ-8",
    issue_number: 8,
    title: "Legacy state",
    risk_level: "low",
    delivery_required: true,
  });
  delete legacy.worktree_path;
  delete legacy.rework_count;
  delete legacy.rework_limit;
  const body = `<!-- cmdb-dev-state:v2 -->\n\n\`\`\`cmdb-state\n${JSON.stringify(legacy)}\n\`\`\``;
  const migrated = parseGitHubState(body);
  assert.equal(migrated.worktree_path, null);
  assert.equal(migrated.rework_count, 0);
  assert.equal(migrated.rework_limit, 3);
});

test("sync rejects newer or divergent GitHub state revisions", () => {
  const local = createWorkItem({ id: "REQ-9", issue_number: 9, title: "Sync", risk_level: "low", delivery_required: true });
  assert.throws(() => assertRevisionCanSync(local, { ...local, revision: 2 }), /newer state revision/);
  assert.throws(() => assertRevisionCanSync(local, { ...local, title: "Divergent" }), /conflicts/);
  assert.equal(assertRevisionCanSync(local, structuredClone(local)), true);
});

test("historical Done remains readable without fabricating V2 evidence", () => {
  const historical = {
    ...createWorkItem({ id: "REQ-10", issue_number: 10, title: "Historical", risk_level: "low", delivery_required: true }),
    status: "done",
    issue_state: "closed",
    human_approval: "approved",
    tester_result: "passed",
    reviewer_result: "approved",
    pr_checks: "passed",
    merged_sha: "a".repeat(40),
    build_status: "passed",
    image_digest: `sha256:${"b".repeat(64)}`,
  };
  for (const field of ["required_checks_enforced", "registry_verified", "release_url", "sbom_status", "provenance_status", "sbom_digest", "provenance_digest", "legacy_completion"]) {
    delete historical[field];
  }
  const body = `<!-- cmdb-dev-state:v2 -->\n\n\`\`\`cmdb-state\n${JSON.stringify(historical)}\n\`\`\``;
  const migrated = parseGitHubState(body);
  assert.equal(migrated.status, "done");
  assert.equal(migrated.legacy_completion, true);
  assert.equal(migrated.registry_verified, false);
});
