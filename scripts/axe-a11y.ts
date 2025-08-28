#!/usr/bin/env node
/**
 * Full axe-core accessibility audit (all default rules) using Puppeteer.
 * Exits with code 1 on any violation.
 */
import puppeteer from 'puppeteer';
import fs from 'node:fs';

// Load axe source
// @ts-ignore
import axePkg from 'axe-core';
// @ts-ignore
const axeSource: string = (axePkg as any).source || fs.readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const BASE = process.env.AXE_BASE || 'http://localhost:3000';
const PATHS = (process.env.AXE_PATHS || '/en,/en/favorites,/en/offline').split(',');

interface ViolationSummary { id: string; impact: string | null; help: string; nodes: number; url: string; }

(async () => {
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  const allViolations: ViolationSummary[] = [];
  for (const p of PATHS) {
    const target = BASE + p;
    console.log(`Auditing (full) ${target}`);
    await page.goto(target, { waitUntil: 'networkidle0' });
    await page.addScriptTag({ content: axeSource });
    const result = await page.evaluate(async () => {
      // @ts-ignore
      return await axe.run();
    });
    if (result.violations.length) {
      for (const v of result.violations) {
        allViolations.push({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.length, url: target });
        console.log(`  Rule: ${v.id} (${v.impact}) - ${v.help}`);
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
    const out = { generatedAt: new Date().toISOString(), base: BASE, paths: PATHS, violations: allViolations };
    const file = process.env.AXE_JSON === '1' ? 'axe-a11y-report.json' : process.env.AXE_JSON;
    await fs.promises.writeFile(file, JSON.stringify(out, null, 2), 'utf8');
    console.log(`Wrote JSON report to ${file}`);
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
})();
