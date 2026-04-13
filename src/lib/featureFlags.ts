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
  fs.writeFileSync(FILE, enc, 'utf-8');
}

let cache: FeatureFlags | null = null;

export function getFeatureFlags(): FeatureFlags {
  if (!cache) cache = readFlags();
  return cache;
}

export function setFeatureFlags(partial: Partial<FeatureFlags>): FeatureFlags {
  const merged = { ...getFeatureFlags(), ...partial } as FeatureFlags;
  cache = merged;
  writeFlags(merged);
  return merged;
}

export function resetFeatureFlags(): void {
  cache = { ...DEFAULT_FLAGS };
  writeFlags(cache);
}
