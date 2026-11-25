# hulane-work-item-lifecycle Specification

## Purpose

承载 hulane 工单生命周期的离线韧性行为基线：开单本地优先（零 gh 调用、本地号自增、
Issue 补建延后）、pending 态不变量与回填写入通道收口（`issue_created` 自环是
`issue_number`/`issue_pending` 的唯一写入通道）、sync 统一降级与 pending 的
remote-truth-wins 语义，以及 `hulane_flush` 在线窗口（幂等预查→补建/复用 Issue→
标题落位→回填→按最终状态一次同步）。GitHub 写操作从每个 transition 压缩到最后一次
在线窗口；push/PR/CI/合并/关单仍走既有逐环节守卫流程，守卫零改动。

## Requirements

### Requirement: 开单本地化与本地号自增

hulane_open_work_item SHALL NOT 调用 gh issue create/edit；SHALL 本地创建工单，编号取 store 内全部工单（REQ 与 BUG 合并）数字最大值+1、前缀由 type 决定；新工单 SHALL 置 issue_pending=true、issue_number=null、github_issue_url=null，并把 planner_summary 与 acceptance_criteria 持久化进工单供 flush 重建 Issue 正文。

#### Scenario: 断网开单成功

- WHEN gh 不可达时调用 open_work_item
- THEN 本地落 waiting_approval 工单，issue_pending=true、issue_number=null，零 gh 调用

#### Scenario: 本地号自增不撞号

- WHEN store 已有 REQ-9 与 BUG-8 再开 feature
- THEN id 为 REQ-10

#### Scenario: 存量工单祖父回填

- WHEN 读取缺 issue_pending 的存量工单
- THEN normalizeWorkItem 回填 false，行为不变

### Requirement: pending 态不变量与回填写入通道收口

issue_pending=true 时 issue_number/github_issue_url 必为 null、issue_state 必为 open；issue_number/issue_pending 仅 issue_created 事件可写；issue_created 仅对 pending 生效；issue_closed、Done 不变式、pr_created 及 pr-merge/issue-close 授权 SHALL 要求 Issue 已建。

#### Scenario: 状态机拒绝 pending 关单

- WHEN 对 pending 应用 issue_closed
- THEN 抛错状态不变

#### Scenario: 伪造回填被拒

- WHEN 非 issue_created patch 携带 issue_number/issue_pending
- THEN 抛 Unsupported state patch field

#### Scenario: issue_created 自环回填

- WHEN 对 pending 应用 issue_created
- THEN issue_pending=false、状态/next_action 不变、history 留痕

#### Scenario: issue_created 对非 pending 抛错

- WHEN 对非 pending 工单应用 issue_created
- THEN 抛错，状态不变

#### Scenario: pr_created 对 pending 抛错

- WHEN 对 pending 工单应用 pr_created
- THEN 抛错，PR 不得挂在不存在的 Issue 上

#### Scenario: 授权层拒绝 pending 关单

- WHEN issue-close 遇 pending
- THEN 拒绝并提示先 flush

### Requirement: sync 降级与 pending 的 remote-truth-wins 语义

syncItemToGitHub 对 pending 返回 skipped 而非抛错；全部控制面工具默认 sync 经统一降级不阻塞；status 刷新与 hydrate 对 pending 只读本地，不清本地不报错。

#### Scenario: 离线流转不阻塞

- WHEN pending 工单连续 transition
- THEN 每次成功，github.skipped="issue_pending"

#### Scenario: hydrate 尊重 pending

- WHEN pending 调 status(refresh=true)
- THEN 返回本地状态，本地未动

### Requirement: flush 在线窗口

hulane_flush 在一次串行在线窗口完成：标题幂等预查→补建 Issue→改标题→issue_created 回填→一次 sync 打最终标签。push/PR/CI/合并/关单仍走既有逐环节守卫流程，guard 零改动。

#### Scenario: flush 补建回填一气呵成

- WHEN 对 pending 工单调用 hulane_flush 且远端无既有 Issue
- THEN Issue 建立、回填、最终标签与状态注释一次到位

#### Scenario: flush 幂等

- WHEN Issue 已建但回填未落（flush 中途中断）重跑 flush
- THEN 预查命中复用，不重复建

#### Scenario: flush 不越权

- WHEN flush 完成后进入 push/merge/close 环节
- THEN 仍走原令牌与状态自证，守卫行为不变

### Requirement: 作废终态(abandoned)

状态机 SHALL 提供 done 之外的第二个终态 abandoned:人工确认的 `abandon` 事件 SHALL 加入 HUMAN_EVENTS(actor 必须 human:身份 形式，requireHumanActor 拒绝 orchestrator)，SHALL 从任何非终态(含 blocked、waiting_tag_confirm 等)可达;abandon SHALL 要求非空 evidence(写明作废原因)，SHALL NOT 要求任何测试/评审/合并/镜像/规格同步证据。done 与 abandoned SHALL 均为终态:block、resume、abandon 均无法离开任一终态。abandoned 工单的 GitHub Issue 关单 SHALL 以 `gh issue close <n> --reason "not planned"` 完成，守卫的状态自证 SHALL 认可 abandoned 终态:从 abandoned 关单必须携带该 reason、从 waiting_close 常规关单必须不携带;两条路径的既有约束(点名精确 Issue 号、单操作、pending 拒绝、规格门禁仅适用 waiting_close)SHALL 保持。`issue_closed` SHALL 在 abandoned 上作为自环(仅回填 issue_state=closed、状态保持 abandoned)。issue_pending=true 的工单 SHALL 可直接作废(无 Issue 可关)，其后的 issue_closed 仍 SHALL 被拒(先 flush)。同步 SHALL 为 abandoned 工单打 `hulane:abandoned` 标签;SessionStart 上下文与 Stop 完成声明钩子 SHALL 把 abandoned 视为终态。

#### Scenario: 任意非终态人工作废

- WHEN 对 doing/blocked/waiting_tag_confirm 等非终态工单以 actor=human:身份 应用 abandon，evidence 写明作废原因
- THEN 状态直达 abandoned，next_action=none，history 留痕，无任何交付证据要求

#### Scenario: 非人类 actor 被拒

- WHEN 以 actor=orchestrator 应用 abandon
- THEN 抛错，状态不变

#### Scenario: 终态不可再作废或阻塞

- WHEN 对 done 或 abandoned 工单应用 abandon 或 block
- THEN 抛错，状态不变

#### Scenario: 守卫认可 not planned 关单

- WHEN 工单处于 abandoned 且执行带 `--reason "not planned"` 的关单命令
- THEN 守卫状态自证放行(仍要求单操作、点名 Issue 号)

#### Scenario: 守卫强制关单 reason

- WHEN abandoned 工单不带 not planned 关单，或 waiting_close 工单带该 reason 关单
- THEN 守卫拒绝

#### Scenario: issue_closed 自环回填

- WHEN 对 Issue 已实际关闭的 abandoned 工单应用 issue_closed
- THEN issue_state=closed、状态保持 abandoned、history 留痕

#### Scenario: pending 工单作废

- WHEN 对 issue_pending=true 工单应用 abandon(随后应用 issue_closed)
- THEN abandon 成功;issue_closed 抛错要求先 flush

#### Scenario: 标签与钩子终态语义

- WHEN 同步 abandoned 工单，或 SessionStart/Stop 钩子读取含 abandoned 工单的 store
- THEN Issue 打 hulane:abandoned 标签;abandoned 不出现在活跃工单上下文，也不触发 Stop 的完成声明拦截
