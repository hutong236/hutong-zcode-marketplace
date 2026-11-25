# REQ-14 Delta：已批准 delta 全文快照

批准来源：Gate A 审批包（GitHub Issue #17 评论 7165642963，2026-11-25）。
以下为该 delta 的逐字快照（标题标记按仓库 delta 模板骨架归一为
`### Requirement:` / `#### Scenario:`，需求与场景正文保持批准原文），
主规格智能合并以此为准。

## ADDED Requirements

（capability：hulane-release-workflow，追加进
`openspec/specs/hulane-release-workflow/spec.md`）

### Requirement: 交付政策互补不变量

hulane SHALL 在开单输入校验(validateWorkItemInput)与持久化工单不变量(validateWorkItem)两层强制 delivery_required 与 skip_allowed 互补:两旗相等(true+true 与 false+false)一律非法;非运行时交付(delivery_required=false,即 skip_allowed=true)仍 SHALL 要求非空 delivery_reason。代码层缺省值(状态机与兼容 CLI)SHALL 与文档默认一致:delivery_required=false、skip_allowed=true;MCP hulane_open_work_item 的双旗必填参数是显式写入,输入校验 SHALL 作为最后防线在落库前拒绝矛盾组合。两旗 SHALL NOT 进入事件 patch 白名单(开单后不可带内改写,既有约束保持)。

#### Scenario: 开单拒绝 false+false

- WHEN 以 delivery_required=false、skip_allowed=false(且 delivery_reason 非空)调用 open_work_item
- THEN validateWorkItemInput 抛错,工单不落库、无 Issue 产生

#### Scenario: 开单拒绝 true+true(回归)

- WHEN 以 true+true 组合调用
- THEN 抛错,行为与既有拒绝一致

#### Scenario: 互补组合放行

- WHEN 以 false+true(默认)或 true+false(显式发版)调用
- THEN 开单成功,策略照常持久化进工单

#### Scenario: 持久化不变量同步收紧

- WHEN 读取或校验含矛盾两旗的工单
- THEN validateWorkItem 报 invalid delivery policy(readStore/writeStore/事件路径共用)

#### Scenario: 缺省值对齐文档

- WHEN 调用方省略两旗(兼容 CLI new 或防御性路径)
- THEN 缺省为 delivery_required=false、skip_allowed=true,与 SKILL/README/INSTALL/流程规范四文档默认一致

## ADDED Requirements

（capability：hulane-work-item-lifecycle，追加进
`openspec/specs/hulane-work-item-lifecycle/spec.md`）

### Requirement: 作废终态(abandoned)

状态机 SHALL 提供 done 之外的第二个终态 abandoned:人工确认的 `abandon` 事件 SHALL 加入 HUMAN_EVENTS(actor 必须 human:身份 形式,requireHumanActor 拒绝 orchestrator),SHALL 从任何非终态(含 blocked、waiting_tag_confirm 等)可达;abandon SHALL 要求非空 evidence(写明作废原因),SHALL NOT 要求任何测试/评审/合并/镜像/规格同步证据。done 与 abandoned SHALL 均为终态:block、resume、abandon 均无法离开任一终态。abandoned 工单的 GitHub Issue 关单 SHALL 以 `gh issue close <n> --reason "not planned"` 完成,守卫的状态自证 SHALL 认可 abandoned 终态:从 abandoned 关单必须携带该 reason、从 waiting_close 常规关单必须不携带;两条路径的既有约束(点名精确 Issue 号、单操作、pending 拒绝、规格门禁仅适用 waiting_close)SHALL 保持。`issue_closed` SHALL 在 abandoned 上作为自环(仅回填 issue_state=closed、状态保持 abandoned)。issue_pending=true 的工单 SHALL 可直接作废(无 Issue 可关),其后的 issue_closed 仍 SHALL 被拒(先 flush)。同步 SHALL 为 abandoned 工单打 `hulane:abandoned` 标签;SessionStart 上下文与 Stop 完成声明钩子 SHALL 把 abandoned 视为终态。

#### Scenario: 任意非终态人工作废

- WHEN 对 doing/blocked/waiting_tag_confirm 等非终态工单以 actor=human:身份 应用 abandon,evidence 写明作废原因
- THEN 状态直达 abandoned,next_action=none,history 留痕,无任何交付证据要求

#### Scenario: 非人类 actor 被拒

- WHEN 以 actor=orchestrator 应用 abandon
- THEN 抛错,状态不变

#### Scenario: 终态不可再作废或阻塞

- WHEN 对 done 或 abandoned 工单应用 abandon 或 block
- THEN 抛错,状态不变

#### Scenario: 守卫认可 not planned 关单

- WHEN 工单处于 abandoned 且执行带 `--reason "not planned"` 的关单命令
- THEN 守卫状态自证放行(仍要求单操作、点名 Issue 号)

#### Scenario: 守卫强制关单 reason

- WHEN abandoned 工单不带 not planned 关单,或 waiting_close 工单带该 reason 关单
- THEN 守卫拒绝

#### Scenario: issue_closed 自环回填

- WHEN 对 Issue 已实际关闭的 abandoned 工单应用 issue_closed
- THEN issue_state=closed、状态保持 abandoned、history 留痕

#### Scenario: pending 工单作废

- WHEN 对 issue_pending=true 工单应用 abandon(随后应用 issue_closed)
- THEN abandon 成功;issue_closed 抛错要求先 flush

#### Scenario: 标签与钩子终态语义

- WHEN 同步 abandoned 工单,或 SessionStart/Stop 钩子读取含 abandoned 工单的 store
- THEN Issue 打 hulane:abandoned 标签;abandoned 不出现在活跃工单上下文,也不触发 Stop 的完成声明拦截
