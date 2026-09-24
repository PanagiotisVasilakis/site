#!/usr/bin/env tsx
/**
 * Lighthouse matrix audit for responsive performance UX across mobile and desktop.
 *
 * Usage:
 * - npm run audit:lighthouse:matrix
 *
 * Optional env vars:
 * - LH_BASE_URL=http://localhost:3000
 * - LH_MATRIX_PATHS=/en,/el,/en/guest?mode=signin,/en/book
 * - LH_MATRIX_PROFILES=mobile,desktop
 * - LH_MATRIX_MIN_SCORE=90
 * - LH_MATRIX_FAIL_ON_ISSUES=1
 * - CHROME_PATH=/usr/bin/google-chrome
 */

import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { launch } from 'chrome-launcher';
import { screenEmulationMetrics, throttling } from 'lighthouse/core/config/constants.js';

const { default: lighthouse } = await import('lighthouse');

type ProfileId = 'mobile' | 'desktop';
type Severity = 'pass' | 'minor' | 'major' | 'critical';

interface Profile {
  id: ProfileId;
  label: string;
  screenEmulation: {
    mobile: boolean;
    width: number;
    height: number;
    deviceScaleFactor: number;
    disabled: boolean;
  };
  throttling: {
    rttMs: number;
    throughputKbps: number;
    cpuSlowdownMultiplier: number;
    requestLatencyMs?: number;
    downloadThroughputKbps: number;
    uploadThroughputKbps: number;
  };
}

interface MatrixCell {
  profile: ProfileId;
  route: string;
  url: string;
  performanceScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  inpMs: number | null;
  tbtMs: number | null;
  ttfbMs: number | null;
  fcpMs: number | null;
  severity: Severity;
  durationMs: number;
  error?: string;
}

interface MatrixReport {
  generatedAt: string;
  baseUrl: string;
  profiles: ProfileId[];
  routes: string[];
  minimumScore: number;
  summary: {
    totalCells: number;
    pass: number;
    minor: number;
    major: number;
    critical: number;
    averageScoreByProfile: Record<ProfileId, number>;
  };
  cells: MatrixCell[];
}

const DEFAULT_BASE_URL = process.env.LH_BASE_URL || 'http://localhost:3000';
const DEFAULT_PATHS = ['/en', '/el', '/en/guest?mode=signin', '/en/book', '/en/check-in', '/en/favorites'];
const MIN_SCORE = Number(process.env.LH_MATRIX_MIN_SCORE || 70);
const FAIL_ON_ISSUES = process.env.LH_MATRIX_FAIL_ON_ISSUES === '1';

const ALL_PROFILES: Profile[] = [
  {
    id: 'mobile',
    label: 'Mobile Slow 4G',
    screenEmulation: {
      mobile: true,
      width: 360,
      height: 640,
      deviceScaleFactor: 2.625,
      disabled: false,
    },
    throttling: {
      rttMs: 150,
      throughputKbps: 1638.4,
      cpuSlowdownMultiplier: 4,
      downloadThroughputKbps: 1638.4,
      uploadThroughputKbps: 750,
    },
  },
  {
    id: 'desktop',
    label: 'Desktop Dense 4G',
    // Keep the matrix aligned with Lighthouse's official `--preset=desktop`.
    // Omitting desktop throttling silently inherits the mobile defaults from
    // `lighthouse:default`, which produces misleading desktop scores.
    screenEmulation: { ...screenEmulationMetrics.desktop } as Profile['screenEmulation'],
    throttling: { ...throttling.desktopDense4G },
  },
];

function parsePaths(): string[] {
  const raw = process.env.LH_MATRIX_PATHS;
  if (!raw) return DEFAULT_PATHS;

  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseProfiles(): Profile[] {
  const raw = process.env.LH_MATRIX_PROFILES;
  if (!raw) return ALL_PROFILES;

  const selected = new Set(
    raw
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean),
  );

  const profiles = ALL_PROFILES.filter((profile) => selected.has(profile.id));
  if (profiles.length === 0) {
    throw new Error('LH_MATRIX_PROFILES did not match any known profile (mobile, desktop).');
  }
  return profiles;
}

function toSafeTimestamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

function rankSeverity(severity: Severity): number {
  if (severity === 'critical') return 3;
  if (severity === 'major') return 2;
  if (severity === 'minor') return 1;
  return 0;
}

function escalate(current: Severity, next: Severity): Severity {
  return rankSeverity(next) > rankSeverity(current) ? next : current;
}

function evaluateSeverity(score: number, lcpMs: number | null, cls: number | null, inpMs: number | null): Severity {
  let severity: Severity = 'pass';

  if (score < 90) severity = escalate(severity, 'minor');
  if (score < 70) severity = escalate(severity, 'major');
  if (score < 50) severity = escalate(severity, 'critical');

  if (lcpMs !== null) {
    if (lcpMs > 2500) severity = escalate(severity, 'minor');
    if (lcpMs > 4000) severity = escalate(severity, 'major');
    if (lcpMs > 6000) severity = escalate(severity, 'critical');
  }

  if (cls !== null) {
    if (cls > 0.1) severity = escalate(severity, 'minor');
    if (cls > 0.25) severity = escalate(severity, 'major');
    if (cls > 0.4) severity = escalate(severity, 'critical');
  }

  if (inpMs !== null) {
    if (inpMs > 200) severity = escalate(severity, 'minor');
    if (inpMs > 500) severity = escalate(severity, 'major');
    if (inpMs > 800) severity = escalate(severity, 'critical');
  }

  return severity;
}

function num(value: unknown): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  return value;
}

function auditNumericValue(audits: Record<string, unknown> | undefined, auditId: string): number | null {
  const audit = audits?.[auditId];
  if (!audit || typeof audit !== 'object' || !('numericValue' in audit)) return null;
  return num(audit.numericValue);
}

function formatMs(value: number | null): string {
  if (value === null) return 'n/a';
  return `${Math.round(value)}ms`;
}

function formatCls(value: number | null): string {
  if (value === null) return 'n/a';
  return value.toFixed(3);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((acc, current) => acc + current, 0) / values.length;
}

function compactInlineText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function summarizeCells(cells: MatrixCell[]): MatrixReport['summary'] {
  return {
    totalCells: cells.length,
    pass: cells.filter((cell) => cell.severity === 'pass').length,
    minor: cells.filter((cell) => cell.severity === 'minor').length,
    major: cells.filter((cell) => cell.severity === 'major').length,
    critical: cells.filter((cell) => cell.severity === 'critical').length,
    averageScoreByProfile: {
      mobile: average(
        cells
          .filter((cell) => cell.profile === 'mobile')
          .map((cell) => cell.performanceScore)
          .filter((score): score is number => score !== null),
      ),
      desktop: average(
        cells
          .filter((cell) => cell.profile === 'desktop')
          .map((cell) => cell.performanceScore)
          .filter((score): score is number => score !== null),
      ),
    },
  };
}

function buildReport(profiles: Profile[], routes: string[], cells: MatrixCell[]): MatrixReport {
  return {
    generatedAt: new Date().toISOString(),
    baseUrl: DEFAULT_BASE_URL,
    profiles: profiles.map((profile) => profile.id),
    routes,
    minimumScore: MIN_SCORE,
    summary: summarizeCells(cells),
    cells,
  };
}

async function writeReportArtifacts(outputDir: string, report: MatrixReport) {
  const ts = toSafeTimestamp();
  const jsonPath = path.join(outputDir, `lighthouse-matrix-${ts}.json`);
  const mdPath = path.join(outputDir, `lighthouse-matrix-${ts}.md`);

  await writeFile(jsonPath, JSON.stringify(report, null, 2), 'utf8');
  await writeFile(mdPath, buildMarkdown(report), 'utf8');

  return { jsonPath, mdPath };
}

