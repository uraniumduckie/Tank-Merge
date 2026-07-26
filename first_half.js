const canvas = document.getElementById("battlefield");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = true;

const POOL_SIZE = 6;
let soundPoolIndex = 0;
const soundPool = [];
for (let i = 0; i < POOL_SIZE; i++) {
    soundPool.push(new Audio());
}
function playSound(src) {
    const audio = soundPool[soundPoolIndex];
    soundPoolIndex = (soundPoolIndex + 1) % POOL_SIZE;
    audio.src = src;
    audio.volume = 0.5;
    audio.currentTime = 0;
    audio.play();
}

const engineSound = new Audio("assets/engine.mp3");
engineSound.loop = true;
engineSound.volume = 0;
let engineStarted = false;
let debugMode = false;
let engineMuted = false;
let battleDebugOverlay = null;
let tagsHidden = false;
function startEngine() {
    if (engineStarted) return;
    engineStarted = true;
    engineSound.play();
}
function updateEngineSound() {
    if (engineMuted) { engineSound.volume = 0; return; }
    if (tanks.length === 0) { engineSound.volume *= 0.95; return; }
    const target = Math.min(0.01 + tanks.length * 0.008, 0.15);
    engineSound.volume += (target - engineSound.volume) * 0.1;
}

const SPAWN_COUNT_KEY = "tank-merge:spawn-count";
let spawnCount = (() => { try { return parseInt(localStorage.getItem(SPAWN_COUNT_KEY)) || 0; } catch { return 0; } })();
const clickCounter = document.getElementById("clickCounter");
clickCounter.textContent = "Spawns: " + spawnCount;
const unlockCounter = document.getElementById("unlockCounter");
const TOTAL_UNLOCKABLE = 60;
function updateUnlockCounter() {
    const count = unlocked.size;
    unlockCounter.textContent = count + "/" + TOTAL_UNLOCKABLE;
}

const unlockToggleButton = document.getElementById("unlockToggleButton");
const pauseButton = document.getElementById("pauseButton");
const nationDropdown = document.getElementById("nationDropdown");
const fieldButton = document.getElementById("fieldButton");
const fieldBackButton = document.getElementById("fieldBackButton");
const fieldMenu = document.getElementById("fieldMenu");
const techTreePanel = document.getElementById("techTreePanel");
const techTreeTitle = document.getElementById("techTreeTitle");
const closeTechTreeButton = document.getElementById("closeTechTreeButton");
const backTechTreeButton = document.getElementById("backTechTreeButton");
const techTreeTanksLabel = document.getElementById("techTreeTanksLabel");
const techTreeTanksRow = document.getElementById("techTreeTanksRow");
const techTreeDestroyersLabel = document.getElementById("techTreeDestroyersLabel");
const techTreeDestroyersRow = document.getElementById("techTreeDestroyersRow");
const pauseDialog = document.getElementById("pauseDialog");
const explodeDialog = document.getElementById("explodeDialog");
const resetDialog = document.getElementById("resetDialog");
const adminDialog = document.getElementById("adminDialog");
const resumeButton = document.getElementById("resumeButton");
const openExplodeDialogButton = document.getElementById("openExplodeDialogButton");
const openResetDialogButton = document.getElementById("openResetDialogButton");
const openAdminDialogButton = document.getElementById("openAdminDialogButton");
const confirmExplodeButton = document.getElementById("confirmExplodeButton");
const confirmResetButton = document.getElementById("confirmResetButton");
const muteEngineToggle = document.getElementById("muteEngineToggle");
const hideTagsToggle = document.getElementById("hideTagsToggle");
const debugToggle = document.getElementById("debugToggle");
const adminPassword = document.getElementById("adminPassword");
const adminError = document.getElementById("adminError");
const confirmAdminButton = document.getElementById("confirmAdminButton");
const battleConfirmDialog = document.getElementById("battleConfirmDialog");
const confirmBattleButton = document.getElementById("confirmBattleButton");
const beatGameDialog = document.getElementById("beatGameDialog");
const confirmBeatGameButton = document.getElementById("confirmBeatGameButton");
let pendingBattleTank = null;
let battleConnectionReady = false;
let battleFirstStateReceived = false;
function showBattleConnecting() {
    const el = document.getElementById("connectingOverlay");
    if (el) el.classList.remove("hidden");
}
function hideBattleConnecting() {
    const el = document.getElementById("connectingOverlay");
    if (el) el.classList.add("hidden");
}
function checkBattleReady() {
    if (debugObstacleReady && battleConnectionReady && battleFirstStateReceived) {
        hideBattleConnecting();
    }
}

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TRACK_RENDER_SCALE = 0.5;
const trackCanvas = document.createElement("canvas");
const trackCtx = trackCanvas.getContext("2d");
trackCanvas.width = Math.ceil(canvas.width * TRACK_RENDER_SCALE);
trackCanvas.height = Math.ceil(canvas.height * TRACK_RENDER_SCALE);
trackCtx.setTransform(TRACK_RENDER_SCALE, 0, 0, TRACK_RENDER_SCALE, 0, 0);
let trackFadeFrames = 0;
let enemyPlayers = [];
function getTankRadius(tier) {
    return Math.max(16, (Math.round((tier || 1) * 8 + 42) * 0.5) * 0.43);
}
function computeDisplayWidth(nation, tier, vehicleClass) {
    const base = tier === SECRET_TANK_TIER ? 500 : Math.round((tier * 8 + 42) * (nationSizeScale[nation] ?? 1)) + (tierSizeOverrides[nation]?.[vehicleClass || "tank"]?.[tier] ?? 0);
    return Math.round(base * 0.5);
}
function computeDisplayHeight(nation, tier, vehicleClass) {
    const dw = computeDisplayWidth(nation, tier, vehicleClass);
    const frame = getFrameRect(nation, tier, vehicleClass || "tank");
    return dw * frame.sh / frame.sw;
}
function getEnemyPivotShift(nation, tier, vehicleClass) {
    const key = `${nation}:${vehicleClass || "tank"}:${tier}`;
    const frac = pivotShifts[key];
    if (!frac) return 0;
    return computeDisplayHeight(nation, tier, vehicleClass) * frac;
}
function getEnemyHitbox(nation, tier, vehicleClass) {
    const key = `${nation}:${vehicleClass || "tank"}:${tier}`;
    const hb = tankHitboxData[key];
    const dw = computeDisplayWidth(nation, tier, vehicleClass);
    const dh = computeDisplayHeight(nation, tier, vehicleClass);
    if (!hb) return { w: dw * 0.7, h: dh * 0.7, ox: 0, oy: 0 };
    return { w: dw * hb.w, h: dh * hb.h, ox: 0, oy: 0 };
}
function getEnemyCollisionRadius(nation, tier, vehicleClass) {
    const hb = getEnemyHitbox(nation, tier, vehicleClass);
    return Math.sqrt(hb.w * hb.w + hb.h * hb.h) / 2;
}
function obbOverlap(ax, ay, aAngle, aW, aH, aOX, aOY, bx, by, bAngle, bW, bH, bOX, bOY) {
    const aA = aAngle + Math.PI / 2;
    const aCos = Math.cos(aA), aSin = Math.sin(aA);
    const aCx = ax + aOX * aCos - aOY * aSin;
    const aCy = ay + aOX * aSin + aOY * aCos;
    const aHw = aW / 2, aHh = aH / 2;
    const bA = bAngle + Math.PI / 2;
    const bCos = Math.cos(bA), bSin = Math.sin(bA);
    const bCx = bx + bOX * bCos - bOY * bSin;
    const bCy = by + bOX * bSin + bOY * bCos;
    const bHw = bW / 2, bHh = bH / 2;
    const axes = [
        { x: aCos, y: aSin },
        { x: -aSin, y: aCos },
        { x: bCos, y: bSin },
        { x: -bSin, y: bCos }
    ];
    for (const axis of axes) {
        const aProj = _projOBB(aCx, aCy, aHw, aHh, aCos, aSin, axis);
        const bProj = _projOBB(bCx, bCy, bHw, bHh, bCos, bSin, axis);
        if (aProj.max < bProj.min || bProj.max < aProj.min) return false;
    }
    return true;
}
function _projOBB(cx, cy, hw, hh, cos, sin, axis) {
    const dotCenter = cx * axis.x + cy * axis.y;
    const du = hw * Math.abs(cos * axis.x + sin * axis.y);
    const dv = hh * Math.abs(-sin * axis.x + cos * axis.y);
    return { min: dotCenter - du - dv, max: dotCenter + du + dv };
}

