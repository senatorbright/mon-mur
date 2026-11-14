#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
"$extension_dir/scripts/build-amo.sh"

version="$(node -p 'require(process.argv[1]).version' "$extension_dir/manifest.json")"
zip_file="$extension_dir/web-ext-artifacts/mon-mur-$version.zip"
xpi_file="$extension_dir/web-ext-artifacts/mon-mur-$version-test-unsigned.xpi"
cp -- "$zip_file" "$xpi_file"

printf 'Paquet de test Android non signé : %s\n' "$xpi_file"
printf 'Pour le charger temporairement sur un téléphone, utilisez scripts/run-android-test.sh avec ADB et le code source présent sur cet ordinateur.\n'
