# 贡献指南

## 开发方式

- 本仓库(插件市场)的改动按近期先例直连 `main`:中文 conventional
  commit,插件改动标题带版本号后缀,如
  `feat(cmdb-dev): Gate B 分级,控制面低/中风险自动合并 (V2.5.0)`。
- 插件管理的是真实 CMDB 项目仓库的开发流程;在那里的开发走 `/cmdb_dev`
  V2 流程(立项 → Gate A → worktree → 编码/测试/评审 → PR → 合并 →
  Gate C),与本仓库自身的提交方式无关。
- 发布 = push `main` 即发布:ZCode 按 commit 跟踪插件更新,无需打 tag 或
  构建产物。插件镜像按需批量发版,完整规则见
  [CMDB_ZCode_AI_Dev_Workflow.md](CMDB_ZCode_AI_Dev_Workflow.md) 的 Gate C 一节。

## 版本与变更记录

- 每次插件改动递增 SemVer 版本,并同步以下 7 处(CI 已强制一致,
  `npm run validate` 本地即可发现遗漏):
  1. `marketplace.json`
  2. `cmdb-dev/.zcode-plugin/plugin.json`
  3. `package.json`
  4. `README.md` 插件表
  5. `CMDB_ZCode_AI_Dev_Workflow.md` 头部版本
  6. `cmdb-dev/skills/cmdb-development/SKILL.md` frontmatter
  7. `CHANGELOG.md` 新版本条目
- `CHANGELOG.md` 每个版本必须写明动机,有取证数据(会话错误统计等)时
  一并写入,保持现有 Keep-a-Changelog 风格。
- 默认交付策略的载重令牌(`delivery_required: false`、
  `skip_allowed: true`)在 README、INSTALL、流程规范、SKILL 四处出现,
  validate 有防漂移哨兵;调整策略措辞时四处一起改。

## 提交前检查

```bash
npm run validate
npm test
```

CI(push main 与 PR)运行同一组检查。新增/删除 command、agent、MCP 工具时,
同步更新 `scripts/validate-marketplace.mjs` 中的结构断言与 README 组件计数。
