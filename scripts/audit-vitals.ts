#!/usr/bin/env node
/**
 * Advisory Core Web Vitals audit (docs/design/identity.md §5.10) for a local production build
 * (`npm run build && npm start`). Never fails the release gate; it prints the medians and the budgets.
 *
 * Profile (§5.10): 390×844 @3x mobile, CPU throttling ×4, network 1.6 Mbps down / 750 kbps up /
 * 150 ms RTT (applied as raw DevTools values), a cold browser context per run, median of VITALS_RUNS.
 * - LCP: last `largest-contentful-paint` entry before the interaction.
 * - CLS: largest session window of `layout-shift` entries without recent input (1 s gap, 5 s cap).
 * - TBT: sum of (duration − 50 ms) of long tasks from FCP until the page is network-idle + 1 s.
 * - INP proxy: the longest Event Timing interaction (durationThreshold 16 ms) for one scripted
 *   interaction per route (menu open, room chip, calendar day, guide chip); "<16" when no entry.
 * - Bytes: encoded transfer size per resource type (Script, Font, Stylesheet, Image) of the first run.
 *
 * Local only: the base URL must be loopback, and the browser can reach nothing else (dead proxy for
 * every other host, host resolver limited to localhost).
 *
 * Env:
 * - VITALS_BASE=http://127.0.0.1:3000
 * - VITALS_PATHS=/en,/en/apartment,/en/availability,/en/moments
 * - VITALS_RUNS=5
 * - VITALS_MOTION=no-preference|reduce (prefers-reduced-motion; default no-preference)
 * - VITALS_JSON=<file> (optional JSON report)
 */
import puppeteer, { type Browser, type Page } from 'puppeteer';
import { writeFile } from 'node:fs/promises';

const BASE = process.env.VITALS_BASE || 'http://127.0.0.1:3000';
const PATHS = (process.env.VITALS_PATHS || '/en,/en/apartment,/en/availability,/en/moments')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const RUNS = Math.max(1, Number.parseInt(process.env.VITALS_RUNS || '5', 10) || 5);
const MOTION = process.env.VITALS_MOTION === 'reduce' ? 'reduce' : 'no-preference';

const BUDGET = { lcpMs: 2500, cls: 0.05, inpMs: 200 } as const;
const NETWORK = { download: (1.6 * 1000 * 1000) / 8, upload: (750 * 1000) / 8, latency: 150 };
const LOCAL_ONLY_ARGS = [
  '--proxy-server=http://127.0.0.1:9',
  '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1',
];

/** One scripted interaction per route, in the order of §5.10 "interaction tests". */
const INTERACTIONS: Array<{ match: RegExp; label: string; selectors: string[] }> = [
  { match: /\/availability$/, label: 'calendar day', selectors: ['.cal__btn:not([disabled])'] },
  { match: /\/moments$/, label: 'guide chip', selectors: ['.guide-chips button:nth-of-type(2)', '.guide-chips button'] },
  { match: /\/apartment$/, label: 'room chip', selectors: ['.apt-chips__list li:nth-child(2) a', '.apt-chip'] },
  { match: /.*/, label: 'menu open', selectors: ['.site-header__menu-btn'] },
];

interface RunResult {
  lcpMs: number | null;
  lcpElement: string;
  cls: number;
  tbtMs: number;
  inpMs: number | null;
  interaction: string;
  bytes: Record<string, number>;
}

interface PageVitals {
  fcp: number | null;
  lcp: number | null;
  lcpElement: string;
  cls: number;
  longTasks: Array<{ start: number; duration: number }>;
}

