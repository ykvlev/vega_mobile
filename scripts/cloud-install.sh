#!/usr/bin/env bash
# Reproduce dependencies in the cloud workspace; does not publish or deploy.
set -euo pipefail
cd /workspace/vega_mobile
test "$(node --version)" = 'v24.19.0'
npm --cache /workspace/.cache/npm install --prefix /workspace/.tools --no-audit --no-fund pnpm@10.34.8
export PATH="/workspace/.tools/node_modules/.bin:$PATH"
pnpm install --frozen-lockfile
if [[ ! -e .env ]]; then
  cp .env.example .env
fi
pnpm db:generate
pnpm build:contracts
