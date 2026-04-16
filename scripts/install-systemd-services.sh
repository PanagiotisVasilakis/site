#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SERVICE_NAME="qr-city-guide"
APP_USER="${SUDO_USER:-${USER}}"
APP_GROUP=""
ENV_FILE=""
SKIP_BOOTSTRAP=0
NO_START=0
NO_ENABLE=0

REQUIRED_ENV_VARS=(
  DATABASE_URL
  ADMIN_JWT_SECRET
  ADMIN_DASH_SECRET
  SECURITY_ENC_KEY_HEX
  SESSION_SECRET
  SECURITY_PEPPER
)

usage() {
  cat <<'USAGE'
Usage: sudo scripts/install-systemd-services.sh [options]

Options:
  --service-name <name>     systemd base name (default: qr-city-guide)
  --app-user <user>         Linux user running the service (default: invoking user)
  --app-group <group>       Linux group running the service (default: same as app-user)
  --env-file <path>         Environment file path (default: /etc/<service>/<service>.env)
  --skip-bootstrap          Install units but skip one-time bootstrap service run
  --no-start                Do not start or restart the runtime service
  --no-enable               Do not enable runtime service on boot
  --help                    Show this help

This installer creates:
- /etc/systemd/system/<service>.service
- /etc/systemd/system/<service>-bootstrap.service
- /etc/<service>/<service>.env (if it does not exist)
USAGE
}

log() {
  printf '[systemd-install] %s\n' "$*"
}

die() {
  printf '[systemd-install] ERROR: %s\n' "$*" >&2
  exit 1
}

escape_sed() {
  printf '%s' "$1" | sed -e 's/[\/&]/\\&/g'
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --service-name)
        SERVICE_NAME="${2:-}"
        [[ -n "$SERVICE_NAME" ]] || die "--service-name requires a value"
        shift 2
        ;;
      --app-user)
        APP_USER="${2:-}"
        [[ -n "$APP_USER" ]] || die "--app-user requires a value"
        shift 2
        ;;
      --app-group)
        APP_GROUP="${2:-}"
        [[ -n "$APP_GROUP" ]] || die "--app-group requires a value"
        shift 2
        ;;
      --env-file)
        ENV_FILE="${2:-}"
        [[ -n "$ENV_FILE" ]] || die "--env-file requires a value"
        shift 2
        ;;
      --skip-bootstrap)
        SKIP_BOOTSTRAP=1
        shift
        ;;
      --no-start)
        NO_START=1
        shift
        ;;
      --no-enable)
        NO_ENABLE=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
}

assert_root() {
  if [[ "$EUID" -ne 0 ]]; then
    die "Run this installer as root (example: sudo scripts/install-systemd-services.sh)"
  fi
}

validate_inputs() {
  [[ -f "$REPO_ROOT/deploy/systemd/qr-city-guide.service" ]] || die "Missing template: deploy/systemd/qr-city-guide.service"
  [[ -f "$REPO_ROOT/deploy/systemd/qr-city-guide-bootstrap.service" ]] || die "Missing template: deploy/systemd/qr-city-guide-bootstrap.service"
  [[ -f "$REPO_ROOT/scripts/system-orchestrator.sh" ]] || die "Missing orchestrator: scripts/system-orchestrator.sh"

  id -u "$APP_USER" >/dev/null 2>&1 || die "App user does not exist: $APP_USER"

  if [[ -z "$APP_GROUP" ]]; then
    APP_GROUP="$APP_USER"
  fi
  getent group "$APP_GROUP" >/dev/null 2>&1 || die "App group does not exist: $APP_GROUP"

  if [[ -z "$ENV_FILE" ]]; then
    ENV_FILE="/etc/${SERVICE_NAME}/${SERVICE_NAME}.env"
  fi
}