function assertLoopback(url: string) {
  const { hostname } = new URL(url);
  if (hostname !== '127.0.0.1' && hostname !== 'localhost' && hostname !== '[::1]') {
    throw new Error(`VITALS_BASE must be a loopback URL (got ${hostname})`);
  }
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Runs in the page before any script: observers for paint, LCP, layout shifts, long tasks and events. */
function installObservers() {
  type Store = {
    fcp: number | null;
    lcp: number | null;
    lcpElement: string;
    cls: number;
    session: { value: number; first: number; last: number };
    longTasks: Array<{ start: number; duration: number }>;
    events: Array<{ id: number; duration: number }>;
  };
  const store: Store = {
    fcp: null,
    lcp: null,
    lcpElement: '',
    cls: 0,
    session: { value: 0, first: 0, last: 0 },
    longTasks: [],
    events: [],
  };
  (globalThis as unknown as { __vitals: Store }).__vitals = store;
  // Inline callbacks only: tsx (esbuild keepNames) wraps named inner functions in a `__name` helper that
  // does not exist in the page.
  const specs: Array<[string, (entries: PerformanceEntryList) => void, object]> = [
    ['paint', (entries) => {
      for (const entry of entries) if (entry.name === 'first-contentful-paint') store.fcp = entry.startTime;
    }, {}],
    ['largest-contentful-paint', (entries) => {
      for (const entry of entries) {
        const lcp = entry as PerformanceEntry & { element?: Element | null; url?: string };
        store.lcp = lcp.startTime;
        const element = lcp.element;
        const name = element ? `${element.tagName.toLowerCase()}.${(element.getAttribute('class') || '').split(' ')[0]}` : '?';
        store.lcpElement = lcp.url ? `${name} ${lcp.url.replace(location.origin, '').split('?')[0]}` : name;
      }
    }, {}],
    ['layout-shift', (entries) => {
      for (const entry of entries) {
        const shift = entry as PerformanceEntry & { value: number; hadRecentInput: boolean };
        if (shift.hadRecentInput) continue;
        const s = store.session;
        if (s.value > 0 && shift.startTime - s.last < 1000 && shift.startTime - s.first < 5000) {
          s.value += shift.value;
          s.last = shift.startTime;
        } else {
          store.session = { value: shift.value, first: shift.startTime, last: shift.startTime };
        }
        store.cls = Math.max(store.cls, store.session.value);
      }
    }, {}],
    ['longtask', (entries) => {
      for (const entry of entries) store.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }, {}],
    ['event', (entries) => {
      for (const entry of entries) {
        const event = entry as PerformanceEntry & { interactionId?: number };
        if (event.interactionId) store.events.push({ id: event.interactionId, duration: event.duration });
      }
    }, { durationThreshold: 16 }],
  ];
  for (const [type, callback, extra] of specs) {
    try {
      new PerformanceObserver((list) => callback(list.getEntries())).observe({ type, buffered: true, ...extra });
    } catch {
      // entry type not supported: the metric stays empty
    }
  }
}

async function interact(page: Page, path: string): Promise<string> {
  const plan = INTERACTIONS.find((entry) => entry.match.test(path));
  if (!plan) return 'none';
  for (const selector of plan.selectors) {
    const handle = await page.$(selector);
    if (!handle) continue;
    await handle.scrollIntoView();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await handle.click();
    await new Promise((resolve) => setTimeout(resolve, 1200));
    if (plan.label === 'menu open') await page.keyboard.press('Escape');
    return plan.label;
  }
  return `${plan.label} (target not found)`;
}

async function measure(browser: Browser, path: string): Promise<RunResult> {
  const context = await browser.createBrowserContext();
  try {
    const page = await context.newPage();
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: MOTION }]);
    await page.emulateCPUThrottling(4);
    await page.emulateNetworkConditions(NETWORK);
    const cdp = await page.createCDPSession();
    const types = new Map<string, string>();
    const bytes: Record<string, number> = {};
    cdp.on('Network.responseReceived', (event) => types.set(event.requestId, event.type));
    cdp.on('Network.loadingFinished', (event) => {
      const type = types.get(event.requestId) ?? 'Other';
      bytes[type] = (bytes[type] ?? 0) + event.encodedDataLength;
    });
    await cdp.send('Network.enable');
    await page.evaluateOnNewDocument(installObservers);

    const response = await page.goto(new URL(path, BASE).toString(), { waitUntil: 'load', timeout: 120000 });
    if (!response || response.status() !== 200) throw new Error(`HTTP ${response?.status() ?? 'no response'}`);
    await page.waitForNetworkIdle({ idleTime: 1000, timeout: 60000 }).catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const vitals = await page.evaluate(() => {
      const store = (globalThis as unknown as { __vitals: PageVitals }).__vitals;
      return { fcp: store.fcp, lcp: store.lcp, lcpElement: store.lcpElement, cls: store.cls, longTasks: store.longTasks };
    });
    const fcp = vitals.fcp ?? 0;
    const tbtMs = vitals.longTasks
      .filter((task) => task.start >= fcp)
      .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);

    const interaction = await interact(page, path);
    const events = await page.evaluate(() => (globalThis as unknown as { __vitals: { events: Array<{ id: number; duration: number }> } }).__vitals.events);
    const inpMs = events.length ? Math.max(...events.map((event) => event.duration)) : null;
    return {
      lcpMs: vitals.lcp,
      lcpElement: vitals.lcpElement,
      cls: vitals.cls,
      tbtMs,
      inpMs,
      interaction,
      bytes: Object.fromEntries(Object.entries(bytes).filter(([type]) => ['Script', 'Font', 'Stylesheet', 'Image'].includes(type))),
    };
  } finally {
    await context.close();
  }
}

