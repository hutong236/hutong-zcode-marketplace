# GitHub state protocol

GitHub is the durable source of truth. `.cmdb-dev/state.json` is a local cache
and Obsidian is a read-only projection.

Each managed Issue has exactly one state label and one machine state comment:

```text
cmdb:waiting-approval
cmdb:doing
cmdb:testing
cmdb:review
cmdb:pr-checking
cmdb:waiting-human-merge
cmdb:waiting-tag-confirm
cmdb:building
cmdb:blocked
cmdb:done
```

The state comment starts with this marker:

```text
<!-- cmdb-dev-state:v2 -->
```

and contains one fenced `cmdb-state` JSON document conforming to
`schemas/work-item-state.schema.json`. The `cmdb-control` MCP server updates the
latest managed comment after every verified transition. Human approvals are history events
whose actor is recorded as `human:<identity>`.

Every payload carries a monotonically increasing `revision`. Sync fails closed
when GitHub already has a newer revision or the same revision with divergent
content; the caller must hydrate and reconcile instead of overwriting remote
truth. Older V1.2 comments are normalized with additive V1.3/V1.4 defaults
before validation.

Historical `done` records that predate the V2 evidence fields are marked
`legacy_completion: true` during normalization. They remain readable and are
never upgraded into fabricated V2 evidence; every newly created Work Item uses
`legacy_completion: false` and the full current Done invariant.

Recovery order:

1. Read the GitHub Issue, state label and machine comment.
2. Reconcile PR/checks/merge/Actions facts into that state.
3. Hydrate `.cmdb-dev/state.json` as a cache.
4. Regenerate the Obsidian projection.

Deleting the local cache must never lose approvals, risk, delivery policy,
test/review evidence, merged SHA, Tag decision or image Digest.
