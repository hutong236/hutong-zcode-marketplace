import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createWorkItem } from "../hulane/scripts/lib/state-machine.mjs";
import { writeStore } from "../hulane/scripts/lib/state-store.mjs";
import { issueAuthorization, issueReleaseAuthorization } from "../hulane/scripts/lib/authorization.mjs";
import { analyzeCommand, evaluateCommand } from "../hulane/hooks/guard.mjs";

const EXEMPT_REMOTE = "https://github.com/hutong236/hutong-zcode-marketplace.git";

function managedRepository({ allowlist, overrides = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hulane-guard-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const item = { ...createWorkItem({
    id: "REQ-66",
    issue_number: 66,
    title: "Hook state",
    risk_level: "low",
    delivery_required: true,
    skip_allowed: false,
  }), status: "doing", ...overrides };
  writeStore(root, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  if (allowlist) {
    fs.mkdirSync(path.join(root, ".hulane"), { recursive: true });
    fs.writeFileSync(path.join(root, ".hulane", "guard-allowlist.json"), JSON.stringify(allowlist));
  }
  return root;
}

// release 通道夹具:hulane 管理仓 + 本地 bare origin(main 已推送),
// 使 release 令牌签发的 ls-remote 校验可离线复现
function releaseManagedRepository() {
  const origin = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hulane-guard-origin-")));
  execFileSync("git", ["init", "-q", "--bare", "-b", "main", origin]);
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hulane-guard-release-")));
  execFileSync("git", ["init", "-q", "-b", "main", root]);
  for (const [key, value] of [["user.email", "test@example.com"], ["user.name", "Hulane Test"]]) {
    execFileSync("git", ["config", key, value], { cwd: root });
  }
  fs.writeFileSync(path.join(root, "README.md"), "release\n");
  execFileSync("git", ["add", "README.md"], { cwd: root });
  execFileSync("git", ["commit", "-qm", "initial"], { cwd: root });
  execFileSync("git", ["remote", "add", "origin", origin], { cwd: root });
  execFileSync("git", ["push", "-q", "origin", "main"], { cwd: root });
  const item = createWorkItem({
    id: "REQ-77",
    issue_number: 77,
    title: "Release guard",
    risk_level: "low",
    delivery_required: true,
    skip_allowed: false,
  });
  writeStore(root, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [item.id]: item } });
  const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: root, encoding: "utf8" }).trim();
  return { root, sha };
}

test("explicit push to an allowlisted remote is allowed even when the command changes directory", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = `cd /tmp/hutong-zcode-marketplace && git -c credential.helper='!gh auth git-credential' push ${EXEMPT_REMOTE} main`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /exempt remote/);
});

