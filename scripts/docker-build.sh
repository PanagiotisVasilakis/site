#!/usr/bin/env bash
# Builds the three production images of one release commit from docker/Dockerfile.security:
#   villa-app:<sha>          web runtime (target runner)
#   villa-app:<sha>-workers  outbox and operations workers (target workers)
#   villa-app:<sha>-migrate  Prisma migrate deploy (target migrate)
# The tag comes from scripts/image-tag.sh ("-dirty" marks an uncommitted tree; never deploy it).
# Set DOCKER_BUILD_PLATFORM (e.g. linux/amd64) to build for the production host from another
# architecture. Nothing is pushed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required (the HTTPS public origin)}"
commit="$(git rev-parse --verify HEAD)"
base_tag="$(bash ./scripts/image-tag.sh)"

for target in runner workers migrate; do
  tag="$base_tag"
  [ "$target" = runner ] || tag="$base_tag-$target"
  docker build \
    ${DOCKER_BUILD_PLATFORM:+--platform "$DOCKER_BUILD_PLATFORM"} \
    --target "$target" \
    --build-arg NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
    --build-arg GIT_COMMIT="$commit" \
    -f docker/Dockerfile.security \
    -t "$tag" \
    .
done

printf '\nBuilt from %s:\n' "$commit"
for target in runner workers migrate; do
  tag="$base_tag"
  [ "$target" = runner ] || tag="$base_tag-$target"
  printf '  %-40s %s\n' "$tag" "$(docker image inspect --format '{{.Id}}' "$tag")"
done
