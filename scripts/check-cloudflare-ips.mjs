#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ingressRoot = path.join(root, 'deploy/nginx');
const manifestPath = path.join(ingressRoot, 'cloudflare-ips.json');
const currentMode = process.argv.includes('--current');

function digest(values) {
  return createHash('sha256').update(`${values.join('\n')}\n`).digest('hex');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function validateRanges(values, version, label) {
  assert(Array.isArray(values) && values.length > 0, `${label} must be a non-empty array`);
  assert(new Set(values).size === values.length, `${label} contains duplicate ranges`);
  assert(JSON.stringify(values) === JSON.stringify([...values].sort()), `${label} must be sorted`);
  for (const range of values) {
    assert(typeof range === 'string' && range === range.trim(), `${label} contains an invalid value`);
    const parts = range.split('/');
    assert(parts.length === 2 && isIP(parts[0]) === version, `${label} contains an invalid address`);
    const prefix = Number(parts[1]);
    assert(Number.isInteger(prefix) && prefix >= 0 && prefix <= (version === 4 ? 32 : 128), `${label} contains an invalid prefix`);
  }
}

function expectedRealIp(ranges) {
  return [
    '# Generated from ../cloudflare-ips.json. Do not edit by hand.',
    ...ranges.map((range) => `set_real_ip_from ${range};`),
    '',
  ].join('\n');
}

function expectedGeo(ranges) {
  return [
    '# Generated from ../cloudflare-ips.json. Do not edit by hand.',
    ...ranges.map((range) => `${range} 1;`),
    '',
  ].join('\n');
}

async function fetchRanges(url) {
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
  assert(response.ok, `official source returned HTTP ${response.status}`);
  return (await response.text()).trim().split(/\s+/u).sort();
}

const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
assert(manifest.version === 1, 'Cloudflare manifest version must be 1');
assert(manifest.sources?.ipv4 === 'https://www.cloudflare.com/ips-v4', 'unexpected IPv4 source');
assert(manifest.sources?.ipv6 === 'https://www.cloudflare.com/ips-v6', 'unexpected IPv6 source');
validateRanges(manifest.ipv4, 4, 'ipv4');
validateRanges(manifest.ipv6, 6, 'ipv6');

const ranges = [...manifest.ipv4, ...manifest.ipv6];
assert(manifest.sha256?.ipv4 === digest(manifest.ipv4), 'IPv4 manifest hash mismatch');
assert(manifest.sha256?.ipv6 === digest(manifest.ipv6), 'IPv6 manifest hash mismatch');
assert(manifest.sha256?.combined === digest(ranges), 'combined manifest hash mismatch');

const realIp = await readFile(path.join(ingressRoot, 'includes/cloudflare-realip.conf'), 'utf8');
const geo = await readFile(path.join(ingressRoot, 'includes/cloudflare-geo.conf'), 'utf8');
assert(realIp === expectedRealIp(ranges), 'cloudflare-realip.conf does not match the manifest');
assert(geo === expectedGeo(ranges), 'cloudflare-geo.conf does not match the manifest');

if (currentMode) {
  const [currentV4, currentV6] = await Promise.all([
    fetchRanges(manifest.sources.ipv4),
    fetchRanges(manifest.sources.ipv6),
  ]);
  assert(JSON.stringify(currentV4) === JSON.stringify(manifest.ipv4), 'checked-in IPv4 ranges differ from Cloudflare');
  assert(JSON.stringify(currentV6) === JSON.stringify(manifest.ipv6), 'checked-in IPv6 ranges differ from Cloudflare');
}

console.log(currentMode
  ? 'Cloudflare ingress ranges match the checked-in manifest and official sources.'
  : 'Cloudflare ingress manifest and generated includes are internally consistent (offline).');