const nations = ["usa", "ussr", "germany"];
const tankColors = { usa: "#4f86ff", ussr: "#ff6a3d", germany: "#4caf50", ratte: "#725d3c" };
const tankNames = {
    usa: ["M3 Stuart", "M5 Stuart", "M4 Sherman", "M4A3E8", "M26 Pershing", "M46 Patton", "M47 Patton", "M60 Patton", "M1 Abrams", "M1A2 Abrams"],
    ussr: ["T-26", "BT-7", "T-34-40", "T-34-85", "KV-1", "IS-2", "T-54", "T-62", "T-72B", "T-90M"],
    germany: ["Panzer I", "Panzer II", "Panzer III", "Panzer IV", "Panther", "Tiger I", "Tiger II", "Leopard 1", "Leopard 2A4", "Leopard 2A7"],
    ratte: ["Ratte"]
};
const tdNames = {
    usa: ["T1 HMC", "T56 GMC", "T3 HMC", "M8A1", "M10 Wolverine", "M18 Hellcat", "T25 AT", "M36 Jackson", "T95", "T110E3"],
    ussr: ["SU-26", "SU-18", "SU-76M", "SU-85B", "SU-100", "SU-85", "SU-100M1", "SU-122-44", "ISU-152", "Object 268"],
    germany: ["Panzerjäger I", "Marder II", "Marder III", "Hetzer", "StuG III", "Nashorn", "Jagdpanzer IV", "Jagdtiger", "Jagdpanzer", "Jagdpanzer E 100"]
};
const tierSizeOverrides = {
    germany: { tank: { 1: 16, 2: 8, 9: 16, 10: 48 }, td: { 1: 12, 8: 24, 10: 48 } },
    ussr: { tank: { 2: -8, 3: 8, 5: -8, 6: 12, 7: -20, 8: -20, 9: -22, 10: -16 }, td: { 5: 10, 9: -20, 10: -20 } },
    usa: { tank: { 5: 36, 6: 36, 8: 16, 9: 20, 10: 24 }, td: { 7: 20, 8: -20, 9: 16, 10: 16 } }
};
const nationSizeScale = { ussr: 1.3, usa: 1.15 };
const pivotShifts = {
    "ussr:tank:3": 0.08, "ussr:tank:4": 0.08, "ussr:tank:6": 0.08, "ussr:tank:7": 0.08, "ussr:tank:8": 0.08, "ussr:tank:9": 0.08, "ussr:tank:10": 0.08,
    "ussr:td:4": 0.10, "ussr:td:5": 0.10, "ussr:td:6": 0.10, "ussr:td:8": 0.10, "ussr:td:9": 0.10, "ussr:td:10": 0.10,
    "germany:tank:6": 0.12, "germany:tank:7": 0.08, "germany:tank:8": 0.08, "germany:tank:9": 0.12, "germany:tank:10": 0.12,
    "germany:td:2": 0.10, "germany:td:3": 0.10, "germany:td:6": 0.10, "germany:td:7": 0.10, "germany:td:8": 0.10, "germany:td:9": 0.10, "germany:td:10": 0.10,
    "usa:tank:5": 0.10, "usa:tank:6": 0.17, "usa:tank:7": 0.14, "usa:tank:8": 0.14, "usa:tank:9": 0.08, "usa:tank:10": 0.08,
    "usa:td:7": 0.16, "usa:td:8": 0.12, "usa:td:9": 0.13, "usa:td:10": 0.18
};
const SECRET_TANK_NATION = "ratte";
const SECRET_TANK_TIER = 11;
const SECRET_TANK_KEY = `${SECRET_TANK_NATION}:${SECRET_TANK_TIER}`;

let mouse = { x: -1000, y: -1000 };
let fieldTanks = { main: [], usa: [], ussr: [], germany: [], ratte: [], battle: [] };
let tanks = fieldTanks.main;
let effects = [];
let isPaused = false;
let adminMode = false;
let ratteSpawned = false;
let currentField = null;
const ADMIN_STORAGE_KEY = "tank-merge:admin-mode";
function loadAdminMode() { try { adminMode = localStorage.getItem(ADMIN_STORAGE_KEY) === "true"; } catch {} }
function saveAdminMode() { try { localStorage.setItem(ADMIN_STORAGE_KEY, adminMode ? "true" : "false"); } catch {} }
loadAdminMode();

let totalMerges = 0;
let totalKills = 0;
let highestTier = 1;
let totalPlayTime = 0;
let playTimeInterval = null;

const API_BASE = window.location.origin;
const AUTH_TOKEN_KEY = 'tank-merge:auth-token';
let currentUser = null;
let grabbedTank = null;
let grabAngle = 0;
let grabDx = 0;
let grabDy = 0;
let grabVx = 0;
let grabVy = 0;
let wobblePhase = 0;
let grabStartX = 0;
let grabStartY = 0;
let heartTimer = 0;

function getToken() { try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; } }
function setToken(t) { try { localStorage.setItem(AUTH_TOKEN_KEY, t); } catch {} }
function clearToken() { try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {} }

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const data = await res.json();
        return { ok: res.ok, data, status: res.status };
    } catch {
        return { ok: false, data: null, status: 0 };
    }
}

async function initAuth() {
    const token = getToken();
    if (token) {
        const result = await apiFetch('/api/auth/me');
        if (result.ok && result.data) {
            currentUser = result.data.user;
            applyServerProgress(result.data.progress);
            await syncProgress();
            hideOverlayStartGame();
            return;
        }
        resetLocalState();
        const guest = await apiFetch('/api/auth/guest', { method: 'POST' });
        if (guest.ok && guest.data) {
            setToken(guest.data.token);
            currentUser = guest.data.user;
            applyServerProgress(guest.data.progress);
            await syncProgress();
            hideOverlayStartGame();
        }
    }
}

function tryStartGame() {
    if (!authReady || loadingLoaded < loadingTotal) return;
    document.getElementById('loadingOverlay').classList.add('hidden');
    document.getElementById('startOverlay').classList.add('hidden');
    document.getElementById('gameUI').classList.remove('hidden');
    if (currentUser && !currentUser.is_guest) startEngine();
    updateAdminDashboardButton();
    if (currentField === "battle") {
        connectBattleWebSocket();
    }
}

function hideOverlayStartGame() {
    authReady = true;
    tryStartGame();
}

function updateAdminDashboardButton() {
    const btn = document.getElementById('openAdminDashboardButton');
    if (currentUser && currentUser.is_admin) {
        btn.classList.remove('hidden');
    } else {
        btn.classList.add('hidden');
    }
}

async function startAsGuest() {
    resetLocalState();
    const result = await apiFetch('/api/auth/guest', { method: 'POST' });
    if (result.ok && result.data) {
        setToken(result.data.token);
        currentUser = result.data.user;
        applyServerProgress(result.data.progress);
        await syncProgress();
        hideOverlayStartGame();
    } else {
        showStartError('Failed to create guest session. Is the server running?');
    }
}

async function startLogin() {
    const username = document.getElementById('startUsername').value.trim();
    const password = document.getElementById('startPassword').value.trim();
    if (!username || !password) { showStartError('Fill in both fields.'); return; }
    resetLocalState();
    const result = await apiFetch('/api/auth/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (result.ok) {
        setToken(result.data.token);
        currentUser = result.data.user;
        applyServerProgress(result.data.progress);
        await syncProgress();
        hideOverlayStartGame();
    } else {
        showStartError(result.data?.error || 'Login failed.');
    }
}

async function startRegister() {
    const username = document.getElementById('startUsername').value.trim();
    const password = document.getElementById('startPassword').value.trim();
    if (!username || !password) { showStartError('Fill in both fields.'); return; }
    if (username.length < 3) { showStartError('Username must be at least 3 characters.'); return; }
    if (password.length < 4) { showStartError('Password must be at least 4 characters.'); return; }
    resetLocalState();
    const guestResult = await apiFetch('/api/auth/guest', { method: 'POST' });
    if (!guestResult.ok) { showStartError('Failed to create session.'); return; }
    setToken(guestResult.data.token);
    currentUser = guestResult.data.user;
    const result = await apiFetch('/api/auth/register', { method: 'POST', body: JSON.stringify({ username, password }) });
    if (result.ok) {
        setToken(result.data.token);
        currentUser = result.data.user;
        applyServerProgress(result.data.progress);
        hideOverlayStartGame();
    } else {
        clearToken();
        currentUser = null;
        showStartError(result.data?.error || 'Registration failed.');
    }
}

