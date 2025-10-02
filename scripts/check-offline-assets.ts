import http from 'node:http';
import { URL } from 'node:url';

const PROVIDED = process.env.OFFLINE_CHECK_HOST;
const DEFAULT_HOSTS = ['http://localhost:3000', 'http://127.0.0.1:3000', 'http://169.254.83.107:3000'];
const CANDIDATE_HOSTS = PROVIDED ? [PROVIDED, ...DEFAULT_HOSTS] : DEFAULT_HOSTS;
const PATHS = ['/sw.js', '/precache.json', '/critical-precache.json', '/version.json', '/manifest.webmanifest'];

async function tryHost(host: string, path: string): Promise<number> {
  return new Promise((resolve) => {
    const url = new URL(path, host).toString();
    http.get(url, (res) => {
      res.on('data', () => {});
      res.on('end', () => resolve(res.statusCode || 0));
    }).on('error', () => resolve(0));
  });
}

async function checkPath(path: string): Promise<{ path: string; status: number }>{
  // Try all candidate hosts and return the first successful 2xx/3xx response, otherwise the last non-zero status
  let lastNonZero = 0;
  for (const h of CANDIDATE_HOSTS) {
    const s = await tryHost(h, path);
    if (s >= 200 && s < 400) return { path, status: s };
    if (s && s > 0) lastNonZero = s;
  }
  return { path, status: lastNonZero || 0 };
}

async function main(){
  console.log(`Checking offline assets (hosts: ${CANDIDATE_HOSTS.join(', ')})`);
  const results = await Promise.all(PATHS.map(p => checkPath(p)));
  let ok = true;
  for (const r of results) {
    if (r.status >= 200 && r.status < 400) {
      console.log(`[OK] ${r.path} -> ${r.status}`);
    } else {
      console.error(`[FAIL] ${r.path} -> ${r.status}`);
      ok = false;
    }
  }
  process.exit(ok ? 0 : 2);
}

main();
