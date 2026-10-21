#!/usr/bin/env bash
# Builds the three production images of one release commit from docker/Dockerfile.security:
#   villa-app:<sha>          web runtime (target runner)
#   villa-app:<sha>-workers  outbox and operations workers (target workers)
#   villa-app:<sha>-migrate  Prisma migrate deploy (target migrate)
# The tag comes from scripts/image-tag.sh ("-dirty" marks an uncommitted tree; never deploy it).
# The images are built for linux/amd64, the production platform (docs/architecture/deployment-target.md),
# whatever the architecture of the build host. A native build on an Apple-silicon Mac would produce
# arm64 images that fail on the x86_64 VPS with "exec format error"; there the build runs under
# emulation and is slow. DOCKER_BUILD_PLATFORM (os/arch) overrides the platform for a local
# experiment only; never ship such images. After the builds every tag must report the requested
# platform, otherwise the script exits 1. Nothing is pushed.
set -Eeuo pipefail
cd "$(dirname "$0")/.."

: "${NEXT_PUBLIC_SITE_URL:?NEXT_PUBLIC_SITE_URL is required (the HTTPS public origin)}"
# A bare origin: https://host[:port] with at most one trailing slash. The value is compiled into the
# image, and the web container refuses a runtime NEXT_PUBLIC_SITE_URL that is not the same string.
# A rejected value is not echoed, so a pasted link with credentials never reaches the terminal.
site_url_re='^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?(:([1-9][0-9]{0,4}))?/?$'
valid_site_url=0
if [[ "$NEXT_PUBLIC_SITE_URL" =~ $site_url_re ]]; then
  site_port="${BASH_REMATCH[3]:-}"
  if [ -z "$site_port" ] || [ "$site_port" -le 65535 ]; then valid_site_url=1; fi
fi
if [ "$valid_site_url" -ne 1 ]; then
  echo "NEXT_PUBLIC_SITE_URL must be a bare https origin such as https://your-host.example or https://localhost:3002:" >&2
  echo "https://host[:port] with at most one trailing slash, and no path, query, fragment or credentials." >&2
  exit 2
fi

platform="${DOCKER_BUILD_PLATFORM:-linux/amd64}"
if ! [[ "$platform" =~ ^([a-z0-9]+/[a-z0-9]+)(/[a-z0-9]+)?$ ]]; then
  echo "DOCKER_BUILD_PLATFORM must look like linux/amd64 (os/arch with an optional variant), got: $platform" >&2
  exit 2
fi
# docker image inspect reports the variant separately, so compare os/arch only.
expected_platform="${BASH_REMATCH[1]}"
if [ "$platform" != linux/amd64 ]; then
  echo "WARNING: building for $platform, not the production platform linux/amd64; do not ship these images." >&2
fi
native_platform="$(docker version --format '{{.Server.Os}}/{{.Server.Arch}}' 2>/dev/null || true)"
if [ -n "$native_platform" ] && [ "$native_platform" != "$expected_platform" ]; then
  echo "Docker daemon is $native_platform: the $platform build runs under emulation and takes much longer." >&2
fi

commit="$(git rev-parse --verify HEAD)"
base_tag="$(bash ./scripts/image-tag.sh)"
printf 'Building for %s, site URL %s\n' "$platform" "$NEXT_PUBLIC_SITE_URL"

tag_of() {
  if [ "$1" = runner ]; then printf '%s\n' "$base_tag"; else printf '%s-%s\n' "$base_tag" "$1"; fi
}

for target in runner workers migrate; do
  docker build \
    --platform "$platform" \
    --target "$target" \
    --build-arg NEXT_PUBLIC_SITE_URL="$NEXT_PUBLIC_SITE_URL" \
    --build-arg GIT_COMMIT="$commit" \
    -f docker/Dockerfile.security \
    -t "$(tag_of "$target")" \
    .
done

printf '\nBuilt from %s for %s:\n' "$commit" "$platform"
wrong_platform=0
for target in runner workers migrate; do
  tag="$(tag_of "$target")"
  actual_platform="$(docker image inspect --format '{{.Os}}/{{.Architecture}}' "$tag")"
  printf '  %-40s %-12s %s\n' "$tag" "$actual_platform" "$(docker image inspect --format '{{.Id}}' "$tag")"
  if [ "$actual_platform" != "$expected_platform" ]; then
    echo "ERROR: $tag is $actual_platform, expected $expected_platform" >&2
    wrong_platform=1
  fi
done
if [ "$wrong_platform" -ne 0 ]; then
  echo "At least one image has the wrong platform; do not scan, save or ship these images." >&2
  exit 1
fi
