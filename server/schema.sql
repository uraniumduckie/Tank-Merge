CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE,
  password_hash TEXT,
  is_guest INTEGER NOT NULL DEFAULT 1,
  is_admin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login TEXT NOT NULL DEFAULT (datetime('now')),
  ip_address TEXT DEFAULT '',
  country TEXT DEFAULT '',
  city TEXT DEFAULT '',
  latitude REAL DEFAULT 0,
  longitude REAL DEFAULT 0,
  user_agent TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS game_progress (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  spawn_count INTEGER NOT NULL DEFAULT 0,
  admin_mode INTEGER NOT NULL DEFAULT 0,
  unlocked_tanks TEXT NOT NULL DEFAULT '[]',
  tank_state TEXT NOT NULL DEFAULT '[]',
  total_merges INTEGER NOT NULL DEFAULT 0,
  total_kills INTEGER NOT NULL DEFAULT 0,
  highest_tier INTEGER NOT NULL DEFAULT 1,
  total_play_time INTEGER NOT NULL DEFAULT 0,
  session_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id),
  event_type TEXT NOT NULL,
  details TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_events_user ON game_events(user_id);
CREATE INDEX IF NOT EXISTS idx_events_type ON game_events(event_type);
CREATE INDEX IF NOT EXISTS idx_events_created ON game_events(created_at);

CREATE TABLE IF NOT EXISTS maps (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  base_image TEXT NOT NULL DEFAULT 'map_base.png',
  layout_image TEXT NOT NULL DEFAULT 'map_layout.png',
  spawns TEXT NOT NULL DEFAULT '{"germany":{"x":104.5,"y":204.5},"ussr":{"x":571.5,"y":829.5},"usa":{"x":1055.5,"y":338.5}}',
  world_scale REAL NOT NULL DEFAULT 2.5,
  active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_maps_active ON maps(active);