function buildMarkdown(report: MatrixReport): string {
  const lines: string[] = [];
  lines.push('# Lighthouse Matrix Report');
  lines.push('');
  lines.push(`Generated at: ${report.generatedAt}`);
  lines.push(`Base URL: ${report.baseUrl}`);
  lines.push(`Minimum score threshold: ${report.minimumScore}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Total cells: ${report.summary.totalCells}`);
  lines.push(`- Pass: ${report.summary.pass}`);
  lines.push(`- Minor: ${report.summary.minor}`);
  lines.push(`- Major: ${report.summary.major}`);
  lines.push(`- Critical: ${report.summary.critical}`);
  lines.push(`- Average mobile score: ${Math.round(report.summary.averageScoreByProfile.mobile)}`);
  lines.push(`- Average desktop score: ${Math.round(report.summary.averageScoreByProfile.desktop)}`);
  lines.push('');
  lines.push('## Matrix');
  lines.push('');
  lines.push('| Route | Profile | Score | LCP | CLS | INP | TBT | TTFB | FCP | Severity |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');

  for (const cell of report.cells) {
    const scoreDisplay = cell.performanceScore === null ? 'n/a' : `${cell.performanceScore}`;
    lines.push(
      `| ${cell.route} | ${cell.profile} | ${scoreDisplay} | ${formatMs(cell.lcpMs)} | ${formatCls(cell.cls)} | ${formatMs(cell.inpMs)} | ${formatMs(cell.tbtMs)} | ${formatMs(cell.ttfbMs)} | ${formatMs(cell.fcpMs)} | ${cell.severity.toUpperCase()} |`,
    );
  }

  const failedCells = report.cells.filter((cell) => Boolean(cell.error));
  if (failedCells.length > 0) {
    lines.push('');
    lines.push('## Execution Errors');
    lines.push('');
    for (const cell of failedCells) {
      lines.push(`- ${cell.profile} | ${cell.route}: ${compactInlineText(cell.error ?? '')}`);
    }
  }

  lines.push('');
  return lines.join('\n');
}

async function discoverChromePath(): Promise<string | undefined> {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;

  try {
    const puppeteer = await import('puppeteer');
    return await puppeteer.executablePath();
  } catch {
    return undefined;
  }
}

