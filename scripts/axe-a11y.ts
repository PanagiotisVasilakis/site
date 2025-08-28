#!/usr/bin/env node
/**
 * Full axe-core accessibility audit (all default rules) using Puppeteer.
 * Exits with code 1 on any violation.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import inlineCss from './inlineCss';

// Load axe source
// @ts-ignore
import axePkg from 'axe-core';
// @ts-ignore
const axeSource: string = (axePkg as any).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
const PATHS = (process.env.AXE_PATHS || '/en,/en/house,/en/favorites,/en/offline,/en/phones,/en/phones/police-emergency').split(',');
const STATIC_DIR = process.env.AXE_STATIC_DIR || '.next/server/app';

interface ViolationSummary { id: string; impact: string | null; help: string; nodes: number; url: string; }

process.on('unhandledRejection', (err) => {
  console.error('[axe-a11y] UnhandledRejection:', err);
});
process.on('uncaughtException', (err) => {
  console.error('[axe-a11y] UncaughtException:', err);
});

(async () => {
  console.log('[axe-a11y] starting');
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const allViolations: ViolationSummary[] = [];
  const errors: { url: string; error: string }[] = [];
  for (const p of PATHS) {
    const target = BASE + p;
    console.log(`Auditing (full) ${target}`);
    let navigated = false;
    try {
      const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 45000 });
      console.log(`[axe-a11y] navigated ${target} status=${resp?.status?.()}`);
      await page.waitForNetworkIdle({ idleTime: 750, timeout: 12000 }).catch(()=>{});
      navigated = true;
    } catch (err) {
      console.error(`[axe-a11y] navigation failed for ${target}:`, (err as Error).message);
      errors.push({ url: target, error: (err as Error).message });
      try {
        const pathModule = await import('node:path');
        const safe = p.replace(/\/$/, '') || '/';
        const guessFiles: string[] = [];
        if (safe === '/') {
          guessFiles.push(pathModule.join(STATIC_DIR, 'index.html'));
        } else {
          const rel = safe.slice(1);
            if (!rel.includes('/')) guessFiles.push(pathModule.join(STATIC_DIR, rel + '.html'));
            guessFiles.push(pathModule.join(STATIC_DIR, rel + '.html'));
        }
        let found: string | null = null;
        for (const f of guessFiles) { if (fs.existsSync(f)) { found = f; break; } }
        if (found) {
          console.log(`[axe-a11y] static fallback using ${found}`);
          let html = await fs.promises.readFile(found, 'utf8');
          try { html = inlineCss(html); } catch {}
          await page.setContent(html, { waitUntil: 'domcontentloaded' });
          navigated = true;
        } else {
          console.log('[axe-a11y] no static fallback file found');
        }
      } catch (fe) {
        console.error('[axe-a11y] static fallback failed:', (fe as Error).message);
      }
      if (!navigated) continue;
    }
    await page.addScriptTag({ content: axeSource });
    console.log('[axe-a11y] axe injected, running...');
    const result = await page.evaluate(async () => {
      // @ts-ignore
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
  }
  await browser.close();
  if (process.env.AXE_JSON) {
    const out = { generatedAt: new Date().toISOString(), base: BASE, paths: PATHS, violations: allViolations, errors };
    let file = process.env.AXE_JSON === '1' ? 'axe-a11y-report.json' : process.env.AXE_JSON;
    if (file === 'timestamp') {
      const ts = new Date().toISOString().replace(/[:.]/g,'-');
      file = `axe-a11y-report-${ts}.json`;
    }
    try {
  try { await fs.promises.unlink(file); console.log(`[axe-a11y] removed existing ${file}`); } catch {}
      await fs.promises.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Wrote JSON report to ${file} (violations=${allViolations.length} errors=${errors.length})`);
    } catch (e) {
      console.error('[axe-a11y] failed to write JSON report:', (e as Error).message);
    }
  }
  if (allViolations.length) {
    const grouped: Record<string, number> = {};
    allViolations.forEach(v => { grouped[v.id] = (grouped[v.id]||0)+v.nodes; });
    console.log('\nSummary:');
    Object.entries(grouped).forEach(([k,count]) => console.log(`- ${k}: ${count} nodes`));
    process.exitCode = 1;
  } else {
    console.log('No accessibility violations detected across scanned pages.');
  }
  console.log('[axe-a11y] done');
})();

// inlineCss now shared via scripts/inlineCss.ts
