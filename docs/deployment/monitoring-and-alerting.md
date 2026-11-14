# Monitoring and alerting

What tells you that the site is down, that a job stopped or that something needs attention, and what
to do about it. The application has four alert rules and two webhooks. Everything else is outside the
application and has to be set up: an external uptime monitor, heartbeats for the three scheduled jobs
and a host check. Without them, a stopped timer, a full disk or a failed backup is silent
([deployment target](../architecture/deployment-target.md): the alert path must be independent of the
failed job).

Status: the two webhook contracts are taken from `src/lib/operationalMonitor.ts` (alerts) and
`src/lib/bookingOutbox.ts` (check-in notifications), and the SQL from the schema in `prisma/`. When
one of those files changes, this page changes in the same commit. On 2026-10-21 the payloads,
headers, error texts, retry times and exit statuses below were checked by running the real operations
and outbox workers against a local receiver and a scratch PostgreSQL 16 with all migrations applied,
and every SQL statement was run there. Nothing here has been connected to an external monitor, and
nothing about a third-party service (a monitor, a chat tool, Cloudflare) could be checked offline:
such statements are written as "check that ...". Creating the monitor, the heartbeat checks and the
receiver is part of the setup.

## What alerts today, and how

The operations worker evaluates four rules on every run (every five minutes, from the timer set up in
the [day-0 runbook](day-0-runbook.md)). A breached rule opens one row in the `alerts` table. **No page
of the application lists these rows**: unless `ALERT_WEBHOOK_URL` is set, an alert is a database row
that nobody reads. To read them (`$C` is defined in the day-0 runbook, and the statements are
wrapped in double quotes, see the end of this page):

```sh
$C exec -T db psql -U qr_app -d qr_city_guide -c "SELECT r.name, a.status, a.value, a.opened_at, a.notification_delivered_at, a.notification_attempts FROM alerts a JOIN alert_rules r ON r.id = a.rule_id WHERE a.status IN ('OPEN','ACKNOWLEDGED') ORDER BY a.opened_at;"
```

| Rule | Severity | Opens when | Closes when |
| --- | --- | --- | --- |
| Dead outbox events | critical | a notification exhausted its 10 attempts (`DEAD`), not counting events that a guest erasure cancelled | no such event remains: retried by the admin, or deleted after 30 days |
| Stale pending outbox | high | the oldest `PENDING` or `LEASED` event is older than 15 minutes | the queue is drained |
| Recent high-severity security events | high | a high or critical audit event in the last 10 minutes; written today by `portal.refresh_token_replay` (a refresh token was replayed or used twice at once, and its family was revoked) and by `operations.retention_step_failed` (a retention step of the operations run failed: an operations fault, not a security incident; `details.step` names the step) | no such event in the last 10 minutes |
| Stale availability calendar | high | `BOOKING_ICAL_URL` is set and no sync succeeded for more than 3 hours (counted from the last success, or from the creation of the `calendar_sync_state` row if none ever did) | a sync succeeds; it is 0 while the URL is unset |

Not alerted by the application, so covered below: the web server or database being down, Nginx,
Cloudflare or DNS problems, certificate expiry, a stopped or failing timer (the operations run is what
evaluates the rules, so if it stops no alert can open), a full disk, a failed or missing backup, and
failed admin sign-ins. The last are recorded, though: each sign-in that the limiter admitted is a
`low` or `medium` security event (`admin.login_succeeded`, `admin.login_failed`, and one
`admin.login_rate_limited` per window), and the `401` and `429` are in the application log and the
Nginx access log. No rule counts them (see the last row of the table at the end).

## The alert webhook (`ALERT_WEBHOOK_URL`)

For every newly opened alert whose notification is not yet delivered, the operations worker sends:

```text
POST <ALERT_WEBHOOK_URL>
content-type: application/json
authorization: Bearer <ALERT_WEBHOOK_TOKEN>          (only when ALERT_WEBHOOK_TOKEN is set)
```