test("bare git push still requires a single-use token", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const result = evaluateCommand({ cwd: root, command: "git push" });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("push to a remote outside the allowlist still requires a single-use token", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = "git push https://github.com/hutong236/hutong-project-demo.git main";
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("missing allowlist file fails closed for explicit remote pushes", () => {
  const root = managedRepository();
  const command = `git push ${EXEMPT_REMOTE} main`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("allowlist never exempts git tag or merge operations", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const tagResult = evaluateCommand({ cwd: root, command: "git tag -a v1.0.0 -m msg" });
  assert.equal(tagResult.allowed, false);
  assert.match(tagResult.reason, /git-tag requires a single-use Hulane authorization token/);
});

test("ascii push/tag words inside a quoted commit message are not protected operations", () => {
  const root = managedRepository();
  const command = 'git commit -m "feat(guard): push allowlist exemption for tag workflows"';
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("unquoted hyphenated commit message tokens are not mistaken for git subcommands", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: "git commit -m fix-push-tag-regression" });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("heredoc style commit messages are scanned without the message body", () => {
  const root = managedRepository();
  const command = 'git commit -m "$(cat <<\'EOF\'\nfeat: push allowlist\nsupport tag workflows\nEOF\n)"';
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.equal(result.reason, "No protected operation");
});

test("a commit message cannot feed the push allowlist for a following bare push", () => {
  const root = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const command = `git commit -m "git push ${EXEMPT_REMOTE} main" && git push`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("command substitution inside a commit message stays visible to the guard", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git commit -m "$(git push origin main)"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /requires a single-use Hulane authorization token/);
});

test("tag message bodies no longer trip the one-action rule", () => {
  const root = managedRepository();
  const result = evaluateCommand({ cwd: root, command: 'git tag -a v1.0.0 -m "match upstream push"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /git-tag requires a single-use Hulane authorization token/);
});

const mergeGuardEvidence = {
  reviewer_result: "approved",
  pr_checks: "passed",
  pr_check_name: "Hulane PR Checks / verify",
  pr_check_run_url: "https://github.com/acme/demo/actions/runs/456",
  pr_head_sha: "a".repeat(40),
  merge_guard_mode: "control_plane_verified",
  required_checks_enforced: false,
  pr_number: 66,
};

test("issue close without a token is state-verified from waiting_close", () => {
  const root = managedRepository({ overrides: { status: "waiting_close", specs_synced: true, specs_commit_sha: "a".repeat(40), spec_delta_dir: "openspec/changes/archive/REQ-66" } });
  const result = evaluateCommand({ cwd: root, command: 'gh issue close 66 --repo acme/demo --comment "Done"' });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /State-verified issue-close for REQ-66/);
});

test("issue close is denied until specs_synced is recorded for spec_sync_required items", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  const result = evaluateCommand({ cwd: root, command: 'gh issue close 66 --repo acme/demo --comment "Done"' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /specs_synced/);
  const exempt = managedRepository({ overrides: { status: "waiting_close", spec_sync_required: false } });
  const allowed = evaluateCommand({ cwd: exempt, command: 'gh issue close 66 --repo acme/demo --comment "Done"' });
  assert.equal(allowed.allowed, true);
  assert.match(allowed.reason, /State-verified issue-close for REQ-66/);
});

test("issue close state verification rejects unknown numbers and wrong states", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh issue close 999" }).reason,
    /exactly one Work Item/,
  );
  const midFlight = managedRepository();
  assert.match(
    evaluateCommand({ cwd: midFlight, command: "gh issue close 66" }).reason,
    /forbidden while REQ-66 is doing/,
  );
});

test("pr merge without a token is state-verified from merging with the pinned head SHA", () => {
  const root = managedRepository({ overrides: { status: "merging", ...mergeGuardEvidence } });
  const command = `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)}`;
  const result = evaluateCommand({ cwd: root, command });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /State-verified pr-merge for REQ-66/);
});

test("pr merge state verification rejects mismatched numbers, SHAs, and states", () => {
  const root = managedRepository({ overrides: { status: "merging", ...mergeGuardEvidence } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh pr merge 999 --squash" }).reason,
    /exactly one Work Item/,
  );
  assert.match(
    evaluateCommand({ cwd: root, command: `gh pr merge 66 --squash --match-head-commit ${"b".repeat(40)}` }).reason,
    /pin verified head SHA/,
  );
  const unverified = managedRepository({ overrides: { status: "doing", ...mergeGuardEvidence } });
  assert.match(
    evaluateCommand({ cwd: root, command: "gh pr merge 66 --squash" }).reason,
    /pin verified head SHA/,
  );
  assert.match(
    evaluateCommand({ cwd: unverified, command: `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)}` }).reason,
    /forbidden while REQ-66 is doing/,
  );
});

test("state-verified operations still respect the one-operation rule", () => {
  const root = managedRepository({ overrides: { status: "waiting_close" } });
  const result = evaluateCommand({ cwd: root, command: 'gh issue close 66 && git push origin main' });
  assert.equal(result.allowed, false);
  assert.match(result.reason, /exactly one protected operation/);
});

test("release tag token authorizes exactly one annotated tag command naming version and SHA", () => {
  const { root, sha } = releaseManagedRepository();
  const issued = issueReleaseAuthorization(root, { version: "v1.2.3", sha, evidence: "user asked to ship the batch" });
  const command = `HULANE_RELEASE_TAG_TOKEN=${issued.tag_token} git tag -a v1.2.3 -m "Release v1.2.3" ${sha}`;
  const result = evaluateCommand({ cwd: root, command, releaseTagToken: issued.tag_token });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /Authorized release-tag v1\.2\.3/);
  // 单次:重放同一条命令被拒
  assert.equal(evaluateCommand({ cwd: root, command, releaseTagToken: issued.tag_token }).allowed, false);
  // 未点名钉死 SHA 的 tag 命令被拒
  const reissued = issueReleaseAuthorization(root, { version: "v1.2.4", sha, evidence: "retry" });
  const noSha = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_TAG_TOKEN=${reissued.tag_token} git tag -a v1.2.4 -m "Release v1.2.4"`,
    releaseTagToken: reissued.tag_token,
  });
  assert.equal(noSha.allowed, false);
  assert.match(noSha.reason, /pinned release SHA/);
  // push 令牌不能替代 tag 令牌
  const wrongLeg = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${reissued.push_token} git tag -a v1.2.4 -m "Release v1.2.4" ${sha}`,
    releasePushToken: reissued.push_token,
  });
  assert.equal(wrongLeg.allowed, false);
  assert.match(wrongLeg.reason, /requires a single-use Hulane authorization token/);
});

