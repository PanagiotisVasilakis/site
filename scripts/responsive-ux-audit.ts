#!/usr/bin/env tsx
/**
 * Responsive UX audit runner.
 *
 * Purpose:
 * - Evaluate key routes across phone and desktop viewport presets.
 * - Capture actionable UX signals (overflow, touch target sizing, clipping, landmarks).
 * - Save JSON + Markdown reports and screenshots for later triage.
 *
 * Usage:
 * - npm run audit:responsive:ux
 *
 * Optional env vars:
 * - RESPONSIVE_BASE_URL=http://localhost:3000
 * - RESPONSIVE_PATHS=/en,/el,/en/guest?mode=signin,/en/book
 * - RESPONSIVE_VIEWPORTS=phone-360x640,desktop-1366x768
 * - RESPONSIVE_CHROME_PATH=/usr/bin/google-chrome
 * - RESPONSIVE_UX_FAIL_ON_ISSUES=1
 * - RESPONSIVE_SCREENSHOTS=0
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import puppeteer, { type Browser, type Page } from 'puppeteer';

type DeviceKind = 'phone' | 'desktop';
type Severity = 'pass' | 'minor' | 'major' | 'critical';

interface ViewportPreset {
  id: string;
  label: string;
  width: number;
  height: number;
  deviceScaleFactor: number;
  isMobile: boolean;
  hasTouch: boolean;
  kind: DeviceKind;
}

interface RouteTarget {
  id: string;
  path: string;
  journey: string;
  locale: string;
}

interface DetectedIssue {
  code: string;
  severity: Exclude<Severity, 'pass'>;
  message: string;
}

interface ViewMetrics {
  horizontalOverflowPx: number;
  overflowingElementCount: number;
  overflowingElementSamples: string[];
  touchTargetFailures: number;
  touchTargetSamples: string[];
  truncatedTextCount: number;
  truncationSamples: string[];
  focusableCount: number;
  interactiveCount: number;
  h1Count: number;
  hasMainLandmark: boolean;
}

interface AuditCell {
  routeId: string;
  routePath: string;
  journey: string;
  locale: string;
  viewportId: string;
  viewportLabel: string;
  deviceKind: DeviceKind;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  durationMs: number;
  severity: Severity;
  issues: DetectedIssue[];
  metrics: ViewMetrics | null;
  screenshotPath?: string;
}

interface AuditReport {
  generatedAt: string;
  baseUrl: string;
  viewportIds: string[];
  routePaths: string[];
  summary: {
    totalCells: number;
    pass: number;
    minor: number;
    major: number;
    critical: number;
  };
  cells: AuditCell[];
}

const DEFAULT_BASE_URL = process.env.RESPONSIVE_BASE_URL || 'http://localhost:3000';
const NAV_TIMEOUT_MS = 45000;
const WAIT_IDLE_TIMEOUT_MS = 12000;
const SHOULD_CAPTURE_SCREENSHOTS = process.env.RESPONSIVE_SCREENSHOTS !== '0';
const FAIL_ON_ISSUES = process.env.RESPONSIVE_UX_FAIL_ON_ISSUES === '1';
const CHROME_PATH = process.env.RESPONSIVE_CHROME_PATH || process.env.CHROME_PATH;

const VIEWPORTS: ViewportPreset[] = [
  {
    id: 'phone-320x568',
    label: 'Phone 320x568',
    width: 320,
    height: 568,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    kind: 'phone',
  },
  {
    id: 'phone-360x640',
    label: 'Phone 360x640',
    width: 360,
    height: 640,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    kind: 'phone',
  },
  {
    id: 'phone-390x844',
    label: 'Phone 390x844',
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    kind: 'phone',
  },
  {
    id: 'phone-414x896',
    label: 'Phone 414x896',
    width: 414,
    height: 896,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    kind: 'phone',
  },
  {
    id: 'desktop-1366x768',
    label: 'Desktop 1366x768',
    width: 1366,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    kind: 'desktop',
  },
  {
    id: 'desktop-1440x900',
    label: 'Desktop 1440x900',
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    kind: 'desktop',
  },
  {
    id: 'desktop-1920x1080',
    label: 'Desktop 1920x1080',
    width: 1920,
    height: 1080,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    kind: 'desktop',
  },
  {
    id: 'desktop-1024x768-boundary',
    label: 'Boundary 1024x768',
    width: 1024,
    height: 768,
    deviceScaleFactor: 1,
    isMobile: false,
    hasTouch: false,
    kind: 'desktop',
  },
  {
    id: 'phone-768x1024-boundary',
    label: 'Boundary 768x1024',
    width: 768,
    height: 1024,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    kind: 'phone',
  },
];

const DEFAULT_ROUTES: RouteTarget[] = [
  { id: 'home-en', path: '/en', journey: 'home-discovery', locale: 'en' },
  { id: 'home-el', path: '/el', journey: 'home-discovery', locale: 'el' },
  { id: 'guest-signin-en', path: '/en/guest?mode=signin', journey: 'guest-auth', locale: 'en' },
  { id: 'guest-signup-en', path: '/en/guest?mode=signup', journey: 'guest-auth', locale: 'en' },
  { id: 'booking-en', path: '/en/book', journey: 'booking-flow', locale: 'en' },
  { id: 'check-in-en', path: '/en/check-in', journey: 'check-in-flow', locale: 'en' },
  { id: 'apartment-en', path: '/en/apartment', journey: 'property-details', locale: 'en' },
  { id: 'favorites-en', path: '/en/favorites', journey: 'favorites', locale: 'en' },
  { id: 'phones-en', path: '/en/phones', journey: 'category-browsing', locale: 'en' },
];

function toTimestampSafe(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'route';
}

function parseRoutesFromEnv(): RouteTarget[] {
  const raw = process.env.RESPONSIVE_PATHS;
  if (!raw) return DEFAULT_ROUTES;

  const paths = raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);

  return paths.map((routePath, index) => {
    const pathWithoutQuery = routePath.split('?')[0] || '/';
    const locale = pathWithoutQuery.split('/').filter(Boolean)[0] || 'unknown';

    return {
      id: `${index + 1}-${sanitizeId(routePath)}`,
      path: routePath,
      journey: 'custom',
      locale,
    };
  });
}

function parseViewportsFromEnv(): ViewportPreset[] {
  const raw = process.env.RESPONSIVE_VIEWPORTS;
  if (!raw) return VIEWPORTS;

  const allowed = new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  const selected = VIEWPORTS.filter((viewport) => allowed.has(viewport.id));
  if (selected.length === 0) {
    throw new Error('RESPONSIVE_VIEWPORTS did not match any known viewport id.');
  }
  return selected;
}

function severityRank(severity: Severity): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  if (severity === 'minor') return 1;
  return 0;
}

function highestSeverity(issues: DetectedIssue[]): Severity {
  if (issues.length === 0) return 'pass';

  let level: Severity = 'pass';
  for (const issue of issues) {
    if (severityRank(issue.severity) > severityRank(level)) {
      level = issue.severity;
    }
  }
  return level;
}

function evaluateIssues(
  metrics: ViewMetrics,
  viewport: ViewportPreset,
  httpStatus: number | null,
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  if (httpStatus !== null && httpStatus >= 500) {
    issues.push({
      code: 'http_server_error',
      severity: 'critical',
      message: `HTTP ${httpStatus} returned by route`,
    });
  } else if (httpStatus !== null && httpStatus >= 400) {
    issues.push({
      code: 'http_client_error',
      severity: 'major',
      message: `HTTP ${httpStatus} returned by route`,
    });
  }

  if (metrics.horizontalOverflowPx >= 24) {
    issues.push({
      code: 'horizontal_overflow_major',
      severity: 'major',
      message: `Horizontal overflow detected (${metrics.horizontalOverflowPx}px)`,
    });
  } else if (metrics.horizontalOverflowPx > 0) {
    issues.push({
      code: 'horizontal_overflow_minor',
      severity: 'minor',
      message: `Minor horizontal overflow detected (${metrics.horizontalOverflowPx}px)`,
    });
  }

  if (viewport.kind === 'phone') {
    if (metrics.touchTargetFailures >= 10) {
      issues.push({
        code: 'touch_target_major',
        severity: 'major',
        message: `${metrics.touchTargetFailures} interactive elements are below 44x44 touch target guidance`,
      });
    } else if (metrics.touchTargetFailures > 0) {
      issues.push({
        code: 'touch_target_minor',
        severity: 'minor',
        message: `${metrics.touchTargetFailures} interactive elements are below 44x44 touch target guidance`,
      });
    }
  }

  if (metrics.truncatedTextCount >= 15) {
    issues.push({
      code: 'text_clipping_major',
      severity: 'major',
      message: `High text clipping likelihood (${metrics.truncatedTextCount} elements)`,
    });
  } else if (metrics.truncatedTextCount >= 5) {
    issues.push({
      code: 'text_clipping_minor',
      severity: 'minor',
      message: `Potential text clipping (${metrics.truncatedTextCount} elements)`,
    });
  }

  if (!metrics.hasMainLandmark) {
    issues.push({
      code: 'missing_main_landmark',
      severity: 'major',
      message: 'Main landmark not found (main/[role="main"])',
    });
  }

  if (metrics.h1Count === 0) {
    issues.push({
      code: 'missing_h1',
      severity: 'minor',
      message: 'No h1 element found on page',
    });
  }

  if (metrics.focusableCount === 0) {
    issues.push({
      code: 'no_focusable_elements',
      severity: 'major',
      message: 'No focusable elements detected',
    });
  }

  return issues;
}

function summarize(cells: AuditCell[]) {
  return {
    totalCells: cells.length,
    pass: cells.filter((cell) => cell.severity === 'pass').length,
    minor: cells.filter((cell) => cell.severity === 'minor').length,
    major: cells.filter((cell) => cell.severity === 'major').length,
    critical: cells.filter((cell) => cell.severity === 'critical').length,
  };
}

function compactInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function markdownFromReport(report: AuditReport): string {
  const lines: string[] = [];
  lines.push('# Responsive UX Audit Report');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push(`Base URL: ${report.baseUrl}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total route x viewport cells: ${report.summary.totalCells}`);
  lines.push(`- Pass: ${report.summary.pass}`);
  lines.push(`- Minor: ${report.summary.minor}`);
  lines.push(`- Major: ${report.summary.major}`);
  lines.push(`- Critical: ${report.summary.critical}`);
  lines.push('');
  lines.push('## Matrix');
  lines.push('');
  lines.push('| Route | Viewport | Severity | HTTP | Top issue | Screenshot |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const cell of report.cells) {
    const topIssue = compactInlineText(cell.issues[0]?.message || 'None');
    const screenshot = cell.screenshotPath ? cell.screenshotPath : 'n/a';
    lines.push(
      `| ${cell.routePath} | ${cell.viewportId} | ${cell.severity.toUpperCase()} | ${cell.httpStatus ?? 'n/a'} | ${topIssue} | ${screenshot} |`,
    );
  }

  lines.push('');
  lines.push('## Detailed Findings');
  lines.push('');

  const actionable = report.cells.filter((cell) => cell.severity !== 'pass');
  if (actionable.length === 0) {
    lines.push('No issues were detected by automated checks.');
  } else {
    for (const cell of actionable) {
      lines.push(`### ${cell.routePath} @ ${cell.viewportLabel}`);
      lines.push('');
      lines.push(`- Severity: ${cell.severity.toUpperCase()}`);
      lines.push(`- Final URL: ${cell.finalUrl ?? 'n/a'}`);
      lines.push(`- HTTP: ${cell.httpStatus ?? 'n/a'}`);
      lines.push(`- Duration (ms): ${cell.durationMs}`);

      for (const issue of cell.issues) {
        lines.push(`- [${issue.severity.toUpperCase()}] ${compactInlineText(issue.message)}`);
      }

      if (cell.metrics) {
        lines.push(`- Horizontal overflow (px): ${cell.metrics.horizontalOverflowPx}`);
        lines.push(`- Touch target failures: ${cell.metrics.touchTargetFailures}`);
        lines.push(`- Truncated text count: ${cell.metrics.truncatedTextCount}`);

        if (cell.metrics.overflowingElementSamples.length > 0) {
          lines.push(`- Overflow samples: ${cell.metrics.overflowingElementSamples.join(' | ')}`);
        }

        if (cell.metrics.touchTargetSamples.length > 0) {
          lines.push(`- Touch target samples: ${cell.metrics.touchTargetSamples.join(' | ')}`);
        }

        if (cell.metrics.truncationSamples.length > 0) {
          lines.push(`- Truncation samples: ${cell.metrics.truncationSamples.join(' | ')}`);
        }
      }

      if (cell.screenshotPath) {
        lines.push(`- Screenshot: ${cell.screenshotPath}`);
      }

      lines.push('');
    }
  }

  return lines.join('\n');
}

async function collectMetrics(page: Page): Promise<ViewMetrics> {
  const script = `
    (() => {
      const describeNode = (element) => {
        const htmlElement = element;
        const tag = element.tagName.toLowerCase();
        const id = htmlElement.id ? '#' + htmlElement.id : '';
        const className = (htmlElement.className || '')
          .toString()
          .split(/\\s+/)
          .filter(Boolean)
          .slice(0, 2)
          .map((part) => '.' + part)
          .join('');
        return '' + tag + id + className;
      };

      const shouldIgnoreElement = (element) => {
        const htmlElement = element;
        return Boolean(htmlElement.classList && htmlElement.classList.contains('skip-link'));
      };

      const root = document.documentElement;
      const body = document.body;
      const docWidth = Math.max((root && root.scrollWidth) || 0, (body && body.scrollWidth) || 0);
      const viewportWidth = window.innerWidth;

      const allElements = Array.from(document.querySelectorAll('body *'));
      const overflowingElements = allElements
        .filter((element) => {
          if (shouldIgnoreElement(element)) return false;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return rect.left < -1 || rect.right > viewportWidth + 1;
        })
        .slice(0, 8)
        .map((element) => describeNode(element));

      const interactiveSelector = [
        'button',
        'a[href]',
        'input:not([type="hidden"])',
        'select',
        'textarea',
        '[role="button"]',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      const interactiveElements = Array.from(document.querySelectorAll(interactiveSelector))
        .filter((element) => !shouldIgnoreElement(element));

      const touchTargetFailures = interactiveElements
        .filter((element) => {
          const style = window.getComputedStyle(element);
          if (style.display === 'none' || style.visibility === 'hidden' || style.pointerEvents === 'none') {
            return false;
          }

          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;

          return rect.width < 44 || rect.height < 44;
        })
        .slice(0, 8)
        .map((element) => describeNode(element));

      const truncationCandidates = Array.from(document.querySelectorAll('h1,h2,h3,h4,p,span,a,button,label'));
      const clipped = truncationCandidates
        .filter((element) => {
          if (shouldIgnoreElement(element)) return false;
          const htmlElement = element;
          if (!htmlElement.offsetParent) return false;

          const style = window.getComputedStyle(htmlElement);
          const clippingEnabled =
            style.textOverflow === 'ellipsis' ||
            style.whiteSpace === 'nowrap' ||
            /(hidden|clip)/.test(style.overflowX) ||
            /(hidden|clip)/.test(style.overflow);

          if (!clippingEnabled) return false;
          return htmlElement.scrollWidth > htmlElement.clientWidth + 4;
        })
        .slice(0, 8)
        .map((element) => describeNode(element));

      const focusableSelector = [
        'a[href]',
        'button:not([disabled])',
        'input:not([disabled]):not([type="hidden"])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        '[tabindex]:not([tabindex="-1"])',
      ].join(',');

      const focusableCount = document.querySelectorAll(focusableSelector).length;

      return {
        horizontalOverflowPx: Math.max(0, docWidth - viewportWidth),
        overflowingElementCount: overflowingElements.length,
        overflowingElementSamples: overflowingElements,
        touchTargetFailures: touchTargetFailures.length,
        touchTargetSamples: touchTargetFailures,
        truncatedTextCount: clipped.length,
        truncationSamples: clipped,
        focusableCount,
        interactiveCount: interactiveElements.length,
        h1Count: document.querySelectorAll('h1').length,
        hasMainLandmark: Boolean(document.querySelector('main, [role="main"]')),
      };
    })();
  `;

  return (await page.evaluate(script)) as ViewMetrics;
}

async function runAudit() {
  const runStarted = Date.now();
  const timestamp = toTimestampSafe();
  const outputDir = path.join(process.cwd(), 'reports', 'responsive-ux');
  const screenshotDir = path.join(outputDir, `screenshots-${timestamp}`);

  await mkdir(outputDir, { recursive: true });
  if (SHOULD_CAPTURE_SCREENSHOTS) {
    await mkdir(screenshotDir, { recursive: true });
  }

  const routes = parseRoutesFromEnv();
  const viewports = parseViewportsFromEnv();

  console.log(`[responsive-ux] base URL: ${DEFAULT_BASE_URL}`);
  console.log(`[responsive-ux] routes: ${routes.length}, viewports: ${viewports.length}`);
  if (CHROME_PATH) {
    console.log(`[responsive-ux] using chrome path: ${CHROME_PATH}`);
  }

  let browser: Browser;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: CHROME_PATH,
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[responsive-ux] Unable to launch Chromium for audit execution.');
    console.error(
      '[responsive-ux] On Linux, install required browser libraries (for example libasound2) or set RESPONSIVE_CHROME_PATH to a working Chrome/Chromium binary.',
    );

    const cells: AuditCell[] = viewports.flatMap((viewport) =>
      routes.map((route) => ({
        routeId: route.id,
        routePath: route.path,
        journey: route.journey,
        locale: route.locale,
        viewportId: viewport.id,
        viewportLabel: viewport.label,
        deviceKind: viewport.kind,
        url: new URL(route.path, DEFAULT_BASE_URL).toString(),
        finalUrl: null,
        httpStatus: null,
        durationMs: 0,
        severity: 'critical' as Severity,
        issues: [
          {
            code: 'browser_launch_failure',
            severity: 'critical' as Exclude<Severity, 'pass'>,
            message: `Chromium launch failed: ${message}`,
          },
        ],
        metrics: null,
      })),
    );

    const report: AuditReport = {
      generatedAt: new Date().toISOString(),
      baseUrl: DEFAULT_BASE_URL,
      viewportIds: viewports.map((viewport) => viewport.id),
      routePaths: routes.map((route) => route.path),
      summary: summarize(cells),
      cells,
    };

    const jsonPath = path.join(outputDir, `responsive-ux-audit-${timestamp}.json`);
    const mdPath = path.join(outputDir, `responsive-ux-audit-${timestamp}.md`);

    await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
    await writeFile(mdPath, markdownFromReport(report), 'utf8');

    console.log(`[responsive-ux] JSON report: ${path.relative(process.cwd(), jsonPath)}`);
    console.log(`[responsive-ux] Markdown report: ${path.relative(process.cwd(), mdPath)}`);
    console.log('[responsive-ux] Completed with launch failure artifacts.');
    process.exitCode = 1;
    return;
  }

  const cells: AuditCell[] = [];

  try {
    for (const viewport of viewports) {
      const page = await browser.newPage();
      await page.setViewport({
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.deviceScaleFactor,
        isMobile: viewport.isMobile,
        hasTouch: viewport.hasTouch,
      });

      for (const route of routes) {
        const started = Date.now();
        const url = new URL(route.path, DEFAULT_BASE_URL).toString();

        let responseStatus: number | null = null;
        let finalUrl: string | null = null;
        let metrics: ViewMetrics | null = null;
        const issues: DetectedIssue[] = [];
        let screenshotPath: string | undefined;

        try {
          const response = await page.goto(url, {
            waitUntil: 'domcontentloaded',
            timeout: NAV_TIMEOUT_MS,
          });

          responseStatus = response?.status() ?? null;
          finalUrl = page.url();

          await page.waitForNetworkIdle({
            idleTime: 750,
            timeout: WAIT_IDLE_TIMEOUT_MS,
          }).catch(() => undefined);

          metrics = await collectMetrics(page);
          issues.push(...evaluateIssues(metrics, viewport, responseStatus));

          if (SHOULD_CAPTURE_SCREENSHOTS) {
            const shotName = `${viewport.id}__${route.id}.png`;
            const shotPath = path.join(screenshotDir, shotName) as `${string}.png`;
            await page.screenshot({ path: shotPath, fullPage: true });
            screenshotPath = path.relative(process.cwd(), shotPath);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          issues.push({
            code: 'navigation_error',
            severity: 'critical',
            message: `Navigation failed: ${message}`,
          });
        }

        const cell: AuditCell = {
          routeId: route.id,
          routePath: route.path,
          journey: route.journey,
          locale: route.locale,
          viewportId: viewport.id,
          viewportLabel: viewport.label,
          deviceKind: viewport.kind,
          url,
          finalUrl,
          httpStatus: responseStatus,
          durationMs: Date.now() - started,
          severity: highestSeverity(issues),
          issues,
          metrics,
          screenshotPath,
        };

        cells.push(cell);

        const topIssue = issues[0]?.message || 'No issues';
        console.log(
          `[responsive-ux] ${viewport.id} | ${route.path} => ${cell.severity.toUpperCase()} | ${topIssue}`,
        );
      }

      await page.close();
    }
  } finally {
    await browser.close();
  }

  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    viewportIds: viewports.map((viewport) => viewport.id),
    routePaths: routes.map((route) => route.path),
    summary: summarize(cells),
    cells,
  };

  const jsonPath = path.join(outputDir, `responsive-ux-audit-${timestamp}.json`);
  const mdPath = path.join(outputDir, `responsive-ux-audit-${timestamp}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(mdPath, markdownFromReport(report), 'utf8');

  console.log(`[responsive-ux] JSON report: ${path.relative(process.cwd(), jsonPath)}`);
  console.log(`[responsive-ux] Markdown report: ${path.relative(process.cwd(), mdPath)}`);
  console.log(
    `[responsive-ux] Summary - pass:${report.summary.pass} minor:${report.summary.minor} major:${report.summary.major} critical:${report.summary.critical}`,
  );
  console.log(`[responsive-ux] Completed in ${Date.now() - runStarted}ms`);

  if (FAIL_ON_ISSUES && (report.summary.major > 0 || report.summary.critical > 0)) {
    console.error('[responsive-ux] Failing due to major/critical issues (RESPONSIVE_UX_FAIL_ON_ISSUES=1).');
    process.exitCode = 1;
  }
}

runAudit().catch((error) => {
  console.error('[responsive-ux] Fatal error:', error);
  process.exitCode = 1;
});
