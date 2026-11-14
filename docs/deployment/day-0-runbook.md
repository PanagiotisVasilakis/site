# Day-0 runbook: first deployment on a Netcup VPS

This runbook takes a fresh Netcup VPS (x86_64, Debian or Ubuntu) to a running, checked production
site, in execution order. It extends three documents and does not replace them:

- [the deployment target](../architecture/deployment-target.md) decides what runs where;
- [the origin ingress runbook](origin-ingress-runbook.md) is the specification of the Nginx ingress,
  the firewall and the Authenticated Origin Pull trust (this runbook says when to follow it);
- [`scripts/README.md`](../../scripts/README.md#production) has the release sequence, the database
  roles and the worker schedule (this runbook links to those sections instead of copying them).

The files it installs are in [`deploy/host`](../../deploy/host/README.md). The Cloudflare dashboard
settings are in the [Cloudflare checklist](cloudflare-checklist.md), the backup procedure in
[backup and restore](backup-and-restore.md) and the alerting in
[monitoring and alerting](monitoring-and-alerting.md).

What this runbook is based on: the database, env-file, backup, worker and verification commands follow
the repository sources (the compose file, `src/lib/runtime-env-schema.js`, the workers, the Nginx
template and the migrations) as they are at commit `e6f83b3`, the commit that adds this runbook. The
Netcup, Cloudflare and public-DNS
steps depend on accounts and dashboards that the repository cannot try, and the names of their menus
change, so those steps name the setting and point to the provider's documentation. The architecture
decision still requires dated operator evidence for them ([section 16](#16-evidence-to-keep)); this
runbook is not that evidence.

Conventions: every command runs as `root` on the VPS unless a step says otherwise (use `sudo -i` once
you are logged in as the deploy user). `<...>` is a value you replace. Commands that use `$C` need
`C="docker compose -f docker/docker-compose.prod.yml"` set in the current shell, from
`/opt/qr-city-guide`.

## 0. Before you start

Decide and write down, before the first command:

1. **The canonical host name**, for example `your-host.example` (apex) or `www.your-host.example`.
   One name serves the site. The other one, if you want it, is redirected to it at Cloudflare
   ([section 13](#13-the-canonical-host-name-rule)). The name is compiled into the images, so it
   cannot change without a new build.
2. **Where the secrets live**: a password manager that you can open when the VPS is gone. The three
   env files, the Cloudflare account recovery codes, the origin certificate key, the
   Authenticated Origin Pull key and the private backup key (never on the VPS) go there.
3. **Whether the guest portal and check-in start switched on or off** ([section 12](#12-first-admin-login-and-the-dark-launch)).
4. **The open owner inputs** in the [README](../../README.md#open-owner-inputs). Leave
   `BOOKING_ICAL_URL` empty until the instructions in `scripts/README.md`
   ("Required runtime configuration") are met.

Prepare the release on the release host (your computer with Docker and a clean checkout of the
approved commit): `npm run verify:release`, then the image sequence of `scripts/README.md`
("Artifacts of one release commit"), which ends with the three images saved in
`release-<sha>.tar.gz` and their three image IDs written down. Build the final images with
`NEXT_PUBLIC_SITE_URL=https://<canonical host>`.

## 1. Provision the host

### 1.1 First login and the platform check

Log in as root with the credentials that Netcup gave you for the installed image (Netcup's
documentation says where to find or reset them). Then check the host against the platform contract
of the deployment target:

```sh
uname -m                      # must print x86_64
dpkg --print-architecture     # must print amd64
. /etc/os-release && echo "$PRETTY_NAME"
apt update && apt full-upgrade -y
```

Reboot if the kernel was updated (`[ -f /var/run/reboot-required ] && reboot`).

### 1.2 Deploy user and SSH keys only

Create the user you will log in as. It has a password only for `sudo`; SSH accepts keys only.

```sh
apt install -y sudo                 # a minimal image may lack it, and the group "sudo" comes with the package
adduser deploy                      # choose a long password and keep it in the password manager
usermod -aG sudo deploy
install -d -m 0700 -o deploy -g deploy /home/deploy/.ssh
```

On your computer, show your public key (`cat ~/.ssh/id_ed25519.pub`; create one with
`ssh-keygen -t ed25519` if you have none) and put that single line into
`/home/deploy/.ssh/authorized_keys` on the VPS (mode `0600`, owner `deploy`). Then write the SSH
policy, check it and reload:

```sh
cat > /etc/ssh/sshd_config.d/10-qr-city-guide.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
AllowUsers deploy
EOF
sshd -t && systemctl reload ssh
sshd -T | grep -E '^(passwordauthentication|kbdinteractiveauthentication|permitrootlogin|allowusers) '
```

The last command must show `no`, `no`, `no` and `deploy`. If it shows something else, another file in
`/etc/ssh/sshd_config.d/` sets the same option first (cloud images ship one; files are read in name
order and the first value wins), or `/etc/ssh/sshd_config` has no `Include` line for that directory:
then put the four lines into `/etc/ssh/sshd_config` itself.

Keep this root session open. In a second terminal, `ssh deploy@<vps address>` must work with the key,
and `sudo -i` must give you root. Only then close the root session. If you locked yourself out, use
the emergency console that Netcup offers for your server (called "the SCP console" in this runbook;
check in Netcup's documentation what your product includes) to undo the file above.

### 1.3 Unattended security upgrades

```sh
apt install -y unattended-upgrades
dpkg-reconfigure -plow unattended-upgrades      # answer Yes
unattended-upgrade --dry-run --debug 2>&1 | tail -n 5
```

This installs the security updates of the operating system by itself. It does not update Docker
(a separate apt repository) and does not reboot: reboot in a quiet hour when
`/var/run/reboot-required` exists ([section 14](#14-security-updates-after-launch)).

### 1.4 Time

```sh
timedatectl
```

It must show `System clock synchronized: yes` and `NTP service: active`. If not,
`timedatectl set-ntp true` (install `systemd-timesyncd` first if the service is missing). A wrong
clock breaks TLS certificates, the 15-minute login window, session expiry and the cron schedule.
Set the zone to UTC so that the schedule has no daylight-saving changes:
`timedatectl set-timezone UTC`.

### 1.5 Docker Engine and Compose v2

Install Docker Engine from Docker's own apt repository, not from the distribution's `docker.io`
package and not as a snap. Follow the current instructions on docs.docker.com ("Install Docker
Engine", the page for your distribution, "Install using the apt repository"): the repository setup
and the package list change over time, so this runbook does not copy them. Install the engine, the
CLI, `containerd.io`, the Buildx plugin and the Compose plugin. Then:

```sh
docker --version
docker compose version          # Compose v2: "docker compose", not "docker-compose"
systemctl is-enabled docker     # enabled: containers with a restart policy return after a reboot
getent group docker             # must list no members
```

Keep the `docker` group empty. A member of that group controls the Docker daemon and is therefore
root on the host, without a password. Run every Docker command through `sudo` (or as root), as this
runbook does.

### 1.6 Other packages and the journal

```sh
apt install -y cron logrotate curl jq age openssl ca-certificates
systemctl is-active cron
mkdir -p /var/log/journal && systemctl restart systemd-journald      # keep worker logs across reboots
```

`age` is the tool that encrypts the backups ([backup and restore](backup-and-restore.md)).

## 2. Directory layout

```sh
install -d -m 0755 /opt/qr-city-guide
install -d -m 0700 /opt/qr-city-guide/nginx /opt/qr-city-guide/nginx/tls
install -d -m 0711 /opt/qr-city-guide/nginx/logs
install -d -m 0700 /opt/qr-city-guide/backups
install -d -m 0755 /opt/qr-city-guide/docker
install -d -m 0750 -o deploy -g deploy /opt/qr-city-guide/releases
```

```text
/opt/qr-city-guide/
  docker/docker-compose.prod.yml   release file
  docker/.env                      root, 0600   host settings (compose.env.example)
  app.env                          root, 0600   runtime configuration (app.env.example)
  migrate.env                      root, 0600   migration role (migrate.env.example)
  deploy/nginx/, deploy/host/      release files
  nginx/                           root, 0700   rendered config, includes/, tls/, logs/ (0711)
  backups/                         root, 0700   encrypted backups
  backup-recipients.txt            root         public backup keys (not secret)
  releases/                        deploy       uploaded release archives
```

Every env file is owned by root with mode `0600`: the images contain no configuration, and these
files are the only place where the secrets are.

`nginx/logs` is `0711` and not `0700` on purpose. When logrotate sends `USR1` (section 10), the Nginx
worker processes, which run as the user `nginx`, reopen the log files by name; they cannot enter a
root-only directory, would log `open() ... failed (13: Permission denied)` and would keep writing to
the files that were rotated away (tested with the pinned image: the new `access.log` stayed empty
and every later line went to the rotated file). The parent `nginx/` stays `0700`, so other users of
the host still cannot reach the logs.

## 3. Release files

The images are built once, on the release host. Nothing is built on the VPS, and nothing is read from
a repository checkout at run time.

On the release host, in the clean checkout of the approved commit, after the image sequence of
`scripts/README.md`:

```sh
sha=$(git rev-parse HEAD | cut -c1-12)          # the same 12 characters as the image tags
git archive --format=tar.gz -o "release-files-$sha.tar.gz" HEAD docker/docker-compose.prod.yml deploy
sha256sum "release-$sha.tar.gz" "release-files-$sha.tar.gz" > "SHA256SUMS-$sha"
scp "release-$sha.tar.gz" "release-files-$sha.tar.gz" "SHA256SUMS-$sha" deploy@<vps address>:/opt/qr-city-guide/releases/
```

`release-<sha>.tar.gz` holds the three images (`docker save`), and `release-files-<sha>.tar.gz` holds
the compose file, `deploy/nginx` and `deploy/host` of the same commit. They must come from the same
commit as the images: the compose file derives the image names from `APP_IMAGE`, and the Nginx
template and the host scripts are versioned with the release.

On the VPS:

```sh
sudo -i
cd /opt/qr-city-guide/releases
sha256sum -c SHA256SUMS-<sha>                                  # both lines must say OK
tar -xzf release-files-<sha>.tar.gz -C /opt/qr-city-guide      # compose file, deploy/nginx, deploy/host
docker load < release-<sha>.tar.gz
docker image inspect --format '{{.Id}}' villa-app:<sha> villa-app:<sha>-workers villa-app:<sha>-migrate
```

The three IDs must equal the ones that `npm run docker:build` printed on the release host. The
checksum protects against a damaged transfer; SSH protects against a changed one. Do not load an
image whose ID differs. `docker:build` builds `linux/amd64` whatever the build machine is (slowly,
under emulation, on an Apple-silicon Mac) and exits 1 if a tag reports another platform; an
`exec format error` on this host would mean an image of the wrong architecture was shipped.

## 4. The three env files

```sh
cd /opt/qr-city-guide
umask 077
install -m 0600 deploy/host/compose.env.example docker/.env
install -m 0600 deploy/host/app.env.example app.env
install -m 0600 deploy/host/migrate.env.example migrate.env
```

Each template documents every variable of `src/lib/runtime-env-schema.js` and `docker-compose.prod.yml`.
Generate the seven independent random values without printing them:

```sh
fill_secret() {   # fill_secret FILE NAME: a fresh 64-character hex value for NAME in FILE
  local file=$1 name=$2 value line
  value=$(openssl rand -hex 32)
  while IFS= read -r line || [ -n "$line" ]; do
    case $line in
      "$name="*) printf '%s=%s\n' "$name" "$value" ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$file" > "$file.new" && cat "$file.new" > "$file" && rm -f "$file.new"
}
for name in ADMIN_JWT_SECRET GUEST_JWT_SECRET ADMIN_DASH_SECRET SECURITY_PEPPER \
  CLAIM_TOKEN_PEPPER ORIGIN_PROXY_SHARED_SECRET; do fill_secret app.env "$name"; done
fill_secret docker/.env POSTGRES_PASSWORD
```

Run this block once, on the unedited templates: it replaces whatever stands after `NAME=`, so a second
run would silently change secrets that are already in use (and that you have already stored in the
password manager). The function runs `printf` inside the shell, so no secret appears in the process
list. The two database role passwords are generated the same way, one for each env file, each in
place of its `<DB_PW>` (the two differ, and section 5 reads them from the files, so you never copy
them by hand):

```sh
fill_db_pw() {   # fill_db_pw FILE: a fresh 64-character hex password in place of <DB_PW> in FILE
  local file=$1 value line
  value=$(openssl rand -hex 32)
  while IFS= read -r line || [ -n "$line" ]; do
    printf '%s\n' "${line//<DB_PW>/$value}"
  done < "$file" > "$file.new" && cat "$file.new" > "$file" && rm -f "$file.new"
}
fill_db_pw app.env          # qr_app
fill_db_pw migrate.env      # qr_migrator
```

Edit the three files (`nano app.env`) and replace the remaining placeholders: `<your-host.example>`
(the canonical host, lowercase, exactly as at the image build), the Wi-Fi name and password, and in
`docker/.env` the `APP_IMAGE` of the release. Read the comments in the templates for the optional
webhooks. Rules that bite:

- A value with `$`, `#`, a space or a backslash goes in single quotes. Docker Compose expands `$name`
  in unquoted and double-quoted values and treats an unquoted ` #` as a comment, so `ab$cd` becomes
  `ab` and the only trace is the warning `The "cd" variable is not set` (it quotes the text after the
  `$`, so never paste it anywhere), while `config --quiet` still exits 0. Single-quoted values are
  taken literally. The last command below catches this.
- `DATABASE_URL` carries no `options` parameter, and its database name is `POSTGRES_DB`.
- `ALLOWED_ORIGINS` stays empty, `LOG_STRUCTURED=true`, and `BUILD_SITE_URL` is not set.
- Put the three files in the password manager now, then clear the screen (`clear`).

Check that nothing is left open, that the modes are right and that Compose accepts the result:

```sh
grep -n '^[^#]*<' docker/.env app.env migrate.env       # must print nothing
ls -l docker/.env app.env migrate.env                   # -rw------- root root
C="docker compose -f docker/docker-compose.prod.yml"
$C --profile ops config -q >/dev/null 2>&1 && echo config-ok   # must print config-ok
$C --profile ops config -q 2>&1 | grep -c 'is not set'         # must print 0
```

Both Compose commands need `--profile ops`: without it Compose leaves out the `migrate`, `outbox` and
`operations` services and does not read `migrate.env` at all (a missing file or a `$` in it would pass).

## 5. Database and application

```sh
$C up -d --wait db
```

The first start pulls the digest-pinned PostgreSQL image and creates the superuser named in
`docker/.env` (`POSTGRES_USER`). Changing `POSTGRES_*` later has no effect on this volume.

**Create the two database roles.** Follow `scripts/README.md` ("Host layout"): the SQL block there
creates `qr_migrator` and `qr_app`, makes `qr_migrator` the owner of the database and grants the
application role its default privileges. Save that block into a file that only root can read, write
`<MIGRATOR_PW>` and `<APP_PW>` in place of its two `<from secret store>` and the database name
(`qr_city_guide`, `POSTGRES_DB`) in place of `<POSTGRES_DB>` (twice), and run it through the socket of
the `db` container, where no password is asked. The two passwords are taken from `migrate.env` and
`app.env` by the shell, so they are neither shown nor on a command line (the `awk` program reads them
from its environment):

```sh
install -m 0600 /dev/null /root/roles.sql
nano /root/roles.sql                         # paste the block, replace the placeholders as described
pg_user=$(sed -n 's/^POSTGRES_USER=//p' docker/.env); pg_db=$(sed -n 's/^POSTGRES_DB=//p' docker/.env)
install -m 0600 /dev/null /root/roles.final.sql
MIGRATOR_PW=$(sed -n 's|^DATABASE_URL=[a-z]*://qr_migrator:\([0-9a-f]\{64\}\)@.*|\1|p' migrate.env) \
APP_PW=$(sed -n 's|^DATABASE_URL=[a-z]*://qr_app:\([0-9a-f]\{64\}\)@.*|\1|p' app.env) \
  awk '{ gsub(/<MIGRATOR_PW>/, ENVIRON["MIGRATOR_PW"]); gsub(/<APP_PW>/, ENVIRON["APP_PW"]); print }' \
  /root/roles.sql > /root/roles.final.sql
grep -c -E "PASSWORD ''|<[A-Za-z_ ]+>" /root/roles.final.sql   # must print 0 (an empty password or a placeholder is left)
$C exec -T db psql -v ON_ERROR_STOP=1 -U "$pg_user" -d "$pg_db" < /root/roles.final.sql
rm -f /root/roles.sql /root/roles.final.sql
```

Do not run the `psql` line when the `grep` prints anything but `0`. A statement that fails is written
to the PostgreSQL log with its full text, password included (`$C logs db`, readable by root only; a
statement that succeeds is not logged). So after a failure do not run the whole block again: the roles
exist by then, and the first `CREATE ROLE` would fail and log a password once more. Remove the
statements that succeeded from the file, fix the error, run the rest, and then discard the log with
`$C up -d --force-recreate db` (the data stays in the volume). Every statement must answer
`CREATE ROLE`, `ALTER DATABASE` or `ALTER DEFAULT PRIVILEGES`. After the migration below, every table
must be owned by `qr_migrator`, and the application role must be able to read and write rows but not
create objects (section 11 checks the owner and the refused `CREATE TABLE`; `scripts/README.md`, "Host
layout", has the complete checks, including write access).

**Migrate and start.** Take the first migration without a pre-migration backup (the database is
empty); every later one starts with `backup.sh --pre-migrate` ([section 15](#15-later-releases)).

```sh
$C --profile ops run --rm migrate          # ends with "All migrations have been successfully applied."
$C up -d --wait web                        # waits for the image health check, /api/health/ready
$C ps
curl -sS http://127.0.0.1:3000/api/health/ready ; echo      # {"status":"ready"}
```

If `migrate` fails with an authentication error, the password in `migrate.env` differs from the one in
the role SQL: set it with `ALTER ROLE qr_migrator PASSWORD '...'` (same socket method) and run it again.
If `web` does not become healthy, `$C logs --tail 30 web` names the rejected variable (start-up exits
with status 78) or says `Readiness: database check failed`. Fix the file and run `$C up -d --wait web`
again.

## 6. Origin certificate and Authenticated Origin Pull

Nginx needs three files in `/opt/qr-city-guide/nginx/tls/`: `origin.crt`, `origin.key` and
`cloudflare-origin-pull-ca.pem`. They are never committed (`*.pem` is ignored, and the release policy
rejects certificate files in `deploy/nginx`).

**Origin certificate.** Create the key and the signing request on the VPS, so that the key never
travels:

```sh
cd /opt/qr-city-guide/nginx/tls
openssl req -new -newkey rsa:2048 -nodes -keyout origin.key -out origin.csr -subj "/CN=<canonical host>"
chmod 0600 origin.key
cat origin.csr
```

In the Cloudflare dashboard, create an Origin CA certificate for the canonical host (and the apex if
you redirect from it) from your own certificate signing request, so that the key never leaves the
VPS, and choose a validity period. Cloudflare's documentation on Origin CA certificates is the
authority for where that is done, what it is called and which validity periods are on offer. Paste
the certificate into `origin.crt` (mode `0644`) and delete `origin.csr`. This certificate is trusted
by Cloudflare only, which is what Full (strict) needs. Write the expiry date in your calendar too.

**Authenticated Origin Pull with a certificate of your own zone.** Nginx must accept connections only
from your Cloudflare zone, and the file `cloudflare-origin-pull-ca.pem` must therefore be the CA that
signed *your* client certificate. Do not use Cloudflare's shared origin-pull CA certificate, which
Cloudflare publishes for the default setting: every Cloudflare customer's zone presents the matching
shared client certificate, so any other customer could point their zone at your origin address and
get through your Nginx, around your Cloudflare Access, WAF and rate-limit rules. The file name is
historical; the content is your CA. See "Preconditions" in the
[origin ingress runbook](origin-ingress-runbook.md).

1. Create a small CA and a client certificate, on a trusted computer or on the VPS (the CA key stays
   with you; only the CA certificate goes to Nginx). On the VPS use a directory of its own, never
   `nginx/tls`: that directory is mounted into the Nginx container, so keys left there would be
   visible inside it.

   ```sh
   install -d -m 0700 /root/aop && cd /root/aop
   openssl req -x509 -newkey rsa:4096 -sha256 -days 3650 -nodes -keyout aop-ca.key -out aop-ca.pem \
     -subj "/CN=qr-city-guide origin pull CA"
   openssl req -newkey rsa:2048 -nodes -keyout aop-client.key -out aop-client.csr \
     -subj "/CN=qr-city-guide cloudflare origin pull"
   printf 'extendedKeyUsage = clientAuth\n' > aop-client.ext
   openssl x509 -req -in aop-client.csr -CA aop-ca.pem -CAkey aop-ca.key -CAcreateserial \
     -out aop-client.pem -days 3650 -sha256 -extfile aop-client.ext
   openssl verify -CAfile aop-ca.pem aop-client.pem          # aop-client.pem: OK
   ```

2. Upload `aop-client.pem` and `aop-client.key` to Cloudflare and enable Authenticated Origin Pulls for
   the zone with that certificate, exactly as Cloudflare's own documentation describes it
   ("Authenticated Origin Pulls", the zone-level setup with your own certificate; it uses the API, so
   it needs an API token). Follow the current pages: the steps and the API calls are Cloudflare's, not
   this repository's. Do not switch on the plain toggle that uses Cloudflare's certificate.
3. Install the CA certificate for Nginx: `cp aop-ca.pem /opt/qr-city-guide/nginx/tls/cloudflare-origin-pull-ca.pem`.
   Move `aop-ca.key`, `aop-client.key` and the CA serial file into the password manager and delete
   them from the VPS (`cd / && rm -r /root/aop` if you used the directory of step 1).
4. Write the expiry date of both certificates (`openssl x509 -enddate -noout -in <file>`) in your
   calendar, 60 days ahead of it. An expired client certificate makes Nginx refuse every request
   from Cloudflare. Rotation: "CIDR and credential rotation" in the origin ingress runbook.

What the checked-in Nginx template does with this recipe (`ssl_verify_client on` against your CA,
TLS 1.2 and 1.3 only, then the Cloudflare source check): a request without a client certificate gets
`400 No required SSL certificate was sent`, a certificate from another CA gets `400`, TLS 1.1 is
refused, and a certificate from your CA passes the TLS layer and then meets the source check (`403`
from anything that is not a Cloudflare address). Section 11 has the commands to see this on your
host.

## 7. Render and start Nginx

```sh
cd /opt/qr-city-guide
deploy/host/render-nginx.sh
```

The script takes the host name and the origin secret from `app.env` (the same file that the
application reads, so the two cannot differ), writes `nginx/nginx.production.conf` (mode `0600`,
because it contains the secret) and `nginx/includes/`, and checks the result with `nginx -t` in the
pinned image. Nothing is installed when the check fails. The template also listens on `[::]:443`, so
the kernel of the VPS must have IPv6 enabled: without it the check fails with "this machine has no
IPv6 support" (seen on a kernel started with `ipv6.disable=1`), and the production Nginx would not
start either, so enable IPv6 instead of using `--no-test`.

Start the container as the "Run" section of the origin ingress runbook specifies: the pinned image
with host networking and `--restart unless-stopped`. With the layout of this runbook:

```sh
IMAGE=$(jq -r '.repository + "@" + .digest' deploy/nginx/image.lock.json)
docker run -d --name origin-nginx --restart unless-stopped --network host \
  -v /opt/qr-city-guide/nginx/nginx.production.conf:/etc/nginx/nginx.conf:ro \
  -v /opt/qr-city-guide/nginx/includes:/etc/nginx/trusted-ingress:ro \
  -v /opt/qr-city-guide/nginx/tls:/etc/nginx/tls:ro \
  -v /opt/qr-city-guide/nginx/logs:/var/log/nginx \
  "$IMAGE"
docker exec origin-nginx nginx -t
ss -ltn
```

Look at the listening sockets with the process names, `ss -ltnp`. Only two programs may listen on a
wildcard address (`0.0.0.0` or `[::]`): nginx on 443 (`0.0.0.0:443` and `[::]:443`) and sshd on 22.
`docker-proxy` must appear only on `127.0.0.1:3000` and `127.0.0.1:5432`. Other listeners on the
loopback addresses (`127.0.0.53`, `127.0.0.54`, `::1`: the local name resolver, sometimes a local mail
agent on port 25) are normal on Debian and Ubuntu. Any other wildcard listener is a finding: find out
what it is, and stop or bind it to the loopback address before you continue to the firewall step.
Port 3000 must stay on the loopback address: the template proxies to `127.0.0.1:3000`.

To change the configuration later (a new secret, a new host name, a new release template), run
`deploy/host/render-nginx.sh` again (without `--no-test`: a failing check then installs nothing) and
then `docker exec origin-nginx nginx -t && docker exec origin-nginx nginx -s reload`. The script
overwrites the file in place on purpose: the container bind-mounts that single file, and a file that was replaced
(for example by an editor that writes a new file) leaves the running Nginx on the old content.
`docker restart origin-nginx` always picks up the current file.

## 8. Cloudflare

Work through the [Cloudflare checklist](cloudflare-checklist.md): SSL/TLS Full (strict), Always Use
HTTPS, the settings that must be off, the canonical host redirect, the rate-limiting rule and Cloudflare
Access for the admin. Then create the DNS records for the canonical host, proxied (the orange cloud):
an `A` record with the VPS IPv4 address and, if the VPS has one, an `AAAA` record with its IPv6 address.
Create no other record that points at the VPS and is not proxied.

The application sends `Strict-Transport-Security: max-age=63072000; includeSubDomains`. Browsers that
visit once will insist on HTTPS for the host and all its subdomains for two years, so every web-facing
name in the zone must be proxied or serve valid HTTPS itself before the first real visit (the checklist
has the details).

## 9. Netcup firewall

Do this after the site works through Cloudflare: first run the "Reachability and health" and "ingress
identity chain" checks of section 11. Keep the SCP console open in another browser tab as your way
back in. When the firewall is on, run the check "The origin refuses direct access" of section 11.

Create a firewall policy in Netcup's Server Control Panel and attach it to the server's network
interface (Netcup's documentation says where that is done, which rule limits apply and how IPv6 is
handled; if the panel offers no firewall for your product, use a host firewall as described below).
Rules to create:

| Direction | Protocol and port | Source | Purpose |
| --- | --- | --- | --- |
| in | TCP 443 | every IPv4 and IPv6 range of `deploy/nginx/cloudflare-ips.json` | Cloudflare to Nginx |
| in | TCP 22 | your own address (and a second one, if you have it) | SSH |
| in | everything else | nobody | closed, including 3000 and 5432 |

List the ranges with `jq -r '.ipv4[], .ipv6[]' deploy/nginx/cloudflare-ips.json`. The origin ingress
runbook lists TCP 80 and 443; this runbook opens only 443, because the Nginx template listens on 443
alone and Cloudflare answers plain HTTP itself (Always Use HTTPS). Follow "Atomic firewall update" of
the origin ingress runbook for the order and the checks. If your internet address changes, you lose
SSH: use the SCP console to edit the SSH rule. If the panel cannot hold all the ranges, put the same
rules into a host firewall instead; Docker's published ports bypass `ufw`, which is why the compose
file publishes 3000 and 5432 on the loopback address only.

Two cautions that this runbook could not check on a real Netcup server. The last rule closes
everything else: find out in Netcup's documentation whether the panel firewall is stateful, and if it
is not, also allow the replies to outgoing connections, or `apt`, `docker pull` and DNS stop working.
And the panel has no automatic rollback that this runbook knows of (the SCP console is the way back).
With a host firewall, schedule its removal before you switch it on, and cancel that only when a new
SSH session from a second terminal works, for example (a generic systemd timer, untested here):
`systemd-run --on-active=10m --unit=qr-firewall-rollback systemctl stop <firewall service>`, then
`systemctl stop qr-firewall-rollback.timer` to cancel it.

## 10. Timers, backup and log rotation

```sh
cd /opt/qr-city-guide
install -m 0644 deploy/host/logrotate-nginx.conf /etc/logrotate.d/qr-city-guide-nginx
logrotate -d /etc/logrotate.d/qr-city-guide-nginx 2>&1 | tail -n 15      # debug mode: changes nothing
grep -n 'notifempty' /etc/logrotate.conf                                 # should print nothing
```

The privacy notice states that the web server's error log is kept for 14 days. The rule rotates it
daily and keeps 13 rotated files besides the current one; a rule that skips empty files would stop the
rotated files from ageing (see
"Error log rotation" in the origin ingress runbook). Both stanzas of the file say `ifempty`, which
overrides a global `notifempty`, so the `grep` is a second look and not the only protection: if it
prints a line, remove that line anyway. `daily` means one rotation per run of the system's daily
logrotate job, and the file has no size limit between two runs: a log that grows very fast is caught
only by the disk check (monitoring and alerting, "Host checks"), not by logrotate.

`logrotate -d` does not run the `postrotate` command, so it cannot show whether the rotation reaches
the Nginx workers (they need the `0711` directory of section 2). Prove it once, now that the site
answers: force one rotation on the VPS, send one request from your own computer, and look at the files.
The first command does rotate the day-0 logs, which hold nothing worth keeping.

```sh
logrotate -f /etc/logrotate.d/qr-city-guide-nginx                     # on the VPS
curl -sS -o /dev/null https://<canonical host>/api/health/live        # on your own computer
ls -l /opt/qr-city-guide/nginx/logs                                   # on the VPS: access.log (new) and access.log.1
wc -l /opt/qr-city-guide/nginx/logs/access.log                        # at least 1: the request went to the NEW file
grep -c 'Permission denied' /opt/qr-city-guide/nginx/logs/error.log*  # 0 for every file
```

If `access.log` stays empty while `access.log.1` grows, or `Permission denied` shows up, the
directory is not `0711` (`chmod 0711 /opt/qr-city-guide/nginx/logs`, then `docker kill -s USR1 origin-nginx`).

Set up the backup first ([backup and restore](backup-and-restore.md), "Set up"): the age key pair, the
recipients file, `deploy/host/backup.sh --check` and a first run of `deploy/host/backup.sh`. Then
install the schedule with `crontab -e` as root. These lines replace the plain cron lines of
`scripts/README.md` ("Worker schedule"); they use the same lock files and time limits and add the
guard rails described in [`deploy/host`](../../deploy/host/README.md):

```cron
MAILTO=""
* * * * *   /opt/qr-city-guide/deploy/host/run-worker.sh outbox
*/5 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh operations
*/15 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh --name hostcheck --timeout 60 -- /opt/qr-city-guide/deploy/host/check-host.sh
17 3 * * *  /opt/qr-city-guide/deploy/host/backup.sh
```

The `hostcheck` line watches free disk space, free memory and the lifetime of the TLS files
([monitoring and alerting](monitoring-and-alerting.md), "Host checks").

Add the heartbeat URLs for the four jobs (`HEALTHCHECK_URL_OUTBOX`, `HEALTHCHECK_URL_OPERATIONS`,
`HEALTHCHECK_URL_HOSTCHECK` and `HEALTHCHECK_URL` for the backup) to `docker/.env`
([monitoring and alerting](monitoring-and-alerting.md), "Dead-man's switches"). Without them the host
works, but nobody notices when a job stops.

The workers read `APP_IMAGE` from `docker/.env` at every start. Check after the first minutes:

```sh
journalctl -t qr-outbox -n 8 --no-pager
journalctl -t qr-operations -n 8 --no-pager
```

Each run leaves a few lines under its tag: Compose's `Container qr-outbox-run Creating` and `Created`,
the worker's own line and the verdict (`ok after 1s`). The outbox line is
`{"worker":"outbox","attempted":0,"delivered":0,"at":"..."}`; the operations line has `alerts`,
`retention` and `calendar` (`"status":"not_configured"` while `BOOKING_ICAL_URL` is empty). The first
operations run creates the four alert rules.

## 11. Post-deploy verification

Run these from your own computer (not from the VPS), with `H=<canonical host>`. The expected answers
follow from the application code and the Nginx template (the identity headers that Nginx adds, the
security middleware, the health routes); a check that differs is a finding, not a detail.

**Reachability and health**

```sh
curl -sS https://$H/api/health/live ; echo       # {"status":"alive","timestamp":"..."}
curl -sS https://$H/api/health/ready ; echo      # {"status":"ready"}
curl -sSI http://$H/ | head -n 3                  # 301 to https:// (Always Use HTTPS)
```

**The ingress identity chain (the most important check).** A wrong admin token must answer `401`. A
`503` here means that Nginx and the application disagree on `ORIGIN_PROXY_SHARED_SECRET`, or that a
request reaches the application without passing Nginx. Do not repeat this more than twice: the admin
login allows five wrong tokens in 15 minutes from one address (a correct token gives its attempt
back), and the sixth attempt is answered `429` with a `Retry-After` header until the window ends.

```sh
curl -sS -i -X POST https://$H/api/admin/login -H 'Content-Type: application/json' \
  --data '{"token":"wrong-token-probe"}' | sed -n '1p;$p'
# HTTP/2 401   {"error":"Unauthorized"}
curl -sS -i https://$H/api/admin/flags | sed -n '1p;$p'      # 401 "Admin credentials required"
curl -sSI https://$H/admin | grep -i -E '^(HTTP|location)'   # 307 to /admin/login
```

**Pages, headers and caching**

```sh
curl -sSI https://$H/en | tr -d '\r' | grep -i -E '^(HTTP|strict-transport|x-frame|x-content-type|referrer-policy|cross-origin|cache-control|cf-cache-status|content-security)'
```

Expect `200`; `strict-transport-security: max-age=63072000; includeSubDomains`;
`x-frame-options: DENY`; `x-content-type-options: nosniff`; a `content-security-policy` with a
`nonce-` in `script-src` and no `'unsafe-inline'` there; `cross-origin-embedder-policy: unsafe-none`;
`cache-control: private, no-cache, no-store, max-age=0, must-revalidate`; `cf-cache-status: DYNAMIC`
(never `HIT` for a page); no `x-powered-by`.

```sh
curl -sSI https://$H/ | grep -i -E '^(HTTP|location)'                                  # 302 /en
curl -sSI -H 'Accept-Language: el' https://$H/ | grep -i -E '^(HTTP|location)'         # 302 /el
curl -sS https://$H/en | grep -o '<html[^>]*lang="[a-z]*"' | head -n 1                 # lang="en"
curl -sS https://$H/el | grep -o '<html[^>]*lang="[a-z]*"' | head -n 1                 # lang="el"
curl -sS https://$H/robots.txt | grep -E '^(Disallow: /admin|Disallow: /api|Sitemap)'
curl -sS https://$H/sitemap.xml | grep -o '<loc>https://[^/]*' | sort | uniq -c        # one line: your canonical host
curl -sS https://$H/en | grep -Eo '(src|href)="http://[^"]*"' | head                   # must print nothing
curl -sS https://$H/en | grep -c -E 'cloudflareinsights|email-protection|rocket-loader|data-cf-settings'   # 0
```

The sitemap and the `Sitemap:` line must name your canonical host: they come from
`NEXT_PUBLIC_SITE_URL`, which is compiled into the image. Also open `https://$H/en` and `https://$H/el`
in a browser with the developer console open: no "Mixed Content", CSP or hydration errors, and the map
loads.

**The canonical host rule** ([section 13](#13-the-canonical-host-name-rule)); with the alias `A`:

```sh
curl -sSI https://A/ | grep -i -E '^(HTTP|location)'     # 301 to https://<canonical host>/
```

**The origin refuses direct access.** From a computer that is not in a Cloudflare range (`-k` turns
certificate verification off, which is intended only for this probe of a bare address):

```sh
curl -sS --connect-timeout 8 -k -o /dev/null -w '%{http_code}\n' https://<vps address>/    # must time out
for port in 22 80 3000 5432 443; do nc -vz -w 5 <vps address> $port; done                  # only 22 from your own address
```

With the firewall in place, 443 times out for you. Before the firewall (section 9) the same request must
get `400` ("No required SSL certificate was sent") and never a page: that is Authenticated Origin Pull
working on its own. Any page content from the address is a failure; stop and fix it before you go on.

**The database** (on the VPS, `$C` as in section 4):

```sh
$C exec -T db psql -U qr_app -d qr_city_guide -c "SELECT migration_name FROM _prisma_migrations ORDER BY migration_name DESC LIMIT 1;"
$C exec -T db psql -U qr_app -d qr_city_guide -c "CREATE TABLE probe(i int);"       # must fail: permission denied for schema public
$C exec -T db psql -U qr_app -d qr_city_guide -c "SELECT name FROM alert_rules ORDER BY name;"   # four rules once operations has run
$C exec -T db psql -U qr_app -d qr_city_guide -c "SELECT tableowner, count(*) FROM pg_tables WHERE schemaname = 'public' GROUP BY 1;"   # one row: qr_migrator
$C exec -T db psql -U qr_app -d qr_city_guide -c "SELECT value FROM operational_settings WHERE key = 'feature_flags';"
```

The newest migration must be the one named as `EXPECTED_MIGRATION` in
`src/app/api/health/ready/route.ts` of the release (the readiness check enforces this). The
`CREATE TABLE` must be refused: the application role cannot change the schema. Every table must be
owned by `qr_migrator` (the owner query returns that one row). The last query shows the feature flags
(section 12).

## 12. First admin login and the dark launch

Open `https://<canonical host>/admin`, sign in with `ADMIN_DASH_SECRET`, and open Settings
(`/admin/settings`). **The migration seeds `portalEnabled` and `checkinEnabled` as true**
(`20260714090000_comprehensive_remediation`): the production default of "off" applies only when that
row is missing. If the launch should be dark, switch both off now; the in-stay pages then show no
portal and no check-in, and the public pages are unaffected. The portal is of no use without a
booking and a claim token that the administrator issues, so the window between going live and this
step is harmless. To keep the whole site private until launch day, put the complete host name behind
Cloudflare Access and remove that rule later (the checklist has the Access setup for the admin).

Also check that the admin works: availability, rate periods and the "Sync now" button
(`/admin/availability`; it needs `BOOKING_ICAL_URL`, see `scripts/README.md`).

## 13. The canonical host name rule

Nginx sets the `Host` header of every request to its `server_name` (`proxy_set_header Host
$server_name`), which `render-nginx.sh` takes from `NEXT_PUBLIC_SITE_URL`. A browser that reached the
site through an alias (for example `www.<canonical host>`) sends `Origin: https://www...` with its
`POST` requests, and the application, which sees the canonical `Host`, answers `403 CORS violation` for
every `POST` under `/api/`: sign-in, claims, check-in and error reports fail while the pages load. The
same request with the canonical origin passes (it reaches the route's own validation). Therefore:

- every alias is redirected to the canonical host at Cloudflare, before the origin (redirect rule in
  the checklist), and
- no alias is added to `ALLOWED_ORIGINS` or to `server_name`.

## 14. Security updates after launch

Monthly, and at once when an advisory below names something you run:

1. On the release host, `npm audit --omit=dev` (the release gate's `validate:security` step runs the
   same audit at `--audit-level=high`, see `docs/release-verification.md`).
2. Read the security announcements of what the images contain: Next.js, Node.js (`node:22-alpine`),
   Alpine Linux, PostgreSQL 16 and Nginx, plus Docker Engine and Cloudflare. For each, look for a release
   that fixes a vulnerability in the version in `package.json`, `docker/Dockerfile.security`,
   `docker/docker-compose.prod.yml` or `deploy/nginx/image.lock.json`.
3. Enable GitHub Dependabot **alerts** for the repository (a recommendation; the setting is in the
   repository's security settings, see GitHub's documentation). Alerts are a repository setting and
   need no workflow file, which fits the decision that this project has no GitHub Actions workflow.
   Whether to also enable Dependabot security updates, which open pull requests, is an owner decision
   that the deployment target does not make.
4. Update base images only through the controlled procedures in
   [`docs/release-verification.md`](../release-verification.md): "Controlled PostgreSQL digest update",
   "Controlled Node base-image digest update" and "Controlled Nginx digest update". Then release as in
   section 15.
5. On the VPS, `apt list --upgradable`, `docker version` against Docker's current release, and
   `[ -f /var/run/reboot-required ] && echo reboot needed`. Reboot in a quiet hour, then run the
   verification of section 11 again: the containers and cron jobs must come back by themselves.
6. Every quarter: refresh the Cloudflare IP ranges (`npm run check:cloudflare-ips:current`, then "CIDR
   and credential rotation" in the origin ingress runbook, which also changes the Netcup firewall) and
   do the restore drill of [backup and restore](backup-and-restore.md).

## 15. Later releases

The release sequence is in `scripts/README.md` ("Release sequence"). On this host it is:

```sh
cd /opt/qr-city-guide
# upload and load the images and extract the release files as in section 3, then:
C="docker compose -f docker/docker-compose.prod.yml"
cp -p docker/.env docker/.env.prev                        # the running release's file, for the rollback
deploy/host/backup.sh --pre-migrate --label <new sha>      # must exit 0 (and copies off-site when configured)
$C up -d --wait db
APP_IMAGE=villa-app:<new sha> $C --profile ops run --rm migrate    # the prefix is for this one command; nothing is exported
sed -i 's|^APP_IMAGE=.*|APP_IMAGE=villa-app:<new sha>|' docker/.env     # the cron jobs read this line
$C --profile ops config --images | grep villa-app          # only <new sha> tags (web, -migrate, -workers)
$C up -d --wait web
deploy/host/render-nginx.sh && docker exec origin-nginx nginx -t && docker exec origin-nginx nginx -s reload
```

Never `export APP_IMAGE` (or any other variable of `docker/.env`) in the shell: it overrides the file
for that shell only, while the cron jobs keep reading the file and would run the previous worker image
(`scripts/README.md`, "Host layout"). Run the `cp -p` once per release; if the sequence is repeated
after `docker/.env` was edited, restore the file from `docker/.env.prev` first.

The last line only matters when `deploy/nginx` changed in the release. Do not add `--no-test` to
`render-nginx.sh` here: it would overwrite the live configuration before any test, and a broken file
would take the ingress down at the next restart of the container or reboot. Without it, a failing
check installs nothing, the running Nginx keeps its configuration, and the chain stops before the
reload. A reload does not change the Nginx image: if `deploy/nginx/image.lock.json` changed (the
"Controlled Nginx digest update" of [`docs/release-verification.md`](../release-verification.md)),
recreate the container after the render, in a quiet hour: `docker rm -f origin-nginx`, then the
`IMAGE=...` and `docker run` commands of section 7 (the configuration, includes, certificates and logs
are on the host and stay). Keep the previous release's
images until the new `web` is healthy: rolling back means `cp -p docker/.env.prev docker/.env` and
`$C up -d --wait web`, and is possible only to a release that ran on the same schema (migrations are
forward-only). Remove old tags with `docker image rm villa-app:<old sha> villa-app:<old sha>-workers
villa-app:<old sha>-migrate` once you no longer need them.

## 16. Evidence to keep

The architecture decision lists live evidence as open. Keep these, dated and sanitized (no secret, no
key), outside the repository:

- the output of section 1.1 and section 1.5, and the SSH policy file;
- an export of the Netcup firewall rules, the date they were applied, and the section 11 results from
  before and after the firewall;
- screenshots of the Cloudflare settings named in the checklist (SSL/TLS mode, Authenticated Origin
  Pulls with your own certificate, the rules) and the expiry dates of the origin and client
  certificates;
- the results of the whole of section 11;
- the first successful `backup.sh --check` and backup, and the first restore drill;
- the owner's decisions on the open points of [backup and restore](backup-and-restore.md): the backup
  role (the deviation from the deployment target) and the recovery point and time objectives;
- the image IDs of each release and the date it went live.

## 17. When something is wrong

| Symptom | First look |
| --- | --- |
| `web` is not healthy, exit status 78 | `$C logs --tail 30 web`: the line names the variable. Fix the env file, `$C up -d --wait web`. |
| `web` is healthy, `https://<host>/` answers 502 | Nginx cannot reach `127.0.0.1:3000`: `docker logs origin-nginx --tail 20`, `curl http://127.0.0.1:3000/api/health/ready`. |
| `525`, `526` or `520` from Cloudflare | The origin certificate or the client certificate chain: `docker logs origin-nginx --tail 20`; SSL/TLS mode must be Full (strict). |
| `400` from Nginx through Cloudflare | Authenticated Origin Pull is not enabled for the zone, or the uploaded client certificate is not from the CA in `cloudflare-origin-pull-ca.pem`. |
| Sign-in and API `POST`s answer `503` | The origin secret differs between Nginx and `app.env`: run `deploy/host/render-nginx.sh`, reload Nginx and restart `web` (`$C up -d --force-recreate web`). |
| API `POST`s answer `403 CORS violation` from one host name only | An alias reaches the origin: [section 13](#13-the-canonical-host-name-rule). |
| Readiness answers `503` | `scripts/README.md`, "Troubleshooting". |
| A cron job does not run | `systemctl is-active cron`, `journalctl -t qr-outbox -n 20`, the heartbeat monitor, `crontab -l`. |
| Locked out of SSH | The SCP console (section 1.2), then undo the firewall rule or the SSH policy file. |
