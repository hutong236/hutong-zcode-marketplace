# CMDB 项目：ZCode AI 研发流水线规范

**版本：** V1.0  
**日期：** 2026-08-31  
**适用范围：** CMDB 项目研发  
**研发完成定义：** GitHub Actions 成功构建并推送 Docker 镜像后，任务才算 `Done`。

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
| 用户 | 提需求、批准需求、处理 Blocked、高风险 Merge |
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
Docker Image Build + Push Success = Done
```

镜像成功前 GitHub Issue 保持 Open。

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

### Coder 完成后不需要人工确认

正常自动闭环：

```text
Coder → Tester → Reviewer
```

Tester Failed 自动退回 Coder；Reviewer Changes Requested 自动退回 Coder，再重新 Tester/Reviewer。

只有需求范围改变、不可恢复 Blocked、高风险 Merge 才找人工。

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
 → building
 → done
```

异常：

```text
blocked
waiting_human_merge
```

## 10. GitHub 是事实源，Obsidian 是投影视图

冲突优先级：

```text
GitHub实际状态 > Git状态 > 本地Markdown > AI推断
```

Obsidian 只显示 ZCode 自动生成/同步的 Markdown，不人工修改研发状态。

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
人工批准后自动跑：Branch → Coder → Tester ↔ Coder → Reviewer ↔ Coder → PR → Merge（低/中风险）→ Build Image → Done。

### `/cmdb_merge_approve`
高风险 PR 的人工 Merge Gate。

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
- Docker Image Built ✅
- Docker Image Pushed ✅
- Image Digest Known ✅
- GitHub Issue Closed ✅

## 14. 项目边界

本流程负责：

```text
需求 → Issue → Branch → Code → Test → Review → PR → Merge → Actions → Docker Image
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
