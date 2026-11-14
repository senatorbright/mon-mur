#!/usr/bin/env bash
set -euo pipefail

extension_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if (( $# > 2 )); then
  printf 'Usage : %s [ID_ADB] [PAQUET_FIREFOX]\n' "$0" >&2
  exit 2
fi

device_id="${1:-}"
firefox_apk="${2:-org.mozilla.fenix}"
if [[ -z "$device_id" ]]; then
  devices=()
  while read -r id status _; do
    [[ "$status" == "device" ]] && devices+=("$id")
  done < <(adb devices | tail -n +2)
  if (( ${#devices[@]} != 1 )); then
    printf 'Connectez un seul téléphone avec le débogage USB activé, ou passez son ID ADB en premier argument. Appareils détectés : %s\n' "${devices[*]:-(aucun)}" >&2
    exit 1
  fi
  device_id="${devices[0]}"
fi

exec npx --yes web-ext@10.7.0 run \
  --source-dir "$extension_dir" \
  --target firefox-android \
  --adb-device "$device_id" \
  --firefox-apk "$firefox_apk"
