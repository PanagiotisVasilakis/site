#!/usr/bin/env tsx
/**
 * Runs a desktop Lighthouse performance audit against a locally running instance.
 * Usage: npm run lighthouse:desktop [env vars: LH_URL, LH_OUTPUT, CHROME_PATH]
 */

import { launch } from 'chrome-launcher';
import { writeFile } from 'node:fs/promises';
import { screenEmulationMetrics, throttling } from 'lighthouse/core/config/constants.js';

const { default: lighthouse } = await import('lighthouse');

let chromeExecutablePath: string | undefined;
if (!process.env.CHROME_PATH) {
  try {
    const puppeteer = await import('puppeteer');
    chromeExecutablePath = await puppeteer.executablePath();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn('Puppeteer chrome discovery failed, relying on system Chrome.', message);
  }
}

const targetUrl = process.env.LH_URL || 'http://localhost:3000';
const outputMode = process.env.LH_OUTPUT || 'html';

let chrome;
try {
  chrome = await launch({
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
    chromePath: process.env.CHROME_PATH || chromeExecutablePath,
  });
} catch (error) {
  console.error('Unable to launch Chromium for desktop Lighthouse audit.');
  console.error('On Linux, install browser runtime dependencies (for example libasound2) or set CHROME_PATH to a working Chrome/Chromium binary.');
  throw error;
}

try {
  const result = await lighthouse(
    targetUrl,
    {
      port: chrome.port,
      output: outputMode.split(',') as Array<'json' | 'html'>,
      logLevel: 'info',
    },
    {
      extends: 'lighthouse:default',
      settings: {
        formFactor: 'desktop',
        screenEmulation: { ...screenEmulationMetrics.desktop },
        emulatedUserAgent: true,
        throttling: { ...throttling.desktopDense4G },
        throttlingMethod: 'simulate',
        onlyCategories: ['performance'],
      },
    },
  );

  const lhr = result.lhr;
  const perfScore = Math.round((lhr.categories.performance?.score ?? 0) * 100);
  const lcp = lhr.audits['largest-contentful-paint']?.displayValue;
  const inp =
    lhr.audits['interaction-to-next-paint']?.displayValue ||
    lhr.audits['experimental-interaction-to-next-paint']?.displayValue;
  const tti = lhr.audits.interactive?.displayValue;

  console.log('\nDesktop Lighthouse performance score:', perfScore);
  if (lcp) console.log('LCP:', lcp);
  if (inp) console.log('INP:', inp);
  if (tti) console.log('TTI:', tti);

  if (Array.isArray(result.report) && result.report.length > 0 && outputMode.includes('html')) {
    const pathUrl = new URL(`./lighthouse-desktop-report-${Date.now()}.html`, import.meta.url);
    await writeFile(pathUrl, result.report.join('\n'), 'utf-8');
    console.log('Saved Lighthouse HTML report to', pathUrl.pathname);
  }
} catch (error) {
  console.error('Desktop Lighthouse run failed:', error);
  process.exitCode = 1;
} finally {
  await chrome.kill();
}
