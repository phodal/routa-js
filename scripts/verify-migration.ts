import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import path from 'path';

const root = process.cwd();
const db = new Database(':memory:');

db.exec(`
  CREATE TABLE workspaces (id TEXT PRIMARY KEY, title TEXT NOT NULL, repo_path TEXT, branch TEXT, status TEXT NOT NULL DEFAULT 'active', metadata TEXT DEFAULT '{}', created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE skills (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', source TEXT NOT NULL, catalog_type TEXT NOT NULL DEFAULT 'skillssh', files TEXT NOT NULL DEFAULT '[]', license TEXT, metadata TEXT DEFAULT '{}', installs INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL DEFAULT 0, updated_at INTEGER NOT NULL DEFAULT 0);
`);
console.log('[0000] base tables OK');

const sql0001 = readFileSync(path.join(root, 'drizzle-sqlite/0001_workspace_centric.sql'), 'utf8');
db.exec(sql0001);
console.log('[0001] workspace-centric migration OK');

const sql0002 = readFileSync(path.join(root, 'drizzle-sqlite/0002_codebase_source_fields.sql'), 'utf8');
db.exec(sql0002);
console.log('[0002] source fields migration OK');

const cols = db.pragma('table_info(codebases)') as Array<{ name: string }>;
const names = cols.map(c => c.name);
console.log('codebases columns:', names.join(', '));

if (!names.includes('source_type')) { console.error('FAIL: source_type missing'); process.exit(1); }
if (!names.includes('source_url'))  { console.error('FAIL: source_url missing');  process.exit(1); }

db.prepare('SELECT id, source_type, source_url FROM codebases WHERE workspace_id = ?').all('x');
console.log('SELECT source_type/source_url: OK');
console.log('\nALL CHECKS PASSED ✓');
