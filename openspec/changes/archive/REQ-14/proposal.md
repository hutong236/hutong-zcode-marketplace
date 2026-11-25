# REQ-14 Proposal：状态机硬化——交付政策互补不变量 + 作废(abandoned)终态

## What

2026-11-25 hutong-project-automated REQ-5 在 waiting_tag_confirm 结构性死锁，最终
靠用户授权带外手改 state.json（skip_allowed false→true）收口。本单根治两个已
活体踩中的结构性缺口：

1. 开单不拦自相矛盾的交付政策：`validateWorkItem`/`validateWorkItemInput` 只拒
   true+true；false+false 放行后必然死锁——skip 事件被 `delivery_required ||
   !skip_allowed` 永久封死，waiting_tag_confirm 唯一另一出路是完整镜像证据链
   且 specs_commit_sha 必须等于 merged_sha，done 校验拒绝 skipped+!skip_allowed，
   两旗不在 PATCH_FIELDS 开单即冻结。MCP 开单两旗必填，输入校验是最后防线。
2. 无作废终态：唯一终态 done、blocked 出来只有 resume；REQ-5 的「作废」是
   即兴拼的（Issue 用 not_planned 关、工单硬走 policy_skip→done）。

修法：

- 缺口 1 两旗互补：`delivery_required === skip_allowed` 一律非法（覆盖原
  true+true 拒绝）；state-machine 与兼容 CLI 缺省对齐文档默认
  delivery_required=false、skip_allowed=true；schema allOf 补对称约束。
- 缺口 2 新增 `abandoned` 终态 + 人工确认 `abandon` 事件（HUMAN_EVENTS/
  requireHumanActor，任意非终态可达，evidence 写明原因、零交付证据要求）；
  守卫 issue-close 认可 abandoned 且强制 `--reason "not planned"`（waiting_close
  常规关单不得带）；`issue_closed` 在 abandoned 上自环；SessionStart/Stop 钩子
  把 abandoned 视为终态；sync 打 `hulane:abandoned` 标签。

## Why

- 状态机的价值在「不可表示非法状态」：false+false 工单是合法表示域内的死锁
  状态，唯一出路是带外手改 state.json——这会击穿全部不变量信任。
- 「不想做了」是真实需求且只能来自人：机器无权裁决作废。abandoned 作为第二
  终态给了它一等公民表达，Issue 的 not planned 关单理由与工单终态一一对应，
  审计面（history 的 human actor + 原因 evidence）完整。
- 存量核查：本仓与 hutong-project-automated 两仓全部工单两旗互补且终态，
  零迁移；schema_version 保持 2。

主规格：`hulane-release-workflow` ADDED「交付政策互补不变量」、
`hulane-work-item-lifecycle` ADDED「作废终态(abandoned)」，其余能力不动。