function showStartError(msg) {
    const el = document.getElementById('startError');
    el.textContent = msg;
    el.classList.remove('hidden');
}

function applyServerProgress(progress) {
    if (!progress) return;
    if (progress.spawn_count > 0) {
        spawnCount = Math.max(spawnCount, progress.spawn_count);
        try { localStorage.setItem(SPAWN_COUNT_KEY, spawnCount); } catch {}
        clickCounter.textContent = "Spawns: " + spawnCount;
    }
    if (progress.unlocked_tanks) {
        try {
            const serverUnlocks = JSON.parse(progress.unlocked_tanks);
            if (Array.isArray(serverUnlocks) && serverUnlocks.length > 0) {
                for (const key of serverUnlocks) unlocked.add(key);
                saveUnlockedTanks();
                updateUnlockCounter();
            }
        } catch {}
    }
    if (progress.total_merges > 0) totalMerges = Math.max(totalMerges, progress.total_merges);
    if (progress.total_kills > 0) totalKills = Math.max(totalKills, progress.total_kills);
    if (progress.highest_tier > 0) highestTier = Math.max(highestTier, progress.highest_tier);
    if (progress.total_play_time > 0) totalPlayTime = Math.max(totalPlayTime, progress.total_play_time);
    if (progress.tank_state) {
        try {
            const serverTanks = JSON.parse(progress.tank_state);
            if (serverTanks && typeof serverTanks === "object") {
                for (const key of Object.keys(serverTanks)) {
                    const arr = serverTanks[key];
                    if (!Array.isArray(arr)) continue;
                    fieldTanks[key] = arr.map((data) => {
                        const t = new Tank(data.nation, data.tier, data.x, data.y, data.adminSpawned, data.angle, data.vehicleClass || "tank");
                        if (data.labelName) t.labelName = data.labelName;
                        return t;
                    });
                }
                for (let i = (fieldTanks.battle || []).length - 1; i >= 0; i--) {
                    const t = fieldTanks.battle[i];
                    if (!fieldTanks[t.nation]) fieldTanks[t.nation] = [];
                    fieldTanks[t.nation].push(t);
                }
                fieldTanks.battle = [];
                tanks = fieldTanks[currentField || 'main'];
                try { localStorage.setItem(TANKS_STORAGE_KEY, JSON.stringify(getTankState())); } catch {}
                maybeUnlockSecretTank();
            }
        } catch {}
    }
}

function getTankState() {
    const all = {};
    for (const key of Object.keys(fieldTanks)) {
        all[key] = fieldTanks[key].map((t) => {
            const obj = {};
            for (const prop of TANK_SAVE_PROPS) obj[prop] = t[prop];
            return obj;
        });
    }
    return all;
}

async function syncProgress() {
    if (!currentUser || !getToken()) return;
    const unlockedArr = [...unlocked];
    const payload = {
        spawn_count: spawnCount,
        unlocked_tanks: JSON.stringify(unlockedArr),
        tank_state: JSON.stringify(getTankState()),
        total_merges: totalMerges,
        total_kills: totalKills,
        highest_tier: highestTier,
        total_play_time: Math.floor(totalPlayTime),
        session_count: 1,
        admin_mode: adminMode ? 1 : 0
    };
    await apiFetch('/api/progress', { method: 'PUT', body: JSON.stringify(payload) });
}

async function logEvent(eventType, details) {
    if (!currentUser || !getToken()) return;
    try {
        await apiFetch('/api/events', { method: 'POST', body: JSON.stringify({ event_type: eventType, details: JSON.stringify(details) }) });
    } catch {}
}

const UNLOCKS_STORAGE_KEY = "tank-merge:unlocked-tanks";
const TANKS_STORAGE_KEY = "tank-merge:tanks";
let unlocked = loadUnlockedTanks();
let currentTechTreeNation = null;

function loadUnlockedTanks() {
    try {
        const savedUnlocks = JSON.parse(localStorage.getItem(UNLOCKS_STORAGE_KEY) || "[]");
        return new Set(Array.isArray(savedUnlocks) ? savedUnlocks : []);
    } catch {
        return new Set();
    }
}

function resetLocalState() {
    spawnCount = 0;
    unlocked = new Set();
    for (const nation of nations) {
        unlocked.add(`${nation}:tank:1`);
    }
    fieldTanks = { main: [], usa: [], ussr: [], germany: [], ratte: [], battle: [] };
    tanks = [];
    try { localStorage.removeItem(SPAWN_COUNT_KEY); } catch {}
    try { localStorage.removeItem(UNLOCKS_STORAGE_KEY); } catch {}
    try { localStorage.removeItem(TANKS_STORAGE_KEY); } catch {}
    clickCounter.textContent = "Spawns: 0";
    updateUnlockCounter();
}

function saveUnlockedTanks() {
    try {
        localStorage.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify([...unlocked]));
    } catch {}
    syncProgress();
}

const TANK_SAVE_PROPS = ["nation", "tier", "x", "y", "angle", "adminSpawned", "vehicleClass", "labelName"];
function saveTanks() {
    try {
        const all = getTankState();
        localStorage.setItem(TANKS_STORAGE_KEY, JSON.stringify(all));
        syncProgress();
    } catch {}
}
function loadTanks() {
    try {
        const saved = JSON.parse(localStorage.getItem(TANKS_STORAGE_KEY) || "{}");
        if (typeof saved !== "object") return;
        for (const key of Object.keys(fieldTanks)) {
            const arr = saved[key];
            if (!Array.isArray(arr)) continue;
            fieldTanks[key] = arr.map((data) => {
                const t = new Tank(data.nation, data.tier, data.x, data.y, data.adminSpawned, data.angle, data.vehicleClass || "tank");
                if (data.labelName) t.labelName = data.labelName;
                return t;
            });
        }
        tanks = fieldTanks[currentField || 'main'];
        maybeUnlockSecretTank();
    } catch {}
}

for (const nation of nations) {
    unlocked.add(`${nation}:tank:1`);
}
saveUnlockedTanks();

const background = new Image();
background.src = "assets/field.png";
const germanField = new Image();
germanField.src = "assets/germanfield.png";
const ussrField = new Image();
ussrField.src = "assets/ussrfield.png";
const usaField = new Image();
usaField.src = "assets/usafield.png";
const battleFieldImg = new Image();
battleFieldImg.src = "assets/map_base.png";
const battleLayoutImg = new Image();
battleLayoutImg.src = "assets/map_layout.png";
let battleObstacleMap = null;
let battleMapWidth = 0;
let battleMapHeight = 0;
const BATTLE_WORLD_SCALE = 2.5;
let battleWorldWidth = 0;
let battleWorldHeight = 0;
let camX = 0;
let camY = 0;
let playerBattleTank = null;
let playerReloadRemaining = 0;
let battleTracks = [];
let debugObstacleCanvas = null;
let debugObstacleReady = false;
battleFieldImg.onload = () => {
    battleWorldWidth = Math.round(battleFieldImg.naturalWidth * BATTLE_WORLD_SCALE);
    battleWorldHeight = Math.round(battleFieldImg.naturalHeight * BATTLE_WORLD_SCALE);
};
battleLayoutImg.onload = () => {
    const offscreen = document.createElement("canvas");
    offscreen.width = battleLayoutImg.naturalWidth;
    offscreen.height = battleLayoutImg.naturalHeight;
    const offCtx = offscreen.getContext("2d");
    offCtx.drawImage(battleLayoutImg, 0, 0);
    const data = offCtx.getImageData(0, 0, offscreen.width, offscreen.height).data;
    battleMapWidth = offscreen.width;
    battleMapHeight = offscreen.height;
    battleObstacleMap = new Uint8Array(battleMapWidth * battleMapHeight);
    for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const idx = i / 4;
        battleObstacleMap[idx] = (g > r && g > b && g > 60) || (b > r && b > g && b > 60) ? 1 : 0;
    }
    // Pre-render obstacle overlay for debug mode
    const debugCanvas = document.createElement("canvas");
    debugCanvas.width = battleMapWidth;
    debugCanvas.height = battleMapHeight;
    const dCtx = debugCanvas.getContext("2d");
    const imgData = dCtx.createImageData(battleMapWidth, battleMapHeight);
    for (let i = 0; i < battleObstacleMap.length; i++) {
        if (battleObstacleMap[i]) {
            imgData.data[i * 4 + 0] = 220;
            imgData.data[i * 4 + 1] = 30;
            imgData.data[i * 4 + 2] = 30;
            imgData.data[i * 4 + 3] = 120;
        }
    }
    dCtx.putImageData(imgData, 0, 0);
    battleDebugOverlay = debugCanvas;
    debugObstacleReady = true;
    checkBattleReady();
    for (const tank of fieldTanks.battle) {
        if (isBattleObstacle(tank.x, tank.y)) {
            let tries = 0;
            while (isBattleObstacle(tank.x, tank.y) && tries < 40) {
                tank.x += (Math.random() - 0.5) * 100;
                tank.y += (Math.random() - 0.5) * 100;
                tries++;
            }
        }
    }
};

