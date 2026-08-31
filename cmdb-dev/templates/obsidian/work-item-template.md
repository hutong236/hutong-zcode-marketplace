---
id:
title:
type:
status: waiting_approval
risk_level:
human_approval: required
owner:
github_issue:
github_pr:
branch:
created:
updated:
agent_owner: orchestrator
agent_status:
coder_result: pending
tester_result: pending
reviewer_result: pending
test_result: unknown
pr_checks: unknown
merge_status: none
build_status: unknown # unknown|running|passed|failed|skipped(人工确认不打 tag 时为 skipped)
image:
image_tag:
image_digest:
commit_sha:
workflow_run_url:
blocked: false
block_reason:
next_action: human_approval
---
# <ID> <中文标题>

## 背景
说明为什么要做这个改动。

## 目标
一句话描述完成后的可验证结果。

## 功能范围
- [ ]

## 非范围
明确不做的部分，避免范围蔓延。

## 验收标准
<!-- 有代码、测试或 Actions 证据后才可打勾，禁止提前勾选。 -->
- [ ]

## Planner 摘要
<!-- dispatch cmdb-planner 后回填：拆解结论与风险。 -->

## GitHub
- Issue：
- PR：
- 分支：
- 构建运行：

## 关联
<!-- 用 wikilink 关联其他工单，如 [[REQ-123]]、[[BUG-456]]；无关联可留空。 -->

## Agent 执行记录
<!-- 按 planner / coder / tester / reviewer / build-checker 顺序追加结论与证据链接。 -->
