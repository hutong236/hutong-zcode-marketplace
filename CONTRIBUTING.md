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

发版时版本号只手写一次:

1. 在 `CHANGELOG.md` 顶部新增版本条目(标题 `## [2.5.1] - 2026-09-20` +
   改动内容)——这是唯一手写版本号的位置;
2. 运行 `npm run sync-version`:脚本从 CHANGELOG 标题读出版本与日期,
   自动改写其余 6 处(`marketplace.json`、`plugin.json`、`package.json`、
   README 插件表、流程规范文档头、SKILL frontmatter),并跑一遍
   validate 自证没漏;
3. 正常提交推送。提交仍包含全部 7 个文件,其中 6 个由脚本改写。

版本一致性断言保留在 validate 与 CI 中作兜底(漏改在机制上已不可能,
断言防的是绕过脚本的手改)。其余要求:

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
