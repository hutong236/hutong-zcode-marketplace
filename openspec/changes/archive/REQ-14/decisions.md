# REQ-14 Decisions：关键取舍记录

工单:REQ-14(状态机硬化——交付政策互补不变量 + 作废(abandoned)终态)。
Gate A 审批包:GitHub Issue #17 评论 7165642963(2026-11-25)。以下为批准时
已裁决事项(编排者按已批准方案派发,非阻塞),实现按此执行,不再自行取舍。

## ① 存量矛盾两旗读取策略:严格拒绝(fail-closed)

- validateWorkItem 对两旗相等的工单一律报 invalid,readStore/writeStore/事件
  路径共用;两已知仓(本仓 + hutong-project-automated)15 单全部互补且终态,
  零命中、零迁移。
- 第三方 store 若含脏数据,整个 store 不可读——这是 fail-closed 信号而非缺陷,
  破坏性说明留给随版 CHANGELOG(3.13.0)明示。

## ② 作废分支清理:默认保留可打捞

- abandoned 工单 worktree 清理用 plain `git worktree remove`(never --force,
  与 done 收尾同规则);分支默认保留,未合并提交随时可打捞。
- 仅用户明示丢弃才 `git branch -D`(对齐 SKILL 第 17 步既有 `-d` 拒绝未合并
  分支的保守取向)。

## ③ 新增 /hulane_abandon 命令文件:采纳

- 对齐 approve/merge/tag 人工确认通道惯例:frontmatter + 单段编排提示,
  human actor、evidence 原因、not planned 关单、issue_closed 自环、worktree
  清理与分支保留规则全部写入;CI 命令计数 10→11 同 PR 收口。

## ④ abandoned 关单豁免规格门禁:确认

- 状态机 issue_closed 的 spec_sync_required 前置与守卫授权层同款断言都限定
  仅 waiting_close 适用:作废没有合并树可验 specs(specs_commit_sha 钉死
  merged_sha 的方案 B 语义在无合并场景无意义);waiting_close 常规关单的
  门禁保持不变。

## ⑤ 版本与哨兵约束

- 本 PR 纯功能:版本号 6 处保持 3.12.0、CHANGELOG 不动(含破坏性说明的定版
  留给后续发版 chore 提交,仓库现行节奏 058ab27→37b4da7、128dc43→8d10d8c)。
- SKILL/README/INSTALL/Hulane_ZCode_AI_Dev_Workflow.md 四文档里的
  `delivery_required: false` 与 `skip_allowed: true` 原文令牌是 CI 校验锚点,
  绝不改动。

## ⑥ 已知残余风险

- 守卫授权矩阵变更 + validateWorkItem 全局收紧的组合回归面(风险 medium):
  既有 state-machine 用例基线零回归 + 新增用例兜底;缺省翻转导致测试夹具里
  仅传 delivery_required: true 的调用方必须显式补 skip_allowed: false。
- `--reason "not planned"` 形态识别按引号可有可无宽容匹配,其它 reason 值
  一律视为不带该 reason(fail-closed)。