```json
{
  "event": "operational_alert.opened",
  "alert": {
    "id": "6b0e4c5a-0000-4000-8000-000000000000",
    "name": "Dead outbox events",
    "description": "At least one durable event exhausted all delivery attempts.",
    "metric": "outbox.dead.count",
    "severity": "critical",
    "value": 1,
    "threshold": 0,
    "openedAt": "2026-01-01T00:00:00.000Z"
  }
}
```

`value` and `threshold` are numbers (the stale rules report minutes, possibly fractional); `severity` is
`low`, `medium`, `high` or `critical`; `metric` is `outbox.dead.count`, `outbox.pending.oldest_minutes`,
`security.high.count` or `availability.calendar.stale_minutes`. Besides the headers above the request
carries only the defaults of Node's `fetch` (`user-agent: node`, `accept`, `accept-language`,
`accept-encoding`, `sec-fetch-mode`). It contains no personal data. The token, when set, must have at
least 20 characters (`web` refuses to start with a shorter one).

How it behaves:

- **HTTPS only in production.** An `http` URL makes the run fail with `ALERT_WEBHOOK_URL must use HTTPS
  in production`; the schema rejects it when `web` starts. The certificate must be one that Node trusts
  by default.
- **A success is any `2xx`.** Any other status fails with `Alert webhook responded with <status>`.
- **No redirects.** A redirect (even `http` to `https`, or a missing trailing slash) fails with `fetch
  failed`. Configure the final URL. The same text covers every connection problem: a DNS error, a
  refused connection and a certificate that Node does not trust all end in `fetch failed`, and the
  cause is not stored. `curl -sS -i` from the VPS shows the cause of most of them, but `curl` may
  accept a certificate that Node does not trust (one from a private CA, for example).
- **Five-second limit** for the whole request; a slow receiver fails with `The operation was aborted
  due to timeout`.
- **Retried every five minutes** (every operations run) while the alert stays open and undelivered,
  without a limit. Each failure increments `notification_attempts` and stores the error text (never
  the URL) in `notification_last_error`, and makes that operations run exit with status `1`; the
  retention step and the calendar step of the same run still run.
- **Sent once.** After a `2xx` the alert is marked delivered and not sent again. There is no "resolved"
  message, and an alert that closes before it was delivered is never announced.
- The request has **no idempotency header**. If your receiver answered but the answer was lost, the
  same alert arrives again with the same `alert.id`: use that as the key for duplicates.

`ALERT_WEBHOOK_REQUIRED=1` makes `web` refuse to start without `ALERT_WEBHOOK_URL`, and makes an
operations run fail while an alert is open that has no webhook to go to
(`ALERT_WEBHOOK_URL is required but not configured`). Set it to `1` once the receiver is proven, so
that a forgotten URL cannot make the alerts silent again.

### Test the receiver

From any computer, send the same request to your receiver (use a made-up alert, never a real token in
a shared place):

```sh
curl -sS -i -X POST "<receiver URL>" -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <ALERT_WEBHOOK_TOKEN>' \
  --data '{"event":"operational_alert.opened","alert":{"id":"11111111-1111-4111-8111-111111111111","name":"Dead outbox events","description":"At least one durable event exhausted all delivery attempts.","metric":"outbox.dead.count","severity":"critical","value":1,"threshold":0,"openedAt":"2026-01-01T00:00:00.000Z"}}'
```

It must answer `2xx` within five seconds and must not redirect. Then run the end-to-end drill below.

## The check-in webhook (`CHECKIN_REQUEST_WEBHOOK_URL`)

When a guest sends an arrival-time request or an administrator approves or rejects one, the
application records a notification in the database (in the same transaction as the request). The
request that caused it makes the first delivery attempt, and the outbox worker (every minute) retries
from there:

```text
POST <CHECKIN_REQUEST_WEBHOOK_URL>
content-type: application/json
idempotency-key: <event id>
authorization: Bearer <CHECKIN_REQUEST_WEBHOOK_TOKEN>     (mandatory when the URL is set, at least 20 characters)
```