async function run() {
  const started = Date.now();
  const routes = parsePaths();
  const profiles = parseProfiles();
  const chromePath = await discoverChromePath();

  const outputDir = path.join(process.cwd(), 'reports', 'lighthouse-matrix');
  await mkdir(outputDir, { recursive: true });

  console.log(`[lh-matrix] base URL: ${DEFAULT_BASE_URL}`);
  console.log(`[lh-matrix] routes: ${routes.length}, profiles: ${profiles.map((profile) => profile.id).join(',')}`);
  if (chromePath) {
    console.log(`[lh-matrix] using chrome path: ${chromePath}`);
  }

  const cells: MatrixCell[] = [];

  let chrome;
  try {
    chrome = await launch({
      chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'],
      chromePath,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[lh-matrix] Unable to launch Chromium for Lighthouse matrix execution.');
    console.error('[lh-matrix] On Linux, install browser runtime dependencies (for example libasound2) or set CHROME_PATH to a working Chrome/Chromium binary.');
    console.error(`[lh-matrix] Launch error: ${message}`);

    for (const profile of profiles) {
      for (const route of routes) {
        const url = new URL(route, DEFAULT_BASE_URL).toString();
        cells.push({
          profile: profile.id,
          route,
          url,
          performanceScore: null,
          lcpMs: null,
          cls: null,
          inpMs: null,
          tbtMs: null,
          ttfbMs: null,
          fcpMs: null,
          severity: 'critical',
          durationMs: 0,
          error: `Chrome launch failed: ${message}`,
        });
      }
    }

    const failureReport = buildReport(profiles, routes, cells);
    const failureArtifacts = await writeReportArtifacts(outputDir, failureReport);
    console.log(`[lh-matrix] JSON report: ${path.relative(process.cwd(), failureArtifacts.jsonPath)}`);
    console.log(`[lh-matrix] Markdown report: ${path.relative(process.cwd(), failureArtifacts.mdPath)}`);
    console.log('[lh-matrix] Completed with launch failure artifacts.');
    process.exitCode = 1;
    return;
  }

  try {
    for (const profile of profiles) {
      for (const route of routes) {
        const url = new URL(route, DEFAULT_BASE_URL).toString();
        const routeStarted = Date.now();

        const config = {
          extends: 'lighthouse:default',
          settings: {
            formFactor: profile.id,
            screenEmulation: profile.screenEmulation,
            emulatedUserAgent: true,
            throttlingMethod: 'simulate' as const,
            throttling: profile.throttling,
            onlyCategories: ['performance'],
          },
        };

        try {
          const result = await lighthouse(
            url,
            {
              port: chrome.port,
              output: ['json'],
              logLevel: 'error',
            },
            config,
          );
          if (!result) throw new Error('Lighthouse returned no result');

          const lhr = result.lhr;
          const score = Math.round((lhr.categories?.performance?.score ?? 0) * 100);

          const lcpMs = auditNumericValue(lhr.audits, 'largest-contentful-paint');
          const cls = auditNumericValue(lhr.audits, 'cumulative-layout-shift');
          const inpMs = auditNumericValue(lhr.audits, 'interaction-to-next-paint')
            ?? auditNumericValue(lhr.audits, 'experimental-interaction-to-next-paint');
          const tbtMs = auditNumericValue(lhr.audits, 'total-blocking-time');
          const ttfbMs = auditNumericValue(lhr.audits, 'server-response-time');
          const fcpMs = auditNumericValue(lhr.audits, 'first-contentful-paint');

          const severity = evaluateSeverity(score, lcpMs, cls, inpMs);

          const cell: MatrixCell = {
            profile: profile.id,
            route,
            url,
            performanceScore: score,
            lcpMs,
            cls,
            inpMs,
            tbtMs,
            ttfbMs,
            fcpMs,
            severity,
            durationMs: Date.now() - routeStarted,
          };

          cells.push(cell);

          console.log(
            `[lh-matrix] ${profile.id} | ${route} => score ${score} | severity ${severity.toUpperCase()} | duration ${cell.durationMs}ms`,
          );
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          const isConnectionError = /ECONNREFUSED|ECONNRESET|EPIPE/i.test(message);
          const hint = isConnectionError
            ? ' (Chrome likely exited unexpectedly; verify CHROME_PATH and Linux browser runtime libraries, for example libasound2.)'
            : '';

          const cell: MatrixCell = {
            profile: profile.id,
            route,
            url,
            performanceScore: null,
            lcpMs: null,
            cls: null,
            inpMs: null,
            tbtMs: null,
            ttfbMs: null,
            fcpMs: null,
            severity: 'critical',
            durationMs: Date.now() - routeStarted,
            error: `${message}${hint}`,
          };

          cells.push(cell);
          console.error(
            `[lh-matrix] ${profile.id} | ${route} => CRITICAL | execution failed: ${cell.error}`,
          );
        }
      }
    }
  } finally {
    await chrome.kill();
  }

  const report = buildReport(profiles, routes, cells);
  const artifacts = await writeReportArtifacts(outputDir, report);

  console.log(`[lh-matrix] JSON report: ${path.relative(process.cwd(), artifacts.jsonPath)}`);
  console.log(`[lh-matrix] Markdown report: ${path.relative(process.cwd(), artifacts.mdPath)}`);
  console.log(`[lh-matrix] Completed in ${Date.now() - started}ms`);

  const minScoreBreaches = cells.filter(
    (cell) => cell.performanceScore !== null && cell.performanceScore < MIN_SCORE,
  );
  if (
    FAIL_ON_ISSUES &&
    (report.summary.major > 0 || report.summary.critical > 0 || minScoreBreaches.length > 0)
  ) {
    console.error(
      `[lh-matrix] Failing due to major/critical findings or score below threshold (${MIN_SCORE}). Breaches: ${minScoreBreaches.length}.`,
    );
    process.exitCode = 1;
  }
}

run().catch((error) => {
  console.error('[lh-matrix] Fatal error:', error);
  process.exitCode = 1;
});
