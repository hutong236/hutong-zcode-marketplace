---
description: 查看 Token 输出速度(t/s)与用量统计
argument-hint: "[session-id]"
---
调用 token-speed 插件 MCP 服务器的 `token_speed` 工具查询 Token 速度(如给了参数则作为 session_id 传入,否则用缺省的最近活跃会话)。把返回结果整理成中文简报,必须包含:

1. 最近一次请求的速度:tok/s、输出 tokens、请求时长、模型名。
2. 会话平均 tok/s(注明这是"输出 tokens ÷ 请求总时长"的估算,含首 token 等待,真实流式速度略高)、中位与峰值。
3. 输入/输出 tokens 合计与 cache 命中率。
4. 最近最多 10 次请求的速度小表(时间、tok/s、输出 tokens、时长、模型)。

只报告工具返回的数据,不要编造数字;若工具不可用或会话没有记录,直接说明原因。