```json
{
  "event": "check_in_time_request.updated",
  "eventId": "<uuid, the same as the idempotency-key>",
  "requestId": "<uuid>",
  "bookingId": "<uuid or null>",
  "userId": "<uuid or null>",
  "guestName": "<text or null>",
  "guestEmail": "<text or null>",
  "guestPhone": "<text or null>",
  "requestedTime": "15:00",
  "message": "<text or null>",
  "previousStatus": "PENDING",
  "status": "APPROVED",
  "occurredAt": "2026-01-01T00:00:00.000Z"
}
```

`event` is `check_in_time_request.created` (with `status` `PENDING`) or `check_in_time_request.updated`
(an administrator decided: `previousStatus` `PENDING`, `status` `APPROVED` or `REJECTED`); `previousStatus`
is left out of a `created` message. **The body contains personal data** (name, e-mail, phone, message):
the receiver is a processor, must be https, must not log bodies and should keep nothing longer than it
needs.

- HTTPS only in production, success is any `2xx`, redirects fail, the limit is five seconds: as for the
  alert webhook (the worker enforces the https rule itself, before the token is attached).
- **The request that caused the event makes the first attempt.** When a guest sends an arrival-time
  request (`POST /api/check-in/arrival-request`) or an administrator decides one
  (`PATCH /api/admin/check-in-requests/<id>`), the request and its outbox event are committed and the
  code then tries to deliver that event once, inside the same HTTP request, with the same five-second
  limit. A slow or failing receiver therefore delays that one response by up to five seconds (the
  answer is still a success, with the notification marked `queued`), and the outbox worker retries from
  there.
- A failure keeps the event `PENDING` with `last_error`, and the next attempt waits `1, 2, 4, 8, 16,
  32, 60, 60, 60` minutes after the first nine failures. The tenth failure makes it `DEAD`, about four
  hours after the first attempt, and the alert "Dead outbox events" opens. Administrators requeue a
  dead event with "Retry notification" in `/admin/requests` (the attempt count starts again at zero and
  the next outbox run delivers it); retention deletes delivered and dead events 30 days after they
  were delivered or last changed.
- **The outbox worker exits with status `0` even when the receiver rejects every event.** Delivery
  failures are recorded on the event (`last_error`) and retried; only a failure of the worker itself
  (the database is unreachable, for example) makes it exit with `1`. A broken receiver is therefore
  visible through the alerts "Stale pending outbox" (after 15 minutes) and "Dead outbox events", not
  through the outbox heartbeat.
- An outbox run takes up to 50 due events, five at a time. A lease on an event lasts five minutes, and
  an abandoned lease is recovered by the next run.
- **Use `idempotency-key` to drop duplicates.** The same event can arrive twice (a lost answer, a
  recovered lease, or a restore of an older backup).
- Events are recorded only while `CHECKIN_REQUEST_WEBHOOK_URL` is set for `web`. A request made before
  the URL was set is never announced. `web` and the workers read the same `app.env`, so they cannot
  disagree; if the URL is missing for the worker only, every attempt fails with `Webhook destination is
  not configured` and burns attempts toward `DEAD`.

## Chat webhooks may reject this payload

The application cannot change its body, which is the contract above. The incoming webhooks of chat
tools (Slack, Discord, Teams and similar) have their own JSON formats, for example with a `text` or a
`content` field. Check in the tool's documentation whether its incoming webhook accepts an arbitrary
JSON body and a bearer token; if it needs its own format, use one of these instead:

- an **automation service with a catch-hook** (check that it accepts any JSON body, then sends an
  e-mail, an SMS or a push message, or posts to the chat you prefer);
- a **small relay that you control**: an HTTPS endpoint that accepts this contract, answers `2xx` within
  five seconds and forwards a short message of your own. It checks the bearer token in constant time,
  ignores the body fields it does not need and deduplicates as described above.

