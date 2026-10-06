#!/usr/bin/env bash
set -euo pipefail

# Local development orchestrator. Production runs the immutable Docker image
# (docs/architecture/deployment-target.md); this script never targets it.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RUNTIME_DIR="$REPO_ROOT/.runtime/system"
STATE_FILE="$RUNTIME_DIR/state.env"
APP_PID_FILE="$RUNTIME_DIR/app.pid"
APP_LOG_FILE="$RUNTIME_DIR/app.log"
MIGRATION_LOCK_FILE="$RUNTIME_DIR/migrate.lock"

STRICT_MODE=0
DOCKER_FALLBACK=1
SKIP_MIGRATE=0
SKIP_VERIFY=0
FORCE_INSTALL=0
VERBOSE=0
LOG_FOLLOW=0
START_TIMEOUT=120
DB_ONLY_MODE=0

SUBCOMMAND=""
COMPOSE_IMPL=""

DB_MODE=""
DB_COMPOSE_FILE="docker-compose.yml"
DB_SERVICE="db"
DB_CONTAINER="site-dev-db"
DB_LOCAL_URL=""

usage() {
  cat <<'USAGE'
Usage: scripts/system-orchestrator.sh <command> [options]

Local development only. Production runs the Docker image (see
docs/architecture/deployment-target.md).

Commands:
  bootstrap   Validate env, install deps if needed, prepare DB, run migrations
  up          Run bootstrap, then start `npm run dev` and verify health
  down        Stop the app and the local fallback DB (if this script started it)
  restart     down + up
  status      Print app and DB status summary
  logs        Print app logs (or follow with --follow)
  verify      Verify health endpoints on a running app
  migrate     Run Prisma generate + migrate deploy with lock and retries
  check       Validate prerequisites and environment without starting services

Options:
  --strict                                 Add lint + typecheck + coverage gate before start
  --db-only                                Validate only DB-related environment and skip app requirements
  --no-docker-fallback                     Fail instead of starting local DB when DATABASE_URL is unreachable
  --skip-migrate                           Skip migration step where applicable
  --skip-verify                            Skip runtime endpoint verification
  --force-install                          Force npm ci even if node_modules exists
  --timeout <seconds>                      Startup verification timeout (default: 120)
  --follow                                 For logs command, follow output
  --verbose                                Verbose command tracing
  --help                                   Show this help

Examples:
  scripts/system-orchestrator.sh up
  scripts/system-orchestrator.sh bootstrap --db-only --skip-migrate
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

ensure_runtime_dir() {
  mkdir -p "$RUNTIME_DIR"
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Required command not found: $cmd" 10
}

parse_args() {
  [[ $# -ge 1 ]] || {
    usage
    exit 1
  }

  SUBCOMMAND="$1"
  shift

  case "$SUBCOMMAND" in
    bootstrap|up|down|restart|status|logs|verify|migrate|check) ;;
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
      --skip-migrate)
        SKIP_MIGRATE=1
        shift
        ;;
      --skip-verify)
        SKIP_VERIFY=1
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

  local current_node current_npm required_node required_npm
  current_node="$(node -v)"
  required_node="$(package_engine_min node)"
  if [[ -n "$required_node" ]] && ! version_at_least "$current_node" "$required_node"; then
    die "Node $required_node+ is required, found $current_node" 12
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

# Load the development env files with the same parser and precedence as
# `next dev` (dotenv; the first file that defines a key wins; values already
# in the process environment are kept).
load_environment() {
  local exports
  exports="$(cd "$REPO_ROOT" && node --input-type=module <<'NODE'
import fs from 'node:fs';
import dotenv from 'dotenv';

const files = ['.env.development.local', '.env.local', '.env.development', '.env'];
const merged = {};
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  process.stderr.write(`[system] Loading env file: ${file}\n`);
  for (const [key, value] of Object.entries(dotenv.parse(fs.readFileSync(file)))) {
    if (!(key in merged)) merged[key] = value;
  }
}
const quote = (value) => `'${String(value).replaceAll("'", "'\\''")}'`;
for (const [key, value] of Object.entries(merged)) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(key)) continue;
  if (process.env[key] !== undefined && process.env[key] !== '') continue;
  process.stdout.write(`export ${key}=${quote(value)}\n`);
}
NODE
)"
  eval "$exports"
}