const fmtMs = (value: number | null) => (value === null ? 'n/a' : `${Math.round(value)} ms`);
const kb = (value: number | undefined) => `${((value ?? 0) / 1024).toFixed(1)} KiB`;

(async () => {
  assertLoopback(BASE);
  console.log(`[vitals] base ${BASE}, runs ${RUNS}, motion ${MOTION}, CPU ×4, 1.6 Mbps / 750 kbps / 150 ms`);
  const browser = await puppeteer.launch({ headless: true, args: LOCAL_ONLY_ARGS });
  const report: Array<Record<string, unknown>> = [];
  let errors = 0;
  try {
    for (const path of PATHS) {
      const runs: RunResult[] = [];
      for (let run = 0; run < RUNS; run++) {
        try {
          runs.push(await measure(browser, path));
        } catch (error) {
          errors++;
          console.error(`[vitals] ${path} run ${run + 1} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
      }
      if (runs.length === 0) continue;
      const lcp = median(runs.flatMap((run) => (run.lcpMs === null ? [] : [run.lcpMs])));
      const cls = median(runs.map((run) => run.cls)) ?? 0;
      const tbt = median(runs.map((run) => run.tbtMs)) ?? 0;
      const inpValues = runs.flatMap((run) => (run.inpMs === null ? [] : [run.inpMs]));
      const inp = median(inpValues);
      const elements = [...new Set(runs.map((run) => run.lcpElement))].join(' | ');
      const flags = [
        lcp !== null && lcp > BUDGET.lcpMs ? 'LCP over budget' : '',
        cls > BUDGET.cls ? 'CLS over budget' : '',
        inp !== null && inp > BUDGET.inpMs ? 'INP over budget' : '',
      ].filter(Boolean);
      const bytes = runs[0].bytes;
      console.log(`\n${path}  (${runs.length} runs, interaction: ${runs[0].interaction})`);
      console.log(`  LCP ${fmtMs(lcp)} (≤ ${BUDGET.lcpMs})  element: ${elements}`);
      console.log(`  CLS ${cls.toFixed(3)} (≤ ${BUDGET.cls})  TBT ${fmtMs(tbt)} (≤ baseline + 50 ms)  INP proxy ${inp === null ? '<16 ms' : fmtMs(inp)} (≤ ${BUDGET.inpMs})`);
      console.log(`  bytes (run 1, encoded incl. headers, sum of all responses per type): scripts ${kb(bytes.Script)}, fonts ${kb(bytes.Font)}, stylesheets ${kb(bytes.Stylesheet)}, images ${kb(bytes.Image)}`);
      console.log(`  per run LCP: ${runs.map((run) => fmtMs(run.lcpMs)).join(', ')}`);
      if (flags.length) console.log(`  ADVISORY: ${flags.join(', ')}`);
      report.push({ path, runs, median: { lcpMs: lcp, cls, tbtMs: tbt, inpMs: inp }, lcpElements: elements, flags });
    }
  } finally {
    await browser.close();
  }
  if (process.env.VITALS_JSON) {
    await writeFile(process.env.VITALS_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), base: BASE, runs: RUNS, motion: MOTION, routes: report }, null, 2), 'utf8');
    console.log(`\n[vitals] wrote ${process.env.VITALS_JSON}`);
  }
  if (errors) process.exitCode = 1;
})();
