# hutong-zcode-marketplace

CMDB AI 研发流水线的 ZCode 插件市场。仓库根目录即 Marketplace 根目录。

## 插件

| 插件 | 版本 | 说明 |
| --- | --- | --- |
| `cmdb-dev` | 2.0.0 | MCP 控制面、GitHub 事实源、隔离执行与可验证供应链闭环 |

组件：8 个 `/cmdb_*` 命令、12 个 `cmdb-control` MCP 工具、5 个子 Agent（planner / coder / tester / build-checker / reviewer）、3 个生命周期 Hook、1 个 Skill、Obsidian 投影模板与 GitHub Actions 模板。

## 在 ZCode 中添加

公开仓库可以直接填入：

```text
hutong236/hutong-zcode-marketplace
```

需要 SSH 身份验证时使用：

```
git@github.com:hutong236/hutong-zcode-marketplace.git
```

添加后在「个人」分类下找到 `cmdb-dev` 插件安装即可。

完整步骤见 [INSTALL.md](INSTALL.md)。

## 安全边界

- Gate A：需求批准后才允许写业务代码；
- Gate B：高风险 PR 必须人工批准合并；
- Gate C：合并后必须人工确认 Tag/镜像交付；
- 公开仓库优先使用 GitHub Required PR Checks；不具备付费分支保护的私有仓库改用 MCP 控制面校验，并强制停在 Gate B；
- 控制面模式会核对 Actions 成功结果、固定 PR Head SHA，并要求合并命令携带 `--match-head-commit`；它不能阻止仓库管理员在 GitHub 页面手工绕过流程；
- `skip` 只允许 Planner 明确标记 `delivery_required: false` 的非运行时改动；
- Coder 完成后不增加人工 Gate，Tester 与 Reviewer 自动衔接。
- 每个 Work Item 使用独立 worktree；受保护的 push/tag/merge/close 操作需要一次性状态授权；自动返工最多 3 轮。
- 镜像完成必须交叉核对 Actions 元数据、GitHub Release 与 GHCR 摘要，并验证 SBOM/Provenance 证据。
- Slash Command 只编排；MCP 服务统一执行状态迁移、GitHub 同步、worktree、授权与交付核验。

## 更新

修改插件后提交推送，并同步递增 `marketplace.json` 与 `cmdb-dev/.zcode-plugin/plugin.json` 中的 `version`，ZCode 按 commit 跟踪更新。

## 验证

```bash
npm run validate
npm test
```
