const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const { WebSocketServer } = require('ws');
const { getDb, initDb } = require('./db');
const { generateToken, verifyToken, authMiddleware, adminMiddleware, createGuestUser, registerUser, loginUser, seedAdmin, updateUserGeo } = require('./auth');
const BattleServer = require('./battle');

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT = path.resolve(__dirname, '..');

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(ROOT));

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || '';
}

app.post('/api/auth/guest', async (req, res) => {
  try {
    const ip = getClientIP(req);
    const userAgent = req.headers['user-agent'] || '';
    const user = createGuestUser(ip, userAgent);
    const token = generateToken(user);
    const progress = getDb().prepare('SELECT * FROM game_progress WHERE user_id = ?').get(user.id);
    updateUserGeo(user.id, ip);
    res.json({ user: { id: user.id, username: user.username, is_guest: true, is_admin: false }, token, progress });
  } catch (err) {
    console.error('Guest error:', err);
    res.status(500).json({ error: 'Failed to create guest session' });
  }
});

app.post('/api/auth/register', authMiddleware, (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
    if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username already taken' });
    const user = registerUser(req.user.id, username, password);
    const token = generateToken(user);
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(user.id);
    res.json({ user: { id: user.id, username: user.username, is_guest: false, is_admin: !!user.is_admin }, token, progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) return res.status(400).json({ error: 'Username and password required' });
    const user = loginUser(username, password);
    if (!user) return res.status(401).json({ error: 'Invalid username or password' });
    const ip = getClientIP(req);
    const db = getDb();
    db.prepare('UPDATE users SET ip_address = ?, last_login = datetime(\'now\') WHERE id = ?').run(ip, user.id);
    updateUserGeo(user.id, ip);
    const token = generateToken(user);
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(user.id);
    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
    res.json({ user: { id: updatedUser.id, username: updatedUser.username, is_guest: false, is_admin: !!updatedUser.is_admin }, token, progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  try {
    const user = getDb().prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const progress = getDb().prepare('SELECT * FROM game_progress WHERE user_id = ?').get(user.id);
    res.json({ user: { id: user.id, username: user.username, is_guest: !!user.is_guest, is_admin: !!user.is_admin }, progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user' });
  }
});

app.get('/api/progress', authMiddleware, (req, res) => {
  try {
    const progress = getDb().prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.id);
    if (!progress) return res.status(404).json({ error: 'Progress not found' });
    res.json({ progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
});

app.put('/api/progress', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { spawn_count, admin_mode, unlocked_tanks, tank_state, total_merges, total_kills, highest_tier, total_play_time, session_count } = req.body;
    const current = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.id);
    if (!current) return res.status(404).json({ error: 'Progress not found' });
    db.prepare(`UPDATE game_progress SET
      spawn_count = ?, admin_mode = ?, unlocked_tanks = ?, tank_state = ?,
      total_merges = ?, total_kills = ?, highest_tier = ?,
      total_play_time = ?, session_count = ?, updated_at = datetime('now')
      WHERE user_id = ?`).run(
      spawn_count ?? current.spawn_count,
      admin_mode ?? current.admin_mode,
      unlocked_tanks ?? current.unlocked_tanks,
      tank_state ?? current.tank_state,
      total_merges ?? current.total_merges,
      total_kills ?? current.total_kills,
      highest_tier ?? current.highest_tier,
      total_play_time ?? current.total_play_time,
      session_count ?? current.session_count,
      req.user.id
    );
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.id);
    res.json({ progress });
  } catch (err) {
    console.error('PUT /api/progress error:', err);
    res.status(500).json({ error: 'Failed to update progress' });
  }
});

app.post('/api/progress/sync', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { spawn_count, admin_mode, unlocked_tanks, tank_state, total_merges, total_kills, highest_tier, total_play_time, session_count } = req.body;
    const existing = db.prepare('SELECT user_id FROM game_progress WHERE user_id = ?').get(req.user.id);
    if (existing) {
      db.prepare(`UPDATE game_progress SET
        spawn_count = ?, admin_mode = ?, unlocked_tanks = ?, tank_state = ?,
        total_merges = ?, total_kills = ?, highest_tier = ?,
        total_play_time = ?, session_count = ?, updated_at = datetime('now')
        WHERE user_id = ?`).run(
        spawn_count ?? 0, admin_mode ?? 0, (unlocked_tanks ?? '[]'), (tank_state ?? '[]'),
        total_merges ?? 0, total_kills ?? 0, highest_tier ?? 1,
        total_play_time ?? 0, session_count ?? 0, req.user.id
      );
    } else {
      db.prepare(`INSERT INTO game_progress (user_id, spawn_count, admin_mode, unlocked_tanks, tank_state, total_merges, total_kills, highest_tier, total_play_time, session_count) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        req.user.id, spawn_count ?? 0, admin_mode ?? 0, (unlocked_tanks ?? '[]'), (tank_state ?? '[]'),
        total_merges ?? 0, total_kills ?? 0, highest_tier ?? 1, total_play_time ?? 0, session_count ?? 0
      );
    }
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.user.id);
    res.json({ progress });
  } catch (err) {
    console.error('Sync error:', err);
    res.status(500).json({ error: err.message || 'Failed to sync progress' });
  }
});

app.post('/api/events', authMiddleware, (req, res) => {
  try {
    const { event_type, details } = req.body;
    if (!event_type) return res.status(400).json({ error: 'event_type required' });
    getDb().prepare('INSERT INTO game_events (user_id, event_type, details) VALUES (?, ?, ?)').run(
      req.user.id, event_type, JSON.stringify(details || {})
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to log event' });
  }
});

app.get('/api/admin/dashboard', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const totalUsers = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    const totalGuests = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_guest = 1').get().count;
    const totalRegistered = db.prepare('SELECT COUNT(*) as count FROM users WHERE is_guest = 0').get().count;
    const totalSpawns = db.prepare('SELECT COALESCE(SUM(spawn_count), 0) as count FROM game_progress').get().count;
    const totalMerges = db.prepare('SELECT COALESCE(SUM(total_merges), 0) as count FROM game_progress').get().count;
    const totalKills = db.prepare('SELECT COALESCE(SUM(total_kills), 0) as count FROM game_progress').get().count;
    const totalEvents = db.prepare('SELECT COUNT(*) as count FROM game_events').get().count;
    const allUnlocked = db.prepare("SELECT unlocked_tanks FROM game_progress WHERE unlocked_tanks IS NOT NULL AND unlocked_tanks != '[]'").all();
    const totalUnlocks = allUnlocked.reduce((sum, row) => {
      try { return sum + JSON.parse(row.unlocked_tanks).length; } catch { return sum; }
    }, 0);
    const users = db.prepare(`SELECT u.id, u.username, u.is_guest, u.is_admin, u.created_at, u.last_login,
      u.country, u.city,
      gp.spawn_count, gp.total_merges, gp.total_kills, gp.highest_tier, gp.total_play_time, gp.unlocked_tanks, gp.updated_at
      FROM users u LEFT JOIN game_progress gp ON u.id = gp.user_id
      ORDER BY u.created_at DESC`).all();
    res.json({ stats: { totalUsers, totalGuests, totalRegistered, totalSpawns, totalMerges, totalKills, totalEvents, totalUnlocks }, users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

app.get('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const users = getDb().prepare(`SELECT u.id, u.username, u.is_guest, u.is_admin, u.created_at, u.last_login,
      u.country, u.city,
      gp.spawn_count, gp.total_merges, gp.total_kills, gp.highest_tier, gp.total_play_time, gp.updated_at
      FROM users u LEFT JOIN game_progress gp ON u.id = gp.user_id
      ORDER BY u.created_at DESC`).all();
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

app.get('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.params.id);

    // Event stats for charts
    const eventTypeCounts = db.prepare(`SELECT event_type, COUNT(*) as count FROM game_events WHERE user_id = ? GROUP BY event_type ORDER BY count DESC`).all(req.params.id);
    const totalEventsByType = db.prepare('SELECT COUNT(*) as count FROM game_events WHERE user_id = ?').get(req.params.id).count;

    // Events per day for time chart
    const eventsByDay = db.prepare(`SELECT date(created_at) as day, COUNT(*) as count, 
      SUM(CASE WHEN event_type = 'spawn' THEN 1 ELSE 0 END) as spawns,
      SUM(CASE WHEN event_type = 'merge' THEN 1 ELSE 0 END) as merges,
      SUM(CASE WHEN event_type = 'kill' THEN 1 ELSE 0 END) as kills,
      SUM(CASE WHEN event_type = 'unlock' THEN 1 ELSE 0 END) as unlocks
      FROM game_events WHERE user_id = ? GROUP BY day ORDER BY day ASC`).all(req.params.id);

    const recentEvents = db.prepare('SELECT * FROM game_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.params.id);

    const accountAgeDays = user.created_at ? Math.floor((Date.now() - new Date(user.created_at + 'Z').getTime()) / 86400000) : 0;

    res.json({ user, progress, eventTypeCounts, totalEventsByType, eventsByDay, recentEvents, accountAgeDays });
  } catch (err) {
    console.error('User detail error:', err);
    res.status(500).json({ error: 'Failed to fetch user details' });
  }
});

app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM game_events WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM game_progress WHERE user_id = ?').run(req.params.id);
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const { username, is_admin, spawn_count, total_merges, total_kills, highest_tier, total_play_time, unlocked_tanks, admin_mode } = req.body;

    if (username !== undefined || is_admin !== undefined) {
      const updates = [];
      const params = [];
      if (username !== undefined) { updates.push('username = ?'); params.push(username); }
      if (is_admin !== undefined) { updates.push('is_admin = ?'); params.push(is_admin ? 1 : 0); }
      if (updates.length > 0) {
        db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...params, req.params.id);
      }
    }

    const current = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.params.id);
    if (current) {
      db.prepare(`UPDATE game_progress SET
        spawn_count = ?, total_merges = ?, total_kills = ?,
        highest_tier = ?, total_play_time = ?, unlocked_tanks = ?,
        admin_mode = ?, updated_at = datetime('now')
        WHERE user_id = ?`).run(
        spawn_count ?? current.spawn_count,
        total_merges ?? current.total_merges,
        total_kills ?? current.total_kills,
        highest_tier ?? current.highest_tier,
        total_play_time ?? current.total_play_time,
        unlocked_tanks ?? current.unlocked_tanks,
        admin_mode ?? current.admin_mode,
        req.params.id
      );
    }

    const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id);
    const updatedProgress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.params.id);
    res.json({ user: updatedUser, progress: updatedProgress });
  } catch (err) {
    console.error('Update user error:', err);
    res.status(500).json({ error: 'Failed to update user' });
  }
});

app.post('/api/admin/users/:id/reset', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM game_events WHERE user_id = ?').run(req.params.id);
    db.prepare(`UPDATE game_progress SET
      spawn_count = 0, admin_mode = 0, unlocked_tanks = '[]', tank_state = '[]',
      total_merges = 0, total_kills = 0, highest_tier = 1,
      session_count = 0, updated_at = datetime('now')
      WHERE user_id = ?`).run(req.params.id);
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.params.id);
    res.json({ ok: true, progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset user progress' });
  }
});

// --- Hitbox override storage ---
const HITBOX_OVERRIDES_PATH = path.join(__dirname, 'hitbox-overrides.json');

function loadHitboxOverrides() {
  try {
    if (require('fs').existsSync(HITBOX_OVERRIDES_PATH)) {
      return JSON.parse(require('fs').readFileSync(HITBOX_OVERRIDES_PATH, 'utf8'));
    }
  } catch (e) { console.error('Failed to load hitbox overrides:', e); }
  return {};
}

function saveHitboxOverrides(data) {
  require('fs').writeFileSync(HITBOX_OVERRIDES_PATH, JSON.stringify(data, null, 2), 'utf8');
}

app.get('/api/admin/hitbox-overrides', authMiddleware, adminMiddleware, (req, res) => {
  res.json(loadHitboxOverrides());
});

app.put('/api/admin/hitbox-overrides', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const data = req.body;
    if (typeof data !== 'object' || data === null) return res.status(400).json({ error: 'Invalid data' });
    for (const key of Object.keys(data)) {
      const hb = data[key];
      if (!hb || typeof hb.x !== 'number' || typeof hb.y !== 'number' || typeof hb.w !== 'number' || typeof hb.h !== 'number') {
        return res.status(400).json({ error: `Invalid hitbox for "${key}". Each override needs { x, y, w, h } as numbers.` });
      }
    }
    saveHitboxOverrides(data);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save hitbox overrides' });
  }
});

app.get('/api/admin/tank-assets', authMiddleware, adminMiddleware, (req, res) => {
  const fs = require('fs');
  const assetsDir = path.join(ROOT, 'assets');
  const files = fs.readdirSync(assetsDir).filter(f => f.endsWith('.png') && !f.startsWith('map_') && !f.endsWith('flag.png') && f !== 'field.png' && f !== 'box.png');
  res.json({ assets: files });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const battleServer = new BattleServer();

// --- Map management ---

function getActiveMap() {
  const db = getDb();
  let active = db.prepare('SELECT * FROM maps WHERE active = 1').get();
  if (!active) {
    db.prepare(`INSERT INTO maps (id, name, base_image, layout_image, spawns, world_scale, active)
      VALUES (?, ?, ?, ?, ?, ?, 1) ON CONFLICT(id) DO NOTHING`).run(
      'default', 'Default Map', 'map_base.png', 'map_layout.png',
      JSON.stringify({ germany: { x: 104.5, y: 204.5 }, ussr: { x: 571.5, y: 829.5 }, usa: { x: 1055.5, y: 338.5 } }),
      2.5
    );
    active = db.prepare('SELECT * FROM maps WHERE active = 1').get();
  }
  return active;
}

app.get('/api/map/active', (req, res) => {
  try {
    const map = getActiveMap();
    res.json({
      id: map.id,
      name: map.name,
      base_image: map.base_image,
      layout_image: map.layout_image,
      spawns: JSON.parse(map.spawns || '{}'),
      world_scale: map.world_scale,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch active map' });
  }
});

app.get('/api/admin/maps', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const maps = getDb().prepare('SELECT * FROM maps ORDER BY created_at DESC').all();
    res.json({ maps });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch maps' });
  }
});

app.post('/api/admin/maps', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const { name, base_image, layout_image, spawns, world_scale } = req.body;
    if (!name) return res.status(400).json({ error: 'Map name is required' });
    const id = require('crypto').randomUUID();
    getDb().prepare(`INSERT INTO maps (id, name, base_image, layout_image, spawns, world_scale)
      VALUES (?, ?, ?, ?, ?, ?)`).run(
      id, name, base_image || 'map_base.png', layout_image || 'map_layout.png',
      JSON.stringify(spawns || { germany: { x: 104.5, y: 204.5 }, ussr: { x: 571.5, y: 829.5 }, usa: { x: 1055.5, y: 338.5 } }),
      world_scale ?? 2.5
    );
    const map = getDb().prepare('SELECT * FROM maps WHERE id = ?').get(id);
    res.json({ map });
  } catch (err) {
    res.status(500).json({ error: 'Failed to create map' });
  }
});

app.put('/api/admin/maps/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const existing = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Map not found' });
    const { name, base_image, layout_image, spawns, world_scale } = req.body;
    db.prepare(`UPDATE maps SET
      name = COALESCE(?, name),
      base_image = COALESCE(?, base_image),
      layout_image = COALESCE(?, layout_image),
      spawns = COALESCE(?, spawns),
      world_scale = COALESCE(?, world_scale),
      updated_at = datetime('now')
      WHERE id = ?`).run(
      name ?? null, base_image ?? null, layout_image ?? null,
      spawns ? JSON.stringify(spawns) : null,
      world_scale ?? null,
      req.params.id
    );
    // Reload battle server if this is the active map
    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (map.active) {
      reloadBattleMap(map);
    }
    res.json({ map });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update map' });
  }
});

app.delete('/api/admin/maps/:id', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const map = getDb().prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    if (map.active) return res.status(400).json({ error: 'Cannot delete the active map. Activate another map first.' });
    getDb().prepare('DELETE FROM maps WHERE id = ?').run(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete map' });
  }
});

app.post('/api/admin/maps/:id/activate', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const map = db.prepare('SELECT * FROM maps WHERE id = ?').get(req.params.id);
    if (!map) return res.status(404).json({ error: 'Map not found' });
    db.prepare('UPDATE maps SET active = 0 WHERE active = 1').run();
    db.prepare('UPDATE maps SET active = 1, updated_at = datetime(\'now\') WHERE id = ?').run(req.params.id);
    await reloadBattleMap(map);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to activate map' });
  }
});

async function reloadBattleMap(map) {
  battleServer.stop();
  battleServer.setConfig({
    layoutFile: map.layout_image,
    spawns: JSON.parse(map.spawns || '{}'),
    worldScale: map.world_scale,
  });
  try {
    await battleServer.loadMap();
    console.log('Battle map reloaded:', map.name);
  } catch (err) {
    console.error('Failed to reload battle map:', err);
  }
  battleServer.start();
}

wss.on('connection', (ws, req) => {
  let userId = null;
  let userData = null;
  let heartbeat = null;

  const send = (data) => { try { ws.send(JSON.stringify(data)); } catch {} };
  const broadcast = (data) => {
    const msg = JSON.stringify(data);
    for (const [, client] of battleServer.players) {
      try { client.ws.send(msg); } catch {}
    }
  };

  const authTimeout = setTimeout(() => {
    send({ type: 'error', message: 'Authentication timeout' });
    ws.close();
  }, 10000);

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'auth') {
        try {
          const payload = verifyToken(msg.token);
          userId = payload.id;
          userData = { id: payload.id, username: payload.username };
          clearTimeout(authTimeout);
          send({ type: 'auth_ok' });
          const playerList = battleServer.getPlayerList(userId);
          send({ type: 'players', players: playerList });
          broadcast({ type: 'player_joined', id: payload.id, username: payload.username });
        } catch {
          send({ type: 'error', message: 'Invalid token' });
          ws.close();
        }
        return;
      }
      if (msg.type === 'join_battle' && userId) {
        battleServer.addPlayer(userId, { ...userData, ...msg }, ws);
        const playerList = battleServer.getPlayerList();
        send({ type: 'players', players: playerList });
        broadcast({ type: 'player_joined', id: userId, username: userData.username });
        return;
      }
      if (msg.type === 'state' && userId) {
        battleServer.updateState(userId, msg);
        return;
      }
      if (msg.type === 'shoot' && userId) {
        battleServer.handleShoot(userId);
        return;
      }
      if (msg.type === 'chat' && userId && msg.text) {
        battleServer.handleChat(userId, msg.text);
        return;
      }
      if (msg.type === 'leave_battle' && userId) {
        battleServer.removePlayer(userId);
        broadcast({ type: 'player_left', id: userId });
        return;
      }
      if (msg.type === 'ping' && userId) {
        send({ type: 'pong' });
        return;
      }
    } catch(e) { console.error('WS message error:', e); }
  });

  ws.on('close', () => {
    clearTimeout(authTimeout);
    if (heartbeat) clearInterval(heartbeat);
    if (userId) {
      const p = battleServer.players.get(userId);
      if (p && p.ws === ws) {
        battleServer.removePlayer(userId);
        broadcast({ type: 'player_left', id: userId });
      }
    }
  });

  ws.on('error', () => {
    clearTimeout(authTimeout);
    if (heartbeat) clearInterval(heartbeat);
    if (userId) {
      const p = battleServer.players.get(userId);
      if (p && p.ws === ws) {
        battleServer.removePlayer(userId);
        broadcast({ type: 'player_left', id: userId });
      }
    }
  });
});

initDb().then(async () => {
  seedAdmin();
  const activeMap = getActiveMap();
  if (activeMap) {
    battleServer.setConfig({
      layoutFile: activeMap.layout_image,
      spawns: JSON.parse(activeMap.spawns || '{}'),
      worldScale: activeMap.world_scale,
    });
    try {
      await battleServer.loadMap();
      console.log('Battle map loaded:', activeMap.name);
    } catch (err) {
      console.error('Failed to load battle map:', err);
    }
  } else {
    try {
      await battleServer.loadMap();
      console.log('Battle map loaded');
    } catch (err) {
      console.error('Failed to load battle map:', err);
    }
  }
  battleServer.start();
  console.log('Battle server started');
  server.listen(PORT, () => {
    console.log(`Tank Merge server running on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});