test("release push token authorizes only the pinned annotated-tag-object explicit refspec push", () => {
  const { root, sha } = releaseManagedRepository();
  const issued = issueReleaseAuthorization(root, { version: "v1.2.3", sha, evidence: "release" });
  // tag 腿先建 annotated tag;push 腿推送 tag 对象本身(rev-parse 不带 ^{} 解引用)
  execFileSync("git", ["tag", "-a", "v1.2.3", "-m", "Release v1.2.3", sha], { cwd: root });
  const tagObjectSha = execFileSync("git", ["rev-parse", "v1.2.3"], { cwd: root, encoding: "utf8" }).trim();

  // 钉死 commit SHA 不是 annotated tag 对象:进通道后被消费链(①)拒绝
  const commitRefspec = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin ${sha}:refs/tags/v1.2.3`,
    releasePushToken: issued.push_token,
  });
  assert.equal(commitRefspec.allowed, false);
  assert.match(commitRefspec.reason, /not an annotated tag object/);

  // 合法:恰好一条显式 refspec 指向钉死版本的 annotated tag 对象
  const result = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.3`,
    releasePushToken: issued.push_token,
  });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /Authorized release-push v1\.2\.3/);

  // 简单 tag 名 refspec 不再进 release-push 通道,回落工单令牌路径被拒
  const simple = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin v1.2.3`,
    releasePushToken: issued.push_token,
  });
  assert.equal(simple.allowed, false);
  assert.match(simple.reason, /requires a single-use Hulane authorization token/);

  // 普通分支推送回归工单令牌路径:release push 令牌不放行
  const branch = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin HEAD`,
    releasePushToken: issued.push_token,
  });
  assert.equal(branch.allowed, false);
  assert.match(branch.reason, /requires a single-use Hulane authorization token/);
  const named = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin main`,
    releasePushToken: issued.push_token,
  });
  assert.equal(named.allowed, false);
  assert.match(named.reason, /requires a single-use Hulane authorization token/);
  // 显式 refspec + 分支混合 refspec 也不是纯 tag 推送
  const mixed = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.3 main`,
    releasePushToken: issued.push_token,
  });
  assert.equal(mixed.allowed, false);
  assert.match(mixed.reason, /requires a single-use Hulane authorization token/);

  // refspec 形式正确但对象在仓库中不存在:进入通道后被消费链(①)拒绝
  const reissued = issueReleaseAuthorization(root, { version: "v1.2.4", sha, evidence: "retry" });
  const wrongPin = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${reissued.push_token} git push origin ${"c".repeat(40)}:refs/tags/v1.2.4`,
    releasePushToken: reissued.push_token,
  });
  assert.equal(wrongPin.allowed, false);
  assert.match(wrongPin.reason, /not an annotated tag object/);

  // 多 refspec 夹带(钉死 + 额外同形 tag refspec):不进通道,回落工单令牌路径拒绝
  const smuggle = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${reissued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.4 ${"d".repeat(40)}:refs/tags/v9.9.9`,
    releasePushToken: reissued.push_token,
  });
  assert.equal(smuggle.allowed, false);
  assert.match(smuggle.reason, /requires a single-use Hulane authorization token/);

  // 重复同一 refspec 两条:恰好一条才进通道
  const duplicate = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${reissued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.4 ${tagObjectSha}:refs/tags/v1.2.4`,
    releasePushToken: reissued.push_token,
  });
  assert.equal(duplicate.allowed, false);
  assert.match(duplicate.reason, /requires a single-use Hulane authorization token/);
});

test("bare tag commands stay denied and combined tag+push stays one-operation", () => {
  const { root, sha } = releaseManagedRepository();
  const bare = evaluateCommand({ cwd: root, command: 'git tag -a v2.0.0 -m "msg"' });
  assert.equal(bare.allowed, false);
  assert.match(bare.reason, /git-tag requires a single-use Hulane authorization token/);

  const issued = issueReleaseAuthorization(root, { version: "v1.2.3", sha, evidence: "release" });
  execFileSync("git", ["tag", "-a", "v1.2.3", "-m", "Release v1.2.3", sha], { cwd: root });
  const tagObjectSha = execFileSync("git", ["rev-parse", "v1.2.3"], { cwd: root, encoding: "utf8" }).trim();
  const combined = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_TAG_TOKEN=${issued.tag_token} git tag -a v1.2.3 -m "Release v1.2.3" ${sha} && HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.3`,
    releaseTagToken: issued.tag_token,
    releasePushToken: issued.push_token,
  });
  assert.equal(combined.allowed, false);
  assert.match(combined.reason, /exactly one protected operation/);
});

