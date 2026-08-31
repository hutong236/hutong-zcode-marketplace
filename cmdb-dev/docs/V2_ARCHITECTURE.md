# cmdb-dev V2 architecture

V2 separates orchestration, authority, execution, and evidence.

| Layer | Owner | Responsibilities |
| --- | --- | --- |
| Orchestration | ZCode Primary Agent | Interpret slash command, dispatch workers, present human Gates |
| Control plane | `cmdb-control` MCP | Validate inputs, transition state, sync GitHub, create worktrees, issue one-use authorization, verify delivery |
| Workers | Planner/Coder/Tester/Reviewer/Build Checker | Bounded work in exhaustive tool lists; no nested subagents or MCP authority |
| Policy | Session/PreToolUse/Stop hooks | Inject current constraints, protect privileged shell actions, reject false Done claims |
| Truth | GitHub Issue + live PR/Actions/GHCR facts | Durable machine comment/label and independently verifiable delivery evidence |
| Projection | `.cmdb-dev/state.json` + `plan/` | Recoverable local cache and read-only Obsidian views |

## MCP tools

| Tool | Effect |
| --- | --- |
| `cmdb_preflight` | Read-only repository and server-policy readiness |
| `cmdb_initialize` | Install managed cache/views/check workflows |
| `cmdb_open_work_item` | Create Issue first, then state and projection |
| `cmdb_transition` | Apply one evidence-bearing state event and sync |
| `cmdb_status` / `cmdb_validate` | Reconcile and validate truth |
| `cmdb_sync` / `cmdb_hydrate` | Move canonical machine state to/from GitHub |
| `cmdb_worktree_create` | Create the one isolated Work Item worktree |
| `cmdb_authorize` | Issue one state-bound token for a protected action |
| `cmdb_verify_delivery` | Cross-check merged SHA, Actions, Release, GHCR, SBOM and provenance |

The stdio server supports current stateless MCP discovery (`2026-07-28`) and
legacy initialization-based clients. Tool input is validated in the server,
not assumed from the client.

## Gate invariants

- Gate A is required before a worktree or business-code write.
- Gate B is required only for high-risk merge and never bypasses server checks.
- Gate C is required after merge before tag/image delivery or an explicitly
  policy-allowed non-runtime skip.
- Automatic rework is limited to three rounds; the next failure blocks.
- Runtime Done requires a closed Issue, merged SHA, verified GHCR digest,
  matching Release metadata, and immutable SBOM/provenance attestation digests.
