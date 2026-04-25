#!/usr/bin/env tsx
/**
 * Checks whether a usable Chrome/Chromium runtime is available for audit scripts.
 *
 * Usage:
 * - npm run check:browser-runtime
 */

import fs from 'node:fs';
import { spawnSync } from 'node:child_process';

type Candidate = {
  label: string;
  command: string;
  absolutePath?: string;
};

function run(command: string, args: string[]) {
  return spawnSync(command, args, { encoding: 'utf8' });
}

function commandPath(command: string): string | null {
  const result = run('bash', ['-lc', `command -v ${command}`]);
  if (result.status !== 0) return null;
  const out = (result.stdout || '').trim();
  return out || null;
}

function candidateFromCommand(command: string): Candidate | null {
  const absolutePath = commandPath(command);
  if (!absolutePath) return null;
  return { label: command, command: absolutePath, absolutePath };
}

async function getPuppeteerPath(): Promise<Candidate | null> {
  try {
    const puppeteer = await import('puppeteer');
    const executablePath = await puppeteer.executablePath();
    if (!executablePath || !fs.existsSync(executablePath)) return null;
    return {
      label: 'puppeteer-executable',
      command: executablePath,
      absolutePath: executablePath,
    };
  } catch {
    return null;
  }
}

function probeCandidate(candidate: Candidate) {
  const result = run(candidate.command, ['--version']);
  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  const failedToLaunch = result.status !== 0;
  const missingSharedLib = /error while loading shared libraries/i.test(stderr);

  return {
    ...candidate,
    exitCode: result.status,
    stdout,
    stderr,
    healthy: !failedToLaunch,
    missingSharedLib,
  };
}

function printSection(title: string) {
  console.log(`\n== ${title} ==`);
}

async function main() {
  console.log('Browser runtime preflight for Lighthouse and responsive UX audits');

  const envCandidates: Candidate[] = [];
  const responsivePath = process.env.RESPONSIVE_CHROME_PATH;
  const chromePath = process.env.CHROME_PATH;

  if (responsivePath) {
    envCandidates.push({
      label: 'RESPONSIVE_CHROME_PATH',
      command: responsivePath,
      absolutePath: responsivePath,
    });
  }

  if (chromePath) {
    envCandidates.push({
      label: 'CHROME_PATH',
      command: chromePath,
      absolutePath: chromePath,
    });
  }

  const commandCandidates = [
    candidateFromCommand('google-chrome'),
    candidateFromCommand('google-chrome-stable'),
    candidateFromCommand('chromium'),
    candidateFromCommand('chromium-browser'),
  ].filter((candidate): candidate is Candidate => Boolean(candidate));

  const puppeteerCandidate = await getPuppeteerPath();
  const candidates = [
    ...envCandidates,
    ...commandCandidates,
    ...(puppeteerCandidate ? [puppeteerCandidate] : []),
  ];

  if (candidates.length === 0) {
    printSection('No Browser Candidate Found');
    console.log('No Chrome/Chromium executable was discovered.');
    console.log('Install Chrome/Chromium or set CHROME_PATH / RESPONSIVE_CHROME_PATH.');
    process.exitCode = 1;
    return;
  }

  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    const key = candidate.command;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const probes = uniqueCandidates.map(probeCandidate);

  printSection('Probe Results');
  for (const probe of probes) {
    console.log(`- ${probe.label}: ${probe.command}`);
    if (probe.healthy) {
      console.log(`  status: OK`);
      console.log(`  version: ${probe.stdout || 'n/a'}`);
    } else {
      console.log(`  status: FAIL (exit ${probe.exitCode ?? 'unknown'})`);
      if (probe.stderr) console.log(`  stderr: ${probe.stderr}`);
      if (probe.stdout) console.log(`  stdout: ${probe.stdout}`);
      if (probe.missingSharedLib) {
        console.log('  hint: missing shared library detected; install Linux browser runtime packages (for example libasound2/libasound2t64).');
      }
    }
  }

  const working = probes.find((probe) => probe.healthy);
  if (working) {
    printSection('Recommended Environment Variable');
    console.log(`Use this before running audits:`);
    console.log(`export CHROME_PATH="${working.command}"`);
    console.log('or');
    console.log(`export RESPONSIVE_CHROME_PATH="${working.command}"`);
    process.exitCode = 0;
    return;
  }

  printSection('No Usable Browser Runtime');
  console.log('No candidate could be launched successfully.');
  console.log('Install browser runtime packages, then re-run: npm run check:browser-runtime');
  process.exitCode = 1;
}

main().catch((error) => {
  console.error('Browser runtime preflight failed:', error);
  process.exitCode = 1;
});
