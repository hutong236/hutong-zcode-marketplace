# BUG-15 Delta：已批准 delta 全文快照

批准来源：Gate A 审批包（GitHub Issue #19 评论 7166711807，2026-11-25）。
以下为该 delta 的逐字快照（标题标记按仓库 delta 模板骨架归一为
`### Requirement:` / `#### Scenario:`，需求与场景正文保持批准原文），
主规格智能合并以此为准。

## MODIFIED Requirements

（capability：hulane-work-item-lifecycle，整块重写
`openspec/specs/hulane-work-item-lifecycle/spec.md` 中的同名需求）

### Requirement: 作废终态(abandoned)

状态机 SHALL 提供 done 之外的第二个终态 abandoned:人工确认的 `abandon` 事件 SHALL 加入 HUMAN_EVENTS(actor 必须 human:身份 形式,requireHumanActor 拒绝 orchestrator),SHALL 从任何非终态(含 blocked、waiting_tag_confirm 等)可达;abandon SHALL 要求非空 evidence(写明作废原因),SHALL NOT 要求任何测试/评审/合并/镜像/规格同步证据。done 与 abandoned SHALL 均为终态:block、resume、abandon 均无法离开任一终态。abandoned 工单的 GitHub Issue 关单 SHALL 以 `gh issue close <n> --reason "not planned"` 完成,守卫的状态自证 SHALL 认可 abandoned 终态:从 abandoned 关单必须携带该 reason、从 waiting_close 常规关单必须不携带;reason 的识别 SHALL 锚定引号外的真实 `--reason` 旗标(引号可有可无、`--reason=` 粘连形态与既有宽容度一致,其它 reason 值一律视为不携带,fail-closed),引号内的注释体等数据值出现 `--reason` 字样时 SHALL 一律拒绝并提示改写该文本(两种终态路径同语义);两条路径的既有约束(点名精确 Issue 号、单操作、pending 拒绝、规格门禁仅适用 waiting_close)SHALL 保持。`issue_closed` SHALL 在 abandoned 上作为自环(仅回填 issue_state=closed、状态保持 abandoned)。issue_pending=true 的工单 SHALL 可直接作废(无 Issue 可关),其后的 issue_closed 仍 SHALL 被拒(先 flush)。同步 SHALL 为 abandoned 工单打 `hulane:abandoned` 标签;SessionStart 上下文与 Stop 完成声明钩子 SHALL 把 abandoned 视为终态。

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

#### Scenario: 注释体 reason 字样不构成携带

- WHEN abandoned 工单执行注释体含 `--reason not planned` 字样、无真实旗标的关单命令
- THEN 守卫拒绝(该命令实际将以 completed 关单,不得当作携带 not planned 放行),拒绝原因指明缺少真实的 `--reason "not planned"` 旗标

#### Scenario: 注释体 reason 字样对 waiting_close 亦 fail-closed

- WHEN waiting_close 工单执行注释体含 `--reason` 字样的关单命令
- THEN 守卫拒绝并提示改写注释文本,不得误报为携带 not planned

#### Scenario: 受控关单形态与注释并存零误拒

- WHEN waiting_close 工单执行带 `--comment "Done"` 的常规关单,或 abandoned 工单执行带 `--reason "not planned" --comment "Abandoned"` 的关单
- THEN 两种形态分别按各自终态语义照常裁决,注释参数不触发拒绝

## ADDED Requirements

（capability：hulane-work-item-lifecycle，追加进
`openspec/specs/hulane-work-item-lifecycle/spec.md`）

### Requirement: 特权操作单调用与受控形态零误拒

hulane 的 PreToolUse 特权守卫 SHALL 按同一次 Bash 调用内的受保护操作计数(不去重)强制单操作约束:两个及以上受保护操作——无论同动作链式(如 `gh issue close A && gh issue close B`、双 push、双 tag、双 merge)还是异动作链式——SHALL 在任何仓库/状态/令牌校验之前被拒绝,拒绝理由 SHALL 指明一次调用恰好一个操作;SHALL NOT 因同动作去重而按首个目标号放行链式中的其余操作。SKILL 受控命令形态单调用 SHALL 全部零误拒:push 令牌形态、tag 令牌形态、`gh pr merge <n> --squash --match-head-commit <sha>`、常规关单、not planned 关单、release 双令牌(refspec 推送)形态、白名单远端显式推送,均 SHALL 原样进入既有豁免/状态自证/令牌通道,单操作计数本身不产生新的拒绝。git 的 -m/-am/--message 消息体剥离与只读 tag 形态(-l/--list/--contains 等)SHALL 保持不计入操作计数。点名校验(commandHasNumber)SHALL 同样锚定引号外片段——数据值内出现目标号字样不构成点名。

#### Scenario: 链式同动作被拒

- WHEN 执行双关单、双推送、双 tag、双 merge 之一
- THEN deny,reason 指明一次调用恰好一个受保护操作,不得按首个目标号放行其余操作

#### Scenario: 链式异动作仍拒

- WHEN 执行 `gh issue close 66 && git push origin main`
- THEN deny(既有行为不变)

#### Scenario: SKILL 受控形态零误拒

- WHEN SKILL 五种受控形态逐条单调用执行
- THEN 每条都通过操作计数检查,原样进入各自既有状态自证/令牌校验通道

#### Scenario: release 双令牌形态零误拒

- WHEN release-tag 与 release-push(显式 refspec 形态)各自单调用执行
- THEN 分别进入 release 令牌通道,单操作计数不产生新的拒绝

#### Scenario: 消息体剥离与只读 tag 保持不计数

- WHEN 执行 `git tag -a v1.0.0 -m "match upstream push"` 或含 `git commit -m "... push ..."` 的命令或 `git tag --list`
- THEN 操作计数分别为 1、0、0,-m 消息体剥离与只读 tag 判定行为不变

#### Scenario: 白名单远端推送回归

- WHEN 含 `cd` 与 `git -c credential.helper=...` 前缀的白名单远端显式推送单调用执行
- THEN 照常豁免放行,不受单操作计数影响

#### Scenario: 注释体数字不构成点名

- WHEN 以 A 单令牌执行目标号仅出现在注释体的关单/合并命令
- THEN 守卫拒绝点名校验,不得凭数据值内的数字放行
