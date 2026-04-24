#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
NODE_BIN="/opt/homebrew/bin/node"
NPM_BIN="/opt/homebrew/bin/npm"
REGISTRY_URL="https://registry.npmjs.org/"

if [[ -z "${NODE_AUTH_TOKEN:-}" ]]; then
  echo "NODE_AUTH_TOKEN is required."
  echo "Example: export NODE_AUTH_TOKEN='your-npm-token'"
  exit 1
fi

cd "$ROOT_DIR"

"$NODE_BIN" "$NPM_BIN" pack --dry-run
"$NODE_BIN" "$NPM_BIN" publish --registry="$REGISTRY_URL"