test("work-item tag token path is unchanged by the release channel", () => {
  const root = managedRepository({ overrides: {
    status: "building",
    tag_confirmation: "approved",
    image_tag: "v2.2.33",
    merged_sha: "a".repeat(40),
  } });
  const authorization = issueAuthorization(root, { id: "REQ-66", action: "git-tag", actor: "orchestrator" });
  const command = `HULANE_AUTH_TOKEN=${authorization.token} git tag -a v2.2.33 -m "Release v2.2.33" ${"a".repeat(40)}`;
  const result = evaluateCommand({ cwd: root, command, token: authorization.token });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /Authorized git-tag for REQ-66/);
  // 未点名 merged_sha 的工单 tag 命令仍被拒
  const reissued = issueAuthorization(root, { id: "REQ-66", action: "git-tag", actor: "orchestrator" });
  const missingSha = evaluateCommand({ cwd: root, command: `HULANE_AUTH_TOKEN=${reissued.token} git tag -a v2.2.33 -m "Release v2.2.33"`, token: reissued.token });
  assert.equal(missingSha.allowed, false);
  assert.match(missingSha.reason, /verified merged SHA/);
  // building 态未经 Gate C 批准的工单仍不能签 tag 令牌
  const unconfirmed = managedRepository({ overrides: { status: "building", merged_sha: "a".repeat(40), image_tag: "v2.2.34" } });
  assert.throws(
    () => issueAuthorization(unconfirmed, { id: "REQ-66", action: "git-tag", actor: "orchestrator" }),
    /Gate C approval/,
  );
});

// REQ-14:abandoned 关单守卫(AC-9/AC-10)
test("abandoned issue close is state-verified only with --reason not planned", () => {
  const abandoned = managedRepository({ overrides: { status: "abandoned" } });
  const allowed = evaluateCommand({ cwd: abandoned, command: 'gh issue close 66 --repo acme/demo --reason "not planned" --comment "Abandoned"' });
  assert.equal(allowed.allowed, true);
  assert.match(allowed.reason, /State-verified issue-close for REQ-66/);

  const missing = evaluateCommand({ cwd: abandoned, command: 'gh issue close 66 --repo acme/demo --comment "Abandoned"' });
  assert.equal(missing.allowed, false);
  assert.match(missing.reason, /requires --reason "not planned"/);

  const regular = managedRepository({ overrides: { status: "waiting_close", specs_synced: true, specs_commit_sha: "a".repeat(40), spec_delta_dir: "openspec/changes/archive/REQ-66" } });
  const tainted = evaluateCommand({ cwd: regular, command: 'gh issue close 66 --repo acme/demo --reason "not planned"' });
  assert.equal(tainted.allowed, false);
  assert.match(tainted.reason, /must not carry --reason "not planned"/);
});

// ===== BUG-15:链式单操作计数、零误拒矩阵与消息体剥离保持 =====