const tankFiles = {
    usa: ["m3stuart", "m5stuart", "m4sherman", "m4a3e8sherman", "m26pershing", "m46patton", "m47patton", "m60patton", "m1abrams", "m1a2abrams"],
    ussr: ["t26", "bt7", "t3440", "t3485", "kv1", "is2", "t54", "t62", "t72b", "t90m"],
    germany: ["panzer1", "panzer2", "panzer3", "panzer4", "panther", "tiger1", "tiger2", "leopard1", "leopard2a4", "leopard2a7"],
};

const tdFiles = {
    usa: ["t1hmc", "t56gmc", "t3hmc", "m8a1", "m10wolverine", "m18hellcat", "t25at", "m36jackson", "t95", "t110e3"],
    ussr: ["su26", "su18", "su76m", "su85b", "su100", "su85", "su100m1", "su12244", "isu152", "object268"],
    germany: ["panzerjager1", "marder2", "marder3", "hetzer", "stug3", "nashorn", "jagdpanzer4", "jagdtiger", "jagdpanzer", "jagdpanzer100"],
};

const tankImages = {};
const tankHitboxData = {};
let loadingTotal = 0;
let loadingLoaded = 0;
let authReady = false;

function updateLoadingProgress() {
    const inner = document.getElementById('loadingBarInner');
    const text = document.getElementById('loadingProgressText');
    if (inner && text) {
        const pct = loadingTotal > 0 ? Math.round((loadingLoaded / loadingTotal) * 100) : 0;
        inner.style.width = pct + '%';
        text.textContent = loadingLoaded + ' / ' + loadingTotal;
    }
}

function preloadAllAssets() {
    const loaded = new Set();
    for (const tank of tanks) {
        const key = `${tank.nation}:${tank.vehicleClass || 'tank'}:${tank.tier}`;
        if (!loaded.has(key)) {
            loaded.add(key);
            getTankImage(tank.nation, tank.tier, tank.vehicleClass || 'tank');
        }
    }
    for (const n of nations) {
        for (let t = 1; t <= 10; t++) {
            if (!loaded.has(`${n}:tank:${t}`)) getTankImage(n, t, 'tank');
            if (!loaded.has(`${n}:td:${t}`)) getTankImage(n, t, 'td');
        }
    }
    if (!loaded.has(`${SECRET_TANK_NATION}:tank:${SECRET_TANK_TIER}`)) {
        getTankImage(SECRET_TANK_NATION, SECRET_TANK_TIER, 'tank');
    }
}

function computeTankHitbox(key) {
    const img = tankImages[key];
    if (!img || !img.complete || !img.naturalWidth || tankHitboxData[key]) return;
    const c = document.createElement("canvas");
    c.width = img.naturalWidth;
    c.height = img.naturalHeight;
    const cx = c.getContext("2d");
    cx.drawImage(img, 0, 0);
    const d = cx.getImageData(0, 0, c.width, c.height).data;
    let minX = c.width, minY = c.height, maxX = 0, maxY = 0;
    for (let y = 0; y < c.height; y++) {
        for (let x = 0; x < c.width; x++) {
            if (d[(y * c.width + x) * 4 + 3] > 30) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
                if (y < minY) minY = y;
                if (y > maxY) maxY = y;
            }
        }
    }
    if (maxX < minX || maxY < minY) { minX = 0; minY = 0; maxX = c.width; maxY = c.height; }
    tankHitboxData[key] = { x: minX / c.width, y: minY / c.height, w: (maxX - minX + 1) / c.width, h: (maxY - minY + 1) / c.height };
    if (key === "usa:td:10") {
        const hb = tankHitboxData[key];
        hb.y += hb.h * 0.4;
        hb.h *= 0.6;
    }
    if (key === "germany:tank:10" 
        || key === "germany:td:10"
        || key === "germany:tank:9"
        || key === "germany:tank:8"
        || key === "germany:tank:7"
        || key === "germany:tank:6"
        || key === "germany:tank:5"
        || key === "germany:td:8"
        || key === "germany:td:6"
        || key === "germany:td:2"
        || key === "germany:td:3"
        || key === "usa:tank:4"
        || key === "usa:td:9"
        || key === "usa:td:8"
        || key === "usa:td:6"
        || key === "usa:td:5"
        || key === "ussr:tank:8"
        || key === "ussr:tank:7"
        || key === "ussr:tank:4"
        || key === "ussr:td:10"
        || key === "ussr:td:6"
        || key === "ussr:tank:3"
    ) {
        const hb = tankHitboxData[key];
        hb.y += hb.h * 0.3;
        hb.h *= 0.7;
    }

function getTankImage(nation, tier, vehicleClass = "tank") {
    const key = `${nation}:${vehicleClass}:${tier}`;
    if (!tankImages[key]) {
        loadingTotal++;
        updateLoadingProgress();
        const img = new Image();
        const onDone = () => { computeTankHitbox(key); loadingLoaded++; updateLoadingProgress(); tryStartGame(); };
        img.onload = onDone;
        img.onerror = onDone;
        if (nation === SECRET_TANK_NATION && tier === SECRET_TANK_TIER) {
            img.src = "assets/ratte.png";
        } else {
            const files = vehicleClass === "td" ? tdFiles : tankFiles;
            const file = files[nation]?.[tier - 1];
            img.src = file ? `assets/${file}.png` : "";
        }
        tankImages[key] = img;
    }
    return tankImages[key];
}

function getFrameRect(nation, tier, vehicleClass = "tank") {
    const img = getTankImage(nation, tier, vehicleClass);
    return { sx: 0, sy: 0, sw: img.naturalWidth || 64, sh: img.naturalHeight || 64 };
}

maybeUnlockSecretTank();

function getTankName(nation, tier, vehicleClass = "tank") {
    if (nation === SECRET_TANK_NATION && tier === SECRET_TANK_TIER) return "Ratte";
    const names = vehicleClass === "td" ? tdNames : tankNames;
    return names[nation]?.[tier - 1] || `Tier ${tier}`;
}

class ExplosionParticle {
    constructor(x, y, color, speed) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const spd = speed || (1 + Math.random() * 5);
        this.vx = Math.cos(angle) * spd; this.vy = Math.sin(angle) * spd - 1;
        this.life = 1; this.size = 3 + Math.random() * 6; this.color = color;
        this.decay = 0.012 + Math.random() * 0.015;
    }
    update() {
        this.x += this.vx; this.y += this.vy; this.vy += 0.06;
        this.vx *= 0.97; this.vy *= 0.97; this.life -= this.decay;
    }
    draw() {
        ctx.save(); ctx.globalAlpha = Math.max(0, this.life);
        ctx.fillStyle = this.color;
        ctx.beginPath(); ctx.arc(this.x, this.y, Math.max(0.5, this.size * this.life), 0, Math.PI * 2);
        ctx.fill(); ctx.restore();
    }
}

