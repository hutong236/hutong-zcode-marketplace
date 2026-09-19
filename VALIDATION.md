# Package Validation

Expected marketplace root:

```text
hutong-zcode-marketplace/
├── marketplace.json
├── scripts/validate-marketplace.mjs
└── hulane/
    └── .zcode-plugin/plugin.json
```

每次 push 前运行 `npm run validate`(CI 在 PR 与 push main 时运行同一检查)。
发版时的版本号同步用 `npm run sync-version`:从 CHANGELOG 标题读出版本,
自动改写其余 6 处,末尾自动跑一遍 validate。

校验事实:

- marketplace exists: True
- plugin manifest exists: True
- commands: 8
- agents: 5
- skills: 1
- MCP tools: 12(名称唯一)
- 版本号 7 处一致:`marketplace.json`、`plugin.json`、`package.json`、
  README 插件表、`Hulane_ZCode_AI_Dev_Workflow.md` 文档头、SKILL frontmatter、
  CHANGELOG 当前版本标题
- 默认交付策略令牌(`delivery_required: false`、`skip_allowed: true`)
  在 README、INSTALL、流程规范、SKILL 四处原样存在(防漂移哨兵)
- hooks:Bash PreToolUse 守卫、SessionStart、Stop
- 模板安全:镜像 workflow 只由 tag 触发且禁止 `workflow_dispatch`、
  SBOM + max provenance;PR checks workflow 跑 `pull_request`
- 运行时必需文件存在;全仓库无 `.DS_Store`
