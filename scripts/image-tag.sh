#!/usr/bin/env bash
# Prints the local image reference for the checked-out commit: villa-app:<first 12 hex of HEAD>,
# with "-dirty" when the working tree differs from HEAD (tracked or untracked files). Only a clean
# reference identifies what the image was built from; never deploy a "-dirty" image.
set -Eeuo pipefail
if [ "$#" -gt 0 ]; then
  echo "unexpected image role argument: $1 (expected no arguments for the unified image)" >&2
  exit 2
fi
commit="$(git rev-parse --verify HEAD)"
suffix=''
if [ -n "$(git status --porcelain)" ]; then suffix='-dirty'; fi
printf 'villa-app:%s%s\n' "${commit:0:12}" "$suffix"
