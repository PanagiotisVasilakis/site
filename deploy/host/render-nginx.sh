#!/usr/bin/env bash
# Renders the production Nginx configuration from deploy/nginx/nginx.conf.template and checks it
# with `nginx -t` in the pinned Nginx image (docs/deployment/origin-ingress-runbook.md, "Nginx
# rendering and validation"; docs/deployment/day-0-runbook.md says when to run this).
#
# Usage:
#   render-nginx.sh [--no-test]
#
#   --no-test   render only; skip the `nginx -t` check (it needs docker and the TLS files). This
#               INSTALLS A CONFIGURATION THAT WAS NOT TESTED, over the one a running Nginx may use.
#               It is meant for a machine that only prepares the file (no docker, no TLS files yet).
#               On the production host always run the script without it, so that a broken template
#               installs nothing, and test again in the running container before the reload.
#
# Inputs:
#   <base>/app.env                                   NEXT_PUBLIC_SITE_URL (its host name becomes
#                                                    server_name) and ORIGIN_PROXY_SHARED_SECRET,
#                                                    the same file that the application reads
#   <base>/deploy/nginx/nginx.conf.template          from the release commit
#   <base>/deploy/nginx/includes/*.conf              from the release commit
#   <base>/nginx/tls/origin.crt, origin.key, cloudflare-origin-pull-ca.pem   (for the check only)
# Outputs, in <base>/nginx/:
#   nginx.production.conf   mode 0600: it contains the origin secret. It is overwritten in place
#                           (the file keeps its inode), because the container bind-mounts this one
#                           file and a replaced file would leave the running Nginx on the old one.
#   includes/               the Cloudflare network lists
#
# Settings: QR_BASE_DIR (default two levels above this script), QR_APP_ENV, QR_NGINX_DIR.
# Nothing is started or reloaded; the secret is never printed.
#
# Exit status: 0 success; 2 usage error; 4 invalid input; 5 the nginx -t check or docker failed.
set -Eeuo pipefail
umask 077
export PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export LC_ALL=C

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
base_dir=${QR_BASE_DIR:-$(cd "$script_dir/../.." && pwd)}
app_env=${QR_APP_ENV:-$base_dir/app.env}
nginx_dir=${QR_NGINX_DIR:-$base_dir/nginx}
template=$base_dir/deploy/nginx/nginx.conf.template
includes_dir=$base_dir/deploy/nginx/includes
lock_file=$base_dir/deploy/nginx/image.lock.json

run_test=1
case ${1-} in
  '') ;;
  --no-test) run_test=0 ;;
  -h|--help) echo "Usage: render-nginx.sh [--no-test]"; exit 0 ;;
  *) echo "Usage: render-nginx.sh [--no-test]" >&2; exit 2 ;;
