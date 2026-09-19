# hulane 安装说明

## 前置条件

- ZCode 已打开一个工作区；
- 目标项目是 Git 仓库；
- 本机已安装并登录 GitHub CLI：`gh auth status`；
- 需要构建镜像的项目已经提供可用的 `Dockerfile`。

## 添加 Marketplace

公开仓库可在 ZCode 中使用以下任一地址：

```text
hutong236/hutong-zcode-marketplace
https://github.com/hutong236/hutong-zcode-marketplace
```

需要 SSH 身份验证时使用：

```text
git@github.com:hutong236/hutong-zcode-marketplace.git
```

进入：

```text
Settings → Plugins → Create → Add marketplace
```

添加后，在 Personal 分类安装并启用 `hulane`。插件更新或 Hook
变更后应新建 ZCode Session，使运行时重新加载组件。

在插件详情中确认 `hulane-control` 出现在 Plugin MCP servers，并在 Hooks
中看到 SessionStart、PreToolUse 与 Stop。V2 不需要手工添加 MCP 配置。

## 初始化目标项目

在真实 Hulane 项目工作区依次执行：

```text
/hulane_check
/hulane_init
```

新需求入口：

```text
/hulane_dev <自然语言需求或 Bug>
```

需求批准、必要的高风险合并批准、Tag/镜像批准分别使用：

```text
/hulane_approve REQ-123
/hulane_merge_approve REQ-123
/hulane_tag_approve REQ-123 v1.2.3
```

默认交付策略是 `delivery_required: false` + `skip_allowed: true`(按需批量发版,不要求每次合并都打 tag):允许 skip 的条目合并后自动关单,已停在 `waiting_tag_confirm` 的条目也可人工确认跳过:

```text
/hulane_tag_approve REQ-123 skip
```

仅当用户明确要求本次出镜像时,才以 `delivery_required: true` 立项并在其 Gate C 打 tag。按需批量发版的完整规则见 [Hulane_ZCode_AI_Dev_Workflow.md](Hulane_ZCode_AI_Dev_Workflow.md) 的 Gate C 一节。

## 从 cmdb-dev 升级

旧版插件 `cmdb-dev`(≤ 2.5.0)与 `hulane`(≥ 3.0.0)是两个独立插件,升级步骤:

1. 在 ZCode 中卸载或禁用旧 `cmdb-dev` 插件——两套插件并存会同时挂载 guard Hook 与 MCP 服务;
2. 更新本仓库的 Marketplace 后,安装并启用 `hulane`;
3. 新建 ZCode Session。

已用 cmdb-dev 初始化过的项目**无需重新初始化**:旧控制目录 `.cmdb-dev/` 被自动兼容(guard 拦截、状态读写、授权与 worktree 全部照旧)。GitHub Actions 检查名等一次性迁移步骤见 [迁移指南](hulane/docs/MIGRATION_hulane.md)。
