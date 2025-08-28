#!/usr/bin/env node
/**
 * axe-core + Puppeteer accessibility (contrast-focused) audit.
 * Launches headless Chromium, loads supplied paths, runs axe, and prints any color-contrast violations.
 * Exit code 1 if any violations of color-contrast rule.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

// Dynamically load axe-core script text
import axePkg from 'axe-core';
// @ts-ignore - axe.min.js path exposed via package exports fallback
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const axeSource: string = (axePkg as any).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
const PATHS = (process.env.AXE_PATHS || '/en,/en/favorites').split(',');

interface Finding { url: string; id: string; impact: string | null; help: string; nodes: number; snippets: string[]; }

console.log('[axe-contrast] starting');
(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  const findings: Finding[] = [];
  for (const p of PATHS) {
    const target = BASE + p;
    // eslint-disable-next-line no-console
    console.log(`Auditing ${target}`);
    try {
      const resp = await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 30000 });
      console.log(`[axe-contrast] navigated ${target} status=${resp?.status?.()}`);
      await page.waitForNetworkIdle({ idleTime: 750, timeout: 10000 }).catch(()=>{});
    } catch (err) {
      console.error(`[axe-contrast] navigation failed for ${target}:`, (err as Error).message);
      continue;
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
  }
    if (process.env.AXE_JSON) {
      const out = { generatedAt: new Date().toISOString(), base: BASE, paths: PATHS, issues: findings };
      const file = process.env.AXE_JSON === '1' ? 'axe-contrast-report.json' : process.env.AXE_JSON;
      await fs.promises.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
      console.log(`Wrote JSON report to ${file}`);
    }
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