esac
[ $# -le 1 ] || { echo "Usage: render-nginx.sh [--no-test]" >&2; exit 2; }

die() {
  local code=$1
  shift
  echo "render-nginx: $*" >&2
  exit "$code"
}

# Prints the value of KEY from a Docker-style env file (empty when absent); see backup.sh.
env_value() {
  local file=$1 key=$2 line value='' found=0
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

[ -r "$app_env" ] || die 4 "cannot read $app_env"
[ -r "$template" ] || die 4 "cannot read $template (copy deploy/nginx from the release commit)"
[ -d "$includes_dir" ] || die 4 "cannot find $includes_dir"

site_url=$(env_value "$app_env" NEXT_PUBLIC_SITE_URL)
secret=$(env_value "$app_env" ORIGIN_PROXY_SHARED_SECRET)
site_url_pattern='^https://(([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{1,62})/?$'
[[ $site_url =~ $site_url_pattern ]] \
  || die 4 "NEXT_PUBLIC_SITE_URL must be https://<lowercase host name> without port or path (found: ${site_url:-nothing})"
hostname=${BASH_REMATCH[1]}
[[ $secret =~ ^[0-9a-fA-F]{64}$ ]] \
  || die 4 "ORIGIN_PROXY_SHARED_SECRET must be 64 hexadecimal characters (openssl rand -hex 32)"

template_text=$(cat "$template"; printf x)
template_text=${template_text%x}
[[ $template_text == *'__PRODUCTION_HOSTNAME__'* ]] || die 4 "the template has no __PRODUCTION_HOSTNAME__ placeholder"
[[ $template_text == *'${ORIGIN_PROXY_SHARED_SECRET}'* ]] || die 4 'the template has no ${ORIGIN_PROXY_SHARED_SECRET} placeholder'
rendered=${template_text//'__PRODUCTION_HOSTNAME__'/$hostname}
rendered=${rendered//'${ORIGIN_PROXY_SHARED_SECRET}'/$secret}
if [[ $rendered == *'__PRODUCTION_HOSTNAME__'* || $rendered == *'${ORIGIN_PROXY_SHARED_SECRET}'* ]]; then
  die 4 "a placeholder is left after rendering"
fi

install -d -m 0700 "$nginx_dir" "$nginx_dir/includes" "$nginx_dir/tls"
tmp_conf=$(mktemp "$nginx_dir/.nginx.production.conf.XXXXXX")
trap 'rm -f "$tmp_conf"' EXIT
printf '%s' "$rendered" > "$tmp_conf"

if [ "$run_test" = 1 ]; then
  command -v docker >/dev/null || die 5 "docker is not installed (--no-test skips the check but installs an untested file)"
  for tls_file in origin.crt origin.key cloudflare-origin-pull-ca.pem; do
    [ -r "$nginx_dir/tls/$tls_file" ] \
      || die 5 "missing $nginx_dir/tls/$tls_file: install the TLS files first (day-0 runbook, section 6); --no-test skips the check but installs an untested file"
  done
  [ -r "$lock_file" ] || die 5 "cannot read $lock_file"
  repository=$(sed -n 's/^ *"repository": *"\([^"]*\)".*/\1/p' "$lock_file")
  digest=$(sed -n 's/^ *"digest": *"\([^"]*\)".*/\1/p' "$lock_file")
  [[ $repository =~ ^[a-z0-9./_-]+$ && $digest =~ ^sha256:[0-9a-f]{64}$ ]] || die 5 "image.lock.json has no usable repository and digest"
  image=$repository@$digest
  if ! docker image inspect "$image" >/dev/null 2>&1; then
    echo "pulling the pinned Nginx image $image"
    docker pull "$image" >/dev/null || die 5 "cannot pull $image"
  fi
  if ! check_output=$(docker run --rm --network none --tmpfs /var/log/nginx \
    -v "$tmp_conf:/etc/nginx/nginx.conf:ro" \
    -v "$includes_dir:/etc/nginx/trusted-ingress:ro" \
    -v "$nginx_dir/tls:/etc/nginx/tls:ro" \
    "$image" nginx -t 2>&1); then
    # nginx names the failing directive and file, never the secret value.
    printf '%s\n' "$check_output" | sed -e "s|$tmp_conf|nginx.production.conf|g" >&2
    if [[ $check_output == *'Address family not supported'* ]]; then
      echo "render-nginx: this machine has no IPv6 support, but the template also listens on [::]:443, so the production Nginx would not start here either; enable IPv6 on the host (--no-test only skips this check, it does not make the configuration work, and is meant for a test machine)" >&2
    fi
    die 5 "nginx -t rejected the rendered configuration; nothing was installed"
  fi
  echo "nginx -t: ok (pinned image $repository)"
fi

# Install in place (same inode) when the file exists; see the header.
target=$nginx_dir/nginx.production.conf
if [ -e "$target" ]; then
  cat "$tmp_conf" > "$target"
else
  cp "$tmp_conf" "$target"
fi
chmod 0600 "$target"
install -m 0644 "$includes_dir"/*.conf "$nginx_dir/includes/"

echo "rendered $target for server_name $hostname (mode 0600)"
echo "includes copied to $nginx_dir/includes/"
if command -v docker >/dev/null 2>&1 && docker ps --format '{{.Names}}' 2>/dev/null | grep -qx origin-nginx; then
  echo "next: docker exec origin-nginx nginx -t && docker exec origin-nginx nginx -s reload"
else
  echo "next: start the origin-nginx container (docs/deployment/origin-ingress-runbook.md, \"Run\")"
fi
