import { buildStats, readModelIoRecords, resolveSessionFile } from "../lib/rollout.mjs";

const objectSchema = (properties, required = []) => ({ type: "object", properties, required, additionalProperties: false });

export const TOOL_DEFINITIONS = Object.freeze([
  {
    name: "token_speed",
    description:
      "读取当前(或指定)ZCode 会话的本地模型请求记录,返回 Token 输出速度(tok/s)、会话汇总、按模型分解与最近请求列表。只读,不写任何文件。",
    inputSchema: objectSchema({
      session_id: { type: "string", description: "会话 ID(如 sess_xxx,可省略 sess_ 前缀)。缺省取最近活跃的会话。" },
      recent: { type: "integer", minimum: 1, maximum: 50, description: "返回最近 N 次请求,默认 10。" },
    }),
    annotations: { readOnlyHint: true, destructiveHint: false },
  },
]);

export async function callTool(name, args = {}) {
  if (name !== "token_speed") throw new Error(`Unknown tool: ${name}`);
  const file = resolveSessionFile(args.session_id);
  const records = readModelIoRecords(file.path);
  if (!records.length) {
    return {
      session: { id: file.sessionId, file: file.path, records: 0 },
      note: "该会话还没有带用量记录的模型请求。",
      summary: null,
      models: [],
      recent: [],
    };
  }
  const stats = buildStats(records, { recent: args.recent ?? 10 });
  stats.session = { id: file.sessionId, file: file.path, records: records.length };
  return stats;
}
