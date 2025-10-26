#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DOCKERD_LOG=/tmp/dockerd.log
OPEN_STUDIO=0
DO_PRISMA_MIGRATE=0
DO_PRISMA_GENERATE=0

# Parse arguments (allow multiple): migrate, generate, studio
for a in "$@"; do
  case "$a" in
    migrate|--migrate) DO_PRISMA_MIGRATE=1 ;;
    generate|--generate) DO_PRISMA_GENERATE=1 ;;
    studio|--studio) OPEN_STUDIO=1 ;;
    *) ;;
  esac
done

# Also honor env vars PRISMA_STUDIO, PRISMA_MIGRATE, PRISMA_GENERATE
if [ "${PRISMA_STUDIO:-}" = "1" ] || [ "${PRISMA_STUDIO:-}" = "true" ]; then
  OPEN_STUDIO=1
fi
if [ "${PRISMA_MIGRATE:-}" = "1" ] || [ "${PRISMA_MIGRATE:-}" = "true" ]; then
  DO_PRISMA_MIGRATE=1
fi
if [ "${PRISMA_GENERATE:-}" = "1" ] || [ "${PRISMA_GENERATE:-}" = "true" ]; then
  DO_PRISMA_GENERATE=1
fi

info(){ printf "[db-check] %s\n" "$*"; }
err(){ printf "[db-check] ERROR: %s\n" "$*" >&2; }

# Check if docker server is available
if docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then
  info "Docker daemon is already running"
else
  info "Docker daemon not running — attempting to start it (sudo may be required)"
  # Try setsid first, fallback to nohup
  if command -v setsid >/dev/null 2>&1; then
    sudo setsid dockerd >"$DOCKERD_LOG" 2>&1 & disown || true
  else
    sudo nohup dockerd >"$DOCKERD_LOG" 2>&1 & disown || true
  fi

  info "Waiting for docker to become responsive (30s timeout)"
  start_ts=$(date +%s)
  until docker info >/dev/null 2>&1; do
    sleep 1
    now_ts=$(date +%s)
    if [ $((now_ts - start_ts)) -ge 30 ]; then
      err "Docker did not start within 30s. Last 200 lines of $DOCKERD_LOG:"
      tail -n 200 "$DOCKERD_LOG" || true
      exit 2
    fi
  done
  info "Docker is now responsive"
fi

# Ensure we're in the repo root
cd "$REPO_ROOT"
# If a .env file exists in the repo root, export its variables for this script's environment.
if [ -f "$REPO_ROOT/.env" ]; then
  info "Found .env in repo root — exporting variables for this session (sensitive values hidden)"
  # Read .env line-by-line, ignore comments and blank lines, export KEY=VALUE pairs.
  while IFS= read -r line || [ -n "$line" ]; do
    # Trim leading/trailing whitespace
    line="${line#${line%%[![:space:]]*}}"
    line="${line%${line##*[![:space:]]}}"
    [ -z "$line" ] && continue
    case "$line" in
      \#*) continue ;;
    esac
    if echo "$line" | grep -q "="; then
      key="${line%%=*}"
      val="${line#*=}"
      # Remove surrounding single or double quotes
      if [[ "$val" =~ ^\".*\"$ ]] || [[ "$val" =~ ^\'.*\'$ ]]; then
        val="${val:1:$((${#val}-2))}"
      fi
      export "$key=$val"
    fi
  done < "$REPO_ROOT/.env"
  # Don't print sensitive values; just indicate presence
  if [ -n "${DATABASE_URL:-}" ]; then
    info "DATABASE_URL is set for this session"
  fi
fi
info "Running: docker-compose up -d db"
docker-compose up -d db

# Wait for container to be up / healthy
info "Waiting for 'site-dev-db' container to reach 'Up' / healthy state (60s timeout)"
start_ts=$(date +%s)
while true; do
  status=$(docker ps --filter "name=site-dev-db" --format '{{.Status}}' || true)
  if [ -n "$status" ]; then
    # If health info available, inspect it
    health=$(docker inspect --format='{{.State.Health.Status}}' site-dev-db 2>/dev/null || true)
    if [ "$health" = "healthy" ]; then
      info "site-dev-db is healthy"
      break
    fi
    # If no health check, ensure container is "Up"
    if [[ "$status" =~ ^Up ]]; then
      info "site-dev-db status: $status"
      # consider this success if it's Up (even if health check not configured)
      break
    fi
  fi
  now_ts=$(date +%s)
  if [ $((now_ts - start_ts)) -ge 60 ]; then
    err "Timeout waiting for site-dev-db to be ready. Current status: '$status'"
    info "Showing last 200 lines of container logs:"
    docker logs --tail 200 site-dev-db || true
    exit 3
  fi
  sleep 2
done

info "Container status (docker ps):"
docker ps --filter "name=site-dev-db" --format "table {{.ID}}\t{{.Names}}\t{{.Status}}\t{{.Ports}}"

info "Last 200 lines of site-dev-db logs:"
docker logs --tail 200 site-dev-db || true

if [ "$DO_PRISMA_MIGRATE" -eq 1 ]; then
  info "Running: npx prisma migrate deploy"
  if command -v npx >/dev/null 2>&1; then
    npx prisma migrate deploy || err "prisma migrate deploy failed"
  else
    err "npx not found — cannot run prisma migrate"
  fi
fi

if [ "$DO_PRISMA_GENERATE" -eq 1 ]; then
  info "Running: npx prisma generate"
  if command -v npx >/dev/null 2>&1; then
    npx prisma generate || err "prisma generate failed"
  else
    err "npx not found — cannot run prisma generate"
  fi
fi

if [ "$OPEN_STUDIO" -eq 1 ]; then
  info "Starting Prisma Studio (npx prisma studio) in background and attempting to open it in your browser"
  if command -v npx >/dev/null 2>&1; then
    # Start Prisma Studio in the background on default port 5555
    nohup npx prisma studio --port 5555 > /tmp/prisma-studio.log 2>&1 & disown || true

    # Wait for it to start responding on localhost:5555 (15s timeout)
    start_ts=$(date +%s)
    studio_url="http://localhost:5555"
    while true; do
      if command -v curl >/dev/null 2>&1; then
        curl -sSf "$studio_url" >/dev/null 2>&1 && break || true
      elif command -v wget >/dev/null 2>&1; then
        wget -q --spider "$studio_url" >/dev/null 2>&1 && break || true
      else
        # No network tester available; break and print URL
        break
      fi

      now_ts=$(date +%s)
      if [ $((now_ts - start_ts)) -ge 15 ]; then
        break
      fi
      sleep 1
    done

    # Try to open in a GUI browser if possible
    if command -v xdg-open >/dev/null 2>&1; then
      xdg-open "$studio_url" >/dev/null 2>&1 || true
    elif command -v wslview >/dev/null 2>&1; then
      wslview "$studio_url" >/dev/null 2>&1 || true
    elif command -v sensible-browser >/dev/null 2>&1; then
      sensible-browser "$studio_url" >/dev/null 2>&1 || true
    elif command -v open >/dev/null 2>&1; then
      open "$studio_url" >/dev/null 2>&1 || true
    else
      info "Prisma Studio is available at: $studio_url"
    fi
  else
    err "npx not found — cannot start Prisma Studio. Run 'npx prisma studio' manually when ready."
  fi
fi

info "Done. If you need a persistent DATABASE_URL, add it to .env or export it in your shell."

exit 0