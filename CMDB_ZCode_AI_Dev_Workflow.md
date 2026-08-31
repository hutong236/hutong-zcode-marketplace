# CMDB 项目：ZCode AI 研发流水线规范

**版本：** V1.1  
**日期：** 2026-08-31  
**适用范围：** CMDB 项目研发  
**研发完成定义：** 人工确认打 Tag 后，GitHub Actions 成功构建并推送 Docker 镜像，任务才算 `Done`；人工确认本次无需镜像（skip）时，PR 合并并关 Issue 即 `Done`。

## 1. 最终架构

```text
用户
 ↓ 自然语言需求 / Bug
ZCode Primary Agent（Orchestrator）
 ↓
Planner → GitHub Issue → 等待人工批准
 ↓ approved
本地 Git Branch
 ↓
Coder
 ↓
Tester ──失败──> Coder
 ↓ passed
Reviewer ──修改──> Coder → Tester
 ↓ approved
Primary Agent: commit + push
 ↓
GitHub PR
 ↓
PR Checks（如仓库已有）
 ↓
Merge
 ↓
Tag 确认（人工 Gate C：/cmdb_tag_approve）──skip──> Close Issue → Done（无镜像）
 ↓ 打 tag
GitHub Actions
 ↓
Docker Build + Push
 ↓
Build Checker
 ↓ success
Close Issue
 ↓
Done
 ↓
本地 Markdown 自动投影
 ↓
Obsidian 只读研发控制台
```

## 2. 各组件职责

| 对象 | 职责 |
|---|---|
| 用户 | 提需求、批准需求、处理 Blocked、高风险 Merge、确认是否打 Tag（镜像交付） |
| ZCode Primary Agent | 唯一流程 Orchestrator |
| Planner Subagent | 需求分析、影响范围、测试策略、风险 |
| Coder Subagent | 在本地 Git Branch 修改代码 |
| Tester Subagent | 独立测试，不允许修改业务源码 |
| Reviewer Subagent | 独立 Review，不替代 Coder |
| Build Checker | 读取 GitHub Actions，确认镜像真实 Push |
| GitHub Issue | 开发输入/工单 |
| GitHub PR | 代码开发输出/合并请求 |
| GitHub Actions | 最终 Docker 镜像构建和推送 |
| Obsidian | 只读 Dashboard，不作为操作入口 |

## 3. 最重要的规则

### Issue 先于编码

用户只需要告诉 ZCode 要做什么。ZCode 先由 Planner 分析，再自动创建 GitHub Issue。

```text
用户需求 → Planner → Issue → Waiting Approval
```

Issue 是“要做什么”。

### PR 在代码完成后创建

PR 不作为需求输入。只有以下条件满足后才创建：

```text
Coder Completed + Tester Passed + Reviewer Approved
```

PR 是“代码已经做成什么”。

### Docker Image 才是最终交付

```text
PR Merge ≠ Done
人工确认打 Tag + Docker Image Build + Push Success = Done
人工确认 skip = Done（无镜像）
```

镜像成功前 GitHub Issue 保持 Open。不是每次调整都打 tag：文档、纯配置等不需要镜像的改动，人工确认 skip 后直接完成。

## 4. 人工 Gate

### Gate A：需求批准（必须）

`/cmdb_dev` 只做到：Planner + Issue + 本地投影 + Waiting Approval。

人工通过 ZCode 执行：

```text
/cmdb_approve REQ-123
```

批准后才允许 Branch / Coder。

### Gate B：高风险 Merge（必须）

以下变化默认高风险：

- 破坏性数据库迁移；
- 删除/覆盖已有数据；
- 权限/认证模型变化；
- API 不兼容变更；
- CI 唯一性规则及既有数据影响；
- 大范围破坏性批处理。

高风险 PR 停在 `waiting_human_merge`：

```text
/cmdb_merge_approve REQ-123
```

### Gate C：Tag/镜像确认（必须）

Merge 后流程停在 `waiting_tag_confirm`，由人工确认本次是否交付镜像：

