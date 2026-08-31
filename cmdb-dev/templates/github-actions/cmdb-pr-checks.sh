#!/usr/bin/env bash
set -euo pipefail

checks_run=0

if [[ -x .github/cmdb-ci.sh ]]; then
  .github/cmdb-ci.sh
  checks_run=1
elif [[ -x scripts/ci.sh ]]; then
  scripts/ci.sh
  checks_run=1
fi

if [[ -f package-lock.json ]]; then
  npm ci
  npm test
  npm run lint --if-present
  npm run build --if-present
  checks_run=1
elif [[ -f package.json ]]; then
  npm install --ignore-scripts
  npm test
  npm run lint --if-present
  npm run build --if-present
  checks_run=1
fi

if [[ -f go.mod ]]; then
  go test ./...
  checks_run=1
fi

if [[ -f Cargo.toml ]]; then
  cargo fmt --all -- --check
  cargo test --locked
  checks_run=1
fi

if [[ -f pyproject.toml || -f pytest.ini || -d tests ]]; then
  if [[ -f requirements-dev.txt ]]; then
    python -m pip install -r requirements-dev.txt
  elif [[ -f requirements.txt ]]; then
    python -m pip install -r requirements.txt
  fi
  python -m pytest
  checks_run=1
fi

if [[ -f Dockerfile ]]; then
  docker build --tag "cmdb-pr-check:${GITHUB_SHA:-local}" .
  checks_run=1
fi

if [[ "${checks_run}" -eq 0 ]]; then
  echo "No supported test/build entrypoint was found." >&2
  echo "Add executable .github/cmdb-ci.sh or scripts/ci.sh." >&2
  exit 2
fi

