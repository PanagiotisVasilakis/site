# Monitoring and alerting

What tells you that the site is down, that a job stopped or that something needs attention, and what
to do about it. The application has four alert rules and two webhooks. Everything else is outside the
application and has to be set up: an external uptime monitor, heartbeats for the three scheduled jobs
and a host check. Without them, a stopped timer, a full disk or a failed backup is silent
([deployment target](../architecture/deployment-target.md): the alert path must be independent of the
failed job).

Status: the two webhook contracts are taken from `src/lib/operationalMonitor.ts` (alerts) and
`src/lib/bookingOutbox.ts` (check-in notifications), and the SQL from the schema in `prisma/`, as
they are in this repository at commit `ae1449d`. When one of those files changes, this page changes
in the same commit. Nothing here has been connected to an external monitor: creating the monitor, the
heartbeat checks and the receiver is part of the setup.

## What alerts today, and how

The operations worker evaluates four rules on every run (every five minutes, from the timer set up in
the [day-0 runbook](day-0-runbook.md)). A breached rule opens one row in the `alerts` table. **No page
of the application lists these rows**: unless `ALERT_WEBHOOK_URL` is set, an alert is a database row
that nobody reads.

| Rule | Severity | Opens when | Closes when |
| --- | --- | --- | --- |
| Dead outbox events | critical | a notification exhausted its 10 attempts (`DEAD`), not counting events that a guest erasure cancelled | no such event remains: retried by the admin, or deleted after 30 days |
| Stale pending outbox | high | the oldest `PENDING` or `LEASED` event is older than 15 minutes | the queue is drained |
| Recent high-severity security events | high | a high or critical audit event in the last 10 minutes; today only `portal.refresh_token_replay` (a refresh token was replayed or used twice at once, and its family was revoked) | no such event in the last 10 minutes |
| Stale availability calendar | high | `BOOKING_ICAL_URL` is set and no sync succeeded for 3 hours | a sync succeeds; it is 0 while the URL is unset |

Not alerted by the application, so covered below: the web server or database being down, Nginx,
Cloudflare or DNS problems, certificate expiry, a stopped or failing timer (the operations run is what
evaluates the rules, so if it stops no alert can open), a full disk, a failed or missing backup, and
failed admin sign-ins (`401` and `429` appear only in the application log and the Nginx access log).

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
`security.high.count` or `availability.calendar.stale_minutes`. The request carries the Node runtime's
default `user-agent` and `accept` headers and no other custom header. It contains no personal data.

How it behaves:

- **HTTPS only in production.** An `http` URL makes the run fail with `ALERT_WEBHOOK_URL must use HTTPS
  in production`; the schema rejects it when `web` starts. The certificate must be one that Node trusts
  by default.
- **A success is any `2xx`.** Any other status fails with `Alert webhook responded with <status>`.
- **No redirects.** A redirect (even `http` to `https`, or a missing trailing slash) fails with `fetch
  failed`. Configure the final URL.
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

When a guest sends or an administrator changes an arrival-time request, the application records a
notification in the database (in the same transaction), and the outbox worker (every minute) delivers
it:

```text
POST <CHECKIN_REQUEST_WEBHOOK_URL>
content-type: application/json
idempotency-key: <event id>
authorization: Bearer <CHECKIN_REQUEST_WEBHOOK_TOKEN>     (the token is mandatory when the URL is set)
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
- **The guest's own request makes the first attempt.** When a guest sends an arrival-time request,
  `POST /api/check-in/arrival-request` commits the request and its outbox event and then tries to
  deliver that event once, inside the guest's request, with the same five-second limit. A slow or
  failing receiver therefore delays that one response by up to five seconds (the guest still gets a
  success, with the notification marked `queued`), and the outbox worker retries from there.
- A failure keeps the event `PENDING` with `last_error`, and the next attempt waits `1, 2, 4, 8, 16,
  32, 60, 60, 60` minutes after the first nine failures. The tenth failure makes it `DEAD`, about four
  hours after the first attempt, and the alert "Dead outbox events" opens. Administrators requeue a
  dead event with "Retry notification" in `/admin/requests`; retention deletes delivered and dead
  events 30 days after they were delivered or last changed.
- An outbox run takes up to 50 due events, five at a time. A lease on an event lasts five minutes, and
  an abandoned lease is recovered by the next run.
- **Use `idempotency-key` to drop duplicates.** The same event can arrive twice (a lost answer, a
  recovered lease, or a restore of an older backup).
- Events are recorded only while `CHECKIN_REQUEST_WEBHOOK_URL` is set for `web`. A request made before
  the URL was set is never announced. `web` and the workers read the same `app.env`, so they cannot
  disagree; if the URL is missing for the worker only, every attempt fails with `Webhook destination is
  not configured` and burns attempts toward `DEAD`.

## Chat webhooks reject this payload

Slack, Discord, Teams and similar incoming webhooks expect their own JSON (for example a `text` or
`content` field) and reject a body without it, typically with `400`; the application cannot change
its body, which is the contract above. Use one of these instead:

- an **automation service with a catch-hook** (a "webhook trigger" that accepts any JSON, then sends an
  e-mail, an SMS or a push message, or posts to the chat you prefer);
- a **small relay that you control**: an HTTPS endpoint that accepts this contract, answers `2xx` within
  five seconds and forwards a short message of your own. It checks the bearer token in constant time,
  ignores the body fields it does not need and deduplicates as described above.

Either is a processor: the alert body has no personal data, the check-in body does. Prefer a provider
in the EU for the check-in webhook and record it with the other recipients of the privacy notice.

## External uptime monitor

Create a monitor that is not on the VPS, not on Cloudflare's network and not in the same account as
the server:

- URL `https://<canonical host>/api/health/ready`, method `GET` (or `HEAD`), every one to five minutes;
- it must expect status `200` and, if the service can, the text `"status":"ready"`;
- alert after two failures in a row, to at least two channels (for example e-mail and a push message);
- no custom header or secret is needed, and none must be put in the URL.

