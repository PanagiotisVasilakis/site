#!/usr/bin/env tsx

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer, { type CDPSession } from 'puppeteer';

type OfflineSmokeReport = {
  generatedAt: string;
  origin: string;
  serviceWorkerScript: string;
  controlled: boolean;
  cachedOfflinePage: boolean;
  offlineNavigationUrl: string;
  offlineNavigationStatus: number | null;
  offlineDocumentTitle: string;
  offlineTextMatched: boolean;
};

function resolveOrigin(): string {
  const raw = process.env.OFFLINE_BROWSER_ORIGIN
    ?? process.env.OFFLINE_CHECK_ORIGIN
    ?? 'http://localhost:3000';
  const url = new URL(raw);
  if (!['http:', 'https:'].includes(url.protocol) || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('OFFLINE_BROWSER_ORIGIN must be a bare HTTP(S) origin');
  }
  return url.origin;
}

async function main() {
  const origin = resolveOrigin();
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: process.env.CHROME_PATH,
    args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  });
  let serviceWorkerSession: CDPSession | undefined;

  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(45_000);

    await page.goto(`${origin}/en/offline`, { waitUntil: 'networkidle0', timeout: 60_000 });
    await page.waitForFunction(() => 'serviceWorker' in navigator);
    await page.evaluate(async () => {
      await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => window.setTimeout(() => reject(new Error('service worker ready timeout')), 30_000)),
      ]);
    });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), { timeout: 30_000 });

    const workerState = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      const cachedOfflinePage = Boolean(await caches.match('/en/offline'));
      return {
        controlled: Boolean(navigator.serviceWorker.controller),
        cachedOfflinePage,
        serviceWorkerScript: registration.active?.scriptURL ?? '',
      };
    });

    if (!workerState.controlled || !workerState.cachedOfflinePage) {
      throw new Error(`service worker did not control the page or cache /en/offline: ${JSON.stringify(workerState)}`);
    }

    // Page.setOfflineMode() only affects the page/frame CDP sessions. A service
    // worker is a separate target, so its own network session must be taken
    // offline as well or its fetch() can still reach the live Next.js server.
    const serviceWorkerTarget = await browser.waitForTarget(
      (target) => target.type() === 'service_worker'
        && target.url() === workerState.serviceWorkerScript,
      { timeout: 30_000 },
    );
    serviceWorkerSession = await serviceWorkerTarget.createCDPSession();
    await serviceWorkerSession.send('Network.enable');
    await serviceWorkerSession.send('Network.emulateNetworkConditions', {
      offline: true,
      latency: 0,
      downloadThroughput: -1,
      uploadThroughput: -1,
    });
    await page.setOfflineMode(true);
    const offlineNavigationUrl = `${origin}/en/offline-smoke-${Date.now()}`;
    const response = await page.goto(offlineNavigationUrl, {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });
    const bodyText = await page.$eval('body', (element) => (element as HTMLElement).innerText);
    const offlineTextMatched = /offline|εκτός σύνδεσης/i.test(bodyText);

    const report: OfflineSmokeReport = {
      generatedAt: new Date().toISOString(),
      origin,
      serviceWorkerScript: workerState.serviceWorkerScript,
      controlled: workerState.controlled,
      cachedOfflinePage: workerState.cachedOfflinePage,
      offlineNavigationUrl,
      offlineNavigationStatus: response?.status() ?? null,
      offlineDocumentTitle: await page.title(),
      offlineTextMatched,
    };

    const outputDir = path.join(process.cwd(), 'reports', 'offline-browser');
    await mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, 'offline-browser-smoke.json');
    await writeFile(reportPath, JSON.stringify(report, null, 2), 'utf8');

    if (!response || response.status() !== 200 || !offlineTextMatched) {
      throw new Error(`offline fallback navigation failed: ${JSON.stringify(report)}`);
    }

    console.log(`[offline-browser] PASS: controlled service worker served locale fallback while offline (${response.status()})`);
    console.log(`[offline-browser] report: ${path.relative(process.cwd(), reportPath)}`);
  } finally {
    if (serviceWorkerSession) {
      await serviceWorkerSession.send('Network.emulateNetworkConditions', {
        offline: false,
        latency: 0,
        downloadThroughput: -1,
        uploadThroughput: -1,
      }).catch(() => undefined);
      await serviceWorkerSession.detach().catch(() => undefined);
    }
    await browser.close();
  }
}

main().catch((error) => {
  console.error('[offline-browser] FAIL:', error);
  process.exitCode = 1;
});
