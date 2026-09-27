#!/usr/bin/env bash
# Prints the local image reference for the checked-out commit: villa-app:<first 12 hex of HEAD>,
# with "-dirty" when the working tree differs from HEAD (tracked or untracked files). Only a clean
# reference identifies what the image was built from; never deploy a "-dirty" image.
# An optional role argument (workers, migrate) is appended: villa-app:<sha>[-dirty]-<role>.
set -Eeuo pipefail
commit="$(git rev-parse --verify HEAD)"
suffix=''
if [ -n "$(git status --porcelain)" ]; then suffix='-dirty'; fi
role="${1:-}"
case "$role" in
  '') ;;
  workers|migrate) suffix="$suffix-$role" ;;
  *) echo "unknown image role: $role (expected workers or migrate)" >&2; exit 2 ;;
esac
printf 'villa-app:%s%s\n' "${commit:0:12}" "$suffix"
