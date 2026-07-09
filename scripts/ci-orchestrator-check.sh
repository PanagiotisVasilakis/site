#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

REQUIRED_NODE_VERSION=""
REQUIRED_NODE_MAJOR=""
REQUIRED_NPM_VERSION="11.18.0"

STARTED_LOCAL_PG=0
LOCAL_PG_CONTAINER="${CI_PG_CONTAINER:-site-ci-orchestrator-db}"
LOCAL_PG_PORT="${CI_PG_PORT:-55432}"
LOCAL_PG_USER="${CI_PG_USER:-ci_user}"
LOCAL_PG_PASSWORD="${CI_PG_PASSWORD:-ci_pass}"
LOCAL_PG_DB="${CI_PG_DB:-site_ci}"

log() {
  printf '[ci-orchestrator-check] %s\n' "$*"
}

warn() {
  printf '[ci-orchestrator-check] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[ci-orchestrator-check] ERROR: %s\n' "$*" >&2
  exit 1
}

parse_major() {
  local version="$1"
  printf '%s' "$version" | sed 's/^v//' | cut -d'.' -f1
}

resolve_required_node_major() {
  if [[ -f "$REPO_ROOT/.nvmrc" ]]; then
    REQUIRED_NODE_VERSION="$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")"
  else
    REQUIRED_NODE_VERSION="22.19.0"
  fi
  REQUIRED_NODE_MAJOR="$(parse_major "$REQUIRED_NODE_VERSION")"
}

version_at_least() {
  local actual="${1#v}" required="${2#v}"
  [[ "$(printf '%s\n%s\n' "$required" "$actual" | sort -V | head -n1)" == "$required" ]]
}

runtime_is_compatible() {
  command -v node >/dev/null 2>&1 || return 1
  command -v npm >/dev/null 2>&1 || return 1

  local node_version npm_version
  node_version="$(node -v 2>/dev/null || true)"
  npm_version="$(npm -v 2>/dev/null || true)"
  [[ -n "$node_version" && -n "$npm_version" ]] || return 1

  if version_at_least "$node_version" "$REQUIRED_NODE_VERSION" \
    && version_at_least "$npm_version" "$REQUIRED_NPM_VERSION"; then
    return 0
  fi

  log "Detected runtime node=$node_version npm=$npm_version; required node>=${REQUIRED_NODE_VERSION}, npm>=${REQUIRED_NPM_VERSION}"
  return 1
}

bootstrap_portable_node_runtime() {
  local os arch node_dist_arch tools_dir latest_manifest archive_url archive_path extract_dir

  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"

  case "$arch" in
    x86_64|amd64) node_dist_arch="x64" ;;
    aarch64|arm64) node_dist_arch="arm64" ;;
    *) die "Unsupported CPU architecture for portable Node bootstrap: $arch" ;;
  esac

  [[ "$os" == "linux" ]] || die "Portable Node bootstrap currently supports Linux only"

  command -v curl >/dev/null 2>&1 || die "curl is required to bootstrap Node ${REQUIRED_NODE_MAJOR}"
  command -v tar >/dev/null 2>&1 || die "tar is required to bootstrap Node ${REQUIRED_NODE_MAJOR}"

  tools_dir="$REPO_ROOT/.runtime/tools"
  mkdir -p "$tools_dir"

  latest_manifest="https://nodejs.org/dist/latest-v${REQUIRED_NODE_MAJOR}.x/SHASUMS256.txt"
  archive_path="$(curl -fsSL "$latest_manifest" | awk '/linux-'"$node_dist_arch"'\.tar\.xz$/ {print $2; exit}')"
  [[ -n "$archive_path" ]] || die "Could not resolve latest Node ${REQUIRED_NODE_MAJOR}.x archive"

  extract_dir="$tools_dir/${archive_path%.tar.xz}"
  if [[ ! -x "$extract_dir/bin/node" ]]; then
    archive_url="https://nodejs.org/dist/latest-v${REQUIRED_NODE_MAJOR}.x/${archive_path}"
    log "Bootstrapping portable Node runtime from $archive_url"
    curl -fsSL "$archive_url" -o "$tools_dir/$archive_path"
    tar -xJf "$tools_dir/$archive_path" -C "$tools_dir"
  fi

  export PATH="$extract_dir/bin:$PATH"
  hash -r

  if ! version_at_least "$(npm -v 2>/dev/null || printf '0')" "$REQUIRED_NPM_VERSION"; then
    log "Installing npm ${REQUIRED_NPM_VERSION} into portable runtime"
    npm install --global "npm@${REQUIRED_NPM_VERSION}"
  fi

  local node_version npm_version
  node_version="$(node -v 2>/dev/null || true)"
  npm_version="$(npm -v 2>/dev/null || true)"
  log "Using portable runtime node=$node_version npm=$npm_version"
}

ensure_required_runtime() {
  if runtime_is_compatible; then
    return
  fi

  bootstrap_portable_node_runtime

  if ! runtime_is_compatible; then
    die "Runtime still incompatible after portable Node bootstrap"
  fi
}

