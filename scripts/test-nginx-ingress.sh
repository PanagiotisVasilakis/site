#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOCK_FILE="$REPO_ROOT/deploy/nginx/image.lock.json"
IMAGE="$(node -e "const f=require(process.argv[1]); process.stdout.write(f.repository+'@'+f.digest)" "$LOCK_FILE")"
RUN_ID="a2-$PPID-$$"
TRUSTED_NET="ingress-trusted-$RUN_ID"
UNTRUSTED_NET="ingress-untrusted-$RUN_ID"
UPSTREAM="ingress-upstream-$RUN_ID"
PROXY="ingress-proxy-$RUN_ID"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/nginx-ingress.XXXXXX")"

cleanup() {
  docker container rm --force "$PROXY" "$UPSTREAM" >/dev/null 2>&1 || true
  docker network rm "$TRUSTED_NET" "$UNTRUSTED_NET" >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

docker image inspect "$IMAGE" >/dev/null
docker network create --subnet 172.30.240.0/24 "$TRUSTED_NET" >/dev/null
docker network create --subnet 172.30.241.0/24 "$UNTRUSTED_NET" >/dev/null

SECRET="$(openssl rand -hex 32)"

openssl req -x509 -newkey rsa:2048 -nodes -days 1 -subj '/CN=origin-test' \
  -keyout "$TMP/origin.key" -out "$TMP/origin.crt" >/dev/null 2>&1
cp "$TMP/origin.crt" "$TMP/cloudflare-origin-pull-ca.pem"

node - "$REPO_ROOT" "$TMP" "$SECRET" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [root, temporary, secret] = process.argv.slice(2);
const template = fs.readFileSync(path.join(root, 'deploy/nginx/nginx.conf.template'), 'utf8');
const rendered = template
  .replaceAll('${ORIGIN_PROXY_SHARED_SECRET}', secret)
  .replaceAll('__PRODUCTION_HOSTNAME__', 'origin.test');
fs.writeFileSync(path.join(temporary, 'nginx.production.conf'), rendered);
fs.writeFileSync(path.join(temporary, 'cloudflare-realip.conf'), fs.readFileSync(
  path.join(root, 'deploy/nginx/includes/cloudflare-realip.conf'), 'utf8'));
fs.writeFileSync(path.join(temporary, 'cloudflare-geo.conf'), fs.readFileSync(
  path.join(root, 'deploy/nginx/includes/cloudflare-geo.conf'), 'utf8'));

const testConfig = rendered
  .replace('include /etc/nginx/trusted-ingress/cloudflare-realip.conf;', 'set_real_ip_from 172.30.240.0/24;')
  .replace('include /etc/nginx/trusted-ingress/cloudflare-geo.conf;', '172.30.240.0/24 1;')
  .replace('server 127.0.0.1:3000;', 'server ingress-upstream:8080;')
  .replace('listen 443 ssl;', 'listen 8080;')
  .replace('listen [::]:443 ssl;', 'listen [::]:8080;')
  .replace('rate=5r/s;', 'rate=1r/s;')
  .replace('rate=10r/s;', 'rate=1r/s;')
  .replace('rate=30r/s;', 'rate=1r/s;')
  .replace('burst=20 nodelay;', 'burst=1 nodelay;')
  .replace('burst=40 nodelay;', 'burst=1 nodelay;')
  .replace('burst=60 nodelay;', 'burst=1 nodelay;')
  .replace('limit_req_dry_run on;', 'limit_req_dry_run off;')
  .replace('limit_conn_dry_run on;', 'limit_conn_dry_run off;')
  .replace(/^\s*ssl_(?:certificate|certificate_key|client_certificate|verify_client|protocols).*;\n/gmu, '');
fs.writeFileSync(path.join(temporary, 'nginx.test.conf'), testConfig);

fs.writeFileSync(path.join(temporary, 'upstream.conf'), `
events {}
http {
  access_log off;
  server {
    listen 8080;
    add_header Seen-Verified-IP $http_x_origin_verified_client_ip always;
    add_header Seen-Attestation $http_x_origin_proxy_attestation always;
    add_header Seen-CF-IP $http_cf_connecting_ip always;
    add_header Seen-Real-IP $http_x_real_ip always;
    add_header Seen-XFF $http_x_forwarded_for always;
    add_header Seen-Forwarded $http_forwarded always;
    return 204;
  }
}
`);
NODE

docker run --rm \
  -v "$TMP/nginx.production.conf:/etc/nginx/nginx.conf:ro" \
  -v "$TMP/cloudflare-realip.conf:/etc/nginx/trusted-ingress/cloudflare-realip.conf:ro" \
  -v "$TMP/cloudflare-geo.conf:/etc/nginx/trusted-ingress/cloudflare-geo.conf:ro" \
  -v "$TMP/origin.crt:/etc/nginx/tls/origin.crt:ro" \
  -v "$TMP/origin.key:/etc/nginx/tls/origin.key:ro" \
  -v "$TMP/cloudflare-origin-pull-ca.pem:/etc/nginx/tls/cloudflare-origin-pull-ca.pem:ro" \
  "$IMAGE" nginx -t >/dev/null

if docker run --rm -v "$TMP/upstream.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" \
  nginx -t -g 'broken_directive on;' >/dev/null 2>&1; then
  echo 'Malformed Nginx configuration unexpectedly passed.' >&2
  exit 1
fi

docker run -d --name "$UPSTREAM" --network "$TRUSTED_NET" --network-alias ingress-upstream \
  -v "$TMP/upstream.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" >/dev/null
docker network connect "$UNTRUSTED_NET" "$UPSTREAM"

docker run -d --name "$PROXY" --network "$TRUSTED_NET" --ip 172.30.240.10 \
  -v "$TMP/nginx.test.conf:/etc/nginx/nginx.conf:ro" "$IMAGE" >/dev/null
docker network connect --ip 172.30.241.10 "$UNTRUSTED_NET" "$PROXY"

trusted_headers="$(docker run --rm --network "$TRUSTED_NET" "$IMAGE" /bin/sh -eu -c \
  "wget -q -S -O /dev/null --header='CF-Connecting-IP: 203.0.113.77' --header='X-Forwarded-For: 198.51.100.1' --header='X-Real-IP: 198.51.100.2' --header='Forwarded: for=198.51.100.3' --header='X-Origin-Verified-Client-IP: 198.51.100.4' --header='X-Origin-Proxy-Attestation: attacker' http://172.30.240.10:8080/ 2>&1")"

for header in 'Seen-Verified-IP: 203.0.113.77' 'Seen-CF-IP: 203.0.113.77' \
  'Seen-Real-IP: 203.0.113.77' 'Seen-XFF: 203.0.113.77'; do
  grep -Fq "$header" <<<"$trusted_headers"
done
grep -Fq "Seen-Attestation: $SECRET" <<<"$trusted_headers"
if grep -Fq 'Seen-Forwarded:' <<<"$trusted_headers"; then
  echo 'Forwarded header was not removed.' >&2
  exit 1
fi

if docker run --rm --network "$UNTRUSTED_NET" "$IMAGE" /bin/sh -eu -c \
  "wget -q -O /dev/null --header='CF-Connecting-IP: 203.0.113.88' http://172.30.241.10:8080/"; then
  echo 'Untrusted source unexpectedly reached the application upstream.' >&2
  exit 1
fi

rate_output="$(docker run --rm --network "$TRUSTED_NET" "$IMAGE" /bin/sh -c \
  "for i in \$(seq 1 20); do wget -q -S -O /dev/null --header='CF-Connecting-IP: 203.0.113.99' --post-data='{}' http://172.30.240.10:8080/api/admin/login 2>&1 || true; done")"
if ! grep -Fq 'HTTP/1.1 429 Too Many Requests' <<<"$rate_output"; then
  echo 'Enforced Nginx rate limit did not return 429.' >&2
  exit 1
fi

if rg -n '172\.30\.(?:240|241)\.' "$REPO_ROOT/deploy/nginx/includes" "$REPO_ROOT/deploy/nginx/nginx.conf.template"; then
  echo 'Production Nginx artifacts contain a test network.' >&2
  exit 1
fi

echo 'Nginx trusted-ingress and layered-rate integration passed.'
