#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNTIME_DIR="$REPO_ROOT/.runtime/system"
STATE_FILE="$RUNTIME_DIR/state.env"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
APP_LOG_FILE="$RUNTIME_DIR/app.log"
MIGRATION_LOCK_FILE="$RUNTIME_DIR/migrate.lock"

PROFILE="production"
STRICT_MODE=0
DOCKER_FALLBACK=1
SKIP_BUILD=0
SKIP_MIGRATE=0
SKIP_VERIFY=0
FOREGROUND=0
FORCE_INSTALL=0
VERBOSE=0
LOG_FOLLOW=0
START_TIMEOUT=120
DB_ONLY_MODE=0

SUBCOMMAND=""
COMPOSE_IMPL=""

DB_MODE=""
DB_COMPOSE_FILE=""
DB_SERVICE=""
DB_CONTAINER=""
DB_LOCAL_URL=""

usage() {
  cat <<'USAGE'
Usage: scripts/system-orchestrator.sh <command> [options]

Commands:
  bootstrap   Validate env, install deps if needed, prepare DB, run migrations, optional build
  up          Run bootstrap, then start app and verify health/metrics
  down        Stop app and stop local fallback DB (if started by orchestrator)
  restart     down + up
  status      Print app and DB status summary
  logs        Print app logs (or follow with --follow)
  verify      Verify health and metrics endpoints on a running app
  build       Run production build pipeline after environment and DB readiness checks
  migrate     Run Prisma generate + migrate deploy with lock and retries
  check       Validate prerequisites and environment contract without starting services

Options:
  --profile <production|development|test>  Runtime profile (default: production)
  --strict                                 Add lint + typecheck + tests before build/start
  --db-only                                Validate only DB-related environment and skip app build/start requirements
  --no-docker-fallback                     Fail instead of starting local DB when DATABASE_URL is unreachable
  --skip-build                             Skip build step where applicable
  --skip-migrate                           Skip migration step where applicable
  --skip-verify                            Skip runtime endpoint verification
  --foreground                             Start app in foreground (disables post-start verify)
  --force-install                          Force npm ci even if node_modules exists
  --timeout <seconds>                      Startup verification timeout (default: 120)
  --follow                                 For logs command, follow output
  --verbose                                Verbose command tracing
  --help                                   Show this help

Examples:
  scripts/system-orchestrator.sh up --profile production
  scripts/system-orchestrator.sh up --profile development --skip-build
  scripts/system-orchestrator.sh bootstrap --profile development --db-only --skip-build --skip-migrate
  scripts/system-orchestrator.sh migrate --profile production
  scripts/system-orchestrator.sh logs --follow
USAGE
}

timestamp() {
  date '+%Y-%m-%dT%H:%M:%S%z'
}

log() {
  printf '[system] [%s] %s\n' "$(timestamp)" "$*"
}

warn() {
  printf '[system] [%s] WARNING: %s\n' "$(timestamp)" "$*" >&2
}

error() {
  printf '[system] [%s] ERROR: %s\n' "$(timestamp)" "$*" >&2
}

die() {
  local message="$1"
  local code="${2:-1}"
  error "$message"
  exit "$code"
}

trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd" 10
}

validate_profile() {
  case "$PROFILE" in
    production|development|test) ;;
    *) die "Invalid profile '$PROFILE'. Use production, development, or test." 11 ;;
  esac
}

parse_args() {
  [[ $# -ge 1 ]] || {
    usage
    exit 1
  }

  SUBCOMMAND="$1"
  shift

  case "$SUBCOMMAND" in
    bootstrap|up|down|restart|status|logs|verify|build|migrate|check) ;;
    -h|--help|help)
      usage
      exit 0
      ;;
    *)
      die "Unknown command: $SUBCOMMAND" 1
      ;;
  esac

  while [[ $# -gt 0 ]]; do
    case "$1" in
      --profile)
        PROFILE="${2:-}"
        [[ -n "$PROFILE" ]] || die "--profile requires a value"
        shift 2
        ;;
      --strict)
        STRICT_MODE=1
        shift
        ;;
      --db-only)
        DB_ONLY_MODE=1
        shift
        ;;
      --no-docker-fallback)
        DOCKER_FALLBACK=0
        shift
        ;;
      --skip-build)
        SKIP_BUILD=1
        shift
        ;;
      --skip-migrate)
        SKIP_MIGRATE=1
        shift
        ;;
      --skip-verify)
        SKIP_VERIFY=1
        shift
        ;;
      --foreground)
        FOREGROUND=1
        shift
        ;;
      --force-install)
        FORCE_INSTALL=1
        shift
        ;;
      --verbose)
        VERBOSE=1
        shift
        ;;
      --follow)
        LOG_FOLLOW=1
        shift
        ;;
      --timeout)
        START_TIMEOUT="${2:-}"
        [[ "$START_TIMEOUT" =~ ^[0-9]+$ ]] || die "--timeout requires an integer number of seconds"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1" 1
        ;;
    esac
  done

  validate_profile

  # Production must never replace its configured database with a local
  # development container. This is an invariant, not an opt-out flag.
  if [[ "$PROFILE" == "production" ]]; then
    DOCKER_FALLBACK=0
  fi
}

