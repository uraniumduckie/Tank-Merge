const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'data.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let sqlModule;
let db;
let saveTimer;

class Statement {
  constructor(stmt) {
    this.stmt = stmt;
  }

  get(...params) {
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    if (this.stmt.step()) {
      const row = this.stmt.getAsObject();
      this.stmt.reset();
      return row;
    }
    this.stmt.reset();
    return undefined;
  }

  all(...params) {
    const rows = [];
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    while (this.stmt.step()) {
      rows.push(this.stmt.getAsObject());
    }
    this.stmt.reset();
    return rows;
  }

  run(...params) {
    if (params.length > 0) {
      this.stmt.bind(params);
    }
    this.stmt.step();
    const info = { changes: db.getRowsModified() };
    this.stmt.reset();
    scheduleSave();
    return info;
  }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      const data = db.export();
      fs.writeFileSync(DB_PATH, Buffer.from(data));
    } catch (err) {
      console.error('DB save error:', err);
    }
  }, 1000);
}

function getDb() {
  if (!sqlModule) {
    throw new Error('Database not initialized. Call initDb() first.');
  }
  if (!db) {
    if (fs.existsSync(DB_PATH)) {
      const fileBuffer = fs.readFileSync(DB_PATH);
      db = new sqlModule.Database(fileBuffer);
    } else {
      db = new sqlModule.Database();
    }
    db.run('PRAGMA journal_mode = MEMORY');
    db.run('PRAGMA foreign_keys = ON');
    migrate();
    migrateExisting();
  }
  return prepareDb(db);
}

function prepareDb(database) {
  return {
    prepare(sql) {
      const stmt = database.prepare(sql);
      return new Statement(stmt);
    },
    exec(sql) {
      database.exec(sql);
    },
    pragma(str) {
      database.run(`PRAGMA ${str}`);
    },
    close() {
      clearTimeout(saveTimer);
      if (database) {
        const data = database.export();
        fs.writeFileSync(DB_PATH, Buffer.from(data));
        database.close();
      }
    },
    getRowsModified() {
      return database.getRowsModified();
    }
  };
}

function migrate() {
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf-8');
  db.exec(schema);
}

function migrateExisting() {
  const userCols = db.exec("PRAGMA table_info('users')");
  const userColNames = userCols[0]?.values.map(r => r[1]) || [];
  const userAdditions = [
    { name: 'ip_address', type: 'TEXT', def: "''" },
    { name: 'country', type: 'TEXT', def: "''" },
    { name: 'city', type: 'TEXT', def: "''" },
    { name: 'latitude', type: 'REAL', def: '0' },
    { name: 'longitude', type: 'REAL', def: '0' },
    { name: 'user_agent', type: 'TEXT', def: "''" },
  ];
  for (const col of userAdditions) {
    if (!userColNames.includes(col.name)) {
      db.run(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type} DEFAULT ${col.def}`);
    }
  }
  const progCols = db.exec("PRAGMA table_info('game_progress')");
  const progColNames = progCols[0]?.values.map(r => r[1]) || [];
  if (!progColNames.includes('session_count')) {
    db.run("ALTER TABLE game_progress ADD COLUMN session_count INTEGER DEFAULT 0");
  }
}

function close() {
  if (db) {
    clearTimeout(saveTimer);
    const data = db.export();
    fs.writeFileSync(DB_PATH, Buffer.from(data));
    db.close();
    db = null;
  }
}

async function initDb() {
  sqlModule = await initSqlJs();
  return getDb();
}

module.exports = { getDb, close, initDb };
