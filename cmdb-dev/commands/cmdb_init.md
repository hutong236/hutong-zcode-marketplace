---
description: Initialize local read-only Obsidian projection and GitHub Actions Docker image build workflow for a CMDB repository.
argument-hint: "[optional setup notes]"
skills: cmdb-development
---
Use only the `cmdb-control` MCP plane for initialization. Call `cmdb_preflight`; stop on fundamental Git/GitHub access failures, otherwise call `cmdb_initialize` to create state/cache directories, managed Obsidian views, PR checks, and (when Dockerfile exists) the tag-only image workflow. Call `cmdb_preflight` again. Never touch business code or create an Issue. Public repositories are auto-merge ready only when GitHub enforces `CMDB PR Checks / verify`. A private repository without paid branch protection may use the control-plane guard, but report that every merge requires Gate B and manual GitHub UI merges remain outside enforcement. Return changed files, MCP/hook availability, readiness, blockers, and next command. Notes: $ARGUMENTS