parse_major_version() {
  local version="$1"
  printf '%s' "$version" | sed 's/^v//' | cut -d'.' -f1
}

normalize_semver_min() {
  local version="${1#v}"
  local major minor patch
  IFS='.' read -r major minor patch _ <<< "$version"
  minor="${minor:-0}"
  patch="${patch:-0}"
  patch="${patch%%[^0-9]*}"
  printf '%s.%s.%s' "$major" "$minor" "${patch:-0}"
}

version_at_least() {
  local current="$1"
  local required="$2"

  node --input-type=module - "$current" "$required" <<'NODE'
function parseVersion(raw) {
  const match = String(raw).trim().replace(/^v/, '').match(/^(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!match) {
    process.exit(2);
  }
  return [Number(match[1]), Number(match[2] ?? 0), Number(match[3] ?? 0)];
}

const current = parseVersion(process.argv[2]);
const required = parseVersion(process.argv[3]);

for (let i = 0; i < 3; i += 1) {
  if (current[i] > required[i]) process.exit(0);
  if (current[i] < required[i]) process.exit(1);
}
process.exit(0);
NODE
}

package_engine_min() {
  local engine_name="$1"

  node --input-type=module - "$REPO_ROOT/package.json" "$engine_name" <<'NODE'
import fs from 'node:fs';

const packagePath = process.argv[2];
const engineName = process.argv[3];
const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const engine = pkg.engines?.[engineName] ?? '';
const match = String(engine).match(/>=\s*([0-9]+(?:\.[0-9]+){0,2})/);
process.stdout.write(match?.[1] ?? '');
NODE
}

check_node_and_npm_versions() {
  require_cmd node
  require_cmd npm

  local current_node
  local required_node=""
  local current_npm required_npm=""

  current_node="$(node -v)"

  if [[ -f "$REPO_ROOT/.nvmrc" ]]; then
    required_node="$(normalize_semver_min "$(tr -d '[:space:]' < "$REPO_ROOT/.nvmrc")")"
    if ! version_at_least "$current_node" "$required_node"; then
      die "Node $required_node+ required by .nvmrc, found $current_node" 12
    fi
  fi

  current_npm="$(npm -v)"
  required_npm="$(package_engine_min npm)"
  if [[ -n "$required_npm" ]] && ! version_at_least "$current_npm" "$required_npm"; then
    die "npm $required_npm+ is required, found $current_npm" 12
  fi

  log "Runtime check passed (node: $current_node, npm: $current_npm)"
}

resolve_compose_impl() {
  if [[ -n "$COMPOSE_IMPL" ]]; then
    return
  fi

  if docker compose version >/dev/null 2>&1; then
    COMPOSE_IMPL="docker compose"
    return
  fi
  if command -v docker-compose >/dev/null 2>&1; then
    COMPOSE_IMPL="docker-compose"
    return
  fi

  die "Docker Compose is required for fallback DB startup but was not found" 13
}

compose() {
  resolve_compose_impl
  if [[ "$COMPOSE_IMPL" == "docker compose" ]]; then
    docker compose "$@"
  else
    docker-compose "$@"
  fi
}

env_candidates() {
  case "$PROFILE" in
    production)
      # Never load developer-local overrides in production mode.
      printf '%s\n' ".env.production.local" ".env.production" ".env"
      ;;
    development)
      printf '%s\n' ".env.development.local" ".env.local" ".env.development" ".env"
      ;;
    test)
      printf '%s\n' ".env.test.local" ".env.test" ".env"
      ;;
  esac
}

set_env_if_unset() {
  local key="$1"
  local value="$2"
  if [[ -z "${!key:-}" ]]; then
    export "$key=$value"
  fi
}

