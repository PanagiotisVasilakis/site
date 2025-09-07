#!/usr/bin/env tsx
/**
 * Simple contrast scanner using jsdom + computed color parsing.
 * It loads a list of URLs (served pages) via fetch from local dev server (assumes running at http://localhost:3000)
 * then parses DOM and checks text nodes against parent background approximation.
 * NOTE: This is a heuristic (no layout painting); for production replace with axe-core integration.
 */
import { JSDOM } from 'jsdom';

interface Issue { url: string; text: string; fg: string; bg: string; ratio: number; nodePath: string; }

// Relative luminance
function luminance(rgb: number[]) {
  return rgb.map(v => {
    const c = v/255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4);
  }).reduce((acc, c, i) => acc + [0.2126,0.7152,0.0722][i]*c, 0);
}
function parseColor(str: string): number[] | null {
  if (!str) return null;
  if (str.startsWith('rgb')) {
    const m = str.match(/rgba?\(([^)]+)\)/); if (!m) return null; const parts = m[1].split(',').map(s=>parseFloat(s.trim())).slice(0,3); return parts as number[];
  }
  if (str.startsWith('#')) {
    let hex = str.slice(1);
    if (hex.length === 3) hex = hex.split('').map(c=>c+c).join('');
    if (hex.length === 6) return [0,2,4].map(i=>parseInt(hex.slice(i,i+2),16));
  }
  return null; // skip named colors for brevity
}
function contrastRatio(fg: number[], bg: number[]) {
  const L1 = luminance(fg); const L2 = luminance(bg);
  const light = Math.max(L1,L2), dark = Math.min(L1,L2);
  return (light + 0.05)/(dark + 0.05);
}

async function scan(url: string): Promise<Issue[]> {
  const res = await fetch(url);
  const html = await res.text();
  const dom = new JSDOM(html);
  const { window } = dom; const { document } = window;
  const issues: Issue[] = [];
  const walker = document.createTreeWalker(document.body, window.NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.textContent) return window.NodeFilter.FILTER_REJECT;
      if (!node.textContent.trim()) return window.NodeFilter.FILTER_REJECT;
      if (node.textContent.trim().length < 2) return window.NodeFilter.FILTER_SKIP;
      return window.NodeFilter.FILTER_ACCEPT;
    }
  });
  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    const el = textNode.parentElement; if (!el) continue;
    const style = window.getComputedStyle(el);
    const fgRaw = style.color; let bgRaw = style.backgroundColor;
    // ascend until non-transparent bg
    let cur: HTMLElement | null = el;
    while (cur && (bgRaw === 'transparent' || bgRaw === 'rgba(0, 0, 0, 0)' || bgRaw === 'rgba(0,0,0,0)')) {
      cur = cur.parentElement; if (!cur) break; const cs = window.getComputedStyle(cur); bgRaw = cs.backgroundColor;
    }
    const fg = parseColor(fgRaw); const bg = parseColor(bgRaw || '#ffffff');
    if (!fg || !bg) continue;
    const ratio = contrastRatio(fg,bg);
    const isLarge = parseFloat(style.fontSize) >= 18 || (parseFloat(style.fontSize) >= 14 && style.fontWeight >= '600');
    const required = isLarge ? 3 : 4.5;
    if (ratio < required) {
      const path: string[] = [];
      let p: HTMLElement | null = el;
      while (p && path.length < 6) { path.push(p.tagName.toLowerCase() + (p.id ? '#' + p.id: '')); p = p.parentElement; }
      issues.push({ url, text: textNode.textContent.trim().slice(0,80), fg: fgRaw, bg: bgRaw, ratio: Math.round(ratio*100)/100, nodePath: path.join(' > ') });
    }
  }
  return issues;
}

async function main() {
  const base = process.env.SCAN_BASE || 'http://localhost:3000';
  const paths = (process.env.SCAN_PATHS || '/en,/en/favorites').split(',');
  const all: Issue[] = [];
  for (const p of paths) {
    try {
      const u = base + p;
  console.log('Scanning', u);
      const issues = await scan(u);
      all.push(...issues);
    } catch (e) {
      console.error('Failed', p, e);
    }
  }
  if (all.length) {
    console.log(`Contrast issues (${all.length}):`);
    for (const i of all) {
      console.log(`- ${i.url} :: ${i.ratio} : "${i.text}" (${i.fg} on ${i.bg}) @ ${i.nodePath}`);
    }
    process.exitCode = 1; // fail CI so we notice
  } else {
    console.log('No contrast issues detected for scanned paths.');
  }
}

main();
