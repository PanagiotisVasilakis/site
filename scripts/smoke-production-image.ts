/**
 * Production-image smoke (docs/deployment/production-image-smoke.md).
 *
 * Starts the checked-out commit's images with docker/docker-compose.prod.yml as the isolated
 * Compose project `qr-city-guide-smoke`, with runtime secrets generated into a 0700 temp
 * directory, and checks the container the way a release would be used: migrations, health,
 * security headers, CSP report intake, service worker + offline fallback, cross-origin images,
 * the admin → booking → claim → check-in → silent-refresh journey, and both workers. Everything
 * it creates is removed at the end (containers, network, volume, temp directory).
 *
 * Usage: NEXT_PUBLIC_SITE_URL=https://localhost:3002 npm run docker:build && npm run smoke:image
 * Environment: SMOKE_APP_IMAGE (default scripts/image-tag.sh), SMOKE_WEB_PORT (3002), SMOKE_DB_PORT (55432).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import puppeteer, { type Browser, type Page } from 'puppeteer';

const REPO = process.cwd();
const PROJECT = 'qr-city-guide-smoke';
const COMPOSE_FILE = 'docker/docker-compose.prod.yml';
const WEB_PORT = Number(process.env.SMOKE_WEB_PORT ?? 3002);
const DB_PORT = Number(process.env.SMOKE_DB_PORT ?? 55432);
// Chrome treats localhost as a secure context, so the production `Secure` cookies are sent.
const BASE = `http://localhost:${WEB_PORT}`;
const GUEST_PHONE = '+30 691 234 5678';

const hex = (bytes: number) => randomBytes(bytes).toString('hex');
const secrets = {
  postgresPassword: hex(16),
  adminDashSecret: hex(32),
  originProxySharedSecret: hex(32),
  guestPassword: hex(12),
};
const identityHeaders = {
  'x-origin-proxy-attestation': secrets.originProxySharedSecret,
  'x-origin-verified-client-ip': '127.0.0.1',
};

const results: Array<{ name: string; ok: boolean; detail?: string }> = [];
let aborted = false;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function check(name: string, run: () => Promise<unknown> | unknown, options: { fatal?: boolean } = {}): Promise<boolean> {
  if (aborted) {
    results.push({ name, ok: false, detail: 'skipped: an earlier fatal check failed' });
    return false;
  }
  try {
    const detail = await run();
    results.push({ name, ok: true, detail: typeof detail === 'string' ? detail : undefined });
    return true;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    results.push({ name, ok: false, detail });
    if (options.fatal) aborted = true;
    return false;
  }
}

function imageReference(): string {
  const configured = process.env.SMOKE_APP_IMAGE?.trim();
  if (configured) return configured;
  return execFileSync('bash', ['scripts/image-tag.sh'], { cwd: REPO, encoding: 'utf8' }).trim();
}

let composeEnvironment: NodeJS.ProcessEnv = process.env;

function compose(args: string[]): string {
  const result = spawnSync('docker', ['compose', '-p', PROJECT, '-f', COMPOSE_FILE, ...args], {
    cwd: REPO,
    env: composeEnvironment,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const tail = (result.stderr ?? '').trim().split('\n').slice(-6).join(' | ');
    throw new Error(`docker compose ${args.join(' ')} exited ${result.status}: ${tail}`);
  }
  return result.stdout ?? '';
}

function lastJsonLine(output: string): Record<string, unknown> {
  const line = output.trim().split('\n').filter((candidate) => candidate.startsWith('{')).at(-1);
  assert(line, `no JSON line in: ${output.trim().slice(-200)}`);
  return JSON.parse(line) as Record<string, unknown>;
}

async function waitForStatus(url: string, expected: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'no response';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      if (response.status === expected) return;
      last = String(response.status);
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }
  throw new Error(`${url} did not answer ${expected} within ${timeoutMs / 1_000}s (last: ${last})`);
}

/** Minimal cookie jar for the HTTP journey; production cookies are httpOnly + Secure, which fetch ignores. */
class CookieJar {
  private readonly cookies = new Map<string, string>();
  absorb(response: Response): void {
    for (const header of response.headers.getSetCookie()) {
      const [pair, ...attributes] = header.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = pair.slice(separator + 1).trim();
      const expired = attributes.some((attribute) => /^\s*max-age=0\s*$/iu.test(attribute));
      if (value === '' || expired) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string {
    return [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; ');
  }
  get(name: string): string | undefined {
    return this.cookies.get(name);
  }
}

async function call(jar: CookieJar, method: string, pathname: string, body?: unknown): Promise<Response> {
  const response = await fetch(`${BASE}${pathname}`, {
    method,
    redirect: 'manual',
    headers: {
      ...identityHeaders,
      origin: BASE,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(jar.header() ? { cookie: jar.header() } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  jar.absorb(response);
  return response;
}

async function json<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

const calendarDate = (daysFromToday: number) => new Date(Date.now() + daysFromToday * 86_400_000).toISOString().slice(0, 10);

async function main(): Promise<number> {
  const appImage = imageReference();
  const workDirectory = await mkdtemp(path.join(os.tmpdir(), 'qr-city-guide-smoke-'));
  await chmod(workDirectory, 0o700);
  const appEnvFile = path.join(workDirectory, 'app.env');
  const migrateEnvFile = path.join(workDirectory, 'migrate.env');
  // Built through the URL API so that the source holds no credential-shaped literal.
  const databaseUrl = new URL('postgresql://db:5432/app');
  databaseUrl.username = 'app';
  databaseUrl.password = secrets.postgresPassword;
  const runtimeEnvironment = [
    'NODE_ENV=production',
    `DATABASE_URL=${databaseUrl.href}`,
    `ADMIN_JWT_SECRET=${hex(32)}`,
    `ADMIN_DASH_SECRET=${secrets.adminDashSecret}`,
    `GUEST_JWT_SECRET=${hex(32)}`,
    `SECURITY_PEPPER=${hex(32)}`,
    `CLAIM_TOKEN_PEPPER=${hex(32)}`,
    `ORIGIN_PROXY_SHARED_SECRET=${secrets.originProxySharedSecret}`,
    'GUEST_WIFI_NETWORK=smoke-guest-network',
    `GUEST_WIFI_PASSWORD=${hex(12)}`,
    'PROPERTY_TIME_ZONE=Europe/Athens',
    `NEXT_PUBLIC_SITE_URL=https://localhost:${WEB_PORT}`,
    `ALLOWED_ORIGINS=https://localhost:${WEB_PORT}`,
    'LOG_LEVEL=info',
    'ALERT_WEBHOOK_REQUIRED=0',
    '',
  ].join('\n');
  // The smoke uses one database role for both files; production uses a separate migration role.
  await writeFile(appEnvFile, runtimeEnvironment, { encoding: 'utf8', mode: 0o600 });
  await writeFile(migrateEnvFile, runtimeEnvironment, { encoding: 'utf8', mode: 0o600 });
  composeEnvironment = {
    ...process.env,
    APP_IMAGE: appImage,
    APP_ENV_FILE: appEnvFile,
    MIGRATE_ENV_FILE: migrateEnvFile,
    POSTGRES_USER: 'app',
    POSTGRES_PASSWORD: secrets.postgresPassword,
    POSTGRES_DB: 'app',
    POSTGRES_PORT: String(DB_PORT),
    WEB_PORT: String(WEB_PORT),
  };

  let browser: Browser | undefined;
  let build = '';
  console.log(`Smoke of ${appImage} on ${BASE} (project ${PROJECT})`);
  try {
    await check('images present', () => {
      for (const reference of [appImage, `${appImage}-workers`, `${appImage}-migrate`]) {
        execFileSync('docker', ['image', 'inspect', '--format', '{{.Id}}', reference], { stdio: ['ignore', 'pipe', 'pipe'] });
      }
    }, { fatal: true });
    await check('compose config', () => compose(['--profile', 'ops', 'config', '-q']), { fatal: true });
    await check('db healthy', () => compose(['up', '-d', '--wait', 'db']), { fatal: true });
    await check('migrate deploy', () => {
      const output = compose(['--profile', 'ops', 'run', '--rm', 'migrate']);
      assert(/successfully applied|No pending migrations/u.test(output), `unexpected migrate output: ${output.trim().slice(-200)}`);
      return output.includes('No pending migrations') ? 'no pending migrations' : 'applied';
    }, { fatal: true });
    await check('web healthy and ready', async () => {
      compose(['up', '-d', '--wait', 'web']);
      await waitForStatus(`${BASE}/api/health/ready`, 200, 60_000);
      await waitForStatus(`${BASE}/api/health/live`, 200, 5_000);
    }, { fatal: true });

    await check('security headers on /en (nonce CSP, https images, COEP unsafe-none)', async () => {
      const response = await fetch(`${BASE}/en`);
      assert(response.status === 200, `status ${response.status}`);
      const csp = response.headers.get('content-security-policy') ?? '';
      const scriptSrc = csp.split(';').map((directive) => directive.trim()).find((directive) => directive.startsWith('script-src ')) ?? '';
      assert(/'nonce-[A-Za-z0-9+/=_-]+'/u.test(scriptSrc), `script-src has no nonce: ${scriptSrc}`);
      assert(!scriptSrc.includes("'unsafe-inline'"), `script-src allows unsafe-inline: ${scriptSrc}`);
      // Map tiles are cross-origin https images: the CSP must allow them and COEP must not require CORP.
      const imgSrc = csp.split(';').map((directive) => directive.trim()).find((directive) => directive.startsWith('img-src ')) ?? '';
      assert(/\shttps:(\s|$)/u.test(imgSrc), `img-src does not allow https images: ${imgSrc}`);
      assert(response.headers.get('cross-origin-embedder-policy') === 'unsafe-none', `COEP ${response.headers.get('cross-origin-embedder-policy')}`);
      const hsts = response.headers.get('strict-transport-security');
      assert(hsts === 'max-age=63072000; includeSubDomains', `HSTS ${hsts}`);
      assert(response.headers.get('x-frame-options') === 'DENY', 'x-frame-options');
      assert(!response.headers.has('x-powered-by'), 'x-powered-by present');
    });
    await check('/en/availability → 200', async () => {
      const response = await fetch(`${BASE}/en/availability`, { redirect: 'manual' });
      assert(response.status === 200, `status ${response.status}`);
    });
    await check('/en/book → 308 to /en/availability (query dropped, security headers kept)', async () => {
      const response = await fetch(`${BASE}/en/book?checkin=2030-07-10&checkout=2030-07-12`, { redirect: 'manual' });
      assert(response.status === 308, `status ${response.status}`);
      const location = response.headers.get('location') ?? '';
      const target = new URL(location, BASE);
      assert(target.pathname === '/en/availability' && target.search === '', `location ${location}`);
      assert((response.headers.get('content-security-policy') ?? '').includes("frame-ancestors 'none'"), 'no CSP on the redirect');
      assert(response.headers.get('x-content-type-options') === 'nosniff', 'x-content-type-options');
    });
    await check('/version.json names the build', async () => {
      const version = await json<{ commit?: string; build?: string }>(await fetch(`${BASE}/version.json`));
      assert(/^[0-9a-f]{40}$/u.test(version.commit ?? ''), `commit ${version.commit}`);
      assert(/^[0-9a-f]{12}$/u.test(version.build ?? ''), `build ${version.build}`);
      build = version.build ?? '';
      return `build ${build}`;
    });
    await check('sensitive route without identity headers → 503', async () => {
      const response = await fetch(`${BASE}/api/admin/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: BASE },
        body: JSON.stringify({ token: 'not-the-secret' }),
      });
      assert(response.status === 503, `status ${response.status}`);
    });
    await check('CSP report intake → 204', async () => {
      const response = await fetch(`${BASE}/api/security/csp-report`, {
        method: 'POST',
        headers: { ...identityHeaders, 'content-type': 'application/csp-report' },
        body: JSON.stringify({
          'csp-report': {
            'document-uri': `${BASE}/en/check-in?session=private`,
            referrer: `${BASE}/en/guest?flash=private`,
            'violated-directive': 'script-src-elem',
            'effective-directive': 'script-src-elem',
            'original-policy': "default-src 'self'; report-uri /api/security/csp-report",
            disposition: 'enforce',
            'blocked-uri': 'https://cdn.example/lib.js?token=secret-token',
            'status-code': 200,
            'script-sample': '',
            'source-file': `${BASE}/_next/static/chunk.js?v=secret-token`,
            'line-number': 12,
            'column-number': 34,
          },
        }),
      });
      assert(response.status === 204, `status ${response.status}`);
    });

    // Browser checks.
    browser = await puppeteer.launch({ headless: true });
    const page: Page = await browser.newPage();
    const consoleErrors: string[] = [];
    let offline = false;
    page.on('console', (message) => {
      if (message.type() === 'error' && !offline) consoleErrors.push(message.text().slice(0, 200));
    });
    await page.evaluateOnNewDocument(() => {
      const violations: string[] = [];
      Object.defineProperty(window, '__cspViolations', { value: violations });
      document.addEventListener('securitypolicyviolation', (event) => {
        violations.push(`${event.violatedDirective} ${event.blockedURI}`);
      });
    });
    await page.setExtraHTTPHeaders(identityHeaders);

    await check('service worker installs and caches the build', async () => {
      await page.goto(`${BASE}/en`, { waitUntil: 'networkidle0', timeout: 60_000 });
      const state = await page.evaluate(async () => {
        const registration = await navigator.serviceWorker.ready;
        return { active: Boolean(registration.active), caches: await caches.keys() };
      });
      assert(state.active, 'no active service worker');
      assert(state.caches.some((name) => name.includes(build)), `caches ${JSON.stringify(state.caches)} do not name build ${build}`);
      await page.reload({ waitUntil: 'networkidle0' });
      assert(await page.evaluate(() => Boolean(navigator.serviceWorker.controller)), 'page not controlled after reload');
      return state.caches.join(', ');
    });
    await check('offline: visited page and offline fallback', async () => {
      await page.goto(`${BASE}/en/moments`, { waitUntil: 'networkidle0' });
      // page.setOfflineMode only reaches the page's own targets, not the service worker, which would
      // keep fetching from the network; emulate offline on the service-worker target as well.
      const serviceWorker = await (await page.browser().waitForTarget((target) => target.type() === 'service_worker', { timeout: 10_000 })).createCDPSession();
      const setOffline = async (value: boolean) => {
        await page.setOfflineMode(value);
        await serviceWorker.send('Network.emulateNetworkConditions', { offline: value, latency: 0, downloadThroughput: -1, uploadThroughput: -1 });
      };
      await serviceWorker.send('Network.enable');
      offline = true;
      await setOffline(true);
      try {
        const visited = await page.goto(`${BASE}/en/moments`, { waitUntil: 'load' });
        assert(visited?.status() === 200 && (await page.$('main')), `visited page offline: ${visited?.status()}`);
        const unvisited = await page.goto(`${BASE}/el/phones`, { waitUntil: 'load' });
        const text = await page.evaluate(() => document.body.innerText);
        assert(unvisited?.status() === 200 && /offline|σύνδεση/iu.test(text), `unvisited page offline: ${unvisited?.status()} ${text.slice(0, 80)}`);
      } finally {
        await setOffline(false);
        await serviceWorker.detach();
        offline = false;
      }
    });
    await check('no CSP violation or console error while online', async () => {
      await page.goto(`${BASE}/en/moments`, { waitUntil: 'networkidle0' });
      const violations = await page.evaluate(() => (window as unknown as { __cspViolations: string[] }).__cspViolations);
      assert(violations.length === 0, `CSP violations: ${violations.join('; ')}`);
      assert(consoleErrors.length === 0, `console errors: ${consoleErrors.join('; ')}`);
    });

    // Guest journey over HTTP, then the silent refresh in the browser.
    const admin = new CookieJar();
    const guest = new CookieJar();
    let bookingId = '';
    let requestId = '';
    await check('admin sign-in', async () => {
      const response = await call(admin, 'POST', '/api/admin/login', { token: secrets.adminDashSecret });
      assert(response.status === 200 && admin.get('admin_jwt'), `status ${response.status}`);
    }, { fatal: true });
    await check('admin creates a booking (201)', async () => {
      const response = await call(admin, 'POST', '/api/admin/bookings', { startDate: calendarDate(1), endDate: calendarDate(4) });
      assert(response.status === 201, `status ${response.status}`);
      bookingId = (await json<{ data: { booking: { id: string } } }>(response)).data.booking.id;
    }, { fatal: true });
    let claimToken = '';
    await check('admin issues a claim grant (201)', async () => {
      const response = await call(admin, 'POST', `/api/admin/bookings/${bookingId}/claim-grants`, { channel: 'ONSITE', ttlMinutes: 30 });
      assert(response.status === 201, `status ${response.status}`);
      claimToken = (await json<{ data: { claimToken: string } }>(response)).data.claimToken;
      assert(claimToken.length >= 32, 'no claim token');
    }, { fatal: true });
    await check('guest exchanges the token and claims the booking (remember me → refresh cookie)', async () => {
      const exchange = await call(guest, 'POST', '/api/portal/claim-exchange', { claimToken });
      assert(exchange.status < 300, `exchange status ${exchange.status}`);
      const claim = await call(guest, 'POST', '/api/portal/claims', {
        origin: 'GR', phone: GUEST_PHONE, password: secrets.guestPassword, acceptTerms: true, remember: true,
      });
      assert(claim.status === 200, `claim status ${claim.status}`);
      assert(guest.get('guest_session') && guest.get('guest_rt'), 'guest cookies missing');
    }, { fatal: true });
    await check('/en/check-in with the guest session (200)', async () => {
      const response = await call(guest, 'GET', '/en/check-in');
      assert(response.status === 200, `status ${response.status}`);
    });
    await check('arrival-time request (201) and admin approval (200)', async () => {
      const created = await call(guest, 'POST', '/api/check-in/arrival-request', { requestedTime: '17:00' });
      assert(created.status === 201, `create status ${created.status}`);
      requestId = (await json<{ data: { request: { id: string } } }>(created)).data.request.id;
      const approved = await call(admin, 'PATCH', `/api/admin/check-in-requests/${requestId}`, { status: 'approved' });
      assert(approved.status === 200, `approve status ${approved.status}`);
    });
    await check('silent refresh: refresh cookie alone ends on /en/check-in', async () => {
      const refreshToken = guest.get('guest_rt');
      assert(refreshToken, 'no refresh cookie');
      const context = page.browserContext();
      await context.deleteCookie(...(await context.cookies()));
      await context.setCookie({ name: 'guest_rt', value: refreshToken, domain: 'localhost', path: '/', httpOnly: true, secure: true, sameSite: 'Lax' });
      const response = await page.goto(`${BASE}/en/check-in`, { waitUntil: 'networkidle0', timeout: 60_000 });
      const pathname = new URL(page.url()).pathname;
      assert(pathname === '/en/check-in', `ended on ${pathname}`);
      assert(response?.status() === 200, `status ${response?.status()}`);
      assert((await context.cookies()).some((cookie) => cookie.name === 'guest_session'), 'no new guest session cookie');
    });

    await check('outbox worker run', () => {
      const event = lastJsonLine(compose(['--profile', 'ops', 'run', '--rm', '--no-deps', 'outbox']));
      assert(event.worker === 'outbox' && typeof event.attempted === 'number', JSON.stringify(event));
      return `attempted ${String(event.attempted)}, delivered ${String(event.delivered)}`;
    });
    await check('operations worker run', () => {
      const event = lastJsonLine(compose(['--profile', 'ops', 'run', '--rm', '--no-deps', 'operations']));
      const alerts = event.alerts as { evaluated?: number } | undefined;
      const calendar = event.calendar as { status?: string } | undefined;
      // The smoke environment sets no AIRBNB_ICAL_URL, so the calendar sync must not run.
      assert(event.worker === 'operations' && alerts?.evaluated === 4 && calendar?.status === 'not_configured', JSON.stringify(event));
      return `alerts evaluated ${String(alerts.evaluated)}, calendar ${calendar.status}`;
    });
  } finally {
    await browser?.close().catch(() => undefined);
    try {
      compose(['--profile', 'ops', 'down', '-v', '--remove-orphans']);
    } catch (error) {
      results.push({ name: 'teardown', ok: false, detail: error instanceof Error ? error.message : String(error) });
    }
    await rm(workDirectory, { recursive: true, force: true });
  }

  for (const result of results) {
    console.log(`${result.ok ? 'ok  ' : 'FAIL'} ${result.name}${result.detail ? ` — ${result.detail}` : ''}`);
  }
  const failed = results.filter((result) => !result.ok).length;
  console.log(failed === 0 ? `All ${results.length} checks passed.` : `${failed} of ${results.length} checks failed.`);
  return failed === 0 ? 0 : 1;
}

process.exitCode = await main();
