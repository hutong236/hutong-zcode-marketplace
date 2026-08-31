---
description: Initialize local read-only Obsidian projection and GitHub Actions Docker image build workflow for a CMDB repository.
argument-hint: "[optional setup notes]"
skills: cmdb-development
---
Use only the `cmdb-control` MCP plane for initialization. Call `cmdb_preflight`; stop on fundamental Git/GitHub access failures, otherwise call `cmdb_initialize` to create state/cache directories, managed Obsidian views, required PR checks, and (when Dockerfile exists) the tag-only image workflow. Call `cmdb_preflight` again. Never touch business code or create an Issue. Branch protection is administrator-owned: do not claim automated merge is ready until the second preflight verifies `CMDB PR Checks / verify`. Return changed files, MCP/hook availability, readiness, blockers, and next command. Notes: $ARGUMENTS
