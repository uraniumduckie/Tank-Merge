const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let db;

function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    migrate();
    migrateExisting();
  }
  return db;
}

function migrate() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
}

function migrateExisting() {
  const userCols = db.prepare("PRAGMA table_info('users')").all().map(r => r.name);
  const userAdditions = [
    { name: 'ip_address', type: 'TEXT', def: "''" },
    { name: 'country', type: 'TEXT', def: "''" },
    { name: 'city', type: 'TEXT', def: "''" },
    { name: 'latitude', type: 'REAL', def: '0' },
    { name: 'longitude', type: 'REAL', def: '0' },
    { name: 'user_agent', type: 'TEXT', def: "''" },
  ];
  for (const col of userAdditions) {
    if (!userCols.includes(col.name)) {
      db.prepare(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.def}`).run();
    }
  }
  const progCols = db.prepare("PRAGMA table_info('game_progress')").all().map(r => r.name);
  if (!progCols.includes('session_count')) {
    db.prepare("ALTER TABLE game_progress ADD COLUMN session_count INTEGER DEFAULT 0").run();
  }
}

function close() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = { getDb, close };
