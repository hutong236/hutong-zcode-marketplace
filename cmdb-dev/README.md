# cmdb-dev ZCode Plugin

CMDB 项目专用 AI 研发插件。

```text
Requirement → Issue → Human Approval → Branch → Coder → Tester → Reviewer → PR → Merge → Actions Image → Close Issue → Done
```

Commands: `/cmdb_check`, `/cmdb_init`, `/cmdb_dev`, `/cmdb_approve`, `/cmdb_merge_approve`, `/cmdb_status`, `/cmdb_resume`.

Prerequisites in ZCode terminal:

```bash
git --version
gh --version
gh auth status
git remote -v
```

Repository should have a usable Dockerfile. Primary Agent is Orchestrator; plugin subagents do not call each other. Obsidian is read-only.
