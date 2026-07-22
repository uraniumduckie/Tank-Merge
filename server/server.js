const express = require('express');
const cors = require('cors');
const path = require('path');
const { getDb } = require('./db');
const { generateToken, authMiddleware, adminMiddleware, createGuestUser, registerUser, loginUser, seedAdmin, updateUserGeo } = require('./auth');

const app = express();
const PORT = process.env.PORT || 3001;
const ROOT = path.resolve(__dirname, '..');

app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(ROOT));

seedAdmin();

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
    const users = db.prepare(`SELECT u.id, u.username, u.is_guest, u.is_admin, u.created_at, u.last_login,
      u.country, u.city,
      gp.spawn_count, gp.total_merges, gp.total_kills, gp.highest_tier, gp.total_play_time, gp.updated_at
      FROM users u LEFT JOIN game_progress gp ON u.id = gp.user_id
      ORDER BY u.created_at DESC`).all();
    res.json({ stats: { totalUsers, totalGuests, totalRegistered, totalSpawns, totalMerges, totalKills, totalEvents }, users });
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

app.post('/api/admin/users/:id/reset', authMiddleware, adminMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    db.prepare('DELETE FROM game_events WHERE user_id = ?').run(req.params.id);
    db.prepare(`UPDATE game_progress SET
      spawn_count = 0, admin_mode = 0, unlocked_tanks = '[]', tank_state = '[]',
      total_merges = 0, total_kills = 0, highest_tier = 1,
      total_play_time = 0, session_count = 0, updated_at = datetime('now')
      WHERE user_id = ?`).run(req.params.id);
    const progress = db.prepare('SELECT * FROM game_progress WHERE user_id = ?').get(req.params.id);
    res.json({ ok: true, progress });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reset user progress' });
  }
});

app.listen(PORT, () => {
  console.log(`Tank Merge server running on http://localhost:${PORT}`);
});
