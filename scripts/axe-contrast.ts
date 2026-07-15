#!/usr/bin/env node
/**
 * axe-core + Puppeteer accessibility (contrast-focused) audit.
 * Launches headless Chromium, loads supplied paths, runs axe, and prints any color-contrast violations.
 * Exit code 1 if any violations of color-contrast rule.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

// Dynamically load axe-core script text
import axePkg from 'axe-core';
// axe-core ESM export doesn't type .source; cast carefully.
const axeSource: string = (axePkg as unknown as { source?: string }).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
// Expanded default PATHS for broader coverage; can override via AXE_PATHS env.
const PATHS = (process.env.AXE_PATHS || '/en,/en/apartment,/en/favorites,/en/offline,/en/phones,/en/phones/emergency-112')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const SETTLE_MS = Math.max(0, Number.parseInt(process.env.AXE_SETTLE_MS || '4000', 10) || 0);

interface Finding { url: string; id: string; impact: string | null; help: string; nodes: number; snippets: string[]; }
interface AuditError { url: string; error: string; }

console.log('[axe-contrast] starting');
// Extra hardening: capture unhandled errors so the script never fails silently
process.on('unhandledRejection', (err) => {
  console.error('[axe-contrast] UnhandledRejection:', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[axe-contrast] UncaughtException:', err);
  process.exit(1);
});

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const findings: Finding[] = [];
  const errors: AuditError[] = [];
  const errorKeys = new Set<string>();
  const baseOrigin = new URL(BASE).origin;

  const recordError = (url: string, error: string) => {
    const key = `${url}\n${error}`;
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push({ url, error });
    console.error(`[axe-contrast] ${error}: ${url}`);
  };

  const isAuditedAsset = (url: string, resourceType: string) => {
    if (resourceType !== 'script' && resourceType !== 'stylesheet') return false;
    try {
      return new URL(url).origin === baseOrigin;
    } catch {
      return false;
    }
  };

  page.on('requestfailed', (request) => {
    if (!isAuditedAsset(request.url(), request.resourceType())) return;
    recordError(
      request.url(),
      `Same-origin ${request.resourceType()} request failed (${request.failure()?.errorText ?? 'unknown error'})`,
    );
  });

  page.on('response', (response) => {
    const request = response.request();
    if (response.status() < 400 || !isAuditedAsset(response.url(), request.resourceType())) return;
    recordError(response.url(), `Same-origin ${request.resourceType()} returned HTTP ${response.status()}`);
  });

  page.on('pageerror', (error) => {
    const message = error instanceof Error ? error.message : String(error);
    recordError(page.url() || BASE, `Uncaught page error (${message})`);
  });

  try {
    for (const p of PATHS) {
      const target = new URL(p, BASE).toString();
      console.log(`Auditing ${target}`);

      let response: Awaited<ReturnType<typeof page.goto>>;
      try {
        response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      } catch (error) {
        recordError(target, `Navigation failed (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }

      if (!response) {
        recordError(target, 'Navigation returned no HTTP response');
        continue;
      }

      const status = response.status();
      console.log(`[axe-contrast] navigated ${target} status=${status}`);
      if (status < 200 || status >= 300) {
        recordError(target, `Navigation returned HTTP ${status}`);
        continue;
      }

      await page.waitForNetworkIdle({ idleTime: 750, timeout: 10000 }).catch(()=>{});
      if (SETTLE_MS > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

      try {
        // Runtime.evaluate is intentionally used here: a script tag is blocked by the
        // application's production CSP, while Puppeteer's isolated execution context
        // is the trusted audit harness.
        await page.evaluate(axeSource);
        const axeAvailable = await page.evaluate(() => 'axe' in globalThis);
        if (!axeAvailable) throw new Error('axe-core injection failed');
        console.log('[axe-contrast] axe injected, running...');
        // Run axe restricted to color-contrast to keep runtime minimal
        const result = await page.evaluate(async () => {
          // @ts-expect-error axe injected globally at runtime
          return await axe.run(document, { runOnly: ['color-contrast'] });
        });
        console.log(`[axe-contrast] rule count: ${result.violations?.length ?? 0}`);
        for (const v of result.violations) {
          if (v.id === 'color-contrast') {
            const snippets: string[] = [];
            for (const n of v.nodes) {
              const preview = n.html.replace(/\s+/g,' ').slice(0,200);
              snippets.push(preview);
              console.log(`  [${v.impact}] contrast issue: ${preview}`);
            }
            findings.push({ url: target, id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, snippets });
          }
        }
      } catch (error) {
        recordError(target, `Contrast audit failed (${error instanceof Error ? error.message : String(error)})`);
      }
      console.log(`[axe-contrast] completed path ${target}`);
    }
  } finally {
    await browser.close();
  }
  if (process.env.AXE_JSON) {
    const out = { generatedAt: new Date().toISOString(), base: BASE, paths: PATHS, issues: findings, errors };
    let file = process.env.AXE_JSON === '1' ? 'axe-contrast-report.json' : process.env.AXE_JSON;
    if (file === 'timestamp') {
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      file = `axe-contrast-report-${ts}.json`;
    }
    try {
      await fs.promises.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Wrote JSON report to ${file} (issues=${findings.length} errors=${errors.length})`);
    } catch (e) {
      recordError(file, `Failed to write JSON report (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  console.log(`[axe-contrast] total issues: ${findings.length}`);
  if (findings.length) {
    console.log('\nContrast violations summary:');
    findings.forEach(f => console.log(`- ${f.url} (${f.nodes} nodes) ${f.help}`));
  }
  if (errors.length) {
    console.error('\nAudit errors:');
    errors.forEach(({ url, error }) => console.error(`- ${url}: ${error}`));
  }
  if (findings.length || errors.length) {
    process.exitCode = 1;
  } else {
    console.log('No axe color-contrast violations on scanned paths.');
  }
  console.log('[axe-contrast] done');
})();
