#!/usr/bin/env tsx
/**
 * Runs a mobile Lighthouse audit against a locally running instance (default http://localhost:3000).
 * Usage: npm run lighthouse:mobile [env vars: LH_URL, LH_OUTPUT]
 */
import { launch } from 'chrome-launcher';
import { writeFile } from 'node:fs/promises';
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

const chrome = await launch({
  chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
  chromePath: process.env.CHROME_PATH || chromeExecutablePath,
});

try {
  const result = await lighthouse(targetUrl, {
    port: chrome.port,
    output: outputMode.split(',') as Array<'json' | 'html'>,
    logLevel: 'info',
    screenEmulation: { mobile: true, disabled: false },
  }, {
    extends: 'lighthouse:default',
    settings: {
      formFactor: 'mobile',
      screenEmulation: {
        mobile: true,
        width: 360,
        height: 640,
        deviceScaleRatio: 2.625,
        disabled: false,
      },
      throttling: {
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: 4,
        downloadThroughputKbps: 1638.4,
        uploadThroughputKbps: 750,
      },
      throttlingMethod: 'simulate',
      onlyCategories: ['performance'],
    },
  });

  const lhr = result.lhr;
  const perfScore = Math.round(((lhr.categories.performance?.score ?? 0) * 100));
  const lcp = lhr.audits['largest-contentful-paint']?.displayValue;
  const fid = lhr.audits['max-potential-fid']?.displayValue;
  const tti = lhr.audits['interactive']?.displayValue;

  console.log('\nLighthouse performance score:', perfScore);
  if (lcp) console.log('LCP:', lcp);
  if (fid) console.log('Max Potential FID:', fid);
  if (tti) console.log('TTI:', tti);

  if (Array.isArray(result.report) && result.report.length > 0 && outputMode.includes('html')) {
    const pathUrl = new URL(`./lighthouse-report-${Date.now()}.html`, import.meta.url);
    await writeFile(pathUrl, result.report.join('\n'), 'utf-8');
    console.log('Saved Lighthouse HTML report to', pathUrl.pathname);
  }

} catch (error) {
  console.error('Lighthouse run failed:', error);
  process.exitCode = 1;
} finally {
  await chrome.kill();
}
