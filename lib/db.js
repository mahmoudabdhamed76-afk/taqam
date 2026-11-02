'use strict';
/* طاقم · قاعدة البيانات — SQLite مدمجة في Node 22 (node:sqlite) من غير أي مكتبات */
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || (fs.existsSync('/data') ? '/data' : path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'taqam.db');
const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 4000;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'manager', created_at TEXT, last_login_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, kind TEXT NOT NULL, ref_id TEXT NOT NULL, created_at TEXT, last_seen INTEGER, ua TEXT);
CREATE TABLE IF NOT EXISTS settings (k TEXT PRIMARY KEY, v TEXT);
CREATE TABLE IF NOT EXISTS sites (id TEXT PRIMARY KEY, name TEXT NOT NULL, lat REAL, lng REAL, radius INTEGER NOT NULL DEFAULT 250);

CREATE TABLE IF NOT EXISTS employees (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, job TEXT, phone TEXT, photo TEXT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE, pass TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1, track INTEGER NOT NULL DEFAULT 1,
  shift_start TEXT, shift_end TEXT, rest_days TEXT, site_id TEXT, salary REAL NOT NULL DEFAULT 0, hue INTEGER,
  created_at TEXT, last_login_at TEXT, last_lat REAL, last_lng REAL, last_acc REAL, last_at TEXT, last_battery INTEGER
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, date TEXT NOT NULL,
  in_at TEXT NOT NULL, in_lat REAL, in_lng REAL, in_dist INTEGER, in_site TEXT, late_min INTEGER NOT NULL DEFAULT 0,
  out_at TEXT, out_lat REAL, out_lng REAL, out_dist INTEGER, ot_min INTEGER NOT NULL DEFAULT 0,
  source TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS ix_att ON attendance (emp_id, date);
CREATE INDEX IF NOT EXISTS ix_att_d ON attendance (date);
CREATE TABLE IF NOT EXISTS locations (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, at TEXT NOT NULL,
  lat REAL NOT NULL, lng REAL NOT NULL, acc REAL, battery INTEGER, kind TEXT
);
CREATE INDEX IF NOT EXISTS ix_loc ON locations (emp_id, at);

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, grp TEXT, contact TEXT, phone TEXT, address TEXT,
  lat REAL, lng REAL, notes TEXT, status TEXT NOT NULL DEFAULT 'active',
  portal_code TEXT UNIQUE, portal_on INTEGER NOT NULL DEFAULT 0, portal_seen TEXT,
  next_follow TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL, date TEXT NOT NULL, kind TEXT NOT NULL,
  amount REAL NOT NULL, ref TEXT, note TEXT, created_at TEXT, created_by TEXT
);
CREATE INDEX IF NOT EXISTS ix_ledger ON ledger (client_id, date);
CREATE TABLE IF NOT EXISTS followups (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL, at TEXT NOT NULL, kind TEXT NOT NULL,
  note TEXT, by_name TEXT, next_date TEXT, outcome TEXT
);
CREATE INDEX IF NOT EXISTS ix_fu ON followups (client_id, at);

CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, client_id TEXT, client_name TEXT, date TEXT NOT NULL,
  start_at TEXT NOT NULL, end_at TEXT, lat REAL, lng REAL, dist INTEGER, purpose TEXT, note TEXT, handed_to TEXT
);
CREATE INDEX IF NOT EXISTS ix_visit ON visits (emp_id, date);
CREATE INDEX IF NOT EXISTS ix_visit_c ON visits (client_id, date);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, client_id TEXT, client_name TEXT, title TEXT, note TEXT,
  status TEXT NOT NULL DEFAULT 'new', request_id INTEGER, created_at TEXT, created_by TEXT,
  started_at TEXT, arrived_at TEXT, done_at TEXT, d0 INTEGER, dist INTEGER,
  last_lat REAL, last_lng REAL, last_at TEXT, done_note TEXT, photo_id INTEGER, seen_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_task ON tasks (emp_id, status);

CREATE TABLE IF NOT EXISTS requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT, client_id TEXT NOT NULL, kind TEXT NOT NULL, items TEXT, device TEXT,
  note TEXT, contact TEXT, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL, seen_at TEXT, done_at TEXT,
  reply TEXT, rating INTEGER, rate_note TEXT, task_id INTEGER, photo_id INTEGER
);
CREATE INDEX IF NOT EXISTS ix_req ON requests (status, id);
CREATE INDEX IF NOT EXISTS ix_req_c ON requests (client_id, id);

