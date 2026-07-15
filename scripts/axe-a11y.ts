#!/usr/bin/env node
/**
 * Full axe-core accessibility audit (all default rules) using Puppeteer.
 * Exits with code 1 on any violation.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

// Load axe source
import axePkg from 'axe-core';
// axe-core types don't surface .source in ESM import; cast cautiously.
const axeSource: string = (axePkg as unknown as { source?: string }).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
const PATHS = (process.env.AXE_PATHS || '/en,/en/apartment,/en/favorites,/en/offline,/en/phones,/en/phones/emergency-112')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const SETTLE_MS = Math.max(0, Number.parseInt(process.env.AXE_SETTLE_MS || '4000', 10) || 0);

interface ViolationSummary { id: string; impact: string | null; help: string; nodes: number; url: string; }
interface AuditError { url: string; error: string; }

process.on('unhandledRejection', (err) => {
  console.error('[axe-a11y] UnhandledRejection:', err);
  process.exit(1);
});
process.on('uncaughtException', (err) => {
  console.error('[axe-a11y] UncaughtException:', err);
  process.exit(1);
});

(async () => {
  console.log('[axe-a11y] starting');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const allViolations: ViolationSummary[] = [];
  const errors: AuditError[] = [];
  const errorKeys = new Set<string>();
  const baseOrigin = new URL(BASE).origin;

  const recordError = (url: string, error: string) => {
    const key = `${url}\n${error}`;
    if (errorKeys.has(key)) return;
    errorKeys.add(key);
    errors.push({ url, error });
    console.error(`[axe-a11y] ${error}: ${url}`);
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
      console.log(`Auditing (full) ${target}`);

      let response: Awaited<ReturnType<typeof page.goto>>;
      try {
        response = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
      } catch (error) {
        recordError(target, `Navigation failed (${error instanceof Error ? error.message : String(error)})`);
        continue;
      }

      if (!response) {
        recordError(target, 'Navigation returned no HTTP response');
        continue;
      }

      const status = response.status();
      console.log(`[axe-a11y] navigated ${target} status=${status}`);
      if (status < 200 || status >= 300) {
        recordError(target, `Navigation returned HTTP ${status}`);
        continue;
      }

      await page.waitForNetworkIdle({ idleTime: 750, timeout: 12000 }).catch(()=>{});
      if (SETTLE_MS > 0) await new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

      try {
        // Runtime.evaluate is intentionally used here: a script tag is blocked by the
        // application's production CSP, while Puppeteer's isolated execution context
        // is the trusted audit harness.
        await page.evaluate(axeSource);
        const axeAvailable = await page.evaluate(() => 'axe' in globalThis);
        if (!axeAvailable) throw new Error('axe-core injection failed');
        console.log('[axe-a11y] axe injected, running...');
        const result = await page.evaluate(async () => {
          // @ts-expect-error axe injected globally at runtime
          return await axe.run();
        });
        console.log(`[axe-a11y] violations found: ${result.violations.length}`);
        if (result.violations.length) {
          for (const v of result.violations) {
            allViolations.push({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, url: target });
            console.log(`  Rule: ${v.id} (${v.impact}) - ${v.help} (nodes=${v.nodes.length})`);
            for (const n of v.nodes.slice(0,10)) {
              const preview = n.html.replace(/\s+/g,' ').slice(0,140);
              console.log(`    Node: ${preview}`);
            }
            if (v.nodes.length > 10) console.log(`    ...and ${v.nodes.length - 10} more nodes`);
          }
        } else {
          console.log('  No violations');
        }
      } catch (error) {
        recordError(target, `Accessibility audit failed (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  } finally {
    await browser.close();
  }

  if (process.env.AXE_JSON) {
    const out = { generatedAt: new Date().toISOString(), base: BASE, paths: PATHS, violations: allViolations, errors };
    let file = process.env.AXE_JSON === '1' ? 'axe-a11y-report.json' : process.env.AXE_JSON;
    if (file === 'timestamp') {
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      file = `axe-a11y-report-${ts}.json`;
    }
    try {
      try {
        await fs.promises.unlink(file);
        console.log(`[axe-a11y] removed existing ${file}`);
      } catch {}
      await fs.promises.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Wrote JSON report to ${file} (violations=${allViolations.length} errors=${errors.length})`);
    } catch (e) {
      recordError(file, `Failed to write JSON report (${e instanceof Error ? e.message : String(e)})`);
    }
  }
  if (allViolations.length) {
    const grouped: Record<string, number> = {};
    allViolations.forEach(v => { grouped[v.id] = (grouped[v.id]||0)+v.nodes; });
    console.log('\nSummary:');
    Object.entries(grouped).forEach(([k,count]) => console.log(`- ${k}: ${count} nodes`));
  }
  if (errors.length) {
    console.error('\nAudit errors:');
    errors.forEach(({ url, error }) => console.error(`- ${url}: ${error}`));
  }
  if (allViolations.length || errors.length) {
    process.exitCode = 1;
  } else {
    console.log('No accessibility violations detected across scanned pages.');
  }
  console.log('[axe-a11y] done');
})();