class SmokeParticle {
    constructor(x, y) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 3 + Math.random() * 5;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed - 1;
        this.life = 1;
        this.decay = 0.008 + Math.random() * 0.01;
        this.trail = [{ x, y }];
        this.size = 0.5 + Math.random() * 1;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.02;
        this.vx *= 0.98;
        this.life -= this.decay;
        this.trail.push({ x: this.x, y: this.y });
        if (this.trail.length > 8) this.trail.shift();
    }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha * 0.6;
        ctx.strokeStyle = "#111";
        ctx.lineWidth = this.size * alpha;
        ctx.lineCap = "round";
        ctx.beginPath();
        for (let i = 0; i < this.trail.length; i++) {
            const p = this.trail[i];
            if (i === 0) ctx.moveTo(p.x, p.y);
            else ctx.lineTo(p.x, p.y);
        }
        ctx.stroke();
        ctx.fillStyle = "#222";
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size * alpha), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class ExplosionFlash {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.life = 1;
    }
    update() { this.life -= 0.06; }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha * 0.5;
        const radius = 80 * (1 - alpha) + 20;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
        gradient.addColorStop(0, "#fffbe6");
        gradient.addColorStop(0.4, "#ffd966");
        gradient.addColorStop(1, "rgba(255,200,50,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(this.x, this.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class ExplosionEffect {
    constructor(x, y, sheet, frameRect, nation) {
        this.flash = new ExplosionFlash(x, y);
        this.particles = [];
        const colors = ["#f7d66d", "#ff8f3c", "#ff5147", "#f2f2d8", "#ffb347"];
        for (let i = 0; i < 44; i += 1) { this.particles.push(new ExplosionParticle(x, y, colors[i % colors.length], 1 + Math.random() * 6)); }
        for (let i = 0; i < 12; i += 1) { this.particles.push(new ExplosionParticle(x, y, "#cccccc", 0.3 + Math.random() * 1.5)); }
        this.smoke = [];
        for (let i = 0; i < 18; i += 1) { this.smoke.push(new SmokeParticle(x, y)); }
        this.risingSmoke = [];
        for (let i = 0; i < 12; i += 1) {
            this.risingSmoke.push({
                x: x + (Math.random() - 0.5) * 30,
                y: y + (Math.random() - 0.5) * 20,
                vx: (Math.random() - 0.5) * 0.3,
                vy: -(0.3 + Math.random() * 0.8),
                size: 4 + Math.random() * 8,
                life: 0.6 + Math.random() * 0.4,
                decay: 0.004 + Math.random() * 0.006,
                maxLife: 0
            });
            this.risingSmoke[i].maxLife = this.risingSmoke[i].life;
        }
    }
    update() {
        this.flash.update();
        this.particles.forEach((p) => p.update());
        this.particles = this.particles.filter((p) => p.life > 0);
        this.smoke.forEach((s) => s.update());
        this.smoke = this.smoke.filter((s) => s.life > 0);
        this.risingSmoke.forEach((s) => {
            s.x += s.vx; s.y += s.vy;
            s.vy *= 0.98;
            s.size += 0.05;
            s.life -= s.decay;
        });
        this.risingSmoke = this.risingSmoke.filter((s) => s.life > 0);
    }
    draw() {
        this.flash.draw();
        this.smoke.forEach((s) => s.draw());
        this.risingSmoke.forEach((s) => {
            ctx.save();
            const alpha = Math.max(0, s.life / s.maxLife);
            ctx.globalAlpha = alpha * 0.4;
            ctx.fillStyle = "#333";
            ctx.beginPath();
            ctx.arc(s.x, s.y, Math.max(0.5, s.size), 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        });
        this.particles.forEach((p) => p.draw());
    }
}

function drawStar(cx, cy, outerR, innerR, points) {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 === 0 ? outerR : innerR;
        const angle = (Math.PI * i) / points - Math.PI / 2;
        const x = cx + Math.cos(angle) * r;
        const y = cy + Math.sin(angle) * r;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
}

class StarParticle {
    constructor(x, y) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 1 + Math.random() * 4;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed;
        this.life = 1;
        this.decay = 0.008 + Math.random() * 0.012;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotSpeed = (Math.random() - 0.5) * 0.15;
        this.size = 3 + Math.random() * 8;
        this.hue = 40 + Math.random() * 30;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.97; this.vy *= 0.97; this.vy += 0.04;
        this.rotation += this.rotSpeed;
        this.life -= this.decay;
    }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha;
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        ctx.fillStyle = `hsl(${this.hue}, 100%, ${60 + 30 * alpha}%)`;
        drawStar(0, 0, this.size, this.size * 0.4, 5);
        ctx.fill();
        ctx.restore();
    }
}

class StarFlash {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.life = 1;
    }
    update() { this.life -= 0.05; }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha * 0.6;
        const radius = 60 * (1 - alpha) + 10;
        const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, radius);
        gradient.addColorStop(0, "#fffbe6");
        gradient.addColorStop(0.3, "#ffd700");
        gradient.addColorStop(1, "rgba(255,200,50,0)");
        ctx.fillStyle = gradient;
        ctx.beginPath(); ctx.arc(this.x, this.y, radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
    }
}

class StarEffect {
    constructor(x, y) {
        this.flash = new StarFlash(x, y);
        this.stars = [];
        for (let i = 0; i < 20; i += 1) { this.stars.push(new StarParticle(x, y)); }
    }
    update() {
        this.flash.update();
        this.stars.forEach((s) => s.update());
        this.stars = this.stars.filter((s) => s.life > 0);
    }
    draw() {
        this.flash.draw();
        this.stars.forEach((s) => s.draw());
    }
    get alive() { return this.stars.length > 0; }
}