set_default_env_values() {
  export NODE_ENV="${NODE_ENV:-production}"
  export ADMIN_JWT_SECRET="${ADMIN_JWT_SECRET:-ci-admin-jwt-secret-should-be-32-chars-0001}"
  export ADMIN_DASH_SECRET="${ADMIN_DASH_SECRET:-ci-admin-dash-secret-0001}"
  export SECURITY_ENC_KEY_HEX="${SECURITY_ENC_KEY_HEX:-0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef}"
  export SESSION_SECRET="${SESSION_SECRET:-ci-session-secret-should-be-32-chars-0001}"
  export SECURITY_PEPPER="${SECURITY_PEPPER:-ci-security-pepper}"
  export NEXT_PUBLIC_SITE_URL="${NEXT_PUBLIC_SITE_URL:-https://example.test}"
  export ALLOWED_ORIGINS="${ALLOWED_ORIGINS:-https://example.test}"
  export VALID_API_KEYS="${VALID_API_KEYS:-0123456789abcdef0123456789abcdef}"
  export INTERNAL_API_KEYS="${INTERNAL_API_KEYS:-fedcba9876543210fedcba9876543210}"
  export ALERT_WEBHOOK_TOKEN="${ALERT_WEBHOOK_TOKEN:-ci-alert-webhook-token}"

  if [[ -z "${DATABASE_URL:-}" ]]; then
    export DATABASE_URL="postgresql://${LOCAL_PG_USER}:${LOCAL_PG_PASSWORD}@127.0.0.1:${LOCAL_PG_PORT}/${LOCAL_PG_DB}"
  fi
}

database_reachable() {
  local db_url="$1"
  DATABASE_URL_TO_TEST="$db_url" node --input-type=module <<'NODE'
import net from 'node:net';

const raw = process.env.DATABASE_URL_TO_TEST;

try {
  const parsed = new URL(raw);
  const host = parsed.hostname;
  const port = Number(parsed.port || '5432');

  if (!host || !Number.isFinite(port)) {
    process.exit(1);
  }

  const socket = net.createConnection({ host, port });
  const timer = setTimeout(() => {
    socket.destroy();
    process.exit(1);
  }, 2500);

  socket.once('connect', () => {
    clearTimeout(timer);
    socket.end();
    process.exit(0);
  });

  socket.once('error', () => {
    clearTimeout(timer);
    process.exit(1);
  });
} catch {
  process.exit(1);
}
NODE
}

cleanup_local_postgres() {
  if (( STARTED_LOCAL_PG == 0 )); then
    return
  fi

  if command -v docker >/dev/null 2>&1; then
    log "Stopping local CI postgres container: $LOCAL_PG_CONTAINER"
    docker rm -f "$LOCAL_PG_CONTAINER" >/dev/null 2>&1 || true
  fi
}

start_local_postgres_if_needed() {
  if database_reachable "$DATABASE_URL"; then
    log "DATABASE_URL reachable; using existing database"
    return
  fi

  command -v docker >/dev/null 2>&1 || die "DATABASE_URL unreachable and Docker is unavailable to provision local CI postgres"
  docker info >/dev/null 2>&1 || die "DATABASE_URL unreachable and Docker daemon is not running"

  log "DATABASE_URL unreachable, provisioning local CI postgres on port $LOCAL_PG_PORT"

  if docker ps -a --format '{{.Names}}' | grep -Fx "$LOCAL_PG_CONTAINER" >/dev/null 2>&1; then
    docker rm -f "$LOCAL_PG_CONTAINER" >/dev/null 2>&1 || true
  fi

  docker run -d --rm \
    --name "$LOCAL_PG_CONTAINER" \
    -e POSTGRES_USER="$LOCAL_PG_USER" \
    -e POSTGRES_PASSWORD="$LOCAL_PG_PASSWORD" \
    -e POSTGRES_DB="$LOCAL_PG_DB" \
    -p "${LOCAL_PG_PORT}:5432" \
    postgres:16-alpine >/dev/null

  STARTED_LOCAL_PG=1

  local attempts=0
  until database_reachable "$DATABASE_URL"; do
    attempts=$((attempts + 1))
    if (( attempts >= 45 )); then
      docker logs --tail 200 "$LOCAL_PG_CONTAINER" || true
      die "Local CI postgres did not become reachable in time"
    fi
    sleep 2
  done

  log "Local CI postgres is ready"
}

run_check_sequence() {
  (
    cd "$REPO_ROOT"
    bash ./scripts/system-orchestrator.sh check --profile production --no-docker-fallback
    bash ./scripts/system-orchestrator.sh migrate --profile production --no-docker-fallback
    npm run ci:test:db
    bash ./scripts/system-orchestrator.sh build --profile production --no-docker-fallback
  )
}

main() {
  resolve_required_node_major
  ensure_required_runtime

  trap cleanup_local_postgres EXIT

  set_default_env_values
  start_local_postgres_if_needed
  run_check_sequence

  log "ci orchestrator check completed successfully"
}

main "$@"