// AC-2:链式同动作四类逐条 deny;拒绝先于一切令牌消费(令牌不烧,纠正后同令牌重试可用)
test("chained same-action operations are denied by count before any token consumption (AC-2)", () => {
  const root = managedRepository({ overrides: { status: "waiting_close", specs_synced: true, specs_commit_sha: "a".repeat(40), spec_delta_dir: "openspec/changes/archive/REQ-66" } });
  const chainedCommands = [
    "gh issue close 66 && gh issue close 77",
    "git push origin main && git push origin main",
    'git tag -a v1.0.0 -m one && git tag -a v1.1.0 -m two',
    `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)} && gh pr merge 77 --squash`,
  ];
  for (const command of chainedCommands) {
    const result = evaluateCommand({ cwd: root, command });
    assert.equal(result.allowed, false, command);
    assert.match(result.reason, /exactly one protected operation/, command);
  }
  // analyzeCommand 不再同动作去重:受保护操作逐个列出
  assert.deepEqual(analyzeCommand("gh issue close 66 && gh issue close 77"), ["issue-close", "issue-close"]);
  assert.deepEqual(analyzeCommand("git push origin main && git push origin main"), ["git-push", "git-push"]);

  // 拒绝先于令牌消费:链式带令牌被拒后,同令牌单操作重试成功
  const building = managedRepository({ overrides: {
    status: "building",
    tag_confirmation: "approved",
    image_tag: "v2.2.33",
    merged_sha: "a".repeat(40),
  } });
  const authorization = issueAuthorization(building, { id: "REQ-66", action: "git-tag", actor: "orchestrator" });
  const denied = evaluateCommand({
    cwd: building,
    command: `HULANE_AUTH_TOKEN=${authorization.token} git tag -a v2.2.33 -m "one" ${"a".repeat(40)} && git tag -a v2.2.34 -m "two"`,
    token: authorization.token,
  });
  assert.equal(denied.allowed, false);
  assert.match(denied.reason, /exactly one protected operation/);
  const corrected = evaluateCommand({
    cwd: building,
    command: `HULANE_AUTH_TOKEN=${authorization.token} git tag -a v2.2.33 -m "one" ${"a".repeat(40)}`,
    token: authorization.token,
  });
  assert.equal(corrected.allowed, true);
  assert.match(corrected.reason, /Authorized git-tag for REQ-66/);
});

