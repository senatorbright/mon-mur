#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
artifacts_dir="$extension_dir/web-ext-artifacts"
version="$(node -p 'require(process.argv[1]).version' "$extension_dir/manifest.json")"
zip_file="$artifacts_dir/mon-mur-$version.zip"
xpi_file="$artifacts_dir/mon-mur-$version.xpi"

"$extension_dir/scripts/build-amo.sh"
cp -- "$zip_file" "$xpi_file"
printf 'Archive ZIP : %s\n' "$zip_file"
printf 'XPI non signé : %s\n' "$xpi_file"
