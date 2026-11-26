# BUG-16 Proposal：守卫解析硬化二期——重复旗标歧义拒绝与全部钉定点名的引号外锚定

## What

BUG-15 把 reason 识别与 commandHasNumber 锚定到引号外后，reviewer 同层清点出
七项残留（用户拍板「修复这个问题」），全部收敛在
`hulane/scripts/lib/authorization.mjs` 单文件，复用 BUG-15 的
tokenizeShellWords、零新依赖，guard/MCP/SKILL 零改动：

1. **重复真实 `--reason` 旗标 last-wins 窗口**：`--reason "not planned"
   --reason completed` 按「任一携带」放行（abandoned 侧），而 gh pflag
   last-wins 实际以 completed 关单——语义反转。修法：≥2 真实旗标一律按
   歧义拒绝（双侧、双路径同语义），理由指明只保留一个。
2. **`--match-head-commit` 钉死引号盲**（原始串正则）：SHA 字样在 `--body`
   引号内即可过校验而真实旗标缺失。修法：词元锚定；`<sha>` 分离与 `=<sha>`
   粘连两受控形态零误拒，带引号值形态按裁决 #2 默认拒。
3. **git-tag 的 merged_sha includes**：`-m "Release <merged_sha>" <别的sha>`
   可过钉死、tag 打到别的 commit。修法：词元锚定（词元恰等于 merged_sha）。
4. **building 态 image_tag includes**（git-tag/git-push 共用）：
   `git -c note=<image_tag> push ...` 类形态可过点名。修法：词元恰等锚定。
5. **release 双腿 version/sha includes**：tag 腿 `git tag -a <vX.Y.Z> -m
   "Release <vX.Y.Z> <sha>" <别的sha>` 可过双点名。修法：点名预检改词元
   锚定；push 腿 refspec 判等与三重验证链一行不动。
6. **actionTargetNumber 引号盲**：引号内命令字样在前时查错工单（现状恒
   fail-closed 拒绝，理论误拒非放行）。修法：首个引号外点名词元序列提取。
7. **旗标值自含字样**：`--reason "--reason not planned"` 从 absent 改歧义
   拒绝（waiting_close 侧不再放行 gh 必报错的命令，abandoned 侧不再误报）。

确认不改（fail-closed 已核实）：pushRefspecsOf、guard 令牌提取正则（引号
形态恒被严格模式拒），仅 decisions 留痕。

## Why

- 守卫的全部权威建立在「解析层看到的就是 shell 将执行的」之上：BUG-15 收口
  了 reason 与目标号的引号外锚定，但其余钉定点名（SHA/tag/refspec）仍是
  原始串 includes——消息体数据值字样可伪造钉死，纵深只剩下游一层。
- 重复旗标的 gh last-wins 语义使「任一携带即放行」与实际执行相反，是唯一的
  语义反转（非仅收紧）洞；歧义拒绝在双侧双路径同语义封死。
- 拒绝路径全部前置于令牌消费：误拼命令不烧令牌，纠正后同令牌重试可用；
  断流风险收敛为零误拒矩阵（既有 8 条 + 新增 building tag 推送形态）。

主规格：`hulane-work-item-lifecycle` MODIFIED「作废终态(abandoned)」（补
重复旗标/值字样两 scenario + 强化 SHALL）与「特权操作单调用与受控形态零误拒」
（扩钉定锚定条款 + 两 scenario）、`hulane-release-workflow` MODIFIED
「release 令牌约束」（补引号外锚定条款 + 两 scenario），其余能力不动。