load_env_file_if_present() {
  local file_path="$1"
  [[ -f "$file_path" ]] || return 0

  log "Loading env file: ${file_path#$REPO_ROOT/}"

  local raw line key value first_char last_char
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    line="${raw%$'\r'}"
    line="$(trim "$line")"

    [[ -z "$line" ]] && continue
    [[ "$line" == \#* ]] && continue

    if [[ "$line" == export\ * ]]; then
      line="${line#export }"
    fi

    [[ "$line" == *=* ]] || continue

    key="$(trim "${line%%=*}")"
    value="$(trim "${line#*=}")"

    if [[ -z "$key" ]]; then
      continue
    fi

    if [[ ${#value} -ge 2 ]]; then
      first_char="${value:0:1}"
      last_char="${value: -1}"
      if [[ "$first_char" == '"' && "$last_char" == '"' ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "$first_char" == "'" && "$last_char" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi

    set_env_if_unset "$key" "$value"
  done < "$file_path"
}

load_environment() {
  local rel
  while IFS= read -r rel; do
    [[ -n "$rel" ]] || continue
    load_env_file_if_present "$REPO_ROOT/$rel"
  done < <(env_candidates)
}

maybe_ensure_pepper() {
  if [[ -n "${SECURITY_ENC_KEY_HEX:-}" && "${SECURITY_ENC_KEY_HEX}" =~ ^[0-9a-fA-F]{64}$ ]]; then
    return
  fi

  if [[ "$PROFILE" == "production" ]]; then
    die "SECURITY_ENC_KEY_HEX missing or invalid; production configuration is never auto-repaired" 14
  fi

  warn "SECURITY_ENC_KEY_HEX missing or invalid; running npm run ensure-pepper"
  (
    cd "$REPO_ROOT"
    npm run ensure-pepper
  )

  unset SECURITY_ENC_KEY_HEX || true
  unset SECURITY_PEPPER || true
  load_environment
}

is_valid_url() {
  local value="$1"
  node --input-type=module -e "try { new URL(process.argv[1]); process.exit(0); } catch { process.exit(1); }" "$value"
}

is_postgres_url() {
  local value="$1"
  node --input-type=module -e "try { const protocol = new URL(process.argv[1]).protocol; process.exit(protocol === 'postgres:' || protocol === 'postgresql:' ? 0 : 1); } catch { process.exit(1); }" "$value"
}

is_exact_origin() {
  local value="$1"
  node --input-type=module -e "try { const url = new URL(process.argv[1]); process.exit(url.origin === process.argv[1] ? 0 : 1); } catch { process.exit(1); }" "$value"
}

validate_environment_contract() {
  local failed=0

  if (( DB_ONLY_MODE )); then
    if [[ -n "${DATABASE_URL:-}" ]] && ! is_postgres_url "$DATABASE_URL"; then
      error "DATABASE_URL must be a valid postgres or postgresql URL"
      failed=1
    fi

    if (( failed )); then
      die "Environment validation failed" 14
    fi

    log "Environment contract validation passed (db-only mode)"
    return
  fi

  if [[ -z "${DATABASE_URL:-}" ]]; then
    error "DATABASE_URL is required"
    failed=1
  elif ! is_postgres_url "$DATABASE_URL"; then
    error "DATABASE_URL must be a valid postgres or postgresql URL"
    failed=1
  fi

  if [[ -z "${ADMIN_JWT_SECRET:-}" || ${#ADMIN_JWT_SECRET} -lt 32 ]]; then
    error "ADMIN_JWT_SECRET must be at least 32 characters"
    failed=1
  fi

  if [[ -z "${ADMIN_DASH_SECRET:-}" || ${#ADMIN_DASH_SECRET} -lt 20 ]]; then
    error "ADMIN_DASH_SECRET must be at least 20 characters"
    failed=1
  fi

  if [[ -z "${GUEST_JWT_SECRET:-}" || ${#GUEST_JWT_SECRET} -lt 32 ]]; then
    error "GUEST_JWT_SECRET must be at least 32 characters"
    failed=1
  fi

  if [[ -z "${SECURITY_ENC_KEY_HEX:-}" || ! "${SECURITY_ENC_KEY_HEX}" =~ ^[0-9a-fA-F]{64}$ ]]; then
    error "SECURITY_ENC_KEY_HEX must be exactly 64 hex characters"
    failed=1
  fi

  if [[ -z "${SECURITY_PEPPER:-}" || ${#SECURITY_PEPPER} -lt 16 ]]; then
    error "SECURITY_PEPPER must be at least 16 characters"
    failed=1
  fi

  if [[ -z "${SESSION_SECRET:-}" || ${#SESSION_SECRET} -lt 32 ]]; then
    error "SESSION_SECRET must be at least 32 characters"
    failed=1
  fi

  if [[ -z "${GUEST_WIFI_NETWORK:-}" ]]; then
    error "GUEST_WIFI_NETWORK is required"
    failed=1
  fi

  if [[ -z "${GUEST_WIFI_PASSWORD:-}" || ${#GUEST_WIFI_PASSWORD} -lt 8 ]]; then
    error "GUEST_WIFI_PASSWORD must be at least 8 characters"
    failed=1
  fi

  if [[ "$PROFILE" == "production" && -z "${NEXT_PUBLIC_SITE_URL:-}" ]]; then
    error "NEXT_PUBLIC_SITE_URL is required in production"
    failed=1
  elif [[ -n "${NEXT_PUBLIC_SITE_URL:-}" ]] && ! is_valid_url "$NEXT_PUBLIC_SITE_URL"; then
    error "NEXT_PUBLIC_SITE_URL is not a valid URL"
    failed=1
  elif [[ "$PROFILE" == "production" && -n "${NEXT_PUBLIC_SITE_URL:-}" && "$NEXT_PUBLIC_SITE_URL" != https://* ]]; then
    if [[ "${CI:-false}" != "true" || ! "$NEXT_PUBLIC_SITE_URL" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
      error "NEXT_PUBLIC_SITE_URL must use HTTPS in production"
      failed=1
    fi
  fi
  if [[ -n "${BUILD_SITE_URL:-}" && "${NEXT_PUBLIC_SITE_URL:-}" != "$BUILD_SITE_URL" ]]; then
    error "NEXT_PUBLIC_SITE_URL does not match the URL compiled into this image"
    failed=1
  fi

  local configured_origin
  local -a configured_origins configured_keys
  IFS=',' read -r -a configured_origins <<< "${ALLOWED_ORIGINS:-}"
  for configured_origin in "${configured_origins[@]}"; do
    configured_origin="$(trim "$configured_origin")"
    [[ -n "$configured_origin" ]] || continue
    if ! is_exact_origin "$configured_origin"; then
      error "ALLOWED_ORIGINS contains an invalid origin"
      failed=1
    elif [[ "$PROFILE" == "production" && "$configured_origin" != https://* ]]; then
      if [[ "${CI:-false}" != "true" || ! "$configured_origin" =~ ^http://(localhost|127\.0\.0\.1)(:[0-9]+)?$ ]]; then
        error "ALLOWED_ORIGINS must use HTTPS in production"
        failed=1
      fi
    fi
  done

  local api_key_env raw_key
  for api_key_env in VALID_API_KEYS INTERNAL_API_KEYS METRICS_WRITE_API_KEYS; do
    [[ -n "${!api_key_env:-}" ]] || continue
    IFS=',' read -r -a configured_keys <<< "${!api_key_env}"
    for raw_key in "${configured_keys[@]}"; do
      raw_key="$(trim "$raw_key")"
      if [[ ! "$raw_key" =~ ^[A-Za-z0-9]{32,64}$ ]]; then
        error "$api_key_env contains an invalid key"
        failed=1
      fi
    done
  done

  if [[ "$PROFILE" == "production" && ( -z "${CLAIM_TOKEN_PEPPER:-}" || ${#CLAIM_TOKEN_PEPPER} -lt 32 ) ]]; then
    error "CLAIM_TOKEN_PEPPER must be at least 32 characters in production"
    failed=1
  fi

  local proxy_mode="${TRUST_PROXY_MODE:-none}"
  local proxy_hops="${TRUST_PROXY_HOPS:-0}"
  if [[ ! "$proxy_mode" =~ ^(none|hops|header)$ ]]; then
    error "TRUST_PROXY_MODE must be one of: none, hops, header"
    failed=1
  elif [[ "$PROFILE" == "production" && "$proxy_mode" == "none" ]]; then
    error "TRUST_PROXY_MODE must explicitly describe the trusted production reverse proxy"
    failed=1
  fi

  if [[ ! "$proxy_hops" =~ ^[0-9]+$ ]]; then
    error "TRUST_PROXY_HOPS must be a non-negative integer"
    failed=1
  elif [[ "$proxy_mode" != "none" && "$proxy_hops" -lt 1 ]]; then
    error "TRUST_PROXY_HOPS must be at least 1 when proxy trust is enabled"
    failed=1
  fi

  if [[ "$proxy_mode" == "header" && ! "${CLIENT_IP_HEADER:-}" =~ ^(cf-connecting-ip|x-real-ip)$ ]]; then
    error "CLIENT_IP_HEADER must be cf-connecting-ip or x-real-ip in header proxy mode"
    failed=1
  fi

  local url_key token_key url_value token_value
  for url_key in BOOKING_REQUEST_WEBHOOK_URL CHECKIN_REQUEST_WEBHOOK_URL; do
    if [[ "$url_key" == "BOOKING_REQUEST_WEBHOOK_URL" ]]; then
      token_key="BOOKING_REQUEST_WEBHOOK_TOKEN"
    else
      token_key="CHECKIN_REQUEST_WEBHOOK_TOKEN"
    fi
    url_value="${!url_key:-}"
    token_value="${!token_key:-}"

    if [[ -n "$url_value" ]] && ! is_valid_url "$url_value"; then
      error "$url_key is not a valid URL"
      failed=1
    fi
    if [[ -n "$url_value" && ${#token_value} -lt 20 ]]; then
      error "$token_key must be at least 20 characters when $url_key is configured"
      failed=1
    fi
    if [[ "$PROFILE" == "production" && -n "$url_value" && "$url_value" != https://* ]]; then
      error "$url_key must use HTTPS in production"
      failed=1
    fi
  done

  if [[ -n "${ALERT_WEBHOOK_URL:-}" ]] && ! is_valid_url "$ALERT_WEBHOOK_URL"; then
    error "ALERT_WEBHOOK_URL is not a valid URL"
    failed=1
  fi
  if [[ "$PROFILE" == "production" && -n "${ALERT_WEBHOOK_URL:-}" && "$ALERT_WEBHOOK_URL" != https://* ]]; then
    error "ALERT_WEBHOOK_URL must use HTTPS in production"
    failed=1
  fi
  if [[ -n "${ALERT_WEBHOOK_TOKEN:-}" && ${#ALERT_WEBHOOK_TOKEN} -lt 20 ]]; then
    error "ALERT_WEBHOOK_TOKEN must be at least 20 characters"
    failed=1
  fi
  if [[ "${ALERT_WEBHOOK_REQUIRED:-0}" == "1" && -z "${ALERT_WEBHOOK_URL:-}" ]]; then
    error "ALERT_WEBHOOK_URL is required when ALERT_WEBHOOK_REQUIRED=1"
    failed=1
  fi
  if [[ ! "${ALERT_WEBHOOK_REQUIRED:-0}" =~ ^(0|1)$ ]]; then
    error "ALERT_WEBHOOK_REQUIRED must be 0 or 1"
    failed=1
  fi

  if [[ -n "${RATE_LIMIT_BACKEND:-}" && "${RATE_LIMIT_BACKEND}" != "redis" ]]; then
    error "RATE_LIMIT_BACKEND must be redis when configured"
    failed=1
  elif [[ "${RATE_LIMIT_BACKEND:-}" == "redis" ]]; then
    if [[ -z "${UPSTASH_REDIS_REST_URL:-}" ]] || ! is_valid_url "$UPSTASH_REDIS_REST_URL"; then
      error "UPSTASH_REDIS_REST_URL must be a valid URL for Redis rate limiting"
      failed=1
    fi
    if [[ "$PROFILE" == "production" && -n "${UPSTASH_REDIS_REST_URL:-}" && "$UPSTASH_REDIS_REST_URL" != https://* ]]; then
      error "UPSTASH_REDIS_REST_URL must use HTTPS in production"
      failed=1
    fi
    if [[ -z "${UPSTASH_REDIS_REST_TOKEN:-}" || ${#UPSTASH_REDIS_REST_TOKEN} -lt 20 ]]; then
      error "UPSTASH_REDIS_REST_TOKEN must be at least 20 characters for Redis rate limiting"
      failed=1
    fi
  fi

  if [[ "${DEV_SESSION_MINT_ENABLED:-0}" == "1" && ( -z "${DEV_SESSION_MINT_SECRET:-}" || ${#DEV_SESSION_MINT_SECRET} -lt 32 ) ]]; then
    error "DEV_SESSION_MINT_SECRET must be at least 32 characters when development session minting is enabled"
    failed=1
  fi
  if [[ ! "${DEV_SESSION_MINT_ENABLED:-0}" =~ ^(0|1)$ ]]; then
    error "DEV_SESSION_MINT_ENABLED must be 0 or 1"
    failed=1
  fi
  if [[ -n "${CRON_SECRET:-}" && ${#CRON_SECRET} -lt 32 ]]; then
    error "CRON_SECRET must be at least 32 characters"
    failed=1
  fi
  if [[ -n "${ANALYTICS_RETENTION_DAYS:-}" && ! "${ANALYTICS_RETENTION_DAYS}" =~ ^[0-9]+$ ]]; then
    error "ANALYTICS_RETENTION_DAYS must be a non-negative integer"
    failed=1
  fi

  if (( failed )); then
    die "Environment validation failed" 14
  fi

  log "Environment contract validation passed"
}

database_reachable() {
  local db_url="$1"

  DATABASE_URL_TO_TEST="$db_url" node --input-type=module <<'NODE'
import pg from 'pg';

const connectionString = process.env.DATABASE_URL_TO_TEST;
if (!connectionString) process.exit(1);

const client = new pg.Client({ connectionString, connectionTimeoutMillis: 3000 });
try {
  await client.connect();
  await client.query({ text: 'SELECT 1', query_timeout: 3000 });
  await client.end();
  process.exit(0);
} catch {
  try { await client.end(); } catch {}
  process.exit(1);
}
NODE
}

choose_fallback_database() {
  if [[ "$PROFILE" == "test" ]]; then
    DB_COMPOSE_FILE="docker/docker-compose.test-db.yml"
    DB_SERVICE="postgres-test"
    DB_CONTAINER=""
    DB_LOCAL_URL="postgresql://testuser:testpass@localhost:5434/site_test"
    return
  fi

  DB_COMPOSE_FILE="docker-compose.yml"
  DB_SERVICE="db"
  DB_CONTAINER="site-dev-db"

  local user="${POSTGRES_USER:-devuser}"
  local password="${POSTGRES_PASSWORD:-devpass}"
  local database="${POSTGRES_DB:-site_dev}"
  local port="${POSTGRES_PORT:-5433}"
  DB_LOCAL_URL="postgresql://${user}:${password}@localhost:${port}/${database}"
}

ensure_docker_available() {
  require_cmd docker
  if ! docker info >/dev/null 2>&1; then
    die "Docker daemon is not running. Start Docker and retry." 15
  fi
}

wait_for_container_ready() {
  local container="$1"
  local timeout_seconds="$2"
  local elapsed=0
  local state=""
  local health=""

  while (( elapsed < timeout_seconds )); do
    state="$(docker inspect --format '{{.State.Status}}' "$container" 2>/dev/null || true)"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container" 2>/dev/null || true)"

    if [[ "$state" == "running" && ( "$health" == "healthy" || "$health" == "none" ) ]]; then
      return 0
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  error "Timed out waiting for container $container (state: ${state:-unknown}, health: ${health:-unknown})"
  docker logs --tail 200 "$container" || true
  return 1
}

start_fallback_database() {
  if [[ "$PROFILE" == "production" ]]; then
    die "Invariant violation: local database fallback is forbidden in production" 17
  fi

  choose_fallback_database
  ensure_docker_available
  resolve_compose_impl

  log "Starting fallback database using $DB_COMPOSE_FILE"
  compose -f "$REPO_ROOT/$DB_COMPOSE_FILE" up -d "$DB_SERVICE"

  if [[ -z "$DB_CONTAINER" ]]; then
    DB_CONTAINER="$(compose -f "$REPO_ROOT/$DB_COMPOSE_FILE" ps -q "$DB_SERVICE")"
    [[ -n "$DB_CONTAINER" ]] || die "Unable to resolve fallback database container" 16
  fi

  wait_for_container_ready "$DB_CONTAINER" 90 || die "Fallback database failed to become ready" 16

  export DATABASE_URL="$DB_LOCAL_URL"
  DB_MODE="local"
  log "Using local fallback DATABASE_URL (host localhost)"
}

prepare_database() {
  if database_reachable "$DATABASE_URL"; then
    DB_MODE="managed"
    log "DATABASE_URL is reachable"
    return
  fi

  if (( DOCKER_FALLBACK == 0 )); then
    warn "DATABASE_URL is not reachable"
    die "Database unreachable and docker fallback disabled" 17
  fi

  log "DATABASE_URL is not reachable; using local Docker fallback"
  start_fallback_database

  if ! database_reachable "$DATABASE_URL"; then
    die "Fallback database started but DATABASE_URL is still unreachable" 17
  fi
}

ensure_dependencies() {
  if (( FORCE_INSTALL )) || [[ ! -d "$REPO_ROOT/node_modules" ]]; then
    log "Installing dependencies via npm ci"
    (
      cd "$REPO_ROOT"
      npm ci
    )
    return
  fi

  log "Dependencies already present (node_modules exists)"
}

run_prisma_generate() {
  log "Generating Prisma client"
  (
    cd "$REPO_ROOT"
    npm run prisma:generate
  )
}

run_migration_once() {
  if command -v flock >/dev/null 2>&1; then
    touch "$MIGRATION_LOCK_FILE"
    flock -x "$MIGRATION_LOCK_FILE" bash -lc "cd '$REPO_ROOT' && npm run prisma:migrate:deploy"
  else
    log "flock not found; running migrations without file lock"
    (
      cd "$REPO_ROOT"
      npm run prisma:migrate:deploy
    )
  fi
}

run_migrations_with_retry() {
  if (( SKIP_MIGRATE )); then
    warn "Skipping migrations due to --skip-migrate"
    return
  fi

  local attempts=3
  local attempt=1
  local backoff=2

  while (( attempt <= attempts )); do
    log "Running migrations (attempt $attempt/$attempts)"
    if run_migration_once; then
      log "Migrations completed successfully"
      return
    fi

    if (( attempt == attempts )); then
      break
    fi

    warn "Migration attempt $attempt failed. Retrying in ${backoff}s"
    sleep "$backoff"
    backoff=$((backoff * 2))
    attempt=$((attempt + 1))
  done

  die "Migrations failed after $attempts attempts" 18
}

run_strict_quality_gate_if_requested() {
  if (( STRICT_MODE == 0 )); then
    return
  fi

  log "Running strict quality gate: lint + typecheck + tests"
  (
    cd "$REPO_ROOT"
    npm run lint
    npm run typecheck
    npm test
  )
}

run_build_pipeline() {
  if (( SKIP_BUILD )); then
    warn "Skipping build due to --skip-build"
    return
  fi

  log "Running build pipeline"
  (
    cd "$REPO_ROOT"
    npm run build
  )
}

app_command_for_profile() {
  case "$PROFILE" in
    production) printf '%s' "npm start" ;;
    development) printf '%s' "npm run dev" ;;
    test) printf '%s' "npm run dev" ;;
  esac
}

set_node_env_for_profile() {
  case "$PROFILE" in
    production) export NODE_ENV="production" ;;
    development) export NODE_ENV="development" ;;
    test) export NODE_ENV="test" ;;
  esac
}

app_is_running() {
  [[ -f "$APP_PID_FILE" ]] || return 1
  local pid
  pid="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" >/dev/null 2>&1
}

write_state_value() {
  local key="$1"
  local value="$2"
  printf '%s=%q\n' "$key" "$value" >> "$STATE_FILE"
}

write_state() {
  local app_cmd="$1"
  ensure_runtime_dir

  : > "$STATE_FILE"
  write_state_value "PROFILE" "$PROFILE"
  write_state_value "DB_MODE" "${DB_MODE:-managed}"
  write_state_value "DB_COMPOSE_FILE" "${DB_COMPOSE_FILE:-}"
  write_state_value "DB_SERVICE" "${DB_SERVICE:-}"
  write_state_value "DB_CONTAINER" "${DB_CONTAINER:-}"
  write_state_value "APP_COMMAND" "$app_cmd"
  write_state_value "APP_LOG_FILE" "$APP_LOG_FILE"
  write_state_value "STARTED_AT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}

load_state() {
  [[ -f "$STATE_FILE" ]] || return 1
  # shellcheck disable=SC1090
  source "$STATE_FILE"
  return 0
}

start_app() {
  local app_cmd
  app_cmd="$(app_command_for_profile)"

  set_node_env_for_profile
  ensure_runtime_dir

  if app_is_running; then
    die "Application already running with PID $(cat "$APP_PID_FILE")" 19
  fi

  if (( FOREGROUND )); then
    warn "Starting in foreground; runtime verification is skipped"
    write_state "$app_cmd"
    (
      cd "$REPO_ROOT"
      exec bash -lc "$app_cmd"
    )
    return 0
  fi

  : > "$APP_LOG_FILE"

  (
    cd "$REPO_ROOT"
    nohup bash -lc "$app_cmd" >> "$APP_LOG_FILE" 2>&1 &
    echo $! > "$APP_PID_FILE"
  )

  local pid
  pid="$(cat "$APP_PID_FILE")"
  if ! kill -0 "$pid" >/dev/null 2>&1; then
    tail -n 80 "$APP_LOG_FILE" || true
    die "Application failed to start" 19
  fi

  write_state "$app_cmd"
  log "Application started (pid: $pid)"
  log "App log file: ${APP_LOG_FILE#$REPO_ROOT/}"
}

live_url() {
  local port="${PORT:-3000}"
  printf '%s' "http://127.0.0.1:${port}/api/health/live"
}

ready_url() {
  local port="${PORT:-3000}"
  printf '%s' "http://127.0.0.1:${port}/api/health/ready"
}

public_page_url() {
  local port="${PORT:-3000}"
  printf '%s' "http://127.0.0.1:${port}/en"
}

metrics_url() {
  local port="${PORT:-3000}"
  printf '%s' "http://127.0.0.1:${port}/api/metrics"
}

wait_for_runtime() {
  require_cmd curl

  local live ready page
  live="$(live_url)"
  ready="$(ready_url)"
  page="$(public_page_url)"
  local elapsed=0
  local live_code="" ready_code="" page_code=""

  while (( elapsed < START_TIMEOUT )); do
    live_code="$(curl -s -o /dev/null -w '%{http_code}' "$live" || true)"
    ready_code="$(curl -s -o /dev/null -w '%{http_code}' "$ready" || true)"
    page_code="$(curl -s -o /dev/null -w '%{http_code}' "$page" || true)"
    if [[ "$live_code" == "200" && "$ready_code" == "200" && "$page_code" == "200" ]]; then
      log "Runtime endpoints are ready (live, ready, public page)"
      return 0
    fi

    sleep 2
    elapsed=$((elapsed + 2))
  done

  error "Runtime did not become ready in ${START_TIMEOUT}s (live=${live_code:-none}, ready=${ready_code:-none}, page=${page_code:-none})"
  tail -n 120 "$APP_LOG_FILE" || true
  return 1
}

first_csv_value() {
  local csv="$1"
  local first="${csv%%,*}"
  trim "$first"
}

verify_metrics_endpoint() {
  require_cmd curl

  local url
  url="$(metrics_url)"
  local code=""

  if [[ -n "${VALID_API_KEYS:-}" ]]; then
    local key
    key="$(first_csv_value "$VALID_API_KEYS")"
    if [[ -n "$key" ]]; then
      code="$(curl -s -o /dev/null -w '%{http_code}' -H "x-api-key: $key" "$url" || true)"
      if [[ "$code" == "200" ]]; then
        log "Metrics endpoint verification passed with API key"
        return 0
      fi
      error "Metrics endpoint returned $code with API key"
      return 1
    fi
  fi

  code="$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)"
  case "$code" in
    200|401|403)
      log "Metrics endpoint is reachable (HTTP $code)"
      return 0
      ;;
    *)
      error "Metrics endpoint verification failed (HTTP ${code:-none})"
      return 1
      ;;
  esac
}

verify_runtime() {
  wait_for_runtime || die "Runtime verification failed: live/ready/page checks did not pass" 20
  verify_metrics_endpoint || die "Runtime verification failed: metrics endpoint check failed" 20
  log "Runtime verification passed"
}

stop_app() {
  if [[ ! -f "$APP_PID_FILE" ]]; then
    warn "No app PID file found; nothing to stop"
    return
  fi

  local pid
  pid="$(cat "$APP_PID_FILE" 2>/dev/null || true)"
  if [[ -z "$pid" ]]; then
    log "App PID file was empty; removing stale PID file"
    rm -f "$APP_PID_FILE"
    return
  fi

  if ! kill -0 "$pid" >/dev/null 2>&1; then
    log "App PID $pid not running; removing stale PID file"
    rm -f "$APP_PID_FILE"
    return
  fi

  log "Stopping app process $pid"
  kill "$pid" >/dev/null 2>&1 || true

  local elapsed=0
  while kill -0 "$pid" >/dev/null 2>&1; do
    if (( elapsed >= 15 )); then
      warn "App did not stop gracefully; sending SIGKILL"
      kill -9 "$pid" >/dev/null 2>&1 || true
      break
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done

  rm -f "$APP_PID_FILE"
}

stop_fallback_database_if_needed() {
  if ! load_state; then
    return
  fi

  if [[ "${DB_MODE:-}" != "local" ]]; then
    return
  fi

  if [[ -z "${DB_COMPOSE_FILE:-}" ]]; then
    warn "State indicates local DB mode but compose file is missing"
    return
  fi

  if ! command -v docker >/dev/null 2>&1; then
    warn "Docker not found; unable to stop local fallback DB"
    return
  fi

  if ! docker info >/dev/null 2>&1; then
    warn "Docker daemon is not running; unable to stop local fallback DB"
    return
  fi

  resolve_compose_impl
  log "Stopping local fallback DB (${DB_COMPOSE_FILE})"
  compose -f "$REPO_ROOT/$DB_COMPOSE_FILE" down || warn "Failed to stop fallback DB cleanly"
}

run_preflight() {
  set_node_env_for_profile
  check_node_and_npm_versions

  if (( DOCKER_FALLBACK )) && ! command -v docker >/dev/null 2>&1; then
    warn "Docker is not installed; disabling fallback DB startup"
    DOCKER_FALLBACK=0
  fi

  load_environment
  if (( DB_ONLY_MODE == 0 )); then
    maybe_ensure_pepper
  fi
  validate_environment_contract
}

run_bootstrap_sequence() {
  run_preflight

  if (( DB_ONLY_MODE )); then
    prepare_database
    log "DB-only bootstrap completed"
    return
  fi

  ensure_dependencies
  prepare_database
  run_prisma_generate
  run_migrations_with_retry
  run_strict_quality_gate_if_requested

  if [[ "$PROFILE" == "production" ]]; then
    run_build_pipeline
  else
    if (( SKIP_BUILD == 0 )); then
      log "Skipping mandatory build because profile is $PROFILE"
    fi
  fi
}

cmd_bootstrap() {
  run_bootstrap_sequence
  log "Bootstrap completed"
}

cmd_up() {
  run_bootstrap_sequence
  start_app

  if (( FOREGROUND )); then
    return
  fi

  if (( SKIP_VERIFY )); then
    warn "Skipping runtime verification due to --skip-verify"
    return
  fi

  verify_runtime
}

cmd_down() {
  stop_app
  stop_fallback_database_if_needed
  log "Shutdown complete"
}

cmd_restart() {
  cmd_down
  cmd_up
}

cmd_status() {
  local app_state="stopped"
  local profile_label="$PROFILE"

  if load_state && [[ -n "${PROFILE:-}" ]]; then
    profile_label="$PROFILE"
  fi

  if app_is_running; then
    app_state="running (pid $(cat "$APP_PID_FILE"))"
  fi

  printf 'Application: %s\n' "$app_state"
  printf 'Profile: %s\n' "$profile_label"

  if load_state; then
    printf 'Database mode: %s\n' "${DB_MODE:-unknown}"
    if [[ -n "${DB_CONTAINER:-}" && "${DB_MODE:-}" == "local" ]] && command -v docker >/dev/null 2>&1; then
      local db_status
      db_status="$(docker ps --filter "name=${DB_CONTAINER}" --format '{{.Status}}' | head -n 1 || true)"
      printf 'Fallback DB: %s (%s)\n' "${DB_CONTAINER}" "${db_status:-not running}"
    fi
  else
    printf 'Database mode: unknown (no state file)\n'
  fi

  if app_is_running; then
    if command -v curl >/dev/null 2>&1; then
      local code
      code="$(curl -s -o /dev/null -w '%{http_code}' "$(ready_url)" || true)"
      printf 'Readiness endpoint: HTTP %s\n' "${code:-unreachable}"
    else
      printf 'Health endpoint: curl not installed\n'
    fi
  fi
}

cmd_logs() {
  if [[ ! -f "$APP_LOG_FILE" ]]; then
    die "Log file not found: ${APP_LOG_FILE#$REPO_ROOT/}" 21
  fi

  if (( LOG_FOLLOW )); then
    tail -n 200 -f "$APP_LOG_FILE"
  else
    tail -n 200 "$APP_LOG_FILE"
  fi
}

cmd_verify() {
  run_preflight
  verify_runtime
}

cmd_build() {
  run_preflight
  ensure_dependencies
  prepare_database
  run_prisma_generate
  run_build_pipeline
  log "Build completed"
}

cmd_migrate() {
  run_preflight
  ensure_dependencies
  prepare_database
  run_prisma_generate
  run_migrations_with_retry
}

cmd_check() {
  run_preflight
  if database_reachable "$DATABASE_URL"; then
    log "Check passed: DATABASE_URL accepted a SQL query"
  else
    die "Check failed: DATABASE_URL did not accept a SQL query" 22
  fi
}

main() {
  ensure_runtime_dir
  parse_args "$@"

  if (( VERBOSE )); then
    set -x
  fi

  case "$SUBCOMMAND" in
    bootstrap) cmd_bootstrap ;;
    up) cmd_up ;;
    down) cmd_down ;;
    restart) cmd_restart ;;
    status) cmd_status ;;
    logs) cmd_logs ;;
    verify) cmd_verify ;;
    build) cmd_build ;;
    migrate) cmd_migrate ;;
    check) cmd_check ;;
    *) die "Unhandled command: $SUBCOMMAND" ;;
  esac
}

main "$@"
