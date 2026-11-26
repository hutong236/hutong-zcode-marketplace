# BUG-16 Delta：已批准 delta 全文快照

批准来源：Gate A 审批包（GitHub Issue #21 评论 issuecomment-7178262512，
2026-11-25）。以下为该 delta 的逐字快照（标题标记按仓库 delta 模板骨架归一为
`### Requirement:` / `#### Scenario:`，需求与场景正文保持批准原文），
主规格智能合并以此为准：各需求块整块重写为既有合入版 + 批准增量，
未提及的既有 scenario 逐字保持。

## MODIFIED Requirements

（capability：hulane-work-item-lifecycle，整块重写
`openspec/specs/hulane-work-item-lifecycle/spec.md` 中的同名需求）

### Requirement: 作废终态(abandoned)

在 BUG-15 版基础上新增两条款与两 scenario(reason 识别段):「出现两个及以上真实 `--reason` 旗标时 SHALL 一律按歧义命令拒绝(gh 旗标语义为 last-wins,不得按『任一旗标携带』放行),拒绝理由 SHALL 指明只保留一个旗标;真实旗标自身的值词元内含 `--reason` 字样(如 `--reason "--reason not planned"`)SHALL 同样按歧义拒绝并提示改写,不得判为不携带而在 waiting_close 侧放行。」

#### Scenario: 重复 reason 旗标按歧义拒绝
- WHEN abandoned 工单执行 `gh issue close 25 --reason "not planned" --reason completed`
- THEN 守卫拒绝(gh last-wins 实际以 completed 关单,不得按任一旗标放行),理由指明重复 `--reason` 歧义、只保留一个;waiting_close 同款同样拒绝;令牌路径与状态自证路径一致

#### Scenario: 旗标值内嵌 reason 字样按歧义拒绝
- WHEN 执行 `--reason "--reason not planned"` 形态的关单命令
- THEN 守卫按歧义拒绝并提示改写该值,不得判为不携带而在 waiting_close 侧放行;abandoned 侧同样以歧义拒绝,不再误报为缺少 `--reason "not planned"`

(其余 11 个 scenario 与 BUG-15 合入版逐字保持)

### Requirement: 特权操作单调用与受控形态零误拒

在 BUG-15 版基础上新增锚定条款:「守卫的全部目标点名与钉死校验(commandHasNumber 的目标号、`--match-head-commit` 的 pr_head_sha、git-tag 的 merged_sha、building 态 tag/push 的 image_tag、release 令牌的 version 与 sha)SHALL 锚定引号外词元——词元恰等于目标值,或为旗标的粘连/分离值形态;`-m` 消息体、`--comment`/`--body` 等数据值内出现目标字样不构成点名或钉死。状态自证的目标号提取(actionTargetNumber)SHALL 取首个引号外的 gh 点名形态,引号内的命令字样不参与匹配。」

#### Scenario: 钉死 SHA 与 tag 名锚定引号外
- WHEN merging 工单执行 `gh pr merge <n> --squash --body "pin --match-head-commit <pr_head_sha>"`(SHA 仅在引号内),或 building 工单以令牌执行 `git tag -a <其它tag> -m "Release <image_tag> <merged_sha>" <其它sha>`
- THEN 守卫拒绝钉死/点名校验;`--match-head-commit <sha>` 与 `=<sha>` 两受控形态、tag 令牌形态与 building 态 tag 推送形态零误拒

#### Scenario: 状态自证目标号取首个引号外点名
- WHEN 状态自证路径收到引号内含 `gh issue close <B>` 字样、其后为真实 `gh issue close <A>` 点名的命令
- THEN 目标号提取锚定首个引号外点名(按 A 查工单并照常裁决)

(其余 8 个 scenario 与 BUG-15 合入版逐字保持)

## MODIFIED Requirements

（capability：hulane-release-workflow，整块重写
`openspec/specs/hulane-release-workflow/spec.md` 中的同名需求）

### Requirement: release 令牌约束

在既有版本基础上新增条款:「两腿的点名 SHALL 锚定引号外词元(词元恰为钉死值),`-m` 消息体等数据值内的 version/SHA 字样不构成点名。」

#### Scenario: 消息体字样不构成 release 点名
- WHEN release-tag 腿执行 `git tag -a <vX.Y.Z> -m "Release <vX.Y.Z> <钉死sha>" <其它sha>`
- THEN 消费被拒(must name the pinned tag/SHA),不得在错误 commit 上创建本地 tag

#### Scenario: 受控 release 形态零误拒保持
- WHEN 两腿按受控形态逐条单调用执行
- THEN 零误拒进入 release 令牌通道,refspec 三重验证链行为不变

(其余 scenario 与既有版逐字保持)