// AC-4:零误拒矩阵——SKILL 五受控形态 + release 双令牌两形态 + 白名单远端推送
// 共 8 条逐条单调用,裁决与修复前一致(断流防线)
test("zero false-positive matrix: five SKILL forms, two release legs, allowlisted remote (AC-4)", () => {
  // 1) push 令牌形态:pr_open 真实分支与 worktree 钉死
  const pushRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "hulane-guard-matrix-")));
  execFileSync("git", ["init", "-q"], { cwd: pushRoot });
  const branch = execFileSync("git", ["branch", "--show-current"], { cwd: pushRoot, encoding: "utf8" }).trim();
  const pushItem = { ...createWorkItem({
    id: "REQ-66",
    issue_number: 66,
    title: "Hook state",
    risk_level: "low",
    delivery_required: true,
    skip_allowed: false,
  }), status: "pr_open", branch, worktree_path: pushRoot };
  writeStore(pushRoot, { schema_version: 2, repository: "acme/demo", revision: 0, updated_at: new Date().toISOString(), items: { [pushItem.id]: pushItem } });
  const pushAuthorization = issueAuthorization(pushRoot, { id: "REQ-66", action: "git-push", actor: "orchestrator" });
  const pushForm = evaluateCommand({
    cwd: pushRoot,
    command: `HULANE_AUTH_TOKEN=${pushAuthorization.token} git push origin HEAD`,
    token: pushAuthorization.token,
  });
  assert.equal(pushForm.allowed, true);
  assert.match(pushForm.reason, /Authorized git-push for REQ-66/);

  // 2) tag 令牌形态
  const tagRoot = managedRepository({ overrides: {
    status: "building",
    tag_confirmation: "approved",
    image_tag: "v2.2.33",
    merged_sha: "a".repeat(40),
  } });
  const tagAuthorization = issueAuthorization(tagRoot, { id: "REQ-66", action: "git-tag", actor: "orchestrator" });
  const tagForm = evaluateCommand({
    cwd: tagRoot,
    command: `HULANE_AUTH_TOKEN=${tagAuthorization.token} git tag -a v2.2.33 -m "Release v2.2.33" ${"a".repeat(40)}`,
    token: tagAuthorization.token,
  });
  assert.equal(tagForm.allowed, true);
  assert.match(tagForm.reason, /Authorized git-tag for REQ-66/);

  // 3) gh pr merge 状态自证形态
  const mergeRoot = managedRepository({ overrides: { status: "merging", ...mergeGuardEvidence } });
  const mergeForm = evaluateCommand({
    cwd: mergeRoot,
    command: `gh pr merge 66 --squash --match-head-commit ${"a".repeat(40)}`,
  });
  assert.equal(mergeForm.allowed, true);
  assert.match(mergeForm.reason, /State-verified pr-merge for REQ-66/);

  // 4) 常规关单形态
  const closeRoot = managedRepository({ overrides: { status: "waiting_close", specs_synced: true, specs_commit_sha: "a".repeat(40), spec_delta_dir: "openspec/changes/archive/REQ-66" } });
  const closeForm = evaluateCommand({ cwd: closeRoot, command: 'gh issue close 66 --repo acme/demo --comment "Done"' });
  assert.equal(closeForm.allowed, true);
  assert.match(closeForm.reason, /State-verified issue-close for REQ-66/);

  // 5) not planned 关单形态
  const abandonedRoot = managedRepository({ overrides: { status: "abandoned" } });
  const abandonedForm = evaluateCommand({ cwd: abandonedRoot, command: 'gh issue close 66 --repo acme/demo --reason "not planned" --comment "Abandoned"' });
  assert.equal(abandonedForm.allowed, true);
  assert.match(abandonedForm.reason, /State-verified issue-close for REQ-66/);

  // 6)+7) release 双令牌两形态(refspec 推送)
  const { root, sha } = releaseManagedRepository();
  const issued = issueReleaseAuthorization(root, { version: "v1.2.3", sha, evidence: "zero false-positive matrix" });
  const releaseTagForm = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_TAG_TOKEN=${issued.tag_token} git tag -a v1.2.3 -m "Release v1.2.3" ${sha}`,
    releaseTagToken: issued.tag_token,
  });
  assert.equal(releaseTagForm.allowed, true);
  assert.match(releaseTagForm.reason, /Authorized release-tag v1\.2\.3/);
  execFileSync("git", ["tag", "-a", "v1.2.3", "-m", "Release v1.2.3", sha], { cwd: root });
  const tagObjectSha = execFileSync("git", ["rev-parse", "v1.2.3"], { cwd: root, encoding: "utf8" }).trim();
  const releasePushForm = evaluateCommand({
    cwd: root,
    command: `HULANE_RELEASE_PUSH_TOKEN=${issued.push_token} git push origin ${tagObjectSha}:refs/tags/v1.2.3`,
    releasePushToken: issued.push_token,
  });
  assert.equal(releasePushForm.allowed, true);
  assert.match(releasePushForm.reason, /Authorized release-push v1\.2\.3/);

  // 8) 白名单远端显式推送(含 cd 与 credential.helper 前缀)
  const allowRoot = managedRepository({ allowlist: ["hutong236/hutong-zcode-marketplace"] });
  const exemptForm = evaluateCommand({
    cwd: allowRoot,
    command: `cd /tmp/hutong-zcode-marketplace && git -c credential.helper='!gh auth git-credential' push ${EXEMPT_REMOTE} main`,
  });
  assert.equal(exemptForm.allowed, true);
  assert.match(exemptForm.reason, /exempt remote/);
});

// AC-5:消息体剥离与只读 tag 不计入操作计数(既有 evaluateCommand 断言零改动,
// 这里以 analyzeCommand 计数逐条冻结)
test("message bodies stay stripped and read-only tag forms stay uncounted (AC-5)", () => {
  assert.deepEqual(analyzeCommand('git tag -a v1.0.0 -m "match upstream push"'), ["git-tag"]);
  assert.deepEqual(analyzeCommand('git commit -m "feat: push allowlist exemption for tag workflows"'), []);
  assert.deepEqual(analyzeCommand("git tag --list"), []);
  assert.deepEqual(analyzeCommand("git tag -l 'v*'"), []);
  assert.deepEqual(analyzeCommand("git tag --contains v1.0.0"), []);
});

// ===== BUG-16:词元锚定收紧后的零误拒扩测 =====

// AC-6:building 态 tag 推送形态(git push origin <image_tag>)零误拒——
// image_tag 点名改词元恰等锚定后,受控形态裁决与修复前一致
test("building tag push form stays zero false-positive under token anchoring (AC-6)", () => {
  const root = managedRepository({ overrides: {
    status: "building",
    tag_confirmation: "approved",
    image_tag: "v2.2.33",
    merged_sha: "a".repeat(40),
  } });
  const authorization = issueAuthorization(root, { id: "REQ-66", action: "git-push", actor: "orchestrator" });
  const result = evaluateCommand({
    cwd: root,
    command: `HULANE_AUTH_TOKEN=${authorization.token} git push origin v2.2.33`,
    token: authorization.token,
  });
  assert.equal(result.allowed, true);
  assert.match(result.reason, /Authorized git-push for REQ-66/);
});
