# Required PR checks and branch protection

`cmdb-dev` must not automatically merge a PR unless the target repository has
an enforced server-side check. `/cmdb_init` installs these files when the
repository has no equivalent workflow:

```text
.github/workflows/pr-checks.yml
.github/scripts/cmdb-pr-checks.sh
```

The expected required check is:

```text
CMDB PR Checks / verify
```

Protect the repository default branch with the following minimum policy:

- require a pull request before merging;
- require `CMDB PR Checks / verify` to pass;
- require the branch to be up to date before merging;
- block force pushes and branch deletion;
- require conversation resolution;
- apply the rule to administrators when the repository policy permits.

The repository administrator must enable this policy in GitHub. The plugin
preflight reads the effective branch protection with `gh api`; it does not
silently weaken or create repository policy during ordinary development.

If the check is absent, pending, skipped, neutral, cancelled, timed out, or
failed, `/cmdb_approve` and `/cmdb_merge_approve` must not merge the PR.

