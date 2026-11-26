# BUG-16 Decisions：关键取舍记录

工单:BUG-16(守卫解析硬化二期——重复旗标歧义拒绝与全部钉定点名的引号外
锚定)。Gate A 审批包:GitHub Issue #21 评论 issuecomment-7178262512
(2026-11-25)。以下为批准时已裁决事项(编排者按已批准方案派发,非阻塞),
实现按此执行,不再自行取舍。

## ① actionTargetNumber 纳入(裁决 #1):采纳

- 与其它钉定点名同属「引号外锚定」同一解析层,边际成本 3-5 行,保持解析层
  一致性;现状该形态恒 fail-closed 误拒(引号内字样在前时按错误目标号查
  工单),修复后按首个引号外真实点名照常裁决,无放行面扩张。

## ② `--match-head-commit "<sha>"` 带引号值形态(裁决 #2):默认拒

- 非受控形态 fail-closed,不与 reason 值宽容度看齐。理由:reason 值引号
  可有可无可与 gh 语义对齐(REQ-14 决策),而 SHA 钉死受控形态 SKILL 已
  文档化为裸值,放宽无必要。

## ③ pushRefspecsOf / guard 令牌提取正则(裁决 #3):确认不改,留痕

- 规划期核实两者对引号形态恒被严格模式拒绝(fail-closed 非放行):
  pushRefspecsOf 的 refspec 判等要求整词元恰为 `<40位>:refs/tags/<version>`
  精确形,guard 的 HULANE_*_TOKEN 提取正则要求引号外裸令牌赋值。本单不动,
  仅此留痕。

## ④ 版本与哨兵约束

- 本 PR 纯功能:版本号 6 处保持 3.12.0、CHANGELOG 不动(随下次
  /hulane_release 发 3.13.0 chore,与 REQ-14/BUG-15 同批)。
- SKILL/README/INSTALL/Hulane_Zcode_AI_Dev_Workflow.md 四文档零改动;
  `delivery_required: false` 与 `skip_allowed: true` 哨兵令牌绝不触碰。
- guard.mjs 零改动(消费层内部收敛于 authorization.mjs)。

## ⑤ 已知残余风险

- 主风险=锚定收紧误拒断流(medium)。兜底:零误拒矩阵既有 8 条断言零改动
  + 新增 building tag 推送形态逐条断言裁决不变;全部拒绝路径在令牌消费前
  (可无损重试);BUG-15 既有 AC(注释体字样/受控关单形态/reason 宽容度
  四形态)全部保持。
- 词元恰等锚定的理论残余:引号外恰等词元若本身是某数据值(如 `-m <钉死值>`
  裸值消息恰等于 version),点名预检仍认——该 corner 在修复前的 includes
  语义下同样放行,本单为净收紧,未引入新放行面。