class TransferParticle {
    constructor(x, y) {
        this.x = x; this.y = y;
        const angle = Math.random() * Math.PI * 2;
        const speed = 2 + Math.random() * 4;
        this.vx = Math.cos(angle) * speed;
        this.vy = Math.sin(angle) * speed + 2;
        this.life = 1;
        this.decay = 0.015 + Math.random() * 0.015;
        this.size = 3 + Math.random() * 6;
        this.hue = 30 + Math.random() * 40;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vx *= 0.96;
        this.life -= this.decay;
    }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `hsl(${this.hue}, 100%, 70%)`;
        ctx.beginPath();
        ctx.arc(this.x, this.y, Math.max(0.5, this.size * alpha), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

class TransferEffect {
    constructor(x, y) {
        this.particles = [];
        for (let i = 0; i < 15; i += 1) { this.particles.push(new TransferParticle(x, y)); }
    }
    update() {
        this.particles.forEach((p) => p.update());
        this.particles = this.particles.filter((p) => p.life > 0);
    }
    draw() {
        this.particles.forEach((p) => p.draw());
    }
    get alive() { return this.particles.length > 0; }
}

class HeartParticle {
    constructor(x, y) {
        this.x = x; this.y = y;
        this.vx = (Math.random() - 0.5) * 3;
        this.vy = -2 - Math.random() * 3;
        this.life = 1;
        this.decay = 0.01 + Math.random() * 0.01;
        this.size = 4 + Math.random() * 6;
        this.hue = 330 + Math.random() * 30;
    }
    update() {
        this.x += this.vx; this.y += this.vy;
        this.vy += 0.04;
        this.life -= this.decay;
    }
    draw() {
        ctx.save();
        const alpha = Math.max(0, this.life);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = `hsl(${this.hue}, 100%, 65%)`;
        ctx.translate(this.x, this.y);
        ctx.beginPath();
        ctx.moveTo(0, this.size * 0.3);
        ctx.bezierCurveTo(-this.size * 0.6, -this.size * 0.3, -this.size, this.size * 0.1, 0, this.size);
        ctx.bezierCurveTo(this.size, this.size * 0.1, this.size * 0.6, -this.size * 0.3, 0, this.size * 0.3);
        ctx.fill();
        ctx.restore();
    }
}

class HeartEffect {
    constructor(x, y) {
        this.particles = [];
        for (let i = 0; i < 10; i += 1) { this.particles.push(new HeartParticle(x, y)); }
    }
    update() {
        this.particles.forEach((p) => p.update());
        this.particles = this.particles.filter((p) => p.life > 0);
    }
    draw() {
        this.particles.forEach((p) => p.draw());
    }
    get alive() { return this.particles.length > 0; }
}

function spawnMergeEffect(x, y, nation) {
    effects.push(new StarEffect(x, y));
    playSound("assets/merge.wav");
}

function spawnTransferEffect(x, y) {
    effects.push(new StarEffect(x, y));
    effects.push(new TransferEffect(x, y));
}

function spawnHeartEffect(x, y) {
    effects.push(new HeartEffect(x, y));
}

function spawnHeartEffectWithSound(x, y) {
    spawnHeartEffect(x, y);
    playSound("assets/merge.wav");
}

function drawTrackSegment(fromX, fromY, toX, toY, tankWidth) {
    if (currentField === "battle") {
        battleTracks.push({ fx: fromX, fy: fromY, tx: toX, ty: toY, tankWidth, life: 90 });
        return;
    }
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const trackWidth = 5 + (tankWidth || 54) * 0.1;

    trackCtx.save();
    trackCtx.globalAlpha = 0.38;
    trackCtx.strokeStyle = "#202418";
    trackCtx.lineWidth = 4;
    trackCtx.lineCap = "round";
    for (const side of [-1, 1]) {
        trackCtx.beginPath();
        trackCtx.moveTo(fromX + Math.sin(angle) * trackWidth * -side, fromY + -Math.cos(angle) * trackWidth * -side);
        trackCtx.lineTo(toX + Math.sin(angle) * trackWidth * -side, toY + -Math.cos(angle) * trackWidth * -side);
        trackCtx.stroke();
    }
    trackCtx.restore();
    trackFadeFrames = 90;
}

function fadeTracks() {
    if (trackFadeFrames <= 0) return;
    trackCtx.save();
    trackCtx.setTransform(1, 0, 0, 1, 0, 0);
    trackCtx.globalCompositeOperation = "destination-out";
    trackCtx.globalAlpha = 0.03;
    trackCtx.fillRect(0, 0, trackCanvas.width, trackCanvas.height);
    trackCtx.restore();
    trackFadeFrames -= 1;
    if (trackFadeFrames <= 0) {
        trackCtx.save();
        trackCtx.setTransform(1, 0, 0, 1, 0, 0);
        trackCtx.clearRect(0, 0, trackCanvas.width, trackCanvas.height);
        trackCtx.restore();
    }
}

class Tank {
    constructor(nation, tier, x, y, adminSpawned = false, angle, vehicleClass = "tank") {
        this.nation = nation; this.tier = tier; this.x = x; this.y = y; this.angle = angle ?? Math.random() * Math.PI * 2; this.adminSpawned = adminSpawned; this.vehicleClass = vehicleClass;
        const weightFactor = Math.max(0.35, 1 - (tier - 1) * 0.07);
        const classFactor = vehicleClass === "td" ? 0.85 : 1.0;
        this.baseSpeed = (1.0 + weightFactor * 1.0) * classFactor;
        this.topSpeed = (2.0 + weightFactor * 2.0) * classFactor;
        this.speed = 0;
        this.acceleration = 0.02 + weightFactor * 0.03;
        this.braking = 0.06 + weightFactor * 0.04;
        this.pivotTurnRate = 0.055;
        this.minTurnRate = 0.01 + weightFactor * 0.04;
        this.turnSpeed = 0;
        this.turnAcceleration = 0.002 + weightFactor * 0.003;
        this.lastTrackX = x;
        this.lastTrackY = y;
        this.labelName = getTankName(nation, tier, vehicleClass);
        this.labelTier = "Tier " + tier;
        this.isChasing = false;
        this.chaseCooldown = 0;
        this.frozen = false;
        ctx.save();
        ctx.font = "11px sans-serif";
        this.labelBoxWidth = Math.max(ctx.measureText(this.labelName).width, ctx.measureText(this.labelTier).width) + 12;
        ctx.restore();
    }
    getLabelText() {
        const orig = getTankName(this.nation, this.tier, this.vehicleClass);
        if (this.labelName !== orig) return [this.labelName, ""];
        return [this.labelName, this.labelTier];
    }
    getDisplayWidth() {
        return computeDisplayWidth(this.nation, this.tier, this.vehicleClass);
    }
    getPivotShift() {
        const key = `${this.nation}:${this.vehicleClass}:${this.tier}`;
        const frac = pivotShifts[key];
        if (!frac) return 0;
        const dw = this.getDisplayWidth();
        const frame = getFrameRect(this.nation, this.tier, this.vehicleClass);
        const dh = dw * frame.sh / frame.sw;
        return dh * frac;
    }
    getHitbox() {
        const key = `${this.nation}:${this.vehicleClass}:${this.tier}`;
        const hb = tankHitboxData[key];
        const dw = this.getDisplayWidth();
        const frame = getFrameRect(this.nation, this.tier, this.vehicleClass);
        const dh = dw * frame.sh / frame.sw;
        if (!hb) return { w: dw * 0.7, h: dh * 0.7, ox: 0, oy: 0 };
        return { w: dw * hb.w, h: dh * hb.h, ox: 0, oy: 0 };
    }
    getHitboxCorners() { return getCorners(this.x, this.y, this.angle + Math.PI / 2, this.getHitbox()); }
    containsPoint(px, py) {
        const corners = this.getHitboxCorners();
        const ax = corners[1].x - corners[0].x, ay = corners[1].y - corners[0].y;
        const bx = corners[3].x - corners[0].x, by = corners[3].y - corners[0].y;
        const dx = px - corners[0].x, dy = py - corners[0].y;
        const dotA = dx * ax + dy * ay, lenA = ax * ax + ay * ay;
        const dotB = dx * bx + dy * by, lenB = bx * bx + by * by;
        return dotA >= 0 && dotA <= lenA && dotB >= 0 && dotB <= lenB;  
    }
    getCollisionRadius() {
        const hb = this.getHitbox();
        return Math.sqrt(hb.w * hb.w + hb.h * hb.h) / 2;
    }
    getWallPadding() { return Math.max(this.getHitbox().w, this.getHitbox().h) / 2 + 3; }
    _overlapsAt(x, y) {
        if (!battleObstacleMap) return false;
        const hb = this.getHitbox();
        const a = this.angle + Math.PI / 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        const cx = x + hb.ox * cos - hb.oy * sin;
        const cy = y + hb.ox * sin + hb.oy * cos;
        const hw2 = hb.w / 2, hh = hb.h / 2;
        const corners = [
            [cx + hw2 * cos - hh * sin, cy + hw2 * sin + hh * cos],
            [cx - hw2 * cos - hh * sin, cy - hw2 * sin + hh * cos],
            [cx - hw2 * cos + hh * sin, cy - hw2 * sin - hh * cos],
            [cx + hw2 * cos + hh * sin, cy + hw2 * sin - hh * cos]
        ];
        if (corners.some(([px, py]) => isBattleObstacle(px, py))) return true;
        if (isBattleObstacle(x, y)) return true;
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            const x1 = corners[i][0], y1 = corners[i][1];
            const x2 = corners[j][0], y2 = corners[j][1];
            for (let t = 0.2; t < 1; t += 0.2) {
                if (isBattleObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
            }
        }
        return false;
    }
    wouldOverlapIfTurned(angleDelta) {
        if (currentField !== "battle" || !battleObstacleMap) return false;
        const oldAngle = this.angle;
        this.angle += angleDelta;
        const result = this._overlapsAt(this.x, this.y);
        this.angle = oldAngle;
        return result;
    }
    resolveMovement() {
        const oldX = this.x, oldY = this.y;
        let newX = this.x + Math.cos(this.angle) * this.speed;
        let newY = this.y + Math.sin(this.angle) * this.speed;
        if (currentField === "battle" && battleWorldWidth) {
            const hb = this.getHitbox();
            const radius = Math.sqrt(hb.w * hb.w + hb.h * hb.h) / 2 + 1;
            newX = Math.max(radius, Math.min(battleWorldWidth - radius, newX));
            newY = Math.max(radius, Math.min(battleWorldHeight - radius, newY));
            this.x = newX;
            this.y = newY;
            if (battleObstacleMap && this._overlapsAt(newX, newY)) {
                if (!this._overlapsAt(newX, oldY)) {
                    this.x = newX;
                    this.y = oldY;
                    this.speed *= 0.4;
                } else if (!this._overlapsAt(oldX, newY)) {
                    this.x = oldX;
                    this.y = newY;
                    this.speed *= 0.4;
                } else {
                    this.x = oldX;
                    this.y = oldY;
                    this.speed = 0;
                    this.turnSpeed = 0;
                }
            }
            const myHb = this.getHitbox();
            for (const enemy of enemyPlayers) {
                const eHb = getEnemyHitbox(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
                if (!obbOverlap(this.x, this.y, this.angle, myHb.w, myHb.h, myHb.ox, myHb.oy,
                                enemy.x, enemy.y, enemy.angle, eHb.w, eHb.h, eHb.ox, eHb.oy)) continue;
                const dx = this.x - enemy.x;
                const dy = this.y - enemy.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.01) continue;
                const nx = dx / dist, ny = dy / dist;
                const pushX = this.x + nx * 4;
                const pushY = this.y + ny * 4;
                if (!battleObstacleMap || !this._overlapsAt(pushX, pushY)) {
                    this.x = pushX;
                    this.y = pushY;
                }
                this.speed *= 0.5;
            }
            this.x = Math.max(radius, Math.min(battleWorldWidth - radius, this.x));
            this.y = Math.max(radius, Math.min(battleWorldHeight - radius, this.y));
        } else {
            this.x = newX;
            this.y = newY;
        }
    }
    update() {
        if (this.frozen) return;
        const mx = currentField === "battle" ? mouse.x - canvas.width / 2 + camX : mouse.x;
        const my = currentField === "battle" ? mouse.y - canvas.height / 2 + camY : mouse.y;
        const dx = this.x - mx; const dy = this.y - my; const distance = Math.sqrt(dx * dx + dy * dy);
        const isScared = distance < 150 && (!currentField || currentField === "battle");
        const isNationField = currentField && currentField !== "battle";
        if (isNationField && !this.isChasing) {
            this.chaseCooldown--;
            if (this.chaseCooldown <= 0 && distance < 250 && Math.random() < 0.025) {
                this.isChasing = true;
                this.chaseCooldown = 0;
            }
        } else if (this.isChasing) {
            this.chaseCooldown++;
            if (this.chaseCooldown > 960) {
                this.isChasing = false;
                this.chaseCooldown = 180 + Math.random() * 300;
            }
            if (this.containsPoint(mx, my)) {
                spawnHeartEffectWithSound(this.x, this.y);
                this.isChasing = false;
                this.chaseCooldown = 300 + Math.random() * 300;
            }
        }
        let targetAngle = this.angle;
        let targetSpeed = this.baseSpeed;
        if (this.isChasing) {
            targetAngle = Math.atan2(mouse.y - this.y, mouse.x - this.x);
            targetSpeed = this.topSpeed;
        } else if (isScared) {
            targetAngle = Math.atan2(dy, dx);
            targetSpeed = currentField === "battle" ? this.topSpeed : this.topSpeed * 2.1;
        } else {
            targetSpeed = this.baseSpeed;
        }
        let diff = targetAngle - this.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        const speedRatio = Math.abs(this.speed) / (this.topSpeed || 0.1);
        const maxTurnRate = this.minTurnRate + (this.pivotTurnRate - this.minTurnRate) * Math.max(0, 1 - speedRatio * 0.8);
        const targetTurn = Math.sign(diff) * Math.min(Math.abs(diff), maxTurnRate);
        if (this.turnSpeed < targetTurn) {
            this.turnSpeed = Math.min(targetTurn, this.turnSpeed + this.turnAcceleration);
        } else if (this.turnSpeed > targetTurn) {
            this.turnSpeed = Math.max(targetTurn, this.turnSpeed - this.turnAcceleration);
        }
        if (!this.wouldOverlapIfTurned(this.turnSpeed)) {
            this.angle += this.turnSpeed;
        } else {
            this.turnSpeed = 0;
        }
        if (Math.abs(diff) < 0.015 && Math.abs(this.turnSpeed) < 0.008 && !this.wouldOverlapIfTurned(targetAngle - this.angle)) {
            this.angle = targetAngle;
            this.turnSpeed = 0;
        }
        if (this.speed < targetSpeed) {
            const accel = isScared && currentField !== "battle" ? this.acceleration * 8 : this.acceleration;
            this.speed = Math.min(targetSpeed, this.speed + accel);
        } else if (this.speed > targetSpeed) {
            this.speed = Math.max(targetSpeed, this.speed - this.braking);
        }
        if (currentField === "battle") {
            this.resolveMovement();
        } else {
            this.x += Math.cos(this.angle) * this.speed; this.y += Math.sin(this.angle) * this.speed;
            const hw = this.getDisplayWidth() / 2;
            if (this.x < -hw) { this.x += canvas.width; this.lastTrackX = this.x; this.lastTrackY = this.y; }
            if (this.x > canvas.width + hw) { this.x -= canvas.width; this.lastTrackX = this.x; this.lastTrackY = this.y; }
            if (this.y < -hw) { this.y += canvas.height; this.lastTrackX = this.x; this.lastTrackY = this.y; }
            if (this.y > canvas.height + hw) { this.y -= canvas.height; this.lastTrackX = this.x; this.lastTrackY = this.y; }
        }
        if (this.x !== this.lastTrackX || this.y !== this.lastTrackY) {
            if (isScared) drawTrackSegment(this.lastTrackX, this.lastTrackY, this.x, this.y, this.getDisplayWidth());
            this.lastTrackX = this.x;
            this.lastTrackY = this.y;
        }
    }
    drawLabel(x, y, displayHeight) {
        const [name, tier] = this.getLabelText();
        const isCustom = !tier;
        ctx.save();
        ctx.font = isCustom ? "bold 15px sans-serif" : "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const boxWidth = isCustom ? ctx.measureText(name).width + 16 : this.labelBoxWidth;
        const boxHeight = isCustom ? 36 : 32;
        ctx.translate(x, y - displayHeight / 2 - 10);
        ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        ctx.beginPath();
        ctx.roundRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 5);
        ctx.fill();
        ctx.fillStyle = "#f6f6f6";
        ctx.fillText(name, 0, tier ? -7 : 0);
        if (tier) ctx.fillText(tier, 0, 7);
        ctx.restore();
    }
    draw() {
        const frameRect = getFrameRect(this.nation, this.tier, this.vehicleClass);
        const aspect = frameRect.sh / frameRect.sw;
        const displayWidth = this.getDisplayWidth();
        const displayHeight = displayWidth * aspect;
        const hw = displayWidth / 2;
        const hh = displayHeight / 2;
        const draws = [{ x: this.x, y: this.y }];
        if (currentField !== "battle" || !battleWorldWidth) {
            const wrapX = this.x - hw < 0 ? canvas.width : this.x + hw > canvas.width ? -canvas.width : 0;
            const wrapY = this.y - hh < 0 ? canvas.height : this.y + hh > canvas.height ? -canvas.height : 0;
            if (wrapX) draws.push({ x: this.x + wrapX, y: this.y });
            if (wrapY) draws.push({ x: this.x, y: this.y + wrapY });
            if (wrapX && wrapY) draws.push({ x: this.x + wrapX, y: this.y + wrapY });
        }
        for (const d of draws) {
            const tankImage = getTankImage(this.nation, this.tier, this.vehicleClass);
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(this.angle + Math.PI / 2);
            ctx.translate(0, -this.getPivotShift());
            if (tankImage.complete && tankImage.naturalWidth > 0) {
                ctx.drawImage(tankImage, frameRect.sx, frameRect.sy, frameRect.sw, frameRect.sh, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
            } else {
                const t = Date.now() / 800;
                ctx.strokeStyle = tankColors[this.nation] || "#ffffff";
                ctx.lineWidth = Math.max(3, Math.min(displayWidth, displayHeight) * 0.14);
                const radius = Math.min(displayWidth, displayHeight) * 0.42;
                ctx.shadowColor = tankColors[this.nation] || "#ffffff";
                ctx.shadowBlur = 8;
                ctx.beginPath();
                ctx.arc(0, 0, radius, t * Math.PI * 2, t * Math.PI * 2 + Math.PI * 1.5);
                ctx.stroke();
                ctx.shadowBlur = 0;
            }
            ctx.restore();
            if (!tagsHidden) this.drawLabel(d.x, d.y, displayHeight);
            if (currentField === "battle" && this === playerBattleTank) {
                const barW = displayWidth * 1.2;
                const barH = 2.1;
                const bx = d.x - barW / 2;
                const by = d.y - displayHeight / 2 + 3;
                const tier = this.tier || 1;
                const maxReload = 2 + (tier - 1) * 0.5 + (this.vehicleClass === 'td' ? 3 : 0);
                const frac = Math.min(1, (playerReloadRemaining || 0) / maxReload);
                ctx.save();
                ctx.globalAlpha = 0.7;
                ctx.fillStyle = frac <= 0 ? '#4ade80' : '#ef4444';
                ctx.fillRect(bx, by, barW * (1 - frac), barH);
                ctx.restore();

            }
        }
    }
}

function spawnTank(x, y) { const nation = nations[Math.floor(Math.random() * nations.length)]; tanks.push(new Tank(nation, 1, x, y)); }
function getCorners(x, y, angle, hb) {
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const hw = hb.w / 2, hh = hb.h / 2;
    const cx = x + hb.ox * cos - hb.oy * sin;
    const cy = y + hb.ox * sin + hb.oy * cos;
    return [
        { x: cx + (-hw) * cos - (-hh) * sin, y: cy + (-hw) * sin + (-hh) * cos },
        { x: cx + (hw) * cos - (-hh) * sin, y: cy + (hw) * sin + (-hh) * cos },
        { x: cx + (hw) * cos - (hh) * sin, y: cy + (hw) * sin + (hh) * cos },
        { x: cx + (-hw) * cos - (hh) * sin, y: cy + (-hw) * sin + (hh) * cos }
    ];
}
function collide(a, b) {
    const ax = a.x, ay = a.y, bx = b.x, by = b.y;
    const hbA = a.getHitbox(), hbB = b.getHitbox();
    if (currentField !== "battle" || !battleWorldWidth) {
        const dx = Math.abs(ax - bx), dy = Math.abs(ay - by);
        if (Math.min(dx, canvas.width - dx) > 300 && Math.min(dy, canvas.height - dy) > 300) return false;
    }
    const wraps = (currentField !== "battle" || !battleWorldWidth) ? [
        [0, 0], [-canvas.width, 0], [canvas.width, 0], [0, -canvas.height], [0, canvas.height],
        [-canvas.width, -canvas.height], [canvas.width, canvas.height],
        [-canvas.width, canvas.height], [canvas.width, -canvas.height]
    ] : [[0, 0]];
    for (const [wx, wy] of wraps) {
        const ca = getCorners(ax, ay, a.angle, hbA);
        const cb = getCorners(bx + wx, by + wy, b.angle, hbB);
        const axes = [];
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            axes.push({ x: -(ca[j].y - ca[i].y), y: ca[j].x - ca[i].x });
            axes.push({ x: -(cb[j].y - cb[i].y), y: cb[j].x - cb[i].x });
        }
        let separated = false;
        for (const ax of axes) {
            const len = Math.hypot(ax.x, ax.y);
            if (len < 0.001) continue;
            const nx = ax.x / len, ny = ax.y / len;
            let minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
            for (const p of ca) { const d = p.x * nx + p.y * ny; if (d < minA) minA = d; if (d > maxA) maxA = d; }
            for (const p of cb) { const d = p.x * nx + p.y * ny; if (d < minB) minB = d; if (d > maxB) maxB = d; }
            if (maxA < minB || maxB < minA) { separated = true; break; }
        }
        if (!separated) return true;
    }
    return false;
}
function spawnExplosion(tank) { if (!tank) return; const frameRect = getFrameRect(tank.nation, tank.tier, tank.vehicleClass); effects.push(new ExplosionEffect(tank.x, tank.y, getTankImage(tank.nation, tank.tier, tank.vehicleClass), frameRect, tank.nation)); playSound("assets/collide.wav"); }
function hasUnlockedAllTanks() {
    return nations.every(nation => {
        const arr = fieldTanks[nation] || [];
        return ["tank", "td"].every(vc =>
            Array.from({ length: 10 }, (_, i) =>
                arr.some(t => t.vehicleClass === vc && t.tier === i + 1)
            ).every(Boolean)
        );
    });
}

function maybeUnlockSecretTank() {
    if (hasUnlockedAllTanks() && !unlocked.has(SECRET_TANK_KEY)) {
        unlocked.add(SECRET_TANK_KEY);
        saveUnlockedTanks();
        renderNationDropdown();
        if (currentTechTreeNation === SECRET_TANK_NATION) renderTechTree(SECRET_TANK_NATION);
        updateUnlockCounter();
    }
}
function markUnlocked(nation, vehicleClass, tier, earnedWithoutAdmin = true) {
    const key = `${nation}:${vehicleClass}:${tier}`;
    if (!earnedWithoutAdmin || unlocked.has(key)) return;
    unlocked.add(key);
    if (vehicleClass === "tank" && tier === 10) {
        unlocked.add(`${nation}:td:1`);
        getTankImage(nation, 1, "td");
        getTankImage(nation, 2, "td");
    }
    saveUnlockedTanks();
    renderNationDropdown();
    if (currentTechTreeNation === nation) renderTechTree(nation);
    maybeUnlockSecretTank();
    updateUnlockCounter();
}

function getSpawnableVehicles() {
    const options = [];
    for (const nation of nations) {
        options.push({ nation, vehicleClass: "tank" });
        if (unlocked.has(`${nation}:tank:10`)) {
            options.push({ nation, vehicleClass: "td" });
        }
    }
    return options;
}

function toggleFieldMenu() {
    if (fieldMenu.classList.contains("open")) {
        closeFieldMenu();
    } else {
        openFieldMenu();
    }
}

function openFieldMenu() {
    renderFieldMenu();
    fieldMenu.classList.remove("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => fieldMenu.classList.add("open")));
}

function closeFieldMenu() {
    fieldMenu.classList.remove("open");
    window.setTimeout(() => { if (!fieldMenu.classList.contains("open")) fieldMenu.classList.add("hidden"); }, 300);
}

function renderFieldMenu() {
    fieldMenu.innerHTML = "";
    for (const nation of nations) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fieldMenuButton";
        btn.style.background = `url(assets/${nation}flag.png) center/cover no-repeat`;
        btn.setAttribute("aria-label", nation.toUpperCase());
        btn.title = nation.toUpperCase();
        btn.addEventListener("click", () => { closeFieldMenu(); switchToField(nation); });
        fieldMenu.appendChild(btn);
    }
    if (fieldTanks.battle.length > 0) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "fieldMenuButton";
        btn.textContent = "⚔";
        btn.style.fontSize = "24px";
        btn.style.background = "#222";
        btn.setAttribute("aria-label", "Battle");
        btn.title = "Battle";
        btn.addEventListener("click", () => { closeFieldMenu(); switchToField("battle"); });
        fieldMenu.appendChild(btn);
    }
}