```text
/cmdb_tag_approve REQ-123 v1.2.4   # 打 tag（不写版本号时自动取最新 v* tag 递增 patch）→ 触发镜像构建
/cmdb_tag_approve REQ-123 skip     # 不打 tag，跳过镜像直接关 Issue 完成
```

未经确认，插件不会创建或推送任何 git tag。

### Coder 完成后不需要人工确认

正常自动闭环：

```text
Coder → Tester → Reviewer
```

Tester Failed 自动退回 Coder；Reviewer Changes Requested 自动退回 Coder，再重新 Tester/Reviewer。

只有需求范围改变、不可恢复 Blocked、高风险 Merge、Tag/镜像确认才找人工。

## 5. 为什么 Orchestrator 必须是 Primary Agent

ZCode 当前 Subagent 由 Primary Agent 调度，且 Subagent 不能继续启动另一个 Subagent。

错误：

```text
Workflow Subagent → Planner Subagent → Coder Subagent
```

正确：

```text
ZCode Primary Agent (Orchestrator)
 ├─ Planner
 ├─ Coder
 ├─ Tester
 ├─ Reviewer
 └─ Build Checker
```

## 6. GitHub 通讯

ZCode 通过本地 Terminal 使用：

```text
git + gh (GitHub CLI)
```

代码：

```bash
git status
git checkout -b feature/REQ-123-short-name
git add ...
git commit ...
git push ...
```

Issue：

```bash
gh issue create
gh issue view
gh issue comment
gh issue close
```

PR：

```bash
gh pr create
gh pr view
gh pr checks
gh pr merge
```

Actions：

```bash
gh run list
gh run view
gh run watch
```

认证：

```bash
gh auth login
gh auth status
```

## 7. Work Item ID

为避免本地编号冲突：先创建 GitHub Issue，再用 Issue Number 生成 ID。

```text
Issue #123 + Feature => REQ-123
Issue #124 + Bug     => BUG-124
```

分支：

```text
feature/REQ-123-ci-search
fix/BUG-124-pagination
```

## 8. PR 与 Issue 关联

因为镜像成功才 Done，PR Body 使用：

```text
Refs #123
```

不要使用：

```text
Closes #123
Fixes #123
```

否则 PR Merge 时 Issue 会被过早关闭。

## 9. 状态机

```text
waiting_approval
 → ready
 → planning
 → doing
 → testing
 → review
 → waiting_tag_confirm
 → building
 → done
```

异常：

```text
blocked
waiting_human_merge
```

skip 旁路：`waiting_tag_confirm` ──人工确认 skip──> `done`（`build_status: skipped`）。

## 10. GitHub 是事实源，Obsidian 是投影视图

冲突优先级：

```text
GitHub实际状态 > Git状态 > 本地Markdown > AI推断
```

Obsidian 只显示 ZCode 自动生成/同步的 Markdown，不人工修改研发状态。

投影目录（全部位于目标仓库 `plan/` 下，只读）：

```text
plan/
├── 00_Dashboard/          # 纯 Dataview 视图页，零手写状态
│   ├── 首页.md            # 人工入口，大链接直达研发控制台
│   ├── 研发控制台.md       # Waiting Approval / Active / Blocked / Open Bugs / Done
│   ├── 研发看板.md         # dataviewjs 按状态机分列的看板
│   └── 需求列表.md         # 全量工单表格
├── 01_Requirements/       # 需求工单，一文件一需求（REQ-<Issue号>.md）
└── 02_Bugs/               # Bug 工单（BUG-<Issue号>.md）
```

工单笔记规范：H1 = `<ID> <中文标题>`；正文固定中文骨架 背景/目标/功能范围/非范围/验收标准/Planner 摘要/GitHub/关联/Agent 执行记录；验收标准用 checkbox，必须有代码、测试或 Actions 证据才可打勾；关联一律用 `[[wikilink]]`；不使用标签，分类靠 frontmatter `type` + 目录。frontmatter 是唯一记录，每次同步刷新 `updated`。

建议字段：

```yaml
id: REQ-123
status: doing
risk_level: medium
human_approval: approved
github_issue: 123
github_pr:
branch: feature/REQ-123-ci-search
agent_owner: coder
coder_result: in_progress
tester_result: pending
reviewer_result: pending
build_status: unknown
image:
image_digest:
commit_sha:
blocked: false
next_action: implement
```