The check-in receiver gets personal data and is therefore a processor. The alert receiver gets none
(the alert body is rule names and figures), so it is one only if you also send it something else. Prefer
a provider in the EU for the check-in webhook, and record both receivers with the other recipients
([processors](../privacy/processors.md)).

## External uptime monitor

Create a monitor that is not on the VPS, not on Cloudflare's network and not in the same account as
the server (a failure of the VPS, of Cloudflare or of one account must not silence the monitor):

- URL `https://<canonical host>/api/health/ready`, method `GET` (or `HEAD`), every one to five minutes;
- it must expect status `200` and, if the service can, the text `"status":"ready"`;
- alert after two failures in a row, to at least two channels (for example e-mail and a push message);
- no custom header or secret is needed, and none must be put in the URL.

This one check covers the whole path: DNS, Cloudflare, the Authenticated Origin Pull handshake, Nginx,
the web container and the database. It does not show whether the workers run or whether an alert was
delivered; the heartbeats below do. Readiness answers `200` with `{"status":"ready"}`, and `503` with
`{"status":"not_ready"}` in three cases, each with its own warning in `$C logs web`: the database does
not answer within about two seconds or the migration table cannot be read (`Readiness: database check
failed`), the newest migration is older than the image expects (`Readiness: expected migration is not
applied`: run `migrate`), or newer (`Readiness: database schema is newer than this image`: start the
image that matches the database). The answer is cached for two seconds. `/api/health/live` answers
`200` while the web process runs and never touches the database, so a monitor on it stays green when
the database is down: use `ready`. If the monitor's address is challenged or limited by a Cloudflare
rule, exclude it ([Cloudflare checklist](cloudflare-checklist.md)); check that the monitor's plan
allows the interval you choose.

## Dead-man's switches

A heartbeat check expects a ping from a job at a fixed rhythm and alerts when a ping is missing. It is
the only thing that notices a job that does not run at all. `run-worker.sh` and `backup.sh` ping the
URL after a successful run and `<URL>/fail` after a failed one (`/fail` is put before any query
string). This follows the ping convention of Healthchecks (hosted or self-hosted), which could not be
checked offline: check your service's documentation for its ping URL and for the way to report a
failure. A service with another URL shape still alerts on the missing success ping. Create one check
per job at your monitor, copy its ping URL into `docker/.env` (it is a secret there and nowhere else),
and set the rhythm:

| Job | Setting in `docker/.env` | Runs | Period of the check | Grace |
| --- | --- | --- | --- | --- |
| outbox worker | `HEALTHCHECK_URL_OUTBOX` | every minute | 1 minute | 5 minutes |
| operations worker | `HEALTHCHECK_URL_OPERATIONS` | every 5 minutes | 5 minutes | 10 minutes |
| nightly backup | `HEALTHCHECK_URL` | daily 03:17 | 1 day | 3 hours |
| host check | `HEALTHCHECK_URL_HOSTCHECK` | every 15 minutes | 15 minutes | 30 minutes |

The grace of the operations check is short on purpose: while it is silent no alert can open.

What a ping means (the `GET` requests were observed against a local receiver; `run-worker.sh` makes
them with `curl` on the VPS itself, https only, ten seconds, one retry, and logs `heartbeat ping
failed` when they fail):

- **Who pings, and when.** Only the host scripts, after the job has ended. Nothing in the application,
  in Nginx or in a container pings. If the host dies, or cron stops, or the VPS cannot reach the
  monitor, the pings stop, and the monitor alerts after the period plus the grace. This is also the
  only signal of a dead host besides the uptime monitor, so use a monitoring service that is not on
  the same host or account, and test its alert channels (the drill below).
- **`/fail` means that the job ran and failed**; `journalctl -t qr-<name>` has the reason. A job that
  exceeds its time limit (55 seconds for the outbox, 280 for operations, 60 for the host check) is
  killed with exit status `124` and sends `/fail`. A run that finds the previous run still holding the
  lock is skipped and sends nothing.
