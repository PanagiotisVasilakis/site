#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ORCH="$REPO_ROOT/scripts/system-orchestrator.sh"

usage() {
  cat <<'USAGE'
Usage: scripts/db-check.sh [start|check|migrate|generate|studio]

This script is a compatibility wrapper.
Maintained DB readiness logic now lives in scripts/system-orchestrator.sh.
USAGE
}

info(){ printf "[db-check] %s\n" "$*"; }
err(){ printf "[db-check] ERROR: %s\n" "$*" >&2; }

ensure_db_ready() {
  bash "$ORCH" bootstrap --profile development --db-only --skip-build --skip-migrate
}

command_name="${1:-start}"

case "$command_name" in
  start|check)
    info "Delegating to system orchestrator for DB readiness"
    ensure_db_ready
    ;;
  migrate)
    info "Delegating DB readiness to system orchestrator, then running Prisma migrate deploy"
    ensure_db_ready
    (cd "$REPO_ROOT" && npm run prisma:migrate:deploy)
    ;;
  generate)
    info "Delegating DB readiness to system orchestrator, then running Prisma generate"
    ensure_db_ready
    (cd "$REPO_ROOT" && npm run prisma:generate)
    ;;
  studio)
    info "Delegating DB readiness to system orchestrator, then launching Prisma Studio"
    ensure_db_ready
    (cd "$REPO_ROOT" && npx prisma studio --port "${PRISMA_STUDIO_PORT:-5555}")
    ;;
  -h|--help|help)
    usage
    ;;
  *)
    err "Unknown command: $command_name"
    usage
    exit 1
    ;;
esac

exit 0