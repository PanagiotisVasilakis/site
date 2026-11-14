#!/usr/bin/env bash
# Runs one scheduled job of the production host with the guard rails that the plain cron lines
# in scripts/README.md ("Worker schedule") do not have:
#   - one run at a time (flock) and a hard time limit (timeout); a container that outlives its
#     timeout is removed, because killing the docker CLI does not stop the container
#   - the job's output and the verdict go to journald (logger -t qr-<name>), and the job's exit
#     status is the exit status of this script
#   - an optional heartbeat ping (dead-man's switch): GET <url> after a success, GET <url>/fail
#     after a failure. A skipped run, or a host where cron stopped, sends nothing, and that
#     silence is what the monitor alerts on.
#
# Usage:
#   run-worker.sh outbox | operations
#   run-worker.sh --name NAME [--timeout SECONDS] [--container NAME] -- COMMAND [ARG...]
#
#   outbox, operations   the one-off services of docker/docker-compose.prod.yml
#                        (timeouts 55 s and 280 s, as in scripts/README.md)
#   --name NAME          job name for the log tag, the lock file and the heartbeat setting
#   --timeout SECONDS    time limit of the job (default 300 for a command)
#   --container NAME     container to remove when the job fails or times out
#
# Settings (process environment first, then the host env file docker/.env, see
# deploy/host/README.md):
#   HEALTHCHECK_URL_<NAME>   heartbeat URL of the job, e.g. HEALTHCHECK_URL_OUTBOX
#   QR_BASE_DIR, QR_HOST_ENV, QR_LOCK_DIR   locations, for tests and non-standard layouts
#
# Exit status: that of the job (124 after a timeout); 0 when the run was skipped because the
# previous run still holds the lock; 2 for a usage error; 4 for a configuration error.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
base_dir=${QR_BASE_DIR:-$(cd "$script_dir/../.." && pwd)}
compose_file=$base_dir/docker/docker-compose.prod.yml
host_env=${QR_HOST_ENV:-$base_dir/docker/.env}
lock_dir=${QR_LOCK_DIR:-/run/lock}

usage() {
  cat <<'USAGE'
Usage:
  run-worker.sh outbox | operations
  run-worker.sh --name NAME [--timeout SECONDS] [--container NAME] -- COMMAND [ARG...]
USAGE
}

# Prints the value of KEY from a Docker-style env file (empty when absent). The last assignment
# wins. One pair of surrounding quotes is removed; nothing is interpolated or executed, so use
# plain values for the settings that this script reads.
env_value() {
  local file=$1 key=$2 line value='' found=0
  [ -r "$file" ] || return 0
  while IFS= read -r line || [ -n "$line" ]; do
    line=${line%$'\r'}
    case $line in
      "$key="*) value=${line#"$key="}; found=1 ;;
    esac
  done < "$file"
  [ "$found" = 1 ] || return 0
  value=${value#"${value%%[![:space:]]*}"}
  case $value in
    \'*) value=${value#\'}; value=${value%%\'*} ;;
    \"*) value=${value#\"}; value=${value%%\"*} ;;
    *) value=${value%%[[:space:]]\#*}; value=${value%"${value##*[![:space:]]}"} ;;
  esac
  printf '%s' "$value"
}

# setting KEY: the process environment wins over the host env file.
setting() {
  local key=$1 value=${!1-}
  if [ -z "$value" ]; then value=$(env_value "$host_env" "$key"); fi
  printf '%s' "$value"
}

name=''
service=''
timeout_s=''
container=''
case ${1-} in
  outbox)     name=outbox; service=outbox; timeout_s=55; shift ;;
  operations) name=operations; service=operations; timeout_s=280; shift ;;
