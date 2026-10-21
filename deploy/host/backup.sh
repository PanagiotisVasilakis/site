#!/usr/bin/env bash
# Encrypted backup of the production PostgreSQL database
# (docs/deployment/backup-and-restore.md has the setup, the restore drill and the privacy points).
#
# Every run dumps the application database (pg_dump -Fc) and the role definitions
# (pg_dumpall --roles-only) from the db container of docker/docker-compose.prod.yml over its local
# socket, so no database password and no published database port are involved. Both streams are
# encrypted while they are written, so no plain text dump ever reaches the disk. The script has no
# mode without encryption, and the private key never has to be on this host.
#
# The dump runs as the bundled PostgreSQL superuser (POSTGRES_USER): the role dump needs it to read
# the password hashes. That is not the least-privilege backup role that the deployment target asks
# for; backup-and-restore.md ("Deviation from the deployment target") says so and asks the owner to
# accept it or to choose the alternative described there.
#
# Usage:
#   backup.sh                      nightly backup: dump, encrypt, prune old copies, copy off-site,
#                                  heartbeat ping (success, or <url>/fail on any failure, also
#                                  when the script is killed)
#   backup.sh --pre-migrate [--label TEXT]
#                                  the same, without the heartbeat, before a migration; TEXT
#                                  (letters, digits, . _ -) becomes part of the file name
#   backup.sh --check              checks settings, encryption, database access and the off-site
#                                  remote; creates no backup, creates and changes nothing in the
#                                  backup directory, sends no heartbeat (a short-lived private
#                                  scratch file in the temporary directory and the lock file excepted)
#
# Settings (process environment first, then the host env file docker/.env, see
# deploy/host/README.md and docs/deployment/backup-and-restore.md):
#   POSTGRES_USER, POSTGRES_DB            required; the same values as for docker compose
#   BACKUP_DIR                            default <base>/backups; an existing directory must belong to
#                                         the user who runs the backup and be closed to everybody else
#                                         (mode 0700, the script never changes the mode of a directory
#                                         it did not create); system directories are refused
#   BACKUP_ENCRYPTION                     age (default) or gpg
#   BACKUP_AGE_RECIPIENTS_FILE            public keys, one per line (default <base>/backup-recipients.txt)
#   BACKUP_GPG_RECIPIENT                  key id or fingerprint of the public key in the gpg keyring
#   BACKUP_RETENTION_DAYS                 default 14: local copies older than this are deleted
#   BACKUP_KEEP_MIN                       default 3: the newest copies are never deleted
#   BACKUP_MIN_FREE_MB                    default 1024: refuse to start with less free space
#   BACKUP_TIMEOUT_SECONDS                default 1800: limit of each dump (enforced inside the db
#                                         container too, so a stuck pg_dump does not outlive the
#                                         script) and of each off-site transfer
#   RCLONE_REMOTE                         optional off-site target, name:path (needs rclone)
#   RCLONE_RETENTION_DAYS                 optional: delete off-site copies older than this (without
#                                         it the storage provider must expire old copies)
#   HEALTHCHECK_URL                       optional heartbeat URL of the nightly backup
#   QR_BASE_DIR, QR_HOST_ENV, QR_LOCK_DIR locations, for tests and non-standard layouts
#
# Exit status:
#   0 success                          5 pre-flight failed (database, disk space, a missing tool:
#   2 usage error                        docker, flock, age, gpg or rclone)
#   3 skipped, another run is active   6 dump or encryption failed (also: a dump that is empty or
#   4 configuration error                implausibly small, although the command exited with 0)
#                                      7 off-site copy failed (the local copy exists)
#                                      8 pruning old copies failed (the backup itself succeeded)
#
# A set is the four files <name>.dump.<ext>, <name>.roles.sql.<ext> and their .sha256 files. Pruning
# counts a set as one of the BACKUP_KEEP_MIN newest only when all four exist, are not empty and the
# checksums match; a half-written or damaged set is kept (and reported) but never counted.
#
# Nothing secret is on a command line or in a log line: the log names files, sizes and durations.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C
export HOME=${HOME:-/root}

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
base_dir=${QR_BASE_DIR:-$(cd "$script_dir/../.." && pwd)}
compose_file=$base_dir/docker/docker-compose.prod.yml
host_env=${QR_HOST_ENV:-$base_dir/docker/.env}
lock_dir=${QR_LOCK_DIR:-/run/lock}
tag=qr-backup

