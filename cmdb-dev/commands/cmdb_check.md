---
description: Read-only preflight check for the CMDB ZCode/GitHub/Docker-image workflow.
argument-hint: "[optional notes]"
skills: cmdb-development
---
Call the read-only `cmdb_preflight` MCP tool for the current workspace. Do not duplicate it with ad-hoc shell mutations. Present every returned check as Check/Result/Evidence/Required action and preserve its READY, READY_WITH_WARNINGS, or NOT_READY verdict. Missing branch protection, required checks, authenticated GitHub access, or verifiable image workflow remains NOT_READY. Do not call any mutating MCP tool. Notes: $ARGUMENTS
