import { spawnSync } from "node:child_process";
import { normalizeWorkItem, validateWorkItem } from "./state-machine.mjs";

export const STATE_MARKER = "<!-- cmdb-dev-state:v2 -->";
const STATE_BLOCK = /```cmdb-state\s*\n([\s\S]*?)\n```/;

export function stateLabel(status) {
  return `cmdb:${String(status).replaceAll("_", "-")}`;
}

export function serializeGitHubState(item) {
  validateWorkItem(item);
  return `${STATE_MARKER}\n\n\`\`\`cmdb-state\n${JSON.stringify(item, null, 2)}\n\`\`\`\n\n> Managed by cmdb-dev. Do not edit this state block manually.`;
}

export function parseGitHubState(body) {
  if (!String(body).includes(STATE_MARKER)) return null;
  const match = String(body).match(STATE_BLOCK);
  if (!match) throw new Error("CMDB state marker exists without a valid state block");
  const item = normalizeWorkItem(JSON.parse(match[1]));
  validateWorkItem(item);
  return item;
}

export function runGh(args, { cwd = process.cwd(), input } = {}) {
  const result = spawnSync("gh", args, { cwd, input, encoding: "utf8", maxBuffer: 10 * 1024 * 1024 });
  if (result.error?.code === "ENOENT") throw new Error("GitHub CLI (gh) is not installed");
  if (result.status !== 0) throw new Error(`gh ${args.join(" ")} failed: ${result.stderr.trim() || result.stdout.trim()}`);
  return result.stdout.trim();
}

export function resolveRepository(cwd = process.cwd()) {
  return runGh(["repo", "view", "--json", "nameWithOwner", "--jq", ".nameWithOwner"], { cwd });
}

function issueComments(repository, issueNumber, cwd) {
  const raw = runGh(["api", "--paginate", "--slurp", `repos/${repository}/issues/${issueNumber}/comments?per_page=100`], { cwd });
  if (!raw) return [];
  const pages = JSON.parse(raw);
  return Array.isArray(pages[0]) ? pages.flat() : pages;
}

export function assertRevisionCanSync(local, remote) {
  if (!remote) return true;
  if (remote.id !== local.id) throw new Error(`GitHub state belongs to ${remote.id}, not ${local.id}`);
  if (remote.revision > local.revision) {
    throw new Error(`GitHub has newer state revision ${remote.revision}; hydrate before sync`);
  }
  if (remote.revision === local.revision && JSON.stringify(remote) !== JSON.stringify(local)) {
    throw new Error(`GitHub state revision ${remote.revision} conflicts with the local payload`);
  }
  return true;
}

export function hydrateItemFromGitHub({ repository, issueNumber, cwd = process.cwd() }) {
  const comments = issueComments(repository, issueNumber, cwd)
    .filter((comment) => String(comment.body).includes(STATE_MARKER))
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  if (!comments.length) throw new Error(`Issue #${issueNumber} has no cmdb-dev state comment`);
  const item = parseGitHubState(comments.at(-1).body);
  const issue = JSON.parse(runGh(["issue", "view", String(issueNumber), "--repo", repository, "--json", "number,state,url,title"], { cwd }));
  item.issue_state = String(issue.state).toLowerCase();
  item.github_issue_url = issue.url;
  return item;
}

export function syncItemToGitHub(item, { repository, cwd = process.cwd() }) {
  validateWorkItem(item);
  const managedComments = issueComments(repository, item.issue_number, cwd)
    .filter((comment) => String(comment.body).includes(STATE_MARKER))
    .sort((a, b) => String(a.updated_at).localeCompare(String(b.updated_at)));
  const existing = managedComments.at(-1);
  assertRevisionCanSync(item, existing ? parseGitHubState(existing.body) : null);
  const label = stateLabel(item.status);
  runGh(["label", "create", label, "--repo", repository, "--color", "1f6feb", "--description", `cmdb-dev state: ${item.status}`, "--force"], { cwd });

  const issue = JSON.parse(runGh(["issue", "view", String(item.issue_number), "--repo", repository, "--json", "labels"], { cwd }));
  const oldStateLabels = issue.labels.map((entry) => entry.name).filter((name) => name.startsWith("cmdb:") && name !== label);
  const editArgs = ["issue", "edit", String(item.issue_number), "--repo", repository, "--add-label", label];
  for (const old of oldStateLabels) editArgs.push("--remove-label", old);
  runGh(editArgs, { cwd });

  const body = serializeGitHubState(item);
  if (existing) {
    runGh(["api", "--method", "PATCH", `repos/${repository}/issues/comments/${existing.id}`, "-f", `body=${body}`], { cwd });
  } else {
    runGh(["api", "--method", "POST", `repos/${repository}/issues/${item.issue_number}/comments`, "-f", `body=${body}`], { cwd });
  }
  return { issue_number: item.issue_number, label, revision: item.revision };
}