This one check covers the whole path: DNS, Cloudflare, the Authenticated Origin Pull handshake, Nginx,
the web container and the database. Readiness answers `503` when the database is unreachable or its
schema does not match the image. If the monitor's address is challenged or limited by a Cloudflare
rule, exclude it ([Cloudflare checklist](cloudflare-checklist.md)).

## Dead-man's switches

A heartbeat check expects a ping from a job at a fixed rhythm and alerts when a ping is missing. It is
the only thing that notices a job that does not run at all. `run-worker.sh` and `backup.sh` ping the
URL after a successful run and `<URL>/fail` after a failed one, using the convention of Healthchecks
(hosted or self-hosted); a monitor with another URL shape still alerts on the missing success ping.
Create one check per job at your monitor, copy its ping URL into `docker/.env` (it is a secret there
and nowhere else), and set the rhythm:

| Job | Setting in `docker/.env` | Runs | Period of the check | Grace |
| --- | --- | --- | --- | --- |
| outbox worker | `HEALTHCHECK_URL_OUTBOX` | every minute | 1 minute | 5 minutes |
| operations worker | `HEALTHCHECK_URL_OPERATIONS` | every 5 minutes | 5 minutes | 10 minutes |
| nightly backup | `HEALTHCHECK_URL` | daily 03:17 | 1 day | 3 hours |
| host check | `HEALTHCHECK_URL_HOSTCHECK` | every 15 minutes | 15 minutes | 30 minutes |

A skipped run (the previous run still holds the lock) sends nothing, so a job that hangs shows up as
silence. The grace of the operations check is short on purpose: while it is silent no alert can open.
A `/fail` ping means that the job ran and failed; `journalctl -t qr-operations` has the reason.

## Host checks

`check-host.sh` fails when a file system is more than 85 percent full, less than 200 MB of memory is
available, or the origin certificate or the origin pull CA expires within 60 days; it prints one line
for each failed check. Run it through the wrapper, every 15 minutes, as one more line of root's
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
   belongs to nothing, and wait for the next operations run (at most five minutes):

   ```sh
   $C exec -T db psql -U qr_app -d qr_city_guide -c "INSERT INTO outbox_events (id, event_type, destination, aggregate_type, aggregate_id, idempotency_key, payload, status, attempt_count, next_attempt_at, last_error, created_at, updated_at) VALUES (gen_random_uuid(), 'alert_drill', 'checkin_request_webhook', 'drill', 'drill', 'alert-drill-1', '{}', 'DEAD', 10, now(), 'drill', now(), now());"
   ```

   Your receiver must be called once, with the name "Dead outbox events". Then remove the row; the next
   run resolves the alert silently:

   ```sh
   $C exec -T db psql -U qr_app -d qr_city_guide -c "DELETE FROM outbox_events WHERE idempotency_key = 'alert-drill-1';"
   ```

2. **Heartbeat.** Stop cron for a few minutes (`systemctl stop cron`), wait for the monitor to alert
   for the outbox and operations checks, then `systemctl start cron`; the checks must recover.
