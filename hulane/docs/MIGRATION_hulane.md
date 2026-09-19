# 从 cmdb-dev 2.x 迁移到 hulane 3.0

hulane 是 cmdb-dev 更名后的延续,门禁模型(Gate A/B/C)、状态机与工具链不变。本指南面向用 cmdb-dev 2.x 初始化过的存量仓库,一次性迁移约 10 分钟。

## 0. 先读:哪些东西自动兼容,不需要动

- **控制目录 `.cmdb-dev/` 自动兼容**:guard 拦截、状态读写、授权令牌、worktree、github-meta 缓存全部继续走旧目录。可以完全不迁移,新仓库 init 才落 `.hulane/`。
- **GitHub 状态标记不变**:Issue 评论上的 `<!-- cmdb-dev-state:v2 -->` 与 ```cmdb-state 块继续被读写,存量工单 hydrate/sync 不受影响。
- **存量分支**:已记录在工单状态里的 `cmdb/req-*` 分支照常使用;只有新工单默认 `hulane/req-*`。
- **令牌环境变量**改为 `HULANE_AUTH_TOKEN`,由工具自动注入,无需手工处理。

## 1. 更新插件

1. 卸载或禁用旧 `cmdb-dev` 插件(两套并存会同时挂载 guard Hook 与 MCP 服务);
2. 更新 Marketplace 后安装 `hulane` ≥ 3.0.0;
3. 新建 Session。

## 2. GitHub Actions 检查名迁移(一次性)

插件 3.0 起工作流与检查名使用 Hulane 品牌,存量仓库需要同步:

1. `.github/workflows/pr-checks.yml`:工作流名 `CMDB PR Checks` → `Hulane PR Checks`(step 名保持 `verify`,最终检查名为 `Hulane PR Checks / verify`);脚本引用 `.github/scripts/cmdb-pr-checks.sh` → `hulane-pr-checks.sh`(脚本文件重新运行 `/hulane_init` 会自动补装,或手工 `git mv`);
2. 如在使用可选钩子,`.github/cmdb-ci.sh` → `.github/hulane-ci.sh`;
3. 出镜像的项目:`.github/workflows/build-image.yml` 工作流名 `CMDB Build Image` → `Hulane Build Image`;
4. 分支保护(或 ruleset)的 required status check:`CMDB PR Checks / verify` → `Hulane PR Checks / verify`;
5. 推送上述改动后,下一个 PR 起生效。

> 过渡期(尚未做完第 2 步)可以用 `hulane_verify_pr_checks` 的 `check_name` 参数显式传旧名 `CMDB PR Checks / verify`;preflight 会提示 required check 缺失,属预期。

## 3. 收尾(可选)

- 旧 `cmdb:*` 状态标签会被 `hulane:*` 取代;旧标签留在 Issue 上无害,可手动删除;
- **不要在有在途工单时 `mv .cmdb-dev .hulane`**:工单状态里的 `worktree_path` 与 git 的 worktree 注册都指向旧路径。确认无在途工单、无已注册 worktree 后才可整体改名。
