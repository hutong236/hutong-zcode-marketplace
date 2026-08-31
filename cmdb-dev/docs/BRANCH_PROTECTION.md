# PR checks and merge guards

`cmdb-dev` always requires a successful PR workflow. `/cmdb_init` installs:

```text
.github/workflows/pr-checks.yml
.github/scripts/cmdb-pr-checks.sh
```

The stable check name is:

```text
CMDB PR Checks / verify
```

## Mode 1: GitHub required checks

Public repositories and paid GitHub plans should protect the default branch:

- require a pull request before merging;
- require `CMDB PR Checks / verify` to pass;
- require the branch to be up to date;
- block force pushes and branch deletion;
- require conversation resolution;
- apply the rule to administrators when repository policy permits.

This is recorded as `merge_guard_mode: github_required_checks` and permits the
existing low/medium-risk automatic merge path after Tester and Reviewer pass.

## Mode 2: private-repository control-plane guard

GitHub Free does not provide protected branches for private repositories. In
that environment `cmdb_verify_pr_checks` performs the compensating control:

1. query the exact open, non-draft PR;
2. require `CMDB PR Checks / verify` to have concluded `SUCCESS`;
3. persist the PR head SHA, check name, and GitHub details URL;
4. record `merge_guard_mode: control_plane_verified` without claiming that
   GitHub itself enforces the check;
5. force every risk level to stop at human Gate B;
6. issue a one-use merge authorization only for a command containing
   `--match-head-commit <verified-sha>`.

This mode protects merges performed through `cmdb-dev`, but it cannot prevent a
repository administrator from manually merging or pushing through the GitHub
web interface. Teams needing that server-side guarantee must use GitHub branch
protection.

Missing, pending, skipped, neutral, cancelled, timed out, or failed workflow
results block both modes.
