# token-speed

在 ZCode 里查看会话的 **Token 输出速度(tok/s)** 与用量统计。

## 用法

- **斜杠命令**:会话里输入 `/tps`(可选参数:session id),agent 调用 `token_speed` 工具后输出简报——最近一次请求速度、会话平均/中位/峰值 tok/s、输入输出合计与 cache 命中率、最近 10 次请求速度表。
- **MCP 工具**:agent 可直接调用 `token_speed`(参数 `session_id`、`recent` 均可选)。
- **CLI**(开发/直查):`node scripts/tps.mjs [--session <sess_id>] [--last <N>] [--json]`。

## 数据来源与口径

- 只读解析 `~/.zcode/cli/rollout/model-io-sess_*.jsonl`(ZCode 客户端记录的每次模型 I/O),不写任何文件、不联网。
- 缺省会话 = 该目录下最近有写入的会话文件;可用 session id 指定其他会话。
- `tok/s = 输出 tokens ÷ 请求总时长(durationMs)`。`durationMs` 含首 token 等待与网络开销,因此该值是流式速度的**下界估算**;token 计数取自响应 `usage.outputTokens`(含 reasoning 输出)。

## 组件

- `commands/tps.md` — `/tps` 斜杠命令。
- `mcp/` — 零依赖 stdio MCP 服务器(工具 `token_speed`),传输与协议协商沿用 hulane 已验证实现。
- `lib/rollout.mjs` — rollout 解析与统计核心;`scripts/tps.mjs` 为 CLI 入口。
