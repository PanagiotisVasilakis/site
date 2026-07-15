#!/usr/bin/env bash
set -Eeuo pipefail

readonly IMAGE_REF="${1:-${DOCKER_IMAGE_REF:-villa-app:latest}}"
readonly REQUESTED_SCANNER="${DOCKER_SCAN_SCANNER:-auto}"

fail_missing_scanner() {
  printf '%s\n' \
    'Container scan aborted: install Trivy or the Docker Scout CLI plugin. Refusing to pass without a scanner.' \
    >&2
  exit 127
}

has_trivy() {
  command -v trivy >/dev/null 2>&1
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
    if has_trivy; then
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
  scout)
    has_docker_scout || fail_missing_scanner
    scan_with_docker_scout
    ;;
  *)
    printf 'Unsupported DOCKER_SCAN_SCANNER=%s; expected auto, trivy, or scout.\n' "$REQUESTED_SCANNER" >&2
    exit 64
    ;;
esac