function switchToField(nation) {
    cancelRename();
    fieldTanks[currentField || 'main'] = tanks;
    currentField = nation;
    tanks = fieldTanks[nation] || (fieldTanks[nation] = []);
    if (nation === "battle" && !playerBattleTank && tanks.length > 0) {
        playerBattleTank = tanks[0];
        camX = playerBattleTank.x;
        camY = playerBattleTank.y;
        if (battleWorldWidth) {
            const halfW = canvas.width / 2;
            const halfH = canvas.height / 2;
            if (battleWorldWidth <= canvas.width) camX = battleWorldWidth / 2;
            else camX = Math.max(halfW, Math.min(battleWorldWidth - halfW, camX));
            if (battleWorldHeight <= canvas.height) camY = battleWorldHeight / 2;
            else camY = Math.max(halfH, Math.min(battleWorldHeight - halfH, camY));
        }
    }
    if (nation === "battle") {
        trackCtx.clearRect(0, 0, trackCanvas.width, trackCanvas.height);
        trackFadeFrames = 0;
        battleChat.classList.remove('hidden');
        clickCounter.classList.add('hidden');
        unlockCounter.classList.add('hidden');
    } else {
        battleChat.classList.add('hidden');
        clickCounter.classList.remove('hidden');
        unlockCounter.classList.remove('hidden');
        speechBubbles = [];
    }
    updateExplodeButton();
    fieldButton.classList.add("hidden");
    fieldBackButton.classList.remove("hidden");
    closeFieldMenu();
}

function leaveField() {
    cancelRename();
    if (currentField === "battle") {
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'leave_battle' }));
        }
        if (ws) { ws.onclose = null; ws.close(); ws = null; }
        for (const tank of fieldTanks.battle) {
            if (!fieldTanks[tank.nation]) fieldTanks[tank.nation] = [];
            fieldTanks[tank.nation].push(tank);
        }
        fieldTanks.battle.length = 0;
        playerBattleTank = null;
        battleTracks = [];
        enemyPlayers = [];
        saveTanks();
        renderFieldMenu();
        if (cur