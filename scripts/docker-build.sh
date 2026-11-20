#!/usr/bin/env bash
# Builds the unified production image of one release commit from docker/Dockerfile.security:
#   villa-app:<sha>  web runtime and bundled workers (target runner)
# The tag comes from scripts/image-tag.sh; an uncommitted tree is refused unless ALLOW_DIRTY=1 (a "-dirty" trial image, never deployed).
# Set DOCKER_BUILD_PLATFORM (e.g. linux/amd64) to build for the production host from another
# architecture. Nothing is pushed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required (the HTTPS public origin)}"
commit="$(git rev-parse --verify HEAD)"
tag="$(bash ./scripts/image-tag.sh)"
# GIT_COMMIT must be the 40-hex HEAD, so an uncommitted tree would record a commit the image was not built from.
if [[ "$tag" == *-dirty && "${ALLOW_DIRTY:-}" != 1 ]]; then
  echo 'refusing to build from an uncommitted tree: commit first, or set ALLOW_DIRTY=1 for a local trial image (never deploy it)' >&2
  exit 1
fi

docker build \
  ${DOCKER_BUILD_PLATFORM:+--platform "$DOCKER_BUILD_PLATFORM"} \
  --target runner \
  --build-arg NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
  --build-arg GIT_COMMIT="$commit" \
  -f docker/Dockerfile.security \
  -t "$tag" \
  .

printf '\nBuilt from %s:\n' "$commit"
printf '  %-40s %s\n' "$tag" "$(docker image inspect --format '{{.Id}}' "$tag")"
