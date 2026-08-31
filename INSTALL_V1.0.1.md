# CMDB ZCode Plugin V1.0.1 安装说明

## 本版修复

V1.0 使用：

```text
cmdb-zcode-marketplace/
├── marketplace.json
└── plugins/
    └── cmdb-dev/
```

并设置：

```json
{
  "pluginRoot": "plugins",
  "source": "./cmdb-dev"
}
```

部分 ZCode 客户端在插件详情页能读取 Marketplace，
但安装阶段没有应用 `pluginRoot`，会报：

```text
Unsupported or missing plugin source: ./cmdb-dev
```

V1.0.1 改为最直接的目录结构：

```text
cmdb-zcode-marketplace/
├── marketplace.json
└── cmdb-dev/
    ├── .zcode-plugin/
    │   └── plugin.json
    ├── commands/
    ├── skills/
    ├── agents/
    └── templates/
```

`marketplace.json`：

```json
{
  "plugins": [
    {
      "name": "cmdb-dev",
      "source": "./cmdb-dev"
    }
  ]
}
```

不再依赖 `pluginRoot`。

---

# 安装步骤

## 1. 先删除旧 Marketplace

ZCode：

```text
Settings
→ Plugins
→ Marketplace sources / 市场源
→ 找到 cmdb-dev-marketplace
→ Remove
```

如果已经有失败的 `cmdb-dev` 安装记录，也先 Uninstall。

## 2. 解压 V1.0.1

确保你看到：

```text
CMDB_ZCode_AI_Dev_Pipeline_V1.0.1/
└── cmdb-zcode-marketplace/
    ├── marketplace.json
    └── cmdb-dev/
        └── .zcode-plugin/
            └── plugin.json
```

特别注意：

```text
marketplace.json
```

和：

```text
cmdb-dev/
```

必须是同一级。

## 3. 添加 Marketplace

ZCode：

```text
Settings
→ Plugins
→ Create
→ Add marketplace
→ Choose directory
```

选择：

```text
cmdb-zcode-marketplace
```

不要选择：

```text
cmdb-dev
```

也不要选择外层：

```text
CMDB_ZCode_AI_Dev_Pipeline_V1.0.1
```

## 4. 安装

进入 Personal：

```text
Cmdb Dev
→ Install
```

安装成功后应该能看到组件：

- Skill: `cmdb-development`
- Commands:
  - `/cmdb_check`
  - `/cmdb_init`
  - `/cmdb_dev`
  - `/cmdb_approve`
  - `/cmdb_merge_approve`
  - `/cmdb_status`
  - `/cmdb_resume`
- Subagents:
  - `cmdb-planner`
  - `cmdb-coder`
  - `cmdb-tester`
  - `cmdb-reviewer`
  - `cmdb-build-checker`

## 5. 新建 Session

插件/子 Agent 修改后建议新建 ZCode Session。

然后在真实 CMDB Git 仓库执行：

```text
/cmdb_check
```