maybe_ensure_pepper() {
  if [[ -n "${SECURITY_PEPPER:-}" && ${#SECURITY_PEPPER} -ge 16 ]]; then
    return
  fi

  warn "SECURITY_PEPPER missing or invalid; running npm run ensure-pepper"
  (
    cd "$REPO_ROOT"
    npm run ensure-pepper
  )

  unset SECURITY_PEPPER || true
  load_environment
}

validate_database_url() {
  if [[ -z "${DATABASE_URL:-}" ]]; then
    fallback_database_url
    export DATABASE_URL="$DB_LOCAL_URL"
    log "DATABASE_URL not set; using the local fallback database URL"
  fi
  (cd "$REPO_ROOT" && node --input-type=module -e "try { const protocol = new URL(process.argv[1]).protocol; process.exit(protocol === 'postgres:' || protocol === 'postgresql:' ? 0 : 1); } catch { process.exit(1); }" "$DATABASE_URL") \
    || die "DATABASE_URL must be a valid postgres or postgresql URL" 14
}

database_reachable() {
  local db_url="$1"

  # Resolve `pg` from the repository, whatever the caller's working directory.
  (cd "$REPO_ROOT" && DATABASE_URL_TO_TEST="$db_url" node --input-type=module <<'NODE'
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
)
}

fallback_database_url() {
  local user="${POSTGRES_USER:-devuser}"
  local password="${POSTGRES_PASSWORD:-devpass}"
  local database="${POSTGRES_DB:-site_dev}"
  local port="${POSTGRES_PORT:-5433}"
  DB_LOCAL_URL="postgresql://${user}:${password}@localhost:${port}/${database}"
}

fallback_container_running() {
  command -v docker >/dev/null 2>&1 \
    && [[ "$(docker inspect --format '{{.State.Status}}' "$DB_CONTAINER" 2>/dev/null || true)" == "running" ]]
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
  fallback_database_url
  ensure_docker_available
  resolve_compose_impl

  log "Starting fallback database using $DB_COMPOSE_FILE"
  compose -f "$REPO_ROOT/$DB_COMPOSE_FILE" up -d "$DB_SERVICE"

  wait_for_container_ready "$DB_CONTAINER" 90 || die "Fallback database failed to become ready" 16

  export DATABASE_URL="$DB_LOCAL_URL"
  DB_MODE="local"
  log "Using local fallback DATABASE_URL (host localhost)"
}

prepare_database() {
  fallback_database_url
  if database_reachable "$DATABASE_URL"; then
    # A reachable URL that points at this script's fallback container is still
    # "local": `down` must stop it (e.g. after `npm run db:start`).
    if [[ "$DATABASE_URL" == "$DB_LOCAL_URL" ]] && fallback_container_running; then
      DB_MODE="local"
    else
      DB_MODE="managed"
    fi
    log "DATABASE_URL is reachable (${DB_MODE})"
    # Record the DB mode for every caller so `down` can stop a fallback DB
    # (start_app later overwrites this with the app command).
    write_state "none"
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
  write_state "none"
}

ensure_dependencies() {
  local missing_build_dependencies=0
  if [[ -d "$REPO_ROOT/node_modules" ]] \
    && { [[ ! -x "$REPO_ROOT/node_modules/.bin/tsx" ]] \
      || [[ ! -x "$REPO_ROOT/node_modules/.bin/prisma" ]] \
      || [[ ! -d "$REPO_ROOT/node_modules/@tailwindcss/postcss" ]]; }; then
    missing_build_dependencies=1
  fi

  if (( FORCE_INSTALL )) || [[ ! -d "$REPO_ROOT/node_modules" ]] || (( missing_build_dependencies )); then
    if (( missing_build_dependencies )); then
      warn "node_modules exists but required build dependencies are missing"
    fi
    log "Installing dependencies via npm ci"
    (
      cd "$REPO_ROOT"
      npm ci
    )
    return
  fi

  log "Dependencies already present (node_modules exists)"
}

validate_runtime_environment_contract() {
  if (( DB_ONLY_MODE )); then
    return
  fi

  log "Validating authoritative runtime environment schema"
  (
    cd "$REPO_ROOT"
    node --input-type=module <<'NODE'
import { z } from 'zod';
import { runtimeEnvSchema } from './src/lib/runtime-env-schema.js';

try {
  runtimeEnvSchema.parse(process.env);
} catch (error) {
  if (error instanceof z.ZodError) {
    console.error('[orchestrator] Authoritative runtime environment validation failed:');
    for (const issue of error.issues) {
      console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
    }
    process.exit(14);
  }
  throw error;
}
NODE
  )
  log "Authoritative runtime environment validation passed"
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

  log "Running strict quality gate: lint + typecheck + test coverage"
  (
    cd "$REPO_ROOT"
    npm run lint -- --max-warnings=0
    npm run typecheck
    npm run test:coverage
  )
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
  write_state_value "DB_MODE" "${DB_MODE:-managed}"
  write_state_value "DB_COMPOSE_FILE" "$DB_COMPOSE_FILE"
  write_state_value "DB_SERVICE" "$DB_SERVICE"
  write_state_value "DB_CONTAINER" "$DB_CONTAINER"
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
  local app_cmd="npm run dev"
  export NODE_ENV="development"
  ensure_runtime_dir

  if app_is_running; then
    die "Application already running with PID $(cat "$APP_PID_FILE")" 19
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

verify_runtime() {
  wait_for_runtime || die "Runtime verification failed: live/ready/page checks did not pass" 20
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
  rm -f "$STATE_FILE"
}

run_preflight() {
  export NODE_ENV="development"
  check_node_and_npm_versions

  if (( DOCKER_FALLBACK )) && ! command -v docker >/dev/null 2>&1; then
    warn "Docker is not installed; disabling fallback DB startup"
    DOCKER_FALLBACK=0
  fi

  load_environment
  if (( DB_ONLY_MODE == 0 )); then
    maybe_ensure_pepper
  fi
  validate_database_url
}

run_bootstrap_sequence() {
  run_preflight

  if (( DB_ONLY_MODE )); then
    prepare_database
    log "DB-only bootstrap completed"
    return
  fi

  ensure_dependencies
  validate_runtime_environment_contract
  prepare_database
  run_prisma_generate
  run_migrations_with_retry
  run_strict_quality_gate_if_requested
}

cmd_bootstrap() {
  run_bootstrap_sequence
  log "Bootstrap completed"
}

cmd_up() {
  run_bootstrap_sequence
  start_app

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

  if app_is_running; then
    app_state="running (pid $(cat "$APP_PID_FILE"))"
  fi

  printf 'Application: %s\n' "$app_state"

  if load_state; then
    printf 'Database mode: %s\n' "${DB_MODE:-unknown}"
    if [[ "${DB_MODE:-}" == "local" ]] && command -v docker >/dev/null 2>&1; then
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
  load_environment
  verify_runtime
}

cmd_migrate() {
  run_preflight
  ensure_dependencies
  validate_runtime_environment_contract
  prepare_database
  run_prisma_generate
  run_migrations_with_retry
}

cmd_check() {
  run_preflight
  if (( DB_ONLY_MODE == 0 )); then
    ensure_dependencies
    validate_runtime_environment_contract
  fi
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
    migrate) cmd_migrate ;;
    check) cmd_check ;;
    *) die "Unhandled command: $SUBCOMMAND" ;;
  esac
}

main "$@"