3. **Uptime monitor.** `docker stop origin-nginx` for two minutes; the monitor must alert; then
   `docker start origin-nginx`.

## What to do when something fires

| What fired | Look at | Usual cause and action |
| --- | --- | --- |
| Uptime monitor: down or `503` | `curl -sS https://<host>/api/health/ready`, then on the VPS `curl -sS http://127.0.0.1:3000/api/health/ready`, `$C ps`, `docker ps`, `$C logs --tail 30 web` | A `502`/`52x` from Cloudflare points at Nginx or the origin certificate (`docker logs origin-nginx --tail 20`). A `503` with `Readiness: database check failed` points at `db` (`$C logs --tail 30 db`, free disk space). After a reboot, `docker ps` must show `db`, `web` and `origin-nginx` running. |
| Heartbeat missing: outbox or operations | `systemctl is-active cron`, `crontab -l`, `journalctl -t qr-outbox -n 20`, `ls -l /run/lock/qr-*.lock` | Cron stopped or the crontab lost its lines; or runs time out (the log says `timed out after`): check `db` and the load. A pile of `skipped` lines means a run that never ends. |
| Heartbeat `/fail`: operations | `journalctl -t qr-operations -n 20` | The JSON names the failing step: `alerts` (a notification could not be delivered, the text says why: `Alert webhook responded with 5xx`, a timeout or `fetch failed`), `retention` or `calendar`. Fix the receiver; the next run retries. |
| Heartbeat missing or `/fail`: backup | `journalctl -t qr-backup -n 20`, `backup.sh --check` | Exit statuses in [`deploy/host`](../../deploy/host/README.md): `5` database or disk space, `6` dump or encryption, `7` off-site copy. Run it by hand after fixing the cause. A missing ping with no log line means that cron did not run it. |
| Host check missing or `/fail` | `check-host.sh` by hand | Disk, memory or certificate lifetime, as above. Renew the origin certificate or the Authenticated Origin Pull files before they expire ([day-0 runbook](day-0-runbook.md), section 6). |
| Alert: Dead outbox events | `SELECT id, event_type, attempt_count, last_error, updated_at FROM outbox_events WHERE status = 'DEAD' AND NOT (payload @> '{"redacted": true}') ORDER BY updated_at DESC LIMIT 20;` | `last_error` says what the receiver answered. Fix the receiver or the URL and token in `app.env`, then press "Retry notification" in `/admin/requests` for each request. The alert closes when no dead event is left. |
| Alert: Stale pending outbox | `SELECT status, count(*), min(created_at), max(attempt_count) FROM outbox_events WHERE status IN ('PENDING','LEASED') GROUP BY status;` | Either the outbox timer stopped (heartbeat), or the receiver keeps failing and the retries are backing off (up to 60 minutes). Compare `last_error`. |
| Alert: Recent high-severity security events | `SELECT occurred_at, event_type, severity, path, details FROM security_audit_events WHERE severity IN ('high','critical') ORDER BY occurred_at DESC LIMIT 20;` | `portal.refresh_token_replay`: a guest's refresh token was used again or twice at once and the family was revoked. One event can be a double tap or a flaky connection; repeated events for one family or many families at once are not. The guest signs in again; there is nothing to repair. |
| Alert: Stale availability calendar | `/admin/availability` ("Last success", the last error), `SELECT last_success_at, last_failure_at, last_error_code, last_http_status, consecutive_failures FROM calendar_sync_state;` | `http_status` with 4xx: the export link was regenerated or switched off in the Booking.com extranet: set the new `BOOKING_ICAL_URL` (`scripts/README.md`). `timeout` or `network`: Booking.com or the VPS network. No attempts at all: the operations timer stopped. Press "Sync now". After 12 hours the public pages drop the calendar. |
| Alert webhook failing (operations exits `1`) | `SELECT notification_attempts, notification_last_error FROM alerts WHERE notification_delivered_at IS NULL;` | The stored text is the status or error without the URL. Fix the receiver; the next run retries. |
| Many `401` or `429` on the admin login | `$C logs --since 24h web \| grep '"route":"/api/admin/login"' \| grep -c '"status":401'` | The login allows five attempts, successful or not, in 15 minutes from one address; the sixth gets `429`. A steady stream from many addresses is a guessing attempt: it cannot succeed against a 64-character secret, but consider Cloudflare Access for `/admin` ([Cloudflare checklist](cloudflare-checklist.md)). |

The queries run through `$C exec -T db psql -U qr_app -d qr_city_guide -c "..."`. The log lines of the
application are JSON, one object per line, in `$C logs web` (`LOG_STRUCTURED=true`).
