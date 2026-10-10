#!/usr/bin/env bash
set -Eeuo pipefail

readonly IMAGE_REF="${1:-${DOCKER_IMAGE_REF:?pass the image reference (npm run docker:scan uses scripts/image-tag.sh)}}"
readonly REQUESTED_SCANNER="${DOCKER_SCAN_SCANNER:-auto}"

# Official Trivy 0.69.3 image, pinned by its multi-platform index digest (identical on Docker Hub
# and GHCR). 0.69.4-0.69.6 were compromised (GHSA-69fq-xp46-6x23). Change it only through the
# controlled update in docs/release-verification.md.
readonly TRIVY_CONTAINER_IMAGE='aquasec/trivy:0.69.3@sha256:bcc376de8d77cfe086a917230e818dc9f8528e3c852f7b1aff648949b6258d1c'
# Named Docker volume for the vulnerability database cache: written only by the scanner
# container, never a host directory.
readonly TRIVY_CACHE_VOLUME='qr-city-guide-trivy-cache'

scan_dir=''

remove_scan_dir() {
  if [[ -n "$scan_dir" ]]; then
    rm -rf -- "$scan_dir"
  fi
}

trap remove_scan_dir EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

fail_missing_scanner() {
  printf '%s\n' \
    'Container scan aborted: install Trivy, run a Docker engine for the pinned Trivy container, or install the Docker Scout CLI plugin. Refusing to pass without a scanner.' \
    >&2
  exit 127
}

has_trivy() {
  command -v trivy >/dev/null 2>&1
}

has_docker_engine() {
  command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1
}

has_docker_scout() {
  command -v docker >/dev/null 2>&1 && docker scout version >/dev/null 2>&1
}

scan_with_trivy() {
  printf 'Scanning %s with Trivy (HIGH,CRITICAL fail threshold).\n' "$IMAGE_REF"
  trivy image \
    --exit-code 1 \
    --severity HIGH,CRITICAL \
    --scanners vuln \
    "$IMAGE_REF"
}

# Scans a `docker save` tarball in the pinned Trivy container. The container gets the tarball
# read-only and no Docker socket; it downloads the vulnerability database from ghcr.io and
# matches locally (no version check, telemetry or dependency lookups, so nothing is uploaded).
scan_with_trivy_container() {
  # Explicit template: BSD mktemp ignores TMPDIR for a bare `mktemp -d`.
  local tmp_root="${TMPDIR:-/tmp}"
  scan_dir="$(mktemp -d "${tmp_root%/}/qr-city-guide-scan.XXXXXXXXXX")"
  local -r tarball="${scan_dir}/image.tar"

  printf 'Exporting %s with docker save.\n' "$IMAGE_REF"
  docker save --output "$tarball" -- "$IMAGE_REF"
  # The directory stays private (mktemp -d, mode 0700). The file itself must be world-readable:
  # the container's root runs without CAP_DAC_OVERRIDE and does not own it on a Linux host.
  chmod 0644 "$tarball"

  printf 'Scanning %s with the pinned Trivy 0.69.3 container (HIGH,CRITICAL fail threshold).\n' "$IMAGE_REF"
  docker run --rm \
    --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,nodev \
    --security-opt no-new-privileges \
    --cap-drop ALL \
    -v "${tarball}:/scan/image.tar:ro" \
    -v "${TRIVY_CACHE_VOLUME}:/root/.cache/trivy" \
    "$TRIVY_CONTAINER_IMAGE" \
    image \
    --input /scan/image.tar \
    --cache-dir /root/.cache/trivy \
    --db-repository ghcr.io/aquasecurity/trivy-db:2 \
    --java-db-repository ghcr.io/aquasecurity/trivy-java-db:1 \
    --skip-version-check \
    --disable-telemetry \
    --offline-scan \
    --exit-code 1 \
    --severity HIGH,CRITICAL \
    --scanners vuln \
    --no-progress
}

scan_with_docker_scout() {
  local target="$IMAGE_REF"
  case "$target" in
    image://*|local://*|registry://*|oci-dir://*|archive://*) ;;
    *) target="local://${target}" ;;
  esac

  printf 'Scanning %s with Docker Scout (HIGH,CRITICAL fail threshold).\n' "$IMAGE_REF"
  docker scout cves \
    --exit-code \
    --only-severity high,critical \
    "$target"
}

case "$REQUESTED_SCANNER" in
  auto)
    # The pinned, digest-verified container comes first: a host trivy is whatever version and
    # origin the machine happens to have, so it runs only when no Docker engine is reachable (or
    # when DOCKER_SCAN_SCANNER=trivy asks for it). Docker Scout comes last: it sends the image
    # SBOM to Docker's service.
    if has_docker_engine; then
      scan_with_trivy_container
    elif has_trivy; then
      scan_with_trivy
    elif has_docker_scout; then
      scan_with_docker_scout
    else
      fail_missing_scanner
    fi
    ;;
  trivy)
    has_trivy || fail_missing_scanner
    scan_with_trivy
    ;;
  trivy-container)
    has_docker_engine || fail_missing_scanner
    scan_with_trivy_container
    ;;
  scout)
    has_docker_scout || fail_missing_scanner
    scan_with_docker_scout
    ;;
  *)
    printf 'Unsupported DOCKER_SCAN_SCANNER=%s; expected auto, trivy, trivy-container, or scout.\n' "$REQUESTED_SCANNER" >&2
    exit 64
    ;;
esac
