#!/usr/bin/env bash
# Host checks for a heartbeat: free disk space, free memory and the lifetime of the TLS files
# (docs/deployment/monitoring-and-alerting.md, "Host checks"). Run it through run-worker.sh, which
# adds the lock, the journald output and the heartbeat:
#
#   */15 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh --name hostcheck --timeout 60 -- /opt/qr-city-guide/deploy/host/check-host.sh
#
# Every failed check prints one line with its numbers; the exit status is 1 when any check failed
# and 0 otherwise. Run it by hand to see all values.
#
# Settings (process environment first, then the host env file docker/.env):
#   CHECK_DISK_MAX_PERCENT   default 85: fail when a checked file system is fuller than this
#   CHECK_DISK_PATHS         default "/ /var/lib/docker" (paths that do not exist are skipped)
#   CHECK_MEM_MIN_MB         default 200: fail when less memory is available
#   CHECK_CERT_MIN_DAYS      default 60: fail when origin.crt or the origin pull CA expires sooner
#   QR_BASE_DIR, QR_HOST_ENV locations, as for the other scripts
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
base_dir=${QR_BASE_DIR:-$(cd "$script_dir/../.." && pwd)}
host_env=${QR_HOST_ENV:-$base_dir/docker/.env}

# Prints the value of KEY from a Docker-style env file (empty when absent); see backup.sh.
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

setting() {
  local key=$1 value=${!1-}
  if [ -z "$value" ]; then value=$(env_value "$host_env" "$key"); fi
  printf '%s' "${value:-${2-}}"
}

whole_number() { # NAME DEFAULT -> prints the setting, which must be a whole number
  local value
  value=$(setting "$1" "$2")
  [[ $value =~ ^[0-9]{1,6}$ ]] || { echo "$1 must be a whole number" >&2; exit 2; }
  printf '%s' "$value"
}

disk_max=$(whole_number CHECK_DISK_MAX_PERCENT 85)
mem_min=$(whole_number CHECK_MEM_MIN_MB 200)
cert_days=$(whole_number CHECK_CERT_MIN_DAYS 60)
disk_paths=$(setting CHECK_DISK_PATHS '/ /var/lib/docker')

failed=0
fail() { echo "FAIL: $*"; failed=1; }

for path in $disk_paths; do
  [ -d "$path" ] || continue
  used=$(df -P "$path" | awk 'NR==2 { gsub("%", "", $5); print $5 }')
  [[ $used =~ ^[0-9]+$ ]] || { fail "cannot read the disk usage of $path"; continue; }
  if [ "$used" -gt "$disk_max" ]; then fail "$path is ${used}% full (limit ${disk_max}%)"; fi
done

available_kb=$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)
if [[ $available_kb =~ ^[0-9]+$ ]]; then
  if [ $((available_kb / 1024)) -lt "$mem_min" ]; then
    fail "only $((available_kb / 1024)) MB of memory available (limit ${mem_min} MB)"
  fi
else
  fail "cannot read MemAvailable from /proc/meminfo"
fi

for file in "$base_dir/nginx/tls/origin.crt" "$base_dir/nginx/tls/cloudflare-origin-pull-ca.pem"; do
  [ -r "$file" ] || { fail "cannot read ${file##*/}"; continue; }
  if ! openssl x509 -checkend $((cert_days * 86400)) -noout -in "$file" >/dev/null 2>&1; then
    fail "${file##*/} expires within ${cert_days} days (or is not a certificate)"
  fi
done

if [ "$failed" -eq 0 ]; then echo "host checks ok"; fi
exit "$failed"
