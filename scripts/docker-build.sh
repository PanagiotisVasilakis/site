#!/usr/bin/env bash
# Builds the unified production image of one release commit from docker/Dockerfile.security:
#   villa-app:<sha>  web runtime and bundled workers (target runner)
# The tag comes from scripts/image-tag.sh ("-dirty" marks an uncommitted tree; never deploy it).
# Set DOCKER_BUILD_PLATFORM (e.g. linux/amd64) to build for the production host from another
# architecture. Nothing is pushed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required (the HTTPS public origin)}"
commit="$(git rev-parse --verify HEAD)"
tag="$(bash ./scripts/image-tag.sh)"

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
