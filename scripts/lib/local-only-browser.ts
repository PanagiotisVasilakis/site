import type { Page } from 'puppeteer';

// Local only: dead proxy for every other host, host resolver limited to localhost,
// and every request that is not to this machine is aborted (map tiles and other third parties never load).
export const LOCAL_ONLY_ARGS = [
  '--proxy-server=http://127.0.0.1:9',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
];
export const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

function isLocalUrl(url: string) {
  if (/^(data|blob|about):/.test(url)) return true;
  try {
    return LOOPBACK_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

/** Aborts every request of the page that is not to this machine; logs each blocked host once. */
export async function blockNonLocalRequests(page: Page, blockedHosts: Set<string>, tag: string) {
  // With request interception on, navigations the service worker answers come back without a response;
  // the audit checks rendered pages, not offline behaviour, so the service worker is bypassed.
  await page.setBypassServiceWorker(true);
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (isLocalUrl(request.url())) {
      void request.continue();
      return;
    }
    const host = URL.canParse(request.url()) ? new URL(request.url()).host : 'an unparsable URL';
    if (!blockedHosts.has(host)) console.log(`[${tag}] blocked non-loopback request to ${host}`);
    blockedHosts.add(host);
    void request.abort();
  });
}
