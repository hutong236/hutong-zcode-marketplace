# hutong-zcode-marketplace

个人 ZCode 插件市场：Hulane AI 研发流水线、发票报销统计等插件。仓库根目录即 Marketplace 根目录。

## 插件

| 插件 | 版本 | 说明 |
| --- | --- | --- |
| `hulane` | 3.7.1 | MCP 控制面、GitHub 事实源、隔离执行与可验证供应链闭环 |
| `invoice-expense-report` | 0.1.0 | 发票报销整理：PDF 发票还原行程链、人工确认补贴天数，生成报销统计 Excel |

`hulane` 组件：9 个 `/hulane_*` 命令、14 个 `hulane-control` MCP 工具、7 个子 Agent（planner / designer / design-critic / coder / tester / build-checker / reviewer）、3 个生命周期 Hook、1 个 Skill、Obsidian 投影模板、GitHub Actions 模板与 OpenSpec 规格模板。

`invoice-expense-report` 组件：1 个 Skill（全 PDF 内容驱动：高铁票/机票/滴滴/酒店发票分类提取、行程链完整性确认、补贴天数人工确认、按出差出报告与 Excel）。版本独立演进，不参与 `npm run sync-version` 的 hulane 版本同步。

可选伴侣插件：后端 Go 工单在生成/修改 Go 代码前由 `hulane-coder` 调用 `modern-go-guidelines` 插件的 `use-modern-go` 技能（市场 `goland-claude-marketplace`），按目标 Go 版本应用现代惯用法；未安装时流程会提示安装，并按仓库后端规范降级继续。

前端页面级工单（新页面、布局/骨架改版、仓库首次使用某原型）在 Gate A 前由 `hulane-designer` 产出页面设计说明（设计方向、区域→组件/令牌映射、交互状态、偏离声明，≤150 行）与按需单文件 HTML 原型，随需求与实现方案一并审批；设计产出只读业务代码，原型暂存 git 排除的 `.hulane/designs/`，批准后随实现 PR 以 `docs/designs/<ID>.html` 入库。设计流程吸收"AI 世界级设计师"方法：编排者注入随机种子串打破默认审美、designer 混入人工品味参考，品质标准锚定 Awwwards / Webby Awards / FWA 获奖水准：designer 产出前按该标准自检、每轮修订以逼近该标准为目标；产出后由编排者渲染截图、派 `hulane-design-critic` 在全新上下文中只看图按该获奖品质打分（/10，低于 9 分带具体修改指令回炉，最多 3 轮），评分历史随设计说明一并进 Gate A 审批包，不新增人工停点；会话无渲染能力时记录 `skipped-no-renderer` 降级为单趟设计。`hulane-designer` 通过 agent frontmatter 的 `model:` 钉在 Kimi（`kimi-for-coding`）上以节省主套餐 token；换机或未配置该模型时把 `hulane/agents/hulane-designer.md` 里的 `model:` 改成本机 Provider/模型（`ListModels` 可查），或删掉该行回落会话模型，Kimi 派发失败时编排者也会自动降级为会话模型并注明 `session-fallback`。`hulane-design-critic` 不钉模型，跟随会话模型。

## 在 ZCode 中添加

公开仓库可以直接填入：

```text
hutong236/hutong-zcode-marketplace
```

需要 SSH 身份验证时使用：

```
git@github.com:hutong236/hutong-zcode-marketplace.git
```

添加后在「个人」分类下找到 `hulane`、`invoice-expense-report` 插件按需安装。

完整步骤见 [INSTALL.md](INSTALL.md)。

## 安全边界（hulane）

- Gate A：需求批准后才允许写业务代码；用户需求原话已明确批准（如「直接做」「预授权」）
  且工单低/中风险、无规格同步要求时，可同轮预授权（approval_source="pre_authorized"）
  直达 ready，高风险与规格工单仍必须停等 `/hulane_approve`；
- Gate B：高风险 PR 必须人工批准合并；
- Gate C：出镜像的条目合并后必须人工确认 Tag/镜像交付;默认 skip 策略
  (`delivery_required: false` + `skip_allowed: true`)在 Gate A 批准时已确认,
  合并后由 `policy_skip` 自动关单,不再逐条人工确认;
- 小修快车道:纯前端/文档、低风险的小改动以 `size: small` 立项,由 Primary Agent
  内联产出计划,跳过 planner 子 Agent 派发;其余条目仍走完整 Planner 分析;
- 原生能力规格层(OpenSpec 兼容):业务仓库在 `openspec/specs/<capability>/spec.md`
  沉淀行为基线;规划期产出 delta 进 Gate A 审批包,实现 PR 内完成 delta→主规格
  智能合并并归档决策史于 `openspec/changes/archive/<REQ-ID>/`;merge 后由
  `hulane_record_specs_synced` 对 merged_sha 树校验 `spec_delta_dir` 触达的
  capability 主规格(delta 目录在提交树无 specs/ 快照时回退全量)并记录
  `specs_synced` (specs_commit_sha=merged_sha)。standard 工单默认 `spec_sync_required: true`
  (纯基建/纯文档由 planner 显式豁免),small 恒 false,存量工单祖父回填;
  未同步的工单被状态机与 PreToolUse 守卫双层拒绝关单——是机制,不是提示词纪律;
- 公开仓库优先使用 GitHub Required PR Checks；不具备付费分支保护的私有仓库改用 MCP 控制面校验（要求 PR 上全部上报检查成功并固定 PR Head SHA），Gate B 规则与公开仓库一致：低/中风险自动合并，高风险停人工确认；
- 控制面模式会核对 Actions 成功结果、固定 PR Head SHA，并要求合并命令携带 `--match-head-commit`；它不能阻止仓库管理员在 GitHub 页面手工绕过流程；
- 默认交付策略为 `delivery_required: false` + `skip_allowed: true`(合并后跳过镜像,按需批量发版);仅当用户明确要求本次出镜像时才标记 `delivery_required: true`;批量发版走 `/hulane_release vX.Y.Z` 轻量路径——零工单、一次确认、两枚钉死 version+SHA 的单次令牌;
- Coder 完成后不增加人工 Gate，Tester 与 Reviewer 自动衔接。
- 前端页面级工单在写代码前产出页面设计并入 Gate A 审批包：设计说明强制映射到既有组件/设计令牌，新视觉词汇必须附偏离声明由人工裁决；未触发设计的条目零设计开销。
- 每个 Work Item 使用独立 worktree；push/tag 受保护操作需要一次性授权令牌，merge/close 由 guard 按状态自证放行；自动返工最多 3 轮。
- 镜像完成必须交叉核对 Actions 元数据、GitHub Release 与 GHCR 摘要，并验证 SBOM/Provenance 证据。
- Slash Command 只编排；MCP 服务统一执行状态迁移、GitHub 同步、worktree、授权与交付核验。
- V3 起控制目录为 `.hulane/`；cmdb-dev 2.x 初始化的仓库继续使用 `.cmdb-dev/` 并被自动兼容（guard/状态/授权/worktree 不断档），一次性迁移步骤见 [迁移指南](hulane/docs/MIGRATION_hulane.md)。

## 更新

发版流程:在 CHANGELOG 顶部手写新版本条目(唯一敲版本号的地方),然后运行 `npm run sync-version`——脚本自动同步其余 6 处版本号(含流程规范文档头的日期)并跑一遍 validate。7 处一致性由 validate 与 CI 强制兜底。ZCode 按 commit 跟踪更新。

## 验证

```bash
npm run validate
npm test
```
