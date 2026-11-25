# BUG-15 Decisions：关键取舍记录

工单:BUG-15(守卫解析层硬化——链式单操作、引号外锚定与 non-blocking 六项
吸收)。Gate A 审批包:GitHub Issue #19 评论 7166711807(2026-11-25)。以下为
批准时已裁决事项(编排者按已批准方案派发,非阻塞),实现按此执行,不再自行
取舍。

## ① 同类病 commandHasNumber 并入修:采纳

- 与 reason 假阳性同属「引号外锚定」同一解析层,边际成本极小,且是真实的
  「关错单」守卫洞——A 单令牌可借注释体数字关 B 单 Issue(pr-merge 同款)。

## ② execution-discipline「既有令牌与状态守卫行为 SHALL 保持不变」条款:按约束 REQ-9 接线解读

- 按「约束 REQ-9 纪律接线不得擅改守卫」解读;本单经自身能力 delta 正规演进
  守卫(净收紧),不触碰该条款;留此解读存档,reviewer 如持严格冻结解读再补
  MODIFIED。

## ③ `--reason completed` 从 waiting_close:保持现状

- 决策宽容度「其它 reason 值视为不携带」保持现状(gh 本就按 completed 关,
  语义正确),不额外收紧。

## ④ 版本与哨兵约束

- 本 PR 纯功能:版本号 6 处保持 3.12.0、CHANGELOG 不动(随下次
  /hulane_release 发版 chore,与 REQ-14 同批)。
- SKILL/README/INSTALL/Hulane_ZCode_AI_Dev_Workflow.md 四文档零改动;
  `delivery_required: false` 与 `skip_allowed: true` 令牌绝不触碰。

## ⑤ 已知残余风险

- 主风险=守卫解析收紧误拒断流(medium)。兜底:8 条零误拒形态矩阵(SKILL
  五受控形态 + release 双令牌两形态 + 白名单远端推送逐条断言裁决不变)、
  消息体剥离既有断言零改动、全部拒绝路径在令牌消费前(可无损重试)。