create_env_file_if_missing() {
  local env_dir
  env_dir="$(dirname "$ENV_FILE")"
  mkdir -p "$env_dir"

  if [[ -f "$ENV_FILE" ]]; then
    log "Using existing env file: $ENV_FILE"
    return
  fi

  cat > "$ENV_FILE" <<'ENVFILE'
# Required environment variables for QR City Guide production service
# Fill these values before starting the service.
DATABASE_URL=
ADMIN_JWT_SECRET=
ADMIN_DASH_SECRET=
SECURITY_ENC_KEY_HEX=
SESSION_SECRET=
SECURITY_PEPPER=
NEXT_PUBLIC_SITE_URL=
ALLOWED_ORIGINS=
# Optional
VALID_API_KEYS=
METRICS_WRITE_API_KEYS=
ALERT_WEBHOOK_TOKEN=
ENVFILE

  chmod 600 "$ENV_FILE"
  chown root:root "$ENV_FILE"
  log "Created env template: $ENV_FILE"
}

render_unit() {
  local source_file="$1"
  local target_file="$2"

  sed \
    -e "s|__APP_USER__|$(escape_sed "$APP_USER")|g" \
    -e "s|__APP_GROUP__|$(escape_sed "$APP_GROUP")|g" \
    -e "s|__REPO_ROOT__|$(escape_sed "$REPO_ROOT")|g" \
    -e "s|__ENV_FILE__|$(escape_sed "$ENV_FILE")|g" \
    "$source_file" > "$target_file"
}

install_units() {
  local app_unit_target="/etc/systemd/system/${SERVICE_NAME}.service"
  local bootstrap_unit_target="/etc/systemd/system/${SERVICE_NAME}-bootstrap.service"

  render_unit "$REPO_ROOT/deploy/systemd/qr-city-guide.service" "$app_unit_target"
  render_unit "$REPO_ROOT/deploy/systemd/qr-city-guide-bootstrap.service" "$bootstrap_unit_target"

  chmod 644 "$app_unit_target" "$bootstrap_unit_target"
  log "Installed unit: $app_unit_target"
  log "Installed unit: $bootstrap_unit_target"
}

reload_systemd() {
  systemctl daemon-reload
  log "Reloaded systemd daemon"
}

run_bootstrap() {
  if (( SKIP_BOOTSTRAP )); then
    log "Skipping bootstrap service run (--skip-bootstrap)"
    return
  fi

  local var line value
  for var in "${REQUIRED_ENV_VARS[@]}"; do
    line="$(grep -E "^${var}=" "$ENV_FILE" | tail -n 1 || true)"
    value="${line#*=}"
    if [[ -z "$line" || -z "$value" ]]; then
      die "Missing required ${var} in ${ENV_FILE}. Fill required values or rerun with --skip-bootstrap."
    fi
  done

  log "Running one-time bootstrap: ${SERVICE_NAME}-bootstrap.service"
  systemctl start "${SERVICE_NAME}-bootstrap.service"
}

enable_service() {
  if (( NO_ENABLE )); then
    log "Skipping enable (--no-enable)"
    return
  fi

  systemctl enable "${SERVICE_NAME}.service"
  log "Enabled service: ${SERVICE_NAME}.service"
}

start_service() {
  if (( NO_START )); then
    log "Skipping start (--no-start)"
    return
  fi

  systemctl restart "${SERVICE_NAME}.service"
  log "Started service: ${SERVICE_NAME}.service"
}

print_next_steps() {
  cat <<EOF

Installation complete.

Service commands:
  systemctl status ${SERVICE_NAME}.service
  journalctl -u ${SERVICE_NAME}.service -f
  systemctl restart ${SERVICE_NAME}.service
  systemctl stop ${SERVICE_NAME}.service

Bootstrap command:
  systemctl start ${SERVICE_NAME}-bootstrap.service

If this was a fresh install, populate required variables in:
  ${ENV_FILE}
EOF
}

main() {
  parse_args "$@"
  assert_root
  validate_inputs
  create_env_file_if_missing
  install_units
  reload_systemd
  run_bootstrap
  enable_service
  start_service
  print_next_steps
}

main "$@"
