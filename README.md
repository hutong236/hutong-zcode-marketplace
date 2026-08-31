# hutong-zcode-marketplace

CMDB AI 研发流水线的 ZCode 私人插件市场。仓库根目录即市场根目录。

## 插件

| 插件 | 版本 | 说明 |
| --- | --- | --- |
| `cmdb-dev` | 1.0.4 | CMDB Issue → Branch → Coder → Tester → Reviewer → PR → Tag确认 → Docker image 全流程 AI 工作流 |

组件：8 个 `/cmdb_*` 命令、5 个子 Agent（planner / coder / tester / build-checker / reviewer）、1 个 Skill、Obsidian 投影模板（首页 / 研发控制台 / 研发看板 / 需求列表 / 工单）与 GitHub Actions 构建模板。

## 在 ZCode 中添加

「设置 → 插件管理 → 发现」页点击 **+**，填入本仓库的 **SSH 地址**（私有仓库必须用 SSH，`用户名/仓库` 简写会走 HTTPS 匿名克隆而失败）：

```
git@github.com:hutong236/hutong-zcode-marketplace.git
```

添加后在「个人」分类下找到 `cmdb-dev` 插件安装即可。

## 更新

修改插件后提交推送，并同步递增 `marketplace.json` 与 `cmdb-dev/.zcode-plugin/plugin.json` 中的 `version`，ZCode 按 commit 跟踪更新。
