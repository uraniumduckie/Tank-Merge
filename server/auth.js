const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'tank-merge-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

const GEO_CACHE = new Map();

function generateToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, is_guest: user.is_guest, is_admin: user.is_admin },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  try {
    const payload = verifyToken(header.slice(7));
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminMiddleware(req, res, next) {
  if (!req.user || !req.user.is_admin) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

async function fetchGeo(ip) {
  if (GEO_CACHE.has(ip)) return GEO_CACHE.get(ip);
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'Local', city: 'Local', latitude: 0, longitude: 0 };
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,city,lat,lon`, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await res.json();
    if (data.status === 'success') {
      const result = { country: data.country || '', city: data.city || '', latitude: data.lat || 0, longitude: data.lon || 0 };
      GEO_CACHE.set(ip, result);
      return result;
    }
  } catch {}
  return { country: '', city: '', latitude: 0, longitude: 0 };
}

function createGuestUser(ip, userAgent) {
  const db = getDb();
  const id = uuidv4();
  const username = `guest_${id.slice(0, 8)}`;
  db.prepare('INSERT INTO users (id, username, is_guest, ip_address, user_agent) VALUES (?, ?, 1, ?, ?)').run(id, username, ip || '', userAgent || '');
  db.prepare('INSERT INTO game_progress (user_id) VALUES (?)').run(id);
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  return user;
}

function updateUserGeo(id, ip) {
  fetchGeo(ip).then(geo => {
    if (geo) {
      const db = getDb();
      db.prepare('UPDATE users SET country = ?, city = ?, latitude = ?, longitude = ? WHERE id = ?').run(geo.country, geo.city, geo.latitude, geo.longitude, id);
    }
  }).catch(() => {});
}

function registerUser(id, username, password) {
  const db = getDb();
  const hash = bcrypt.hashSync(password, SALT_ROUNDS);
  db.prepare('UPDATE users SET username = ?, password_hash = ?, is_guest = 0 WHERE id = ?').run(username, hash, id);
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function loginUser(username, password) {
  const db = getDb();
  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_guest = 0').get(username);
  if (!user) return null;
  if (!bcrypt.compareSync(password, user.password_hash)) return null;
  db.prepare('UPDATE users SET last_login = datetime(\'now\') WHERE id = ?').run(user.id);
  return user;
}

function seedAdmin() {
  const db = getDb();
  const admin = db.prepare('SELECT * FROM users WHERE is_admin = 1').get();
  if (admin) return;
  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const id = uuidv4();
  const hash = bcrypt.hashSync(adminPassword, SALT_ROUNDS);
  db.prepare('INSERT OR IGNORE INTO users (id, username, password_hash, is_guest, is_admin) VALUES (?, ?, ?, 0, 1)').run(id, adminUsername, hash);
  db.prepare('INSERT OR IGNORE INTO game_progress (user_id) VALUES (?)').run(id);
  console.log(`Admin user seeded: ${adminUsername}`);
}

module.exports = { generateToken, verifyToken, authMiddleware, adminMiddleware, createGuestUser, registerUser, loginUser, seedAdmin, updateUserGeo };