usage() {
  cat <<'USAGE'
Usage:
  backup.sh                              nightly backup
  backup.sh --pre-migrate [--label TEXT] extra backup before a migration
  backup.sh --check                      check the settings without writing a backup
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

# setting KEY [DEFAULT]: the process environment wins over the host env file.
setting() {
  local key=$1 value=${!1-}
  if [ -z "$value" ]; then value=$(env_value "$host_env" "$key"); fi
  printf '%s' "${value:-${2-}}"
}

# log PRIORITY MESSAGE: journald through syslog; warnings, errors and (on a terminal) everything
# else also go to stderr.
log() {
  local priority=$1
  shift
  logger -t "$tag" -p "user.$priority" -- "$*" 2>/dev/null || true
  if [ -t 2 ]; then
    printf '%s\n' "$*" >&2
  else
    case $priority in
      warning|err) printf '%s: %s\n' "$tag" "$*" >&2 ;;
    esac
  fi
}

die() {
  local code=$1
  shift
  log err "$*"
  exit "$code"
}

mode=nightly
label=''
while (($#)); do
  case $1 in
    --pre-migrate) mode=pre-migrate; shift ;;
    --check) mode=check; shift ;;
    --label) [ $# -ge 2 ] || { usage >&2; exit 2; }; label=$2; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) usage >&2; exit 2 ;;
  esac
done
if [ -n "$label" ]; then
  [ "$mode" = pre-migrate ] || { usage >&2; exit 2; }
  [[ $label =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$ ]] || { echo "backup: invalid --label" >&2; exit 2; }
fi

work_files=()
scratch_dir=''
heartbeat_url=''
heartbeat_armed=0
finished_ok=0
dump_session=''

# ping_heartbeat SUFFIX: '' for success, /fail for failure (before any query string). The URL is a
# capability, so curl reads it from its configuration on stdin, never from a command line.
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

# stop_dump_sessions PATTERN: ends the database sessions whose application name matches the SQL LIKE
# pattern PATTERN (no quote characters in it). Killing the docker CLI on the host does not stop the
# process inside the container, and a stuck dump holds locks and a snapshot that can block the next
# migration. A dump session is found by the application name that its run gave it (PGAPPNAME).
# The lock descriptor (9) is closed for the child, like for every command that could outlive the script.
stop_dump_sessions() {
  timeout --kill-after=5 20 "${compose[@]}" exec -T db psql -X -q -U "$pg_user" -d postgres \
    -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE application_name LIKE '$1' AND pid <> pg_backend_pid()" \
    9>&- >/dev/null 2>&1 || true
}

# stop_dump_session: the session of the pg_dump or pg_dumpall that this run started.
stop_dump_session() {
  [ -n "$dump_session" ] || return 0
  stop_dump_sessions "$dump_session"
}

# on_exit: removes the work files and decides which heartbeat to send. A run counts as a success
# only when it reached the end (finished_ok), not merely because the exit status is 0: after
# SIGTERM, SIGHUP or SIGINT (a reboot, a time limit, a lost SSH session) bash runs this trap with
# status 0, and a killed backup must not look healthy to the monitor.
on_exit() {
  local status=$?
  local ok=0
  trap - EXIT ERR
  if [ "$status" -eq 0 ] && [ "$finished_ok" = 1 ]; then ok=1; fi
  if [ "$ok" != 1 ]; then
    command -v pkill >/dev/null 2>&1 && pkill -TERM -P $$ 2>/dev/null || true
    stop_dump_session
  fi
  if [ ${#work_files[@]} -gt 0 ]; then rm -f -- "${work_files[@]}"; fi
  if [ -n "$scratch_dir" ]; then rmdir -- "$scratch_dir" 2>/dev/null || true; fi
  if [ "$heartbeat_armed" = 1 ]; then
    if [ "$ok" = 1 ]; then ping_heartbeat ''; else ping_heartbeat /fail; fi
  fi
  exit "$status"
}
trap on_exit EXIT
trap 'log err "unexpected error at line $LINENO (exit status $?)"' ERR

# --- settings ---------------------------------------------------------------------------------
# The heartbeat URL is validated in the nightly run and in --check (so that --check reports a URL
# that the nightly run would ignore); only the nightly run sends pings.
heartbeat_rejected=0
if [ "$mode" != pre-migrate ]; then
  heartbeat_url=$(setting HEALTHCHECK_URL)
  if [ -n "$heartbeat_url" ]; then
    if [[ $heartbeat_url =~ [[:space:]\"\\] ]] \
      || ! [[ $heartbeat_url =~ ^(https://[^/?#]+|http://(127\.0\.0\.1|localhost|\[::1\])(:[0-9]+)?)([/?#].*)?$ ]]; then
      heartbeat_rejected=1
      heartbeat_url=''
      if [ "$mode" = nightly ]; then log err "heartbeat URL ignored: HEALTHCHECK_URL must be an https URL"; fi
    fi
  fi
  if [ "$mode" = nightly ]; then heartbeat_armed=1; fi
fi

pg_user=$(setting POSTGRES_USER)
pg_db=$(setting POSTGRES_DB)
[[ $pg_user =~ ^[A-Za-z0-9_.-]{1,63}$ ]] || die 4 "POSTGRES_USER is missing or invalid (host env file: $host_env)"
[[ $pg_db =~ ^[A-Za-z0-9_.-]{1,63}$ ]] || die 4 "POSTGRES_DB is missing or invalid (host env file: $host_env)"

backup_dir=$(setting BACKUP_DIR "$base_dir/backups")
[[ $backup_dir == /* ]] || die 4 "BACKUP_DIR must be an absolute path"
while [[ $backup_dir == */ && $backup_dir != / ]]; do backup_dir=${backup_dir%/}; done
if [[ $backup_dir == */../* || $backup_dir == */.. || $backup_dir == */./* || $backup_dir == */. ]]; then
  die 4 "BACKUP_DIR must not contain . or .. path segments"
fi
# The backup directory is made 0700 when this script creates it, and is never chmod-ed afterwards.
# An existing directory is therefore checked, and a system directory is refused outright: pointing
# BACKUP_DIR at /tmp or /var must not quietly change who can enter it.
case $backup_dir in
  /|/bin|/boot|/dev|/etc|/home|/lib|/lib32|/lib64|/media|/mnt|/opt|/proc|/root|/run|/sbin|/srv|/sys|/tmp|/usr|/var|/var/lib|/var/log|/var/tmp|"$base_dir"|"$base_dir/docker"|"$base_dir/deploy"|"$base_dir/nginx"|"$base_dir/releases")
    die 4 "BACKUP_DIR=$backup_dir is a system or release directory: use a directory of its own, for example $base_dir/backups" ;;
esac
backup_dir_exists=0
if [ -e "$backup_dir" ]; then
  [ -d "$backup_dir" ] || die 4 "BACKUP_DIR exists but is not a directory: $backup_dir"
  backup_dir_exists=1
  [ "$(stat -L -c %u "$backup_dir")" = "$(id -u)" ] && [ $(( 8#$(stat -L -c %a "$backup_dir") & 8#077 )) -eq 0 ] \
    || die 4 "BACKUP_DIR $backup_dir must belong to the user who runs the backup and be closed to everybody else: chmod 0700 $backup_dir"
fi

# read_int VARIABLE SETTING DEFAULT MIN MAX: sets VARIABLE to the validated whole number.
read_int() {
  local value
  value=$(setting "$2" "$3")
  [[ $value =~ ^[0-9]{1,8}$ ]] && [ "$value" -ge "$4" ] && [ "$value" -le "$5" ] \
    || die 4 "$2 must be a whole number from $4 to $5"
  printf -v "$1" '%s' "$value"
}
read_int retention_days BACKUP_RETENTION_DAYS 14 1 3650
read_int keep_min BACKUP_KEEP_MIN 3 1 1000
read_int min_free_mb BACKUP_MIN_FREE_MB 1024 0 10000000
read_int timeout_s BACKUP_TIMEOUT_SECONDS 1800 10 86400

encryption=$(setting BACKUP_ENCRYPTION age)
case $encryption in
  age)
    command -v age >/dev/null || die 5 "BACKUP_ENCRYPTION=age needs the age command (apt install age)"
    recipients_file=$(setting BACKUP_AGE_RECIPIENTS_FILE "$base_dir/backup-recipients.txt")
    [ -f "$recipients_file" ] && [ -r "$recipients_file" ] \
      || die 4 "age recipients file not found: $recipients_file (see docs/deployment/backup-and-restore.md)"
    if grep -Fq 'AGE-SECRET-KEY-' "$recipients_file"; then
      die 4 "the age recipients file contains a private key: remove it, keep the private key off this server"
    fi
    grep -Eq '^[[:space:]]*[^#[:space:]]' "$recipients_file" \
      || die 4 "the age recipients file has no public key"
    [ "$(stat -c %u "$recipients_file")" = "$(id -u)" ] && [ $(( 8#$(stat -c %a "$recipients_file") & 8#022 )) -eq 0 ] \
      || die 4 "the age recipients file must belong to the user who runs the backup and not be writable by others"
    ext=age
    ;;
  gpg)
    command -v gpg >/dev/null || die 5 "BACKUP_ENCRYPTION=gpg needs the gpg command (apt install gnupg)"
    gpg_recipient=$(setting BACKUP_GPG_RECIPIENT)
    [[ $gpg_recipient =~ ^[A-Za-z0-9@._+-]{1,128}$ ]] || die 4 "BACKUP_GPG_RECIPIENT is missing or invalid"
    gnupg_home=$(setting GNUPGHOME)
    if [ -n "$gnupg_home" ]; then export GNUPGHOME=$gnupg_home; fi
    gpg --batch --no-tty --list-keys -- "$gpg_recipient" >/dev/null 2>&1 \
      || die 4 "no public key for BACKUP_GPG_RECIPIENT in the gpg keyring (gpg --import the public key)"
    if gpg --batch --no-tty --list-secret-keys -- "$gpg_recipient" >/dev/null 2>&1; then
      log warning "the secret key of BACKUP_GPG_RECIPIENT is in this server's keyring: move it offline"
    fi
    ext=gpg
    ;;
  *) die 4 "BACKUP_ENCRYPTION must be age or gpg" ;;
esac

rclone_remote=$(setting RCLONE_REMOTE)
rclone_retention_days=''
if [ -n "$rclone_remote" ]; then
  [[ $rclone_remote =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*:[A-Za-z0-9_./-]*$ ]] \
    || die 4 "RCLONE_REMOTE must look like name:path (credentials belong in the rclone configuration file)"
  command -v rclone >/dev/null || die 5 "RCLONE_REMOTE is set but the rclone command is not installed"
  rclone_config=$(setting RCLONE_CONFIG)
  if [ -n "$rclone_config" ]; then export RCLONE_CONFIG=$rclone_config; fi
  rclone_retention_days=$(setting RCLONE_RETENTION_DAYS)
  if [ -n "$rclone_retention_days" ]; then
    [[ $rclone_retention_days =~ ^[0-9]{1,5}$ ]] && [ "$rclone_retention_days" -ge 1 ] \
      || die 4 "RCLONE_RETENTION_DAYS must be a whole number of at least 1"
  elif [ "$mode" != check ]; then
    log warning "RCLONE_RETENTION_DAYS is empty: the off-site copies of personal data are kept until the storage provider expires them; make sure it does (backup-and-restore.md, Privacy)"
  fi
fi

command -v docker >/dev/null || die 5 "docker is not installed or not in PATH"
command -v flock >/dev/null || die 5 "flock is not installed"
[ -r "$compose_file" ] || die 5 "compose file not found: $compose_file"
compose=(docker compose -f "$compose_file")

# --- single flight ------------------------------------------------------------------------------
# Descriptor 9 holds the lock for as long as any process keeps it open, so every command that could
# outlive this script (the dump pipeline, rclone, the session cleanup) runs with 9>&-: after a
# SIGKILL of the script the lock is then free at once and the next run is not skipped.
exec 9>"$lock_dir/$tag.lock" || die 4 "cannot open the lock file in $lock_dir"
if ! flock -n 9; then
  heartbeat_armed=0
  if [ "$mode" = nightly ]; then
    log notice "skipped: another backup is still running"
  else
    log warning "skipped: another backup is still running, so NO backup was taken: wait for it to finish and run this command again"
  fi
  exit 3
fi

space_dir=$backup_dir
if [ "$mode" = check ]; then
  # --check creates and changes nothing in the backup directory: its scratch files live in a
  # private temporary directory (mode 0700) that is removed on exit.
  scratch_dir=$(mktemp -d "${TMPDIR:-/tmp}/qr-backup-check.XXXXXX") || die 5 "cannot create a scratch directory"
  work_dir=$scratch_dir
  if [ "$backup_dir_exists" = 1 ]; then
    [ -w "$backup_dir" ] || die 5 "BACKUP_DIR is not writable: $backup_dir"
  else
    while [ ! -d "$space_dir" ]; do space_dir=$(dirname "$space_dir"); done
  fi
else
  # The directory is created 0700 here, once; an existing one was checked above and is left as it is.
  if [ "$backup_dir_exists" = 0 ]; then install -d -m 0700 "$backup_dir" || die 5 "cannot create $backup_dir"; fi
  [ -w "$backup_dir" ] || die 5 "BACKUP_DIR is not writable: $backup_dir"
  work_dir=$backup_dir
  # The single-flight lock is held, so no other run owns these: leftovers of a run that was killed.
  # find -H: BACKUP_DIR may itself be a symbolic link to the directory.
  find -H "$backup_dir" -maxdepth 1 -type f \
    \( -name '.stderr.*' -o -name '.selftest.*' -o -name '.size.*' -o -name 'qr-city-guide-*.partial' \) \
    -delete 2>/dev/null || true
fi
errfile=$(mktemp "$work_dir/.stderr.XXXXXX")
work_files+=("$errfile")

# log_errfile: the last lines of the captured stderr of a failed command (no secrets are involved:
# there is no password in any command, and pg_dump does not print data).
log_errfile() {
  local line
  [ -s "$errfile" ] || return 0
  while IFS= read -r line; do log err "  $line"; done < <(tail -n 10 "$errfile")
}

# --- encryption -----------------------------------------------------------------------------------
# encrypt_stream DEST: stdin -> encrypted DEST
encrypt_stream() {
  case $encryption in
    age) age -R "$recipients_file" -o "$1" ;;
    gpg) gpg --batch --yes --quiet --no-tty --trust-model always --compress-algo none \
           --recipient "$gpg_recipient" --output "$1" --encrypt ;;
  esac
}

# verify_encrypted FILE: non-empty, and for age the format header.
verify_encrypted() {
  [ -s "$1" ] || return 1
  if [ "$encryption" = age ]; then
    [ "$(head -c 21 "$1")" = 'age-encryption.org/v1' ] || return 1
  fi
}

selftest_encryption() {
  local probe="$work_dir/.selftest.$$"
  work_files+=("$probe")
  printf 'qr-city-guide backup self-test\n' | encrypt_stream "$probe" 2>"$errfile" \
    && verify_encrypted "$probe" || { log_errfile; return 1; }
  rm -f -- "$probe"
}

# --- pre-flight -------------------------------------------------------------------------------------
available_mb=$(df -Pm "$space_dir" | awk 'NR==2 { print $4 }')
[[ $available_mb =~ ^[0-9]+$ ]] || die 5 "cannot read the free space of $space_dir"
[ "$available_mb" -ge "$min_free_mb" ] \
  || die 5 "only ${available_mb} MB free in $space_dir (BACKUP_MIN_FREE_MB=$min_free_mb)"

timeout --kill-after=5 60 "${compose[@]}" exec -T db pg_isready -q -U "$pg_user" -d "$pg_db" 9>&- 2>"$errfile" \
  || { log_errfile; die 5 "the db container is not running or not ready (docker compose ps)"; }
selftest_encryption || die 4 "the encryption self-test failed: check the recipients"

if [ "$mode" = check ]; then
  echo "ok: settings, encryption, database access and free space (${available_mb} MB) are fine"
  echo "    encryption=$encryption retention=${retention_days}d keep_min=$keep_min dir=$backup_dir"
  if [ "$backup_dir_exists" = 0 ]; then echo "    note: $backup_dir does not exist yet; the first backup creates it (mode 0700)"; fi
  if [ -n "$rclone_remote" ]; then
    echo "    off-site remote: ${rclone_remote%%:*}:"
    if ! timeout --kill-after=10 "$timeout_s" rclone lsf --max-depth 1 "$rclone_remote" 9>&- >/dev/null 2>"$errfile"; then
      log_errfile
      die 7 "cannot list the off-site remote (a write-only credential cannot be checked this way; run a real backup instead)"
    fi
    echo "ok: the off-site remote can be listed"
    if [ -z "$rclone_retention_days" ]; then
      echo "    WARNING: RCLONE_RETENTION_DAYS is empty: the storage provider must expire the off-site copies (they hold personal data)"
    fi
  else
    echo "    off-site copy: not configured (RCLONE_REMOTE is empty)"
  fi
  if [ -n "$heartbeat_url" ]; then
    echo "    heartbeat: configured"
  elif [ "$heartbeat_rejected" = 1 ]; then
    echo "    WARNING: HEALTHCHECK_URL is set but the nightly run would ignore it: it must be an https URL without spaces"
  else
    echo "    heartbeat: not configured"
  fi
  exit 0
fi

# --- backup ------------------------------------------------------------------------------------------
# A run that was killed without a chance to clean up (SIGKILL, the out-of-memory killer) can leave its
# dump session behind. This run holds the lock, so no other backup is running: end such sessions.
stop_dump_sessions 'qr-backup-%'

started=$SECONDS
stamp=$(date -u +%Y%m%dT%H%M%SZ)
kind=nightly
if [ "$mode" = pre-migrate ]; then kind=pre-migrate${label:+-$label}; fi
base_name=qr-city-guide-$stamp-$kind
db_file=$backup_dir/$base_name.dump.$ext
roles_file=$backup_dir/$base_name.roles.sql.$ext

# The least a real dump has (bytes of plain text, before encryption). An empty database dumps to
# about 0.8 KB, the schema of this application alone to about 50 KB, and the role dump of a server
# with a single role to a few hundred bytes. A command that exits with 0 but writes less than this
# (an empty stream, a truncated one) is a failure, not a backup.
min_dump_bytes=4096
min_roles_bytes=256

# count_stream FILE: copies stdin to stdout; dd reports the number of bytes it copied in FILE.
count_stream() {
  dd bs=65536 iflag=fullblock 2>"$1"
}

# write_encrypted DEST MIN_BYTES COMMAND...: runs the command in the db container and stores its
# output encrypted. pipefail makes a failed dump fail the whole pipeline; the partial file is never
# kept, and it is renamed (after it has been flushed to disk) only when the whole pipeline succeeded
# and the plain text had at least MIN_BYTES. The time limit is enforced inside the container by
# `timeout` (busybox, in the pinned postgres image), because a timeout on the host only kills the
# docker CLI and leaves the dump running; the host-side limit is a backstop that fires later.
# PGAPPNAME names the session, so that stop_dump_session can end it when this script is killed.
write_encrypted() {
  local dest=$1 min_bytes=$2
  shift 2
  local partial=$dest.partial sizefile plain_bytes
  sizefile=$(mktemp "$work_dir/.size.XXXXXX") || return 1
  work_files+=("$partial" "$sizefile")
  rm -f -- "$partial"
  dump_session=qr-backup-$$
  local began=$SECONDS
  if ! timeout --kill-after=30 "$((timeout_s + 60))" "${compose[@]}" exec -T -e "PGAPPNAME=$dump_session" db \
    timeout -k 10 "$timeout_s" "$@" 9>&- 2>"$errfile" \
    | count_stream "$sizefile" 9>&- \
    | encrypt_stream "$partial" 9>&- 2>>"$errfile"; then
    log_errfile
    if [ $((SECONDS - began)) -ge "$timeout_s" ]; then
      log err "the command was stopped after ${timeout_s}s (BACKUP_TIMEOUT_SECONDS)"
    fi
    stop_dump_session
    return 1
  fi
  dump_session=''
  plain_bytes=$(sed -n 's/^\([0-9][0-9]*\) bytes.*/\1/p' "$sizefile" | tail -n 1)
  if ! [[ $plain_bytes =~ ^[0-9]+$ ]]; then
    log err "cannot tell how much data the command produced"
    return 1
  fi
  if [ "$plain_bytes" -lt "$min_bytes" ]; then
    log err "the command produced only $plain_bytes bytes (at least $min_bytes are expected): not a usable backup"
    return 1
  fi
  verify_encrypted "$partial" || return 1
  sync -- "$partial" 2>/dev/null || true
  mv -f -- "$partial" "$dest"
}

# write_checksum NAME: NAME.sha256 appears (flushed to disk) only when it is complete, like the files.
write_checksum() {
  local name=$1
  work_files+=("$backup_dir/$name.sha256.partial")
  (
    cd "$backup_dir" \
      && sha256sum -- "$name" > "$name.sha256.partial" \
      && { sync -- "$name.sha256.partial" 2>/dev/null || true; } \
      && mv -f -- "$name.sha256.partial" "$name.sha256"
  )
}

write_encrypted "$db_file" "$min_dump_bytes" pg_dump -U "$pg_user" -d "$pg_db" -Fc --no-password --lock-wait-timeout=120s \
  || die 6 "the database dump or its encryption failed"
write_checksum "${db_file##*/}" || die 6 "cannot write the checksum of ${db_file##*/}"
write_encrypted "$roles_file" "$min_roles_bytes" pg_dumpall -U "$pg_user" --roles-only --no-password \
  || die 6 "the role dump or its encryption failed (the database dump ${db_file##*/} was kept, but the set is incomplete)"
write_checksum "${roles_file##*/}" || die 6 "cannot write the checksum of ${roles_file##*/}"
sync -- "$backup_dir" 2>/dev/null || true
log info "backup written: ${db_file##*/} ($(stat -c %s "$db_file") bytes), ${roles_file##*/} ($(stat -c %s "$roles_file") bytes)"

# --- off-site copy -----------------------------------------------------------------------------------
offsite_status=0
if [ -n "$rclone_remote" ]; then
  # name: with an empty path gets the file name directly (name:file), otherwise name:path/file.
  offsite_prefix=$rclone_remote
  if [[ $offsite_prefix != *: ]]; then offsite_prefix=${offsite_prefix%/}/; fi
  for file in "$db_file" "$db_file.sha256" "$roles_file" "$roles_file.sha256"; do
    if ! timeout --kill-after=30 "$timeout_s" rclone copyto --immutable --checksum \
      "$file" "$offsite_prefix${file##*/}" 9>&- 2>"$errfile"; then
      log_errfile
      log err "off-site copy failed for ${file##*/}"
      offsite_status=7
      break
    fi
  done
  if [ "$offsite_status" -eq 0 ]; then
    log info "off-site copy done: ${rclone_remote%%:*}:"
    if [ -n "$rclone_retention_days" ]; then
      if ! timeout --kill-after=30 "$timeout_s" rclone delete --max-depth 1 --min-age "${rclone_retention_days}d" \
        --include 'qr-city-guide-*' "$rclone_remote" 9>&- 2>"$errfile"; then
        log_errfile
        log err "off-site pruning failed"
        offsite_status=7
      fi
    fi
  fi
fi

# --- prune local copies --------------------------------------------------------------------------------
prune_status=0

# set_is_complete BASE EXT: the set BASE has its dump, its role dump and both checksum files, none of
# them empty, and the checksums match. Only such a set is a backup that can be restored.
set_is_complete() {
  local base=$1 ext=$2 f
  for f in "$base.dump.$ext" "$base.roles.sql.$ext"; do
    [ -s "$backup_dir/$f" ] && [ -s "$backup_dir/$f.sha256" ] || return 1
  done
  (cd "$backup_dir" && sha256sum --check --status -- "$base.dump.$ext.sha256" "$base.roles.sql.$ext.sha256") >/dev/null 2>&1
}

prune_local() {
  local cutoff now name stamp_part epoch good=0 damaged=0 removed=0 base ext
  now=$(date -u +%s)
  cutoff=$((now - retention_days * 86400))
  # Only files named like this script names them are backup sets (the stamp is checked below); a
  # stray file or a leftover .partial is ignored. The newest sets come first, and only a complete,
  # intact set is counted towards the BACKUP_KEEP_MIN that are always kept: a set that a power cut
  # or a failed role dump left half-written, or that no longer matches its checksum, is kept (it
  # may hold the only copy of something) but never takes the place of a good one. Older sets are
  # then removed once they are past the retention time, complete or not. File names are read
  # NUL-separated, so no file name can be mistaken for several, and the files of a set are removed by
  # their exact names (no pattern that could match another set).
  while IFS= read -r -d '' name; do
    stamp_part=${name#qr-city-guide-}
    stamp_part=${stamp_part%%-*}
    [[ $stamp_part =~ ^[0-9]{8}T[0-9]{6}Z$ ]] || continue
    epoch=$(date -u -d "${stamp_part:0:4}-${stamp_part:4:2}-${stamp_part:6:2} ${stamp_part:9:2}:${stamp_part:11:2}:${stamp_part:13:2}" +%s 2>/dev/null) || continue
    # A set from the future (the clock was wrong when it was made) would rank above every real one
    # and push them out of the protected places: leave it alone, neither counted nor removed.
    if [ "$epoch" -gt $((now + 86400)) ]; then
      log warning "backup set ${name%.dump.*} is dated in the future (was the clock wrong?): ignored"
      continue
    fi
    ext=${name##*.}
    base=${name%.dump.*}
    if [ "$good" -lt "$keep_min" ]; then
      if set_is_complete "$base" "$ext"; then
        good=$((good + 1))
      else
        damaged=$((damaged + 1))
        log warning "backup set $base is incomplete or does not match its checksum: it is kept but not counted"
      fi
      continue
    fi
    if [ "$epoch" -lt "$cutoff" ]; then
      rm -f -- "$backup_dir/$base.dump.$ext" "$backup_dir/$base.dump.$ext.sha256" \
        "$backup_dir/$base.roles.sql.$ext" "$backup_dir/$base.roles.sql.$ext.sha256" || return 1
      removed=$((removed + 1))
    fi
  done < <(find -H "$backup_dir" -maxdepth 1 -type f \( -name 'qr-city-guide-*.dump.age' -o -name 'qr-city-guide-*.dump.gpg' \) -printf '%f\0' | sort -z -r)
  log info "pruned $removed local backup set(s) older than ${retention_days} days (the newest $keep_min complete sets are always kept; $good counted, $damaged damaged)"
}
prune_local || { log err "pruning old local backups failed"; prune_status=8; }

elapsed=$((SECONDS - started))
if [ "$offsite_status" -ne 0 ]; then die "$offsite_status" "backup finished with an off-site failure after ${elapsed}s"; fi
if [ "$prune_status" -ne 0 ]; then die "$prune_status" "backup finished, but pruning failed, after ${elapsed}s"; fi
log info "backup ok in ${elapsed}s (mode $mode, encryption $encryption${rclone_remote:+, off-site copy done})"
finished_ok=1
exit 0