- **Silence means that the job did not complete or did not start**: host down, cron stopped, the
  crontab line missing, the lock still held, or the VPS has no route to the monitor.
- **The outbox heartbeat does not prove that notifications arrive.** The worker exits `0` while the
  receiver rejects them (see the check-in webhook); it exits `1` only when the worker itself fails.
- **The operations heartbeat does not prove that no alert is open.** The run exits `1` when any of its
  three steps throws: an alert notification that could not be delivered (or an open alert with no
  `ALERT_WEBHOOK_URL` while `ALERT_WEBHOOK_REQUIRED=1`), a database error, a failed retention step
  (any of its deletes or redactions, or the guest erasure; each step runs on its own, so one failing
  step never blocks the others), or a missing `calendar_sync_state` row. The other steps still run and are
  logged. It exits `0` while alerts are open and `ALERT_WEBHOOK_URL` is unset, and while the calendar
  fetch from Booking.com keeps failing: that failure is recorded in `calendar_sync_state` and only the
  alert "Stale availability calendar" reports it, after 3 hours.

## Host checks

`check-host.sh` fails (exit status `1`) when `/` or `/var/lib/docker` is more than 85 percent full,
less than 200 MB of memory is available, or the origin certificate or the origin pull CA expires
within 60 days; it prints one line for each failed check. It does not look at the client certificate
that Cloudflare presents (it is not in `nginx/tls/`): keep its expiry date in your calendar, as the
day-0 runbook says. Run the check through the wrapper, every 15 minutes, as one more line of root's
crontab:

```cron
*/15 * * * * /opt/qr-city-guide/deploy/host/run-worker.sh --name hostcheck --timeout 60 -- /opt/qr-city-guide/deploy/host/check-host.sh
```

Run `/opt/qr-city-guide/deploy/host/check-host.sh` by hand to see the result, and
`journalctl -t qr-hostcheck -n 5` for the last runs. The limits are settings (see
`compose.env.example`). When the disk check fails: `df -h`, `du -xh /var/lib/docker /opt/qr-city-guide
/var/log --max-depth=1 | sort -h | tail`; old release archives in `releases/`, unused image tags
(`docker image rm` for tags you no longer need), journal size (`journalctl --vacuum-size=200M`) and
`backups/` are the usual causes. Container logs are bounded by the compose file (10 MB, five files per
service). The Nginx logs in `/opt/qr-city-guide/nginx/logs` are rotated once a day by `logrotate` with
no size limit in between, so a flood of requests can fill the disk within a day; this disk check is
what notices it.

## End-to-end drill

Do this once before launch, and after any change of the receiver.

1. **Alert webhook.** Set `ALERT_WEBHOOK_URL` (and the token) in `app.env` and run
   `$C up -d --force-recreate web`: that validates the new values, which the workers never do; they
   read `app.env` afresh at every run. Then open a harmless critical alert with a dead event that
   belongs to nothing, and wait for the next operations run (at most five minutes). This works only
   when no "Dead outbox events" alert is open already (the receiver is told once per alert). The row
   has no check-in request, so no admin page shows it:

   ```sh
   $C exec -T db psql -U qr_app -d qr_city_guide -c "INSERT INTO outbox_events (id, event_type, destination, aggregate_type, aggregate_id, idempotency_key, payload, status, attempt_count, next_attempt_at, last_error, created_at, updated_at) VALUES (gen_random_uuid(), 'alert_drill', 'checkin_request_webhook', 'drill', 'drill', 'alert-drill-1', '{}', 'DEAD', 10, now(), 'drill', now(), now());"
   ```

   Your receiver must be called once, with the name "Dead outbox events". Then remove the row; the next
   run resolves the alert silently:

   ```sh
   $C exec -T db psql -U qr_app -d qr_city_guide -c "DELETE FROM outbox_events WHERE idempotency_key = 'alert-drill-1';"
   ```

