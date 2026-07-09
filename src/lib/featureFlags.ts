import fs from 'node:fs';
import path from 'node:path';
import { encryptJSON, decryptJSON } from '@/lib/crypto';

export type FeatureFlags = {
  portalEnabled: boolean;
  checkinEnabled: boolean;
};

const DEFAULT_FLAGS: FeatureFlags = {
  portalEnabled: true,
  checkinEnabled: true,
};

const FILE = path.join(process.cwd(), 'data', 'secure', 'feature-flags.enc.json');

function readFlags(): FeatureFlags {
  try {
    if (!fs.existsSync(FILE)) return { ...DEFAULT_FLAGS };
    const raw = fs.readFileSync(FILE, 'utf-8');
    const obj = decryptJSON<Partial<FeatureFlags>>(raw);
    return { ...DEFAULT_FLAGS, ...obj } as FeatureFlags;
  } catch {
    return { ...DEFAULT_FLAGS };
  }
}

function writeFlags(flags: FeatureFlags): void {
  const enc = encryptJSON(flags);
  const temporaryFile = `${FILE}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryFile, enc, { encoding: 'utf-8', mode: 0o600 });
    fs.renameSync(temporaryFile, FILE);
  } catch (error) {
    try { fs.unlinkSync(temporaryFile); } catch {}
    throw error;
  }
}

let cache: FeatureFlags | null = null;
let cacheMtimeMs = -1;

function flagsMtimeMs(): number {
  try {
    return fs.statSync(FILE).mtimeMs;
  } catch {
    return 0;
  }
}

export function getFeatureFlags(): FeatureFlags {
  const currentMtimeMs = flagsMtimeMs();
  if (!cache || currentMtimeMs !== cacheMtimeMs) {
    cache = readFlags();
    cacheMtimeMs = currentMtimeMs;
  }
  return { ...cache };
}

export function setFeatureFlags(partial: Partial<FeatureFlags>): FeatureFlags {
  const merged = { ...getFeatureFlags(), ...partial } as FeatureFlags;
  writeFlags(merged);
  cache = merged;
  cacheMtimeMs = flagsMtimeMs();
  return { ...merged };
}

export function resetFeatureFlags(): void {
  const defaults = { ...DEFAULT_FLAGS };
  writeFlags(defaults);
  cache = defaults;
  cacheMtimeMs = flagsMtimeMs();
}