CREATE TABLE IF NOT EXISTS photos (id INTEGER PRIMARY KEY AUTOINCREMENT, mime TEXT, data BLOB NOT NULL, created_at TEXT);

CREATE TABLE IF NOT EXISTS faults (
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT, title TEXT NOT NULL, solution TEXT NOT NULL, client_id TEXT, client_name TEXT,
  emp_id TEXT, emp_name TEXT, at TEXT NOT NULL, votes INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS fault_votes (fault_id INTEGER NOT NULL, voter TEXT NOT NULL, PRIMARY KEY (fault_id, voter));

CREATE TABLE IF NOT EXISTS rewards (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, month TEXT NOT NULL, amount REAL NOT NULL, reason TEXT, created_at TEXT, seen INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS loans (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, total REAL NOT NULL, n INTEGER NOT NULL, start_month TEXT NOT NULL, note TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT);
CREATE TABLE IF NOT EXISTS adjustments (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, month TEXT NOT NULL, kind TEXT NOT NULL, amount REAL NOT NULL, note TEXT, created_at TEXT);
CREATE INDEX IF NOT EXISTS ix_adj ON adjustments (month, emp_id);

CREATE TABLE IF NOT EXISTS messages (id INTEGER PRIMARY KEY AUTOINCREMENT, emp_id TEXT NOT NULL, side TEXT NOT NULL, body TEXT NOT NULL, at TEXT NOT NULL, by_name TEXT, read_at TEXT);
CREATE INDEX IF NOT EXISTS ix_msg ON messages (emp_id, id);

CREATE TABLE IF NOT EXISTS log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, who TEXT, action TEXT, detail TEXT);
`);

try { const tc = db.prepare('PRAGMA table_info(tasks)').all().map(c => c.name); if (!tc.includes('accepted_at')) db.exec('ALTER TABLE tasks ADD COLUMN accepted_at TEXT'); if (!tc.includes('self')) db.exec('ALTER TABLE tasks ADD COLUMN self INTEGER NOT NULL DEFAULT 0'); } catch (e) { console.error('[db] tasks', e.message); }

db.exec(`
CREATE TABLE IF NOT EXISTS pacs_studies (
  uid TEXT PRIMARY KEY, patient_name TEXT, patient_id TEXT, birth TEXT, sex TEXT, age TEXT,
  study_date TEXT, study_time TEXT, modality TEXT, description TEXT, accession TEXT, referring TEXT, institution TEXT, body_part TEXT,
  source_ae TEXT, source_ip TEXT, n_series INTEGER NOT NULL DEFAULT 0, n_inst INTEGER NOT NULL DEFAULT 0, bytes INTEGER NOT NULL DEFAULT 0,
  received_at TEXT, updated_at TEXT, seen INTEGER NOT NULL DEFAULT 0, note TEXT, client_id TEXT
);
CREATE INDEX IF NOT EXISTS ix_ps_upd ON pacs_studies (updated_at);
CREATE TABLE IF NOT EXISTS pacs_instances (
  sop_uid TEXT PRIMARY KEY, study_uid TEXT NOT NULL, series_uid TEXT, series_no INTEGER, series_desc TEXT, inst_no INTEGER,
  modality TEXT, sop_class TEXT, ts TEXT, path TEXT NOT NULL, bytes INTEGER, received_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_pi_study ON pacs_instances (study_uid, series_no, inst_no);
CREATE TABLE IF NOT EXISTS pacs_nodes (id TEXT PRIMARY KEY, name TEXT NOT NULL, ae TEXT NOT NULL, host TEXT NOT NULL, port INTEGER NOT NULL, parallel INTEGER NOT NULL DEFAULT 1, auto INTEGER NOT NULL DEFAULT 0, created_at TEXT, last_ok TEXT);
CREATE TABLE IF NOT EXISTS pacs_log (id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, dir TEXT, ae TEXT, ip TEXT, study_uid TEXT, n INTEGER, ok INTEGER, ms INTEGER, note TEXT);
`);
try { const uc = db.prepare('PRAGMA table_info(users)').all().map(c => c.name); if (!uc.includes('perms')) db.exec('ALTER TABLE users ADD COLUMN perms TEXT'); } catch (e) { console.error('[db] users', e.message); }
module.exports = { db, DATA_DIR, DB_FILE };
