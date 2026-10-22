# Processors and other recipients

Who receives personal data from the guest guide, in what role, what they receive, where, whether a data
processing agreement (DPA) is in place, and what the privacy notice says about them.

- Draft, 2026-10-21, prepared against the code of the branch `claude/nice-turing-uidc0s` on 2026-10-22. Last reviewed by the owner: `<OWNER: date, name>`.
- Roles follow the privacy notice and the code; they are not legal conclusions. A **processor** acts on the
  host's instructions and needs a contract under Article 28. An **independent recipient** decides for
  itself what it does with the data. `<OWNER/lawyer: confirm each role>`
- "DPA status": record the date you accepted or signed the agreement and where the copy is kept. Until then,
  the field stays `<OWNER: ...>`.
- Related: [record of processing](record-of-processing.md), [proposed notice changes](proposed-notice-changes.md).

## 1. Table

| Recipient | Role | Data | Location | DPA status | What the privacy notice says |
| --- | --- | --- | --- | --- | --- |
| **Hosting provider** (the architecture decision selects a Netcup VPS 500 G12) | Processor | Everything held by the application: the database, the containers, the container logs, the workers' output, the host's own files | "in the EU" (notice); `<OWNER: data-centre location of the ordered plan>` | `<OWNER: DPA accepted? date, where kept>` | "Our hosting provider in the EU runs the site and its database and processes all the data described here on our behalf." |
| **Cloudflare, Inc.** (DNS, proxy, TLS, CDN, firewall) | Processor | The IP address and every request and response in transit, including what visitors type: phone numbers, passwords, access links and the admin secret (TLS ends at Cloudflare), cookies, headers; Cloudflare's own logs | USA and its global network; transfer under the EU-US Data Privacy Framework and standard contractual clauses (notice) | `<OWNER: Cloudflare DPA accepted? date>` | "Cloudflare, Inc. (USA) delivers and protects the site: every request passes through its network, so it sees your IP address and the request. Transfers to the USA rely on the EU-US Data Privacy Framework and the European Commission's standard contractual clauses." |
| **Booking.com** | Source of the reservations for the host (extranet) and of the calendar feed; independent controller for its own platform. Not a processor of this system | To Booking.com from our server: the request for the iCal export, which carries the secret export URL and the server's address; nothing about any guest. From Booking.com: the calendar (booked or closed nights, dates only, not told apart). The reservation data in the extranet stays outside this system | `<OWNER/lawyer: ...>` | `<OWNER/lawyer: the data protection terms of the Booking.com partner agreement>` | "Our server downloads the apartment's calendar from Booking.com and keeps only which nights are booked or closed. Nothing about you or any other visitor is sent to Booking.com." Whether Booking.com must be named as a recipient and as a source of the booking data is an open legal question (README, "Open owner inputs") |
| **Arrival-notification receiver** (`CHECKIN_REQUEST_WEBHOOK_URL`) | Processor if it is a service run by someone else; the host's own system if it is not. `<OWNER: which>` | For every new arrival request and every approval or rejection: event name and id, request id, booking id, account id, guest name and e-mail (empty today), **phone number, requested time, free-text message**, status, previous status, time | `<OWNER: service and country>` | `<OWNER: DPA accepted? date>` | "When you send your arrival details from the portal, they (arrival time, message, the mobile number of your account and internal booking and account identifiers) are forwarded to the notification service the host uses to receive them." The retention line speaks only of our own copy (see [proposed notice changes](proposed-notice-changes.md), item a) |
| **Alert receiver** (`ALERT_WEBHOOK_URL`) | `<OWNER: service; processor only if it receives personal data>` | Alert id, rule name, description, metric, severity, value, threshold, time. **No personal data** (read from `notifyAlert` in `src/lib/operationalMonitor.ts`) | `<OWNER: ...>` | Not needed for guest data; `<OWNER: check the terms of your own account>` | "Alerts about the site's operation go to the host's alert service. They contain only rule names and figures, no personal data." |
| **Backup provider** (planned; `deploy/host/backup.sh` writes the encrypted copies, no off-site provider is chosen yet) | Processor | Encrypted copies of the whole database | `<OWNER: provider and country>` | `<OWNER: DPA accepted? date>` | **Not mentioned** (see [proposed notice changes](proposed-notice-changes.md), item c) |
| **CARTO** (`basemaps.cartocdn.com`) | Independent recipient. `<OWNER/lawyer: possible joint controller by embedding, CJEU Fashion ID, C-40/17>` | The visitor's IP address, browser headers, the address of our site, the coordinates of the map area; with `CARTO_BASEMAPS_KEY` set, the key is in the tile URL | `<OWNER/lawyer: see CARTO's own notice>` | None (the visitor's browser contacts it) | "Map images load directly from CARTO (basemaps.cartocdn.com) or, where CARTO is not configured, from the OpenStreetMap Foundation (tile.openstreetmap.org)." and "[The provider] receives your IP address, the standard data your browser sends with a request, the address of our site and the coordinates of the map area shown." |
| **OpenStreetMap Foundation** (`tile.openstreetmap.org`) | Independent recipient (as CARTO) | As CARTO, without a key | `<OWNER/lawyer: see the Foundation's own notice>` | None | As above |

## 2. Others to record

These are not in the notice's "Who else receives data" list. Decide whether they belong there.

| Recipient | Role | Data | Note |
| --- | --- | --- | --- |
| **Mailbox provider** of the contact address (a `gmail.com` address in `HOST_CONTACT`) | `<OWNER/lawyer: processor or independent, depends on the account type>` | The requests and the correspondence of the guests | The address is the channel for every right in the notice. `<OWNER: account type, two-step login>` |
| **WhatsApp, Booking.com messages, SMS** | Channels the host chooses to hand over the access link and to talk to guests | The one-time access link (single use, 30 minutes by default), phone numbers, the conversation | `<OWNER: list the channels you really use>` |
| **AADE** (tax authority) | Recipient under a legal obligation | What the host puts in the short-term stay declaration, made outside this system | The notice names it under "Tax obligations" |
| **Hellenic Data Protection Authority** | Supervisory authority, not a processor | Breach notifications and complaints | See the [breach runbook](breach-runbook.md) |
| **Source code host** | Not a recipient of guest data | The repository, including history; history contains old committed environment files (see [SECURITY.md](../../SECURITY.md)) | No guest data |
| **Links on the site** (Instagram, WhatsApp, Google Maps, Booking.com) | Independent; nothing is loaded from them before a link is followed | Whatever the visitor sends when following a link | The notice: "Links to other sites" |

## 3. To do

1. Accept or sign the DPA of the hosting provider, Cloudflare, the notification receiver and the backup provider; note the
   date and where the copy is kept in the table above.
2. Name the notification service and the alert service and fill in their location.
3. Decide whether the notice must name Booking.com's role and the notification service (open legal questions).
4. Review the table once a year and at every new service or tool.
