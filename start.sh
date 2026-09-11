#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
if (( $# != 0 )); then
  echo 'Usage: ./start.sh (no arguments; configure .env instead)' >&2
  exit 2
fi
if [[ ! -f .env ]]; then cp .env.example .env; fi
if [[ ! -x .venv/bin/python ]]; then
  if command -v poetry >/dev/null 2>&1; then
    poetry install --no-interaction
  else
    if [[ ! -x .cache/poetry/bin/poetry ]]; then
      python3 -m venv .cache/poetry
      .cache/poetry/bin/pip install 'poetry>=2.0,<3'
    fi
    .cache/poetry/bin/poetry install --no-interaction
  fi
fi
if [[ ! -f frontend/node_modules/vite/bin/vite.js ]]; then
  (cd frontend && npm ci --no-audit --no-fund)
fi
exec .venv/bin/python scripts/supervise.py
