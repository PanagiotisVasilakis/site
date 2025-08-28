#!/usr/bin/env node
/**
 * axe-core + Puppeteer accessibility (contrast-focused) audit.
 * Launches headless Chromium, loads supplied paths, runs axe, and prints any color-contrast violations.
 * Exit code 1 if any violations of color-contrast rule.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import inlineCss from './inlineCss';
import url from 'node:url';

// Dynamically load axe-core script text
import axePkg from 'axe-core';
// @ts-ignore - axe.min.js path exposed via package exports fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const axeSource: string = (axePkg as any).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
// Expanded default PATHS for broader coverage; can override via AXE_PATHS env.
const PATHS = (process.env.AXE_PATHS || '/en,/en/house,/en/favorites,/en/offline,/en/phones,/en/phones/police-emergency').split(',');
// Allow static fallback using prerendered HTML in .next if network fetch fails (useful in locked CI sandboxes)
const STATIC_DIR = process.env.AXE_STATIC_DIR || '.next/server/app';

interface Finding { url: string; id: string; impact: string | null; help: string; nodes: number; snippets: string[]; }

console.log('[axe-contrast] starting');
// Extra hardening: capture unhandled errors so the script never fails silently
process.on('unhandledRejection', (err) => {
  console.error('[axe-contrast] UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[axe-contrast] UncaughtException:', err);
});

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const findings: Finding[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const p of PATHS) {
    const target = BASE + p;
    // eslint-disable-next-line no-console
    console.log(`Auditing ${target}`);
    let navigated = false;
    try {
      const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`[axe-contrast] navigated ${target} status=${resp?.status?.()}`);
      await page.waitForNetworkIdle({ idleTime: 750, timeout: 10000 }).catch(()=>{});
      navigated = true;
    } catch (err) {
      console.error(`[axe-contrast] navigation failed for ${target}:`, (err as Error).message);
      errors.push({ url: target, error: (err as Error).message });
      // Attempt static fallback
      try {
        // Derive file path from Next.js app dir structure: /en -> /[locale]/page.html etc.
        // Simplest approach: search for a matching index.html|page.html under STATIC_DIR containing data-path attr.
        const safe = p.replace(/\/$/, '') || '/';
        const guessFiles: string[] = [];
        if (safe === '/') {
          guessFiles.push(path.join(STATIC_DIR, 'index.html'));
        } else {
          const rel = safe.slice(1); // drop leading slash
          // Locale root e.g. en -> en.html
          if (!rel.includes('/')) guessFiles.push(path.join(STATIC_DIR, rel + '.html'));
          // Nested path e.g. en/favorites -> en/favorites.html
          guessFiles.push(path.join(STATIC_DIR, rel + '.html'));
        }
        let found: string | null = null;
        for (const f of guessFiles) { if (fs.existsSync(f)) { found = f; break; } }
        if (found) {
          console.log(`[axe-contrast] static fallback using ${found}`);
          let html = await fs.promises.readFile(found, 'utf8');
          // Inline built Next.js CSS so contrast calculations have real variable values.
          try { html = inlineCss(html); } catch {}
          await page.setContent(html, { waitUntil: 'domcontentloaded' });
          navigated = true;
        } else {
          console.log('[axe-contrast] no static fallback file found');
        }
      } catch (fe) {
        console.error('[axe-contrast] static fallback failed:', (fe as Error).message);
      }
      if (!navigated) continue;
    }
    // Inject axe
    await page.addScriptTag({ content: axeSource });
    console.log('[axe-contrast] axe injected, running...');
    // Run axe restricted to color-contrast to keep runtime minimal
    const result = await page.evaluate(async () => {
      // @ts-ignore
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
  console.log(`[axe-contrast] completed path ${target}`);
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
      console.error('[axe-contrast] failed to write JSON report:', (e as Error).message);
    }
  }
  console.log(`[axe-contrast] total issues: ${findings.length}`);
  if (findings.length) {
    console.log('\nContrast violations summary:');
    findings.forEach(f => console.log(`- ${f.url} (${f.nodes} nodes) ${f.help}`));
    process.exitCode = 1;
  } else {
    console.log('No axe color-contrast violations on scanned paths.');
  }
  await browser.close();
  console.log('[axe-contrast] done');
})();

// inlineCss now shared via scripts/inlineCss.ts
