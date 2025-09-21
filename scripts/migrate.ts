/* Minimal sql.js migration runner: apply/rollback migrations in ./migrations */
import fs from 'node:fs';
import path from 'node:path';
import initSqlJs from 'sql.js';

const MIGRATIONS_DIR = path.join(process.cwd(), 'migrations');
const DB_FILE = path.join(process.cwd(), '.localdb.sqlite');

type Direction = 'up' | 'down';

async function loadDB() {
  const SQL = await initSqlJs({});
  let db;
  if (fs.existsSync(DB_FILE)) {
    const buf = fs.readFileSync(DB_FILE);
    db = new SQL.Database(new Uint8Array(buf));
  } else {
    db = new SQL.Database();
  }
  // Enforce foreign keys on this connection
  db.run('PRAGMA foreign_keys = ON;');
  db.run('CREATE TABLE IF NOT EXISTS _migrations (id TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);');
  return { SQL, db };
}

function persist(db: any) {
  const data = db.export();
  const buf = Buffer.from(data);
  fs.writeFileSync(DB_FILE, buf);
}

function listMigrations(dir: string) {
  const files = fs.readdirSync(dir).filter(f => /\d+_.*_(up|down)\.sql$/.test(f)).sort();
  const byId = new Map<string, { up?: string; down?: string }>();
  for (const f of files) {
    const id = f.split('_')[0];
    const isUp = f.endsWith('_up.sql');
    const rec = byId.get(id) || {};
    if (isUp) rec.up = path.join(dir, f); else rec.down = path.join(dir, f);
    byId.set(id, rec);
  }
  return [...byId.entries()].map(([id, files]) => ({ id, ...files }));
}

function getApplied(db: any): Set<string> {
  const res = db.exec('SELECT id FROM _migrations ORDER BY id');
  const out = new Set<string>();
  if (res && res[0]) {
    for (const row of res[0].values) out.add(String(row[0]));
  }
  return out;
}

function runSQL(db: any, sql: string) {
  // Split on ; while keeping statements simple; ignore empty
  const parts = sql
    .split(/;\s*(\n|$)/)
    .map(s => s.trim())
    .filter(Boolean);
  db.run('BEGIN;');
  try {
    for (const stmt of parts) {
      if (!stmt) continue;
      db.run(stmt + ';');
    }
    db.run('COMMIT;');
  } catch (e) {
    db.run('ROLLBACK;');
    throw e;
  }
}

async function migrate(direction: Direction) {
  const { db } = await loadDB();
  const migrations = listMigrations(MIGRATIONS_DIR);
  const applied = getApplied(db);

  if (direction === 'up') {
    for (const m of migrations) {
      if (!m.up) continue;
      if (applied.has(m.id)) continue;
      const sql = fs.readFileSync(m.up, 'utf-8');
      runSQL(db, sql);
      db.run('INSERT INTO _migrations (id, applied_at) VALUES (?, ?);', [m.id, Date.now()]);
    }
  } else {
    // Rollback last applied migration only (single step)
    const ids = [...applied];
    if (ids.length === 0) return;
    const last = ids.sort().pop()!;
    const m = migrations.find(mm => mm.id === last);
    if (m?.down) {
      const sql = fs.readFileSync(m.down, 'utf-8');
      runSQL(db, sql);
      db.run('DELETE FROM _migrations WHERE id = ?;', [last]);
    }
  }

  persist(db);
}

async function main() {
  const dir = (process.argv[2] as Direction) || 'up';
  if (dir !== 'up' && dir !== 'down') throw new Error('Usage: tsx scripts/migrate.ts [up|down]');
  await migrate(dir);
  console.log(`Migrations ${dir} completed.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
