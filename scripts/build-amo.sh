#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifacts_dir="$extension_dir/web-ext-artifacts"
version="$(node -p 'require(process.argv[1]).version' "$extension_dir/manifest.json")"

npx --yes web-ext@10.7.0 build \
  --source-dir "$extension_dir" \
  --artifacts-dir "$artifacts_dir" \
  --filename "mon-mur-$version.zip" \
  --overwrite-dest \
  --ignore-files \
    "README.md" \
    "cumulative.txt" \
    "v5.4.0.txt" \
    "v5.5.0.txt" \
    "docs" \
    "scripts" \
    "tests" \
    "*.log" \
    "**/*.log" \
    ".DS_Store"

printf 'AMO archive: %s\n' "$artifacts_dir/mon-mur-$version.zip"
