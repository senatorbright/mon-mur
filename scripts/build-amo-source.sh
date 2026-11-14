#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifacts_dir="$extension_dir/web-ext-artifacts"
version="$(node -p 'require(process.argv[1]).version' "$extension_dir/manifest.json")"
archive="$artifacts_dir/mon-mur-$version-source.zip"

mkdir -p "$artifacts_dir"
rm -f "$archive"
(
  cd "$extension_dir"
  zip -qr "$archive" . \
    -x "./web-ext-artifacts/*" \
    "./node_modules/*" \
    "./*.log" \
    "./**/*.log" \
    "./.DS_Store"
)

printf 'Reviewer source archive: %s\n' "$archive"
