# BUG-15 Proposal：守卫解析层硬化——链式单操作、引号外锚定与 non-blocking 六项吸收

## What

吸收 REQ-14 reviewer 留下的 6 条 non-blocking(用户拍板「立单修复」),并在规划期
发现同类病一并修:

1. **主规格标点漂移**(纯文案,实际 14 处,比 reviewer 报的 8 处多):lifecycle
   追加块全角逗号回归半角贴合 archive/REQ-14/delta.md 原文——随本单 MODIFIED
   整块重写一并消灭。
2. **reason 识别假阳性**:closeCarriesNotPlannedReason 全串正则,注释体
   `--comment "cancelled --reason not planned"` 误判为携带——abandoned 侧真不带
   reason 的关单(gh 按 completed 关)过守卫;waiting_close 侧合法关单被误拒。
   修法:引号感知解析,只认引号外真实 `--reason` 旗标(保留 REQ-14 决策宽容度:
   引号可有可无、`--reason=` 粘连认),未消费的 `--reason` 字样子样一律
   fail-closed 并提示改写,双向同语义。
3. **analyzeCommand 链式只算一个 action**(既有病,最值得修):同动作去重使
   `gh issue close A && gh issue close B` 只算一个 action 且目标号取首个——第二
   个操作完全脱离 reason/状态/点名校验;push/tag/merge 同病。修法:去掉去重,
   按受保护操作计数强制单操作,链式在任何仓库/状态/令牌校验之前被拒(先于令牌
   消费,纠正后同令牌可重试)。与 SKILL「单调用恰好一个操作」既有契约对齐——
   SKILL 零改动。
4. **TERMINAL_STATES freeze 不彻底**:`Object.freeze(new Set())` 冻不住
   add/delete;改 frozen array + `isTerminalState()`,四处调用点切换。
5. **context.mjs 诊断误导**:catch-all 把脏 store 读失败报成 "not a Git
   worktree";拆 try 分支,store 失败报「state store 加载失败 + 原因 + 先修
   store」,fail-closed 语义不变(不列活跃工单)。
6. **schema 哨兵测试**:新增 test/schema.test.mjs——status 枚举 deepEqual
   STATES(16 态)、allOf 互补两分支存在 + 零依赖最小 if/then 求值器验证四组合。
7. **同类病(规划期发现,并入 #2 同层修)**:commandHasNumber 同样全串匹配——
   A 单令牌配 `--comment "see 122"` 可通过点名关掉 B 单 Issue(pr-merge 同款)。

## Why

- 守卫的全部权威建立在「解析层看到的就是 shell 将执行的」之上:注释体数据值
  伪造旗标/点名、链式第二操作绕过校验,都是解析层失真直接击穿授权语义。
- 拒绝路径全部前置于令牌消费:误拼命令不烧令牌,纠正后同令牌重试可用,
  断流风险收敛为零误拒矩阵 + 消息体剥离既有断言零改动。
- 主规格是行为基线的单一事实源,标点漂移让 delta 与主规格逐字对齐失效,
  随 MODIFIED 重写一并收口。

主规格:`hulane-work-item-lifecycle` MODIFIED「作废终态(abandoned)」(补 3 个
reason 解析 scenario + 强化 SHALL 文本,整块重写顺带消灭标点漂移)、ADDED
「特权操作单调用与受控形态零误拒」,其余能力不动。