2. **Heartbeat.** Stop cron (`systemctl stop cron`) for as long as the slowest check needs (period plus
   grace: 15 minutes for the operations check, so about 20), wait for the monitor to alert for the
   outbox and operations checks, then `systemctl start cron` and check that `systemctl is-active cron`
   prints `active`; the checks must recover. A nightly backup that falls into the window is missed:
   do not do this around 03:17.
3. **Uptime monitor.** At a quiet hour, `docker stop origin-nginx` for as long as the monitor needs to
   alert (two failed checks in a row, so twice its interval); the site is down for guests meanwhile.
   The monitor must alert; then `docker start origin-nginx`, and check that `/api/health/ready`
   answers `200` again and that the monitor recovers.

## What to do when something fires

| What fired | Look at | Usual cause and action |
| --- | --- | --- |
| Uptime monitor: down or `503` | `curl -sS https://<host>/api/health/ready`, then on the VPS `curl -sS http://127.0.0.1:3000/api/health/ready`, `$C ps`, `docker ps`, `$C logs --tail 30 web` | A `502` from the origin means that Nginx cannot reach `web` on 127.0.0.1:3000: the web container is down or restarting. A `52x` page from Cloudflare (for example `521`, `525`, `526`) means that Cloudflare could not complete its request to the origin: Nginx is not running, or the origin certificate or the client-certificate handshake fails (`docker logs origin-nginx --tail 20`); look the code up in Cloudflare's documentation. A `503` from the application comes with one of the three `Readiness:` warnings of the uptime section: `database check failed` points at `db` (`$C logs --tail 30 db`, free disk space), `expected migration is not applied` at a missed `migrate`, `schema is newer than this image` at a wrong `APP_IMAGE`. After a reboot, `docker ps` must show `db`, `web` and `origin-nginx` running. |
| Heartbeat missing: outbox or operations | `systemctl is-active cron`, `crontab -l`, `journalctl -t qr-outbox -n 20`, `ls -l /run/lock/qr-*.lock` | Cron stopped or the crontab lost its lines; or runs time out (the log says `timed out after`): check `db` and the load. Repeated `skipped` lines mean that a previous run still holds the lock: `docker ps` shows its container (`qr-outbox-run` or `qr-operations-run`). |
| Heartbeat `/fail`: operations | `journalctl -t qr-operations -n 20` | The JSON line names the failing steps: `alerts` (a notification could not be delivered: `Alert webhook responded with 5xx`, `The operation was aborted due to timeout`, `fetch failed`, or `ALERT_WEBHOOK_URL is required but not configured`), `retention` (a retention step failed: the entry reads `N retention step(s) failed: <step>: ...` and lists every failed step; the other retention steps still ran) or `calendar` (the `calendar_sync_state` row is missing). The same database error in every step means that `db` is unreachable (`$C ps`, `$C logs --tail 30 db`). Fix the cause; the next run retries. A Booking.com fetch that fails exits `0` and is not in this list: see the calendar row. |
| Heartbeat missing or `/fail`: backup | `journalctl -t qr-backup -n 20`, `backup.sh --check` | Exit statuses in [`deploy/host`](../../deploy/host/README.md): `5` database, disk space or a missing tool, `6` dump or encryption, `7` off-site copy. Run it by hand after fixing the cause. A missing ping with no log line means that cron did not run it. |
| Host check missing or `/fail` | `check-host.sh` by hand | Disk, memory or certificate lifetime, as above. Renew the origin certificate or the Authenticated Origin Pull files before they expire ([day-0 runbook](day-0-runbook.md), section 6). |
| Alert: Dead outbox events | `SELECT id, event_type, attempt_count, last_error, updated_at FROM outbox_events WHERE status = 'DEAD' AND payload ->> 'redacted' IS DISTINCT FROM 'true' ORDER BY updated_at DESC LIMIT 20;` | `last_error` says what the receiver answered. Fix the receiver or the URL and token in `app.env`, then press "Retry notification" in `/admin/requests` for each request. The alert closes when no dead event is left. Events that a guest erasure cancelled are marked `{"redacted": true}`; the query leaves them out, as the alert does. |
| Alert: Stale pending outbox | `SELECT status, count(*), min(created_at), max(attempt_count) FROM outbox_events WHERE status IN ('PENDING','LEASED') GROUP BY status;` | Either the outbox timer stopped (heartbeat), or the receiver keeps failing and the retries are backing off (up to 60 minutes). The age counts from the creation of the event, so an event that waits for its next retry keeps the alert open. Compare `last_error`. |
| Alert: Recent high-severity security events | `SELECT occurred_at, event_type, severity, path, details FROM security_audit_events WHERE severity IN ('high','critical') ORDER BY occurred_at DESC LIMIT 20;` | `portal.refresh_token_replay`: a guest's refresh token was used again or twice at once and the family was revoked; the guest signs in again. One event can be a double tap or a flaky connection. Repeated events for one family, or for many families at once, can mean that copies of sign-in cookies are in use: follow the [breach runbook](../privacy/breach-runbook.md) (section 3 explains when the 72-hour clock starts). `operations.retention_step_failed`: an operations fault, not a breach: `details.step` names the retention step that failed and `details.error` is an error code (no personal data). Fix that step (the `retention` entry of the heartbeat line has the message; the cause is usually the database) and do not start the breach runbook for it; the alert closes on its own 10 minutes after the last failing run. |
| Alert: Stale availability calendar | `/admin/availability` ("Last success", "Last error"), `SELECT last_success_at, last_failure_at, last_error_code, last_http_status, consecutive_failures FROM calendar_sync_state;` | `last_error_code` `http_status` with a `last_http_status` of 4xx: the export link was regenerated or switched off in the Booking.com extranet: set the new `BOOKING_ICAL_URL` (`scripts/README.md`). `timeout` or `network`: Booking.com or the VPS network. No attempts at all: the operations timer stopped. Press "Sync now". After 12 hours the public pages drop the calendar. |
| Alert webhook failing (operations exits `1`) | `SELECT notification_attempts, notification_last_error FROM alerts WHERE notification_delivered_at IS NULL;` | The stored text is the status or error without the URL. Fix the receiver; the next run retries. |
| Many `401` or `429` on the admin login | `SELECT date_trunc('hour', occurred_at) AS hour, event_type, count(*) FROM security_audit_events WHERE event_type LIKE 'admin.login%' AND occurred_at > now() - interval '24 hours' GROUP BY 1, 2 ORDER BY 1 DESC, 2;` | The login allows five wrong tokens in 15 minutes from one address (a correct token gives its attempt back); the sixth attempt gets `429` with a `Retry-After` header until the window ends, and is stored once per window. Failed attempts are `admin.login_failed` (medium), refusals `admin.login_rate_limited` (medium); no rule alerts on them, and the rows are kept 90 days. A steady stream from many addresses is a guessing attempt: it cannot succeed against a 64-character secret (the length the day-0 runbook generates), but consider Cloudflare Access for `/admin` ([Cloudflare checklist](cloudflare-checklist.md)). |

The queries run through `$C exec -T db psql -U qr_app -d qr_city_guide -c "..."`. Inside double quotes a
statement must not contain a double quote itself: the shell would end the string there and PostgreSQL
would receive something else. The statements on this page use single quotes only. For a longer query,
open a session with `$C exec db psql -U qr_app -d qr_city_guide` and type it at the prompt.

The log lines of the application are JSON, one object per line, in `$C logs web`
(`LOG_STRUCTURED=true`); the route is in `context.route` and the status in `metadata.status`. The
counts of `401` and `429` on the admin login in the last 24 hours, from the log instead of the
database:

```sh
$C logs --since 24h web | grep '"route":"/api/admin/login"' | grep -c '"status":401'
$C logs --since 24h web | grep '"route":"/api/admin/login"' | grep -c '"status":429'
```