## 11. 子 Agent 权限建议

| Agent | Read | Edit/Write | Bash | GitHub写操作 |
|---|---:|---:|---:|---:|
| Primary Orchestrator | ✅ | ✅ | ✅ | ✅ |
| Planner | ✅ | ❌ | ❌ | ❌ |
| Coder | ✅ | ✅ | ✅ | ❌ |
| Tester | ✅ | ❌ | ✅ | ❌ |
| Reviewer | ✅ | ❌ | ✅ | ❌ |
| Build Checker | ✅ | ❌ | ✅ | 只读 |

Tester/Reviewer 的 Bash 仅用于测试和安全的 Git/文件检查，Prompt 禁止通过 shell 修改业务源码。

## 12. 插件命令

```text
/cmdb_check
/cmdb_init
/cmdb_dev <自然语言需求或Bug>
/cmdb_approve <REQ-xxx/BUG-xxx>
/cmdb_merge_approve <REQ-xxx/BUG-xxx>
/cmdb_tag_approve <REQ-xxx/BUG-xxx> [vX.Y.Z|skip]
/cmdb_status [REQ-xxx/BUG-xxx]
/cmdb_resume <REQ-xxx/BUG-xxx>
```

### `/cmdb_check`
只读检查 git / gh / GitHub 登录 / remote / Issue / PR / Actions / Dockerfile / build workflow。

### `/cmdb_init`
初始化本地只读 Obsidian 投影目录，并在仓库没有等价 workflow 时生成 `.github/workflows/build-image.yml`（要求已有 Dockerfile）。

### `/cmdb_dev`
Planner 分析 → 创建 Issue → 生成 REQ/BUG → Waiting Approval。**不写代码。**

### `/cmdb_approve`
人工批准后自动跑：Branch → Coder → Tester ↔ Coder → Reviewer ↔ Coder → PR → Merge（低/中风险）→ Tag 确认 →（打 tag：Build Image | skip：直接 Done）。

### `/cmdb_merge_approve`
高风险 PR 的人工 Merge Gate。

### `/cmdb_tag_approve`
Merge 后的 Tag/镜像人工确认 Gate：打 tag（触发镜像构建，Build Checker 取证后 Done）或 skip（跳过镜像直接 Done）。

### `/cmdb_status`
只读同步 GitHub/Git 状态并展示研发控制台。

### `/cmdb_resume`
会话中断后从 GitHub/Git 真实状态恢复，不依赖旧聊天记忆。

## 13. Definition of Done

只有全部适用条件满足才 Done：

- Requirement Approved ✅
- Coder Completed ✅
- Tester Passed ✅
- Reviewer Approved ✅
- PR Created ✅
- PR Checks Passed（如存在）✅
- PR Merged ✅
- Tag/镜像人工确认 ✅（打 tag 或 skip 二选一）
- 打 tag 路径：Docker Image Built / Pushed / Digest Known ✅
- skip 路径：build_status = skipped ✅
- GitHub Issue Closed ✅

## 14. 项目边界

本流程负责：

```text
需求 → Issue → Branch → Code → Test → Review → PR → Merge → Tag确认 → Actions → Docker Image
```

不负责：

```text
Kubernetes部署 / 生产上线 / 生产验证 / 生产回滚
```

## 15. 安装插件

下载包内：

```text
cmdb-zcode-marketplace/
├── marketplace.json
└── plugins/cmdb-dev/
```

ZCode：

```text
Settings → Plugins → Create → Add marketplace → Choose directory
```

选择 `cmdb-zcode-marketplace`，然后在 Personal 中安装并启用 `cmdb-dev`。

首次在 CMDB 仓库运行：

```text
/cmdb_check
/cmdb_init
```

然后：

```text
/cmdb_dev <需求>
```

分析无误后：

```text
/cmdb_approve REQ-xxx
```

## 16. ZCode 官方参考

- https://zcode.z.ai/en/docs/plugin
- https://zcode.z.ai/en/docs/subagents
- https://zcode.z.ai/en/docs/commands
- https://zcode.z.ai/en/docs/skill
