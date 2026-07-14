#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

log() {
  printf '[ci-orchestrator-check] %s\n' "$*"
}

require_env() {
  local name="$1"
  [[ -n "${!name:-}" ]] || {
    printf '[ci-orchestrator-check] ERROR: %s is required\n' "$name" >&2
    exit 1
  }
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

load_env_file_if_present() {
  local file_path="$1"
  [[ -f "$file_path" ]] || return 0
  log "Loading env file: ${file_path#$REPO_ROOT/}"

  local raw line key value first_char last_char
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "$line" == \#* ]] && continue
    [[ "$line" == export\ * ]] && line="${line#export }"
    [[ "$line" == *=* ]] || continue

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"
    [[ -n "$key" ]] || continue

    if [[ ${#value} -ge 2 ]]; then
      first_char="${value:0:1}"
      last_char="${value: -1}"
      if [[ "$first_char" == '"' && "$last_char" == '"' ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$first_char" == "'" && "$last_char" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$file_path"
}

load_environment() {
  local candidate
  for candidate in ".env.production.local" ".env.production" ".env"; do
    load_env_file_if_present "$REPO_ROOT/$candidate"
  done
}

set_default_test_secrets() {
  export NODE_ENV="${NODE_ENV:-production}"
  export ADMIN_JWT_SECRET="${ADMIN_JWT_SECRET:-ci-admin-jwt-secret-should-be-32-chars-0001}"
  export ADMIN_DASH_SECRET="${ADMIN_DASH_SECRET:-ci-admin-dash-secret-0001}"
  export GUEST_JWT_SECRET="${GUEST_JWT_SECRET:-ci-guest-jwt-secret-should-be-32-chars-0001}"
  export GUEST_WIFI_NETWORK="${GUEST_WIFI_NETWORK:-ci-guest-network}"
  export GUEST_WIFI_PASSWORD="${GUEST_WIFI_PASSWORD:-ci-guest-password}"
  export SECURITY_ENC_KEY_HEX="${SECURITY_ENC_KEY_HEX:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
  export SECURITY_PEPPER="${SECURITY_PEPPER:-ci-security-pepper}"
  export CLAIM_TOKEN_PEPPER="${CLAIM_TOKEN_PEPPER:-ci-claim-token-pepper-at-least-32-chars-0001}"
  export SESSION_SECRET="${SESSION_SECRET:-ci-session-secret-should-be-32-chars-0001}"
  export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://example.test}"
  export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://example.test}"
  export VALID_API_KEYS="${VALID_API_KEYS:-0123456789abcdef0123456789abcdef}"
  export INTERNAL_API_KEYS="${INTERNAL_API_KEYS:-fedcba9876543210fedcba9876543210}"
  export ALERT_WEBHOOK_TOKEN="${ALERT_WEBHOOK_TOKEN:-ci-alert-webhook-token}"
  export TRUST_PROXY_MODE="${TRUST_PROXY_MODE:-hops}"
  export TRUST_PROXY_HOPS="${TRUST_PROXY_HOPS:-1}"
  export TEST_DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-}}"
}

main() {
  cd "$REPO_ROOT"
  load_environment
  set_default_test_secrets
  require_env DATABASE_URL
  require_env TEST_DATABASE_URL

  log 'Checking repository and runtime contract'
  npm run check:conflicts
  bash ./scripts/system-orchestrator.sh check --profile production --no-docker-fallback

  log 'Applying migrations'
  bash ./scripts/system-orchestrator.sh migrate --profile production --no-docker-fallback

  log 'Restoring development test dependencies'
  npm ci --include=dev --no-audit --no-fund

  log 'Running database-backed tests'
  npm run ci:test:db

  log 'Building production application'
  bash ./scripts/system-orchestrator.sh build --profile production --no-docker-fallback

  log 'CI orchestrator check completed successfully'
}

main "$@"
