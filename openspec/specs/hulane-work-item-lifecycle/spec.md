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

状态机 SHALL 提供 done 之外的第二个终态 abandoned:人工确认的 `abandon` 事件 SHALL 加入 HUMAN_EVENTS(actor 必须 human:身份 形式,requireHumanActor 拒绝 orchestrator),SHALL 从任何非终态(含 blocked、waiting_tag_confirm 等)可达;abandon SHALL 要求非空 evidence(写明作废原因),SHALL NOT 要求任何测试/评审/合并/镜像/规格同步证据。done 与 abandoned SHALL 均为终态:block、resume、abandon 均无法离开任一终态。abandoned 工单的 GitHub Issue 关单 SHALL 以 `gh issue close <n> --reason "not planned"` 完成,守卫的状态自证 SHALL 认可 abandoned 终态:从 abandoned 关单必须携带该 reason、从 waiting_close 常规关单必须不携带;reason 的识别 SHALL 锚定引号外的真实 `--reason` 旗标(引号可有可无、`--reason=` 粘连形态与既有宽容度一致,其它 reason 值一律视为不携带,fail-closed),引号内的注释体等数据值出现 `--reason` 字样时 SHALL 一律拒绝并提示改写该文本(两种终态路径同语义);出现两个及以上真实 `--reason` 旗标时 SHALL 一律按歧义命令拒绝(gh 旗标语义为 last-wins,不得按『任一旗标携带』放行),拒绝理由 SHALL 指明只保留一个旗标;真实旗标自身的值词元内含 `--reason` 字样(如 `--reason "--reason not planned"`)SHALL 同样按歧义拒绝并提示改写,不得判为不携带而在 waiting_close 侧放行;两条路径的既有约束(点名精确 Issue 号、单操作、pending 拒绝、规格门禁仅适用 waiting_close)SHALL 保持。`issue_closed` SHALL 在 abandoned 上作为自环(仅回填 issue_state=closed、状态保持 abandoned)。issue_pending=true 的工单 SHALL 可直接作废(无 Issue 可关),其后的 issue_closed 仍 SHALL 被拒(先 flush)。同步 SHALL 为 abandoned 工单打 `hulane:abandoned` 标签;SessionStart 上下文与 Stop 完成声明钩子 SHALL 把 abandoned 视为终态。

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

#### Scenario: 重复 reason 旗标按歧义拒绝

- WHEN abandoned 工单执行 `gh issue close 25 --reason "not planned" --reason completed`
- THEN 守卫拒绝(gh last-wins 实际以 completed 关单,不得按任一旗标放行),理由指明重复 `--reason` 歧义、只保留一个;waiting_close 同款同样拒绝;令牌路径与状态自证路径一致

#### Scenario: 旗标值内嵌 reason 字样按歧义拒绝

- WHEN 执行 `--reason "--reason not planned"` 形态的关单命令
- THEN 守卫按歧义拒绝并提示改写该值,不得判为不携带而在 waiting_close 侧放行;abandoned 侧同样以歧义拒绝,不再误报为缺少 `--reason "not planned"`

#### Scenario: 受控关单形态与注释并存零误拒

- WHEN waiting_close 工单执行带 `--comment "Done"` 的常规关单,或 abandoned 工单执行带 `--reason "not planned" --comment "Abandoned"` 的关单
- THEN 两种形态分别按各自终态语义照常裁决,注释参数不触发拒绝

### Requirement: 特权操作单调用与受控形态零误拒

hulane 的 PreToolUse 特权守卫 SHALL 按同一次 Bash 调用内的受保护操作计数(不去重)强制单操作约束:两个及以上受保护操作——无论同动作链式(如 `gh issue close A && gh issue close B`、双 push、双 tag、双 merge)还是异动作链式——SHALL 在任何仓库/状态/令牌校验之前被拒绝,拒绝理由 SHALL 指明一次调用恰好一个操作;SHALL NOT 因同动作去重而按首个目标号放行链式中的其余操作。SKILL 受控命令形态单调用 SHALL 全部零误拒:push 令牌形态、tag 令牌形态、`gh pr merge <n> --squash --match-head-commit <sha>`、常规关单、not planned 关单、release 双令牌(refspec 推送)形态、白名单远端显式推送,均 SHALL 原样进入既有豁免/状态自证/令牌通道,单操作计数本身不产生新的拒绝。git 的 -m/-am/--message 消息体剥离与只读 tag 形态(-l/--list/--contains 等)SHALL 保持不计入操作计数。点名校验(commandHasNumber)SHALL 同样锚定引号外片段——数据值内出现目标号字样不构成点名。守卫的全部目标点名与钉死校验(commandHasNumber 的目标号、`--match-head-commit` 的 pr_head_sha、git-tag 的 merged_sha、building 态 tag/push 的 image_tag、release 令牌的 version 与 sha)SHALL 锚定引号外词元——词元恰等于目标值,或为旗标的粘连/分离值形态;`-m` 消息体、`--comment`/`--body` 等数据值内出现目标字样不构成点名或钉死。状态自证的目标号提取(actionTargetNumber)SHALL 取首个引号外的 gh 点名形态,引号内的命令字样不参与匹配。

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

#### Scenario: 钉死 SHA 与 tag 名锚定引号外

- WHEN merging 工单执行 `gh pr merge <n> --squash --body "pin --match-head-commit <pr_head_sha>"`(SHA 仅在引号内),或 building 工单以令牌执行 `git tag -a <其它tag> -m "Release <image_tag> <merged_sha>" <其它sha>`
- THEN 守卫拒绝钉死/点名校验;`--match-head-commit <sha>` 与 `=<sha>` 两受控形态、tag 令牌形态与 building 态 tag 推送形态零误拒

#### Scenario: 状态自证目标号取首个引号外点名

- WHEN 状态自证路径收到引号内含 `gh issue close <B>` 字样、其后为真实 `gh issue close <A>` 点名的命令
- THEN 目标号提取锚定首个引号外点名(按 A 查工单并照常裁决)

