# cmdb-dev 安装说明

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

添加后，在 Personal 分类安装并启用 `cmdb-dev`。插件更新或 Hook
变更后应新建 ZCode Session，使运行时重新加载组件。

在插件详情中确认 `cmdb-control` 出现在 Plugin MCP servers，并在 Hooks
中看到 SessionStart、PreToolUse 与 Stop。V2 不需要手工添加 MCP 配置。

## 初始化目标项目

在真实 CMDB 项目工作区依次执行：

```text
/cmdb_check
/cmdb_init
```

新需求入口：

```text
/cmdb_dev <自然语言需求或 Bug>
```

需求批准、必要的高风险合并批准、Tag/镜像批准分别使用：

```text
/cmdb_approve REQ-123
/cmdb_merge_approve REQ-123
/cmdb_tag_approve REQ-123 v1.2.3
```

只有 Planner 明确判定 `delivery_required: false` 的非运行时改动才允许：

```text
/cmdb_tag_approve REQ-123 skip
```