esac
command_line=()
while (($#)); do
  case $1 in
    --name) [ $# -ge 2 ] || { usage >&2; exit 2; }; name=$2; shift 2 ;;
    --timeout) [ $# -ge 2 ] || { usage >&2; exit 2; }; timeout_s=$2; shift 2 ;;
    --container) [ $# -ge 2 ] || { usage >&2; exit 2; }; container=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    --) shift; command_line=("$@"); break ;;
    *) usage >&2; exit 2 ;;
  esac
done

if [ -n "$service" ]; then
  [ ${#command_line[@]} -eq 0 ] || { usage >&2; exit 2; }
  [ -n "$container" ] || container=qr-$name-run
  command_line=(docker compose -f "$compose_file" --profile ops run -T --rm --no-deps --name "$container" "$service")
else
  [ -n "$name" ] && [ ${#command_line[@]} -gt 0 ] || { usage >&2; exit 2; }
  [ -n "$timeout_s" ] || timeout_s=300
fi
[[ $name =~ ^[a-z][a-z0-9-]{0,30}$ ]] || { echo "run-worker: invalid job name" >&2; exit 2; }
[[ $timeout_s =~ ^[0-9]{1,5}$ ]] && [ "$timeout_s" -ge 1 ] || { echo "run-worker: invalid timeout" >&2; exit 2; }
[ -z "$container" ] || [[ $container =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] || { echo "run-worker: invalid container name" >&2; exit 2; }

tag=qr-$name

# log PRIORITY MESSAGE: journald through syslog; warnings and errors also go to stderr.
log() {
  local priority=$1
  shift
  logger -t "$tag" -p "user.$priority" -- "$*" 2>/dev/null || true
  case $priority in
    warning|err) printf '%s: %s\n' "$tag" "$*" >&2 ;;
  esac
}

# The heartbeat URL is a capability, so it never appears on a command line, in a log line or in an
# error message: curl reads it from its configuration on stdin. Only https is accepted (plain
# http only for the local host); a rejected setting is logged and the job still runs.
heartbeat_var=HEALTHCHECK_URL_$(printf '%s' "$name" | tr 'a-z-' 'A-Z_')
heartbeat_url=$(setting "$heartbeat_var")
if [ -n "$heartbeat_url" ]; then
  if [[ $heartbeat_url =~ [[:space:]\"\\] ]] \
    || ! [[ $heartbeat_url =~ ^(https://[^/?#]+|http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?)([/?#].*)?$ ]]; then
    log err "heartbeat URL ignored: $heartbeat_var must be an https URL without spaces or quotes"
    heartbeat_url=''
  fi
fi

# ping_heartbeat SUFFIX: '' for success, /fail for failure (before any query string).
ping_heartbeat() {
  [ -n "$heartbeat_url" ] || return 0
  local target=$heartbeat_url path query status=0
  if [ -n "$1" ]; then
    path=${heartbeat_url%%\?*}
    query=${heartbeat_url#"$path"}
    target=${path%/}$1$query
  fi
  printf 'url = "%s"\n' "$target" \
    | curl --silent --fail --max-time 10 --retry 1 --retry-delay 2 --output /dev/null --config - 2>/dev/null \
    || status=$?
  if [ "$status" -ne 0 ]; then log warning "heartbeat ping failed (curl exit status $status)"; fi
}

exec 9>"$lock_dir/$tag.lock" || { log err "cannot open the lock file in $lock_dir"; exit 4; }
if ! flock -n 9; then
  log notice "skipped: the previous run still holds the lock"
  exit 0
fi

out=$(mktemp "${TMPDIR:-/tmp}/$tag.XXXXXX")
trap 'rm -f "$out"' EXIT

# A container that an earlier timeout left behind would block the name (and the next run).
if [ -n "$container" ]; then docker rm -f "$container" >/dev/null 2>&1 || true; fi

start=$SECONDS
status=0
timeout --kill-after=5 "$timeout_s" "${command_line[@]}" >"$out" 2>&1 9>&- || status=$?
elapsed=$((SECONDS - start))

if [ "$status" -ne 0 ] && [ -n "$container" ]; then
  docker rm -f "$container" >/dev/null 2>&1 || true
fi

if [ "$status" -eq 0 ]; then priority=info; else priority=err; fi
head -c 65536 "$out" | logger -t "$tag" -p "user.$priority" 2>/dev/null || true
if [ "$(wc -c < "$out")" -gt 65536 ]; then log warning "the output of the job was cut after 65536 bytes"; fi

# Free the lock before the ping: a slow monitor must not make the next scheduled run skip.
exec 9>&-

case $status in
  0)
    log info "ok after ${elapsed}s"
    ping_heartbeat ''
    ;;
  124)
    log err "timed out after ${timeout_s}s (exit status $status)"
    ping_heartbeat /fail
    ;;
  137)
    # timeout sends KILL after --kill-after, but an out-of-memory kill or a manual kill -9 ends
    # with 137 too: only a run that used up its time limit is called a timeout.
    if [ "$elapsed" -ge "$timeout_s" ]; then
      log err "timed out after ${timeout_s}s and had to be killed (exit status $status)"
    else
      log err "killed by SIGKILL after ${elapsed}s (exit status $status), before the time limit of ${timeout_s}s"
    fi
    ping_heartbeat /fail
    ;;
  *)
    log err "failed with exit status $status after ${elapsed}s"
    ping_heartbeat /fail
    ;;
esac
exit "$status"
