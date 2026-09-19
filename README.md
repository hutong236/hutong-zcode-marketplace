# hutong-zcode-marketplace

CMDB AI 研发流水线的 ZCode 插件市场。仓库根目录即 Marketplace 根目录。

## 插件

| 插件 | 版本 | 说明 |
| --- | --- | --- |
| `cmdb-dev` | 2.5.0 | MCP 控制面、GitHub 事实源、隔离执行与可验证供应链闭环 |

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
- Gate C：出镜像的条目合并后必须人工确认 Tag/镜像交付;默认 skip 策略
  (`delivery_required: false` + `skip_allowed: true`)在 Gate A 批准时已确认,
  合并后由 `policy_skip` 自动关单,不再逐条人工确认;
- 小修快车道:纯前端/文档、低风险的小改动以 `size: small` 立项,由 Primary Agent
  内联产出计划,跳过 planner 子 Agent 派发;其余条目仍走完整 Planner 分析;
- 公开仓库优先使用 GitHub Required PR Checks；不具备付费分支保护的私有仓库改用 MCP 控制面校验（要求 PR 上全部上报检查成功并固定 PR Head SHA），Gate B 规则与公开仓库一致：低/中风险自动合并，高风险停人工确认；
- 控制面模式会核对 Actions 成功结果、固定 PR Head SHA，并要求合并命令携带 `--match-head-commit`；它不能阻止仓库管理员在 GitHub 页面手工绕过流程；
- 默认交付策略为 `delivery_required: false` + `skip_allowed: true`(合并后跳过镜像,按需批量发版);仅当用户明确要求本次出镜像时才标记 `delivery_required: true`;
- Coder 完成后不增加人工 Gate，Tester 与 Reviewer 自动衔接。
- 每个 Work Item 使用独立 worktree；push/tag 受保护操作需要一次性授权令牌，merge/close 由 guard 按状态自证放行；自动返工最多 3 轮。
- 镜像完成必须交叉核对 Actions 元数据、GitHub Release 与 GHCR 摘要，并验证 SBOM/Provenance 证据。
- Slash Command 只编排；MCP 服务统一执行状态迁移、GitHub 同步、worktree、授权与交付核验。

## 更新

修改插件后提交推送,并同步递增版本号。版本号在 7 处必须一致(`marketplace.json`、`plugin.json`、`package.json`、README 插件表、流程规范文档头、SKILL frontmatter、CHANGELOG),`npm run validate` 与 CI 已全部强制,漏改会直接失败。ZCode 按 commit 跟踪更新。

## 验证

```bash
npm run validate
npm test
```
