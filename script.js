const canvas = document.getElementById("battlefield");
const ctx = canvas.getContext("2d");
ctx.imageSmoothingEnabled = false;

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
let engineMuted = false;
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
const techTreePanel = document.getElementById("techTreePanel");
const techTreeTitle = document.getElementById("techTreeTitle");
const closeTechTreeButton = document.getElementById("closeTechTreeButton");
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
const muteEngineButton = document.getElementById("muteEngineButton");
const adminPassword = document.getElementById("adminPassword");
const adminError = document.getElementById("adminError");
const confirmAdminButton = document.getElementById("confirmAdminButton");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const TRACK_RENDER_SCALE = 0.5;
const trackCanvas = document.createElement("canvas");
const trackCtx = trackCanvas.getContext("2d");
trackCanvas.width = Math.ceil(canvas.width * TRACK_RENDER_SCALE);
trackCanvas.height = Math.ceil(canvas.height * TRACK_RENDER_SCALE);
trackCtx.setTransform(TRACK_RENDER_SCALE, 0, 0, TRACK_RENDER_SCALE, 0, 0);
let trackFadeFrames = 0;

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
    germany: { tank: { 1: 16, 2: 8, 9: -8, 10: 48 }, td: { 1: 12, 8: 24, 10: 48 } },
    ussr: { tank: { 5: -8, 6: 12, 7: -20, 8: -20, 9: -22, 10: -16 }, td: { 5: 10, 9: -20, 10: -20 } },
    usa: { tank: { 5: 36, 6: 36, 8: 16, 9: 20, 10: 24 }, td: { 7: 20, 8: -20 } }
};
const nationSizeScale = { ussr: 1.3, usa: 1.15 };
const SECRET_TANK_NATION = "ratte";
const SECRET_TANK_TIER = 11;
const SECRET_TANK_KEY = `${SECRET_TANK_NATION}:${SECRET_TANK_TIER}`;

let mouse = { x: -1000, y: -1000 };
let tanks = [];
let effects = [];
let isPaused = false;
let adminMode = false;
const ADMIN_STORAGE_KEY = "tank-merge:admin-mode";
function loadAdminMode() { try { adminMode = localStorage.getItem(ADMIN_STORAGE_KEY) === "true"; } catch {} }
function saveAdminMode() { try { localStorage.setItem(ADMIN_STORAGE_KEY, adminMode ? "true" : "false"); } catch {} }
loadAdminMode();
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

function saveUnlockedTanks() {
    try {
        localStorage.setItem(UNLOCKS_STORAGE_KEY, JSON.stringify([...unlocked]));
    } catch {
        // The game remains playable if browser storage is unavailable.
    }
}

const TANK_SAVE_PROPS = ["nation", "tier", "x", "y", "angle", "adminSpawned", "vehicleClass"];
function saveTanks() {
    try {
        localStorage.setItem(TANKS_STORAGE_KEY, JSON.stringify(tanks.map((t) => {
            const obj = {};
            for (const prop of TANK_SAVE_PROPS) obj[prop] = t[prop];
            return obj;
        })));
    } catch {
        // The game remains playable if browser storage is unavailable.
    }
}
function loadTanks() {
    try {
        const saved = JSON.parse(localStorage.getItem(TANKS_STORAGE_KEY) || "[]");
        if (!Array.isArray(saved)) return;
        for (const data of saved) {
            tanks.push(new Tank(data.nation, data.tier, data.x, data.y, data.adminSpawned, data.angle, data.vehicleClass || "tank"));
        }
    } catch {
        // The game remains playable if browser storage is unavailable.
    }
}

for (const nation of nations) {
    unlocked.add(`${nation}:tank:1`);
}
saveUnlockedTanks();

const background = new Image();
background.src = "assets/field.png";

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

function getTankImage(nation, tier, vehicleClass = "tank") {
    const key = `${nation}:${vehicleClass}:${tier}`;
    if (!tankImages[key]) {
        const img = new Image();
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

function spawnMergeEffect(x, y, nation) {
    effects.push(new StarEffect(x, y));
    playSound("assets/merge.wav");
}

function drawTrackSegment(fromX, fromY, toX, toY, tankWidth) {
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
        this.nation = nation; this.tier = tier; this.x = x; this.y = y; this.baseSpeed = 1.2 + Math.random() * 1.0; this.speed = this.baseSpeed; this.angle = angle ?? Math.random() * Math.PI * 2; this.adminSpawned = adminSpawned; this.vehicleClass = vehicleClass;
        this.lastTrackX = x;
        this.lastTrackY = y;
        this.labelName = getTankName(nation, tier, vehicleClass);
        this.labelTier = "Tier " + tier;
        ctx.save();
        ctx.font = "11px sans-serif";
        this.labelBoxWidth = Math.max(ctx.measureText(this.labelName).width, ctx.measureText(this.labelTier).width) + 12;
        ctx.restore();
    }
    getLabelText() {
        return [this.labelName, this.labelTier];
    }
    getDisplayWidth() { return this.tier === SECRET_TANK_TIER ? 162 : Math.round((this.tier * 8 + 42) * (nationSizeScale[this.nation] ?? 1)) + (tierSizeOverrides[this.nation]?.[this.vehicleClass]?.[this.tier] ?? 0); }
    getCollisionRadius() { return this.tier === SECRET_TANK_TIER ? 216 : this.getDisplayWidth() / 2; }
    getWallPadding() { return this.getDisplayWidth() / 2 + 3; }
    update() {
        const dx = this.x - mouse.x; const dy = this.y - mouse.y; const distance = Math.sqrt(dx * dx + dy * dy);
        const isScared = distance < 150;
        if (isScared) {
            const targetAngle = Math.atan2(dy, dx);
            let diff = targetAngle - this.angle;
            while (diff > Math.PI) diff -= Math.PI * 2;
            while (diff < -Math.PI) diff += Math.PI * 2;
            const turnSpeed = 0.07;
            this.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed);
            this.speed = Math.min(3, this.speed + 0.08);
        } else {
            if (this.speed < this.baseSpeed) this.speed = Math.min(this.baseSpeed, this.speed + 0.03);
            else if (this.speed > this.baseSpeed) this.speed = Math.max(this.baseSpeed, this.speed - 0.03);
        }
        this.x += Math.cos(this.angle) * this.speed; this.y += Math.sin(this.angle) * this.speed;
        const hw = this.getDisplayWidth() / 2;
        if (this.x < -hw) { this.x += canvas.width; this.lastTrackX = this.x; this.lastTrackY = this.y; }
        if (this.x > canvas.width + hw) { this.x -= canvas.width; this.lastTrackX = this.x; this.lastTrackY = this.y; }
        if (this.y < -hw) { this.y += canvas.height; this.lastTrackX = this.x; this.lastTrackY = this.y; }
        if (this.y > canvas.height + hw) { this.y -= canvas.height; this.lastTrackX = this.x; this.lastTrackY = this.y; }
        if (this.x !== this.lastTrackX || this.y !== this.lastTrackY) {
            if (isScared) drawTrackSegment(this.lastTrackX, this.lastTrackY, this.x, this.y, this.getDisplayWidth());
            this.lastTrackX = this.x;
            this.lastTrackY = this.y;
        }
    }
    drawLabel(x, y, displayHeight) {
        const [name, tier] = this.getLabelText();
        ctx.save(); ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const boxWidth = this.labelBoxWidth;
        const boxHeight = 32;
        ctx.translate(x, y - displayHeight / 2 - 24);
        ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        ctx.beginPath();
        ctx.roundRect(-boxWidth / 2, -boxHeight / 2, boxWidth, boxHeight, 5);
        ctx.fill();
        ctx.fillStyle = "#f6f6f6";
        ctx.fillText(name, 0, -7);
        ctx.fillText(tier, 0, 7);
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
        const wrapX = this.x - hw < 0 ? canvas.width : this.x + hw > canvas.width ? -canvas.width : 0;
        const wrapY = this.y - hh < 0 ? canvas.height : this.y + hh > canvas.height ? -canvas.height : 0;
        if (wrapX) draws.push({ x: this.x + wrapX, y: this.y });
        if (wrapY) draws.push({ x: this.x, y: this.y + wrapY });
        if (wrapX && wrapY) draws.push({ x: this.x + wrapX, y: this.y + wrapY });
        for (const d of draws) {
            const tankImage = getTankImage(this.nation, this.tier, this.vehicleClass);
            ctx.save();
            ctx.translate(d.x, d.y);
            ctx.rotate(this.angle + Math.PI / 2);
            if (tankImage.complete && tankImage.naturalWidth > 0) {
                ctx.drawImage(tankImage, frameRect.sx, frameRect.sy, frameRect.sw, frameRect.sh, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
            } else {
                ctx.fillStyle = tankColors[this.nation] || "#ffffff";
                ctx.fillRect(-displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
            }
            ctx.restore();
            this.drawLabel(d.x, d.y, displayHeight);
        }
    }
}

function spawnTank(x, y) { const nation = nations[Math.floor(Math.random() * nations.length)]; tanks.push(new Tank(nation, 1, x, y)); }
function collide(a, b) { const dx = Math.abs(a.x - b.x); const dy = Math.abs(a.y - b.y); return Math.hypot(Math.min(dx, canvas.width - dx), Math.min(dy, canvas.height - dy)) < a.getCollisionRadius() + b.getCollisionRadius(); }
function spawnExplosion(tank) { if (!tank) return; const frameRect = getFrameRect(tank.nation, tank.tier, tank.vehicleClass); effects.push(new ExplosionEffect(tank.x, tank.y, getTankImage(tank.nation, tank.tier, tank.vehicleClass), frameRect, tank.nation)); playSound("assets/collide.wav"); }
function hasUnlockedAllTanks() {
    return nations.every(nation =>
        ["tank", "td"].every(vehicleClass =>
            Array.from({ length: 10 }, (_, i) =>
                unlocked.has(`${nation}:${vehicleClass}:${i + 1}`)
            ).every(Boolean)
        )
    );
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
        // Unlocking a nation's top-tier tank opens up its tank destroyer line.
        unlocked.add(`${nation}:td:1`);
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

function renderNationDropdown() {
    nationDropdown.innerHTML = "";
    for (const nation of nations) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nationIconButton";
        btn.style.background = tankColors[nation];
        btn.setAttribute("aria-label", nation.toUpperCase());
        btn.title = nation.toUpperCase();
        btn.addEventListener("click", () => openTechTree(nation));
        nationDropdown.appendChild(btn);
    }
    if (unlocked.has(SECRET_TANK_KEY) || adminMode) {
        const secretBtn = document.createElement("button");
        secretBtn.type = "button";
        secretBtn.className = "nationIconButton secretIconButton";
        secretBtn.textContent = "?";
        secretBtn.setAttribute("aria-label", "Secret tank");
        secretBtn.title = "???";
        secretBtn.addEventListener("click", () => openTechTree(SECRET_TANK_NATION));
        nationDropdown.appendChild(secretBtn);
    }
}

function buildUnlockSlot(nation, tier, vehicleClass) {
    const key = `${nation}:${vehicleClass}:${tier}`;
    const isUnlocked = unlocked.has(key);
    const names = vehicleClass === "td" ? tdNames : tankNames;
    const files = vehicleClass === "td" ? tdFiles : tankFiles;
    const slot = document.createElement("div");
    slot.className = "unlockSlot";
    const label = document.createElement("div");
    label.textContent = names[nation]?.[tier - 1] || `Tier ${tier}`;
    slot.appendChild(label);
    if (isUnlocked || adminMode) {
        const img = document.createElement("img");
        const file = files[nation]?.[tier - 1];
        if (file) img.src = `assets/${file}.png`;
        img.alt = names[nation]?.[tier - 1] || `Tier ${tier}`;
        slot.appendChild(img);
    } else {
        const lock = document.createElement("div");
        lock.className = "lockIcon";
        lock.textContent = "🔒";
        slot.appendChild(lock);
    }
    if (adminMode) {
        slot.className += " adminClickable";
        slot.addEventListener("click", () => {
            const x = canvas.width * (0.2 + Math.random() * 0.6);
            const y = canvas.height * (0.2 + Math.random() * 0.6);
            tanks.push(new Tank(nation, tier, x, y, false, undefined, vehicleClass));
            saveTanks();
        });
    }
    return slot;
}

function renderTechTree(nation) {
    currentTechTreeNation = nation;
    techTreeTanksRow.innerHTML = "";
    techTreeDestroyersRow.innerHTML = "";
    if (nation === SECRET_TANK_NATION) {
        techTreeTitle.textContent = "???";
        techTreeTitle.style.background = tankColors.ratte;
        techTreeTanksLabel.textContent = "Secret Tank";
        techTreeDestroyersLabel.classList.add("hidden");
        techTreeDestroyersRow.classList.add("hidden");
        const slot = document.createElement("div");
        slot.className = "unlockSlot";
        const label = document.createElement("div");
        label.textContent = "Ratte";
        slot.appendChild(label);
        const img = document.createElement("img");
        img.src = "assets/ratte.png";
        img.alt = "Ratte";
        slot.appendChild(img);
        if (adminMode) {
            slot.className += " adminClickable";
            slot.addEventListener("click", () => {
                const x = canvas.width * (0.2 + Math.random() * 0.6);
                const y = canvas.height * (0.2 + Math.random() * 0.6);
                tanks.push(new Tank(SECRET_TANK_NATION, SECRET_TANK_TIER, x, y));
                saveTanks();
            });
        }
        techTreeTanksRow.appendChild(slot);
        return;
    }
    techTreeTitle.textContent = nation.toUpperCase();
    techTreeTitle.style.background = tankColors[nation];
    techTreeTanksLabel.textContent = "Tanks";
    techTreeDestroyersLabel.classList.remove("hidden");
    techTreeDestroyersRow.classList.remove("hidden");
    for (let tier = 1; tier <= 10; tier += 1) {
        techTreeTanksRow.appendChild(buildUnlockSlot(nation, tier, "tank"));
        techTreeDestroyersRow.appendChild(buildUnlockSlot(nation, tier, "td"));
    }
}

function openTechTree(nation) {
    renderTechTree(nation);
    techTreePanel.classList.remove("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => techTreePanel.classList.add("open")));
    closeNationDropdown();
}

function closeTechTreePanel() {
    techTreePanel.classList.remove("open");
    window.setTimeout(() => { if (!techTreePanel.classList.contains("open")) techTreePanel.classList.add("hidden"); }, 340);
    currentTechTreeNation = null;
}

function openNationDropdown() {
    renderNationDropdown();
    nationDropdown.classList.remove("hidden");
    requestAnimationFrame(() => requestAnimationFrame(() => nationDropdown.classList.add("open")));
}

function closeNationDropdown() {
    nationDropdown.classList.remove("open");
    window.setTimeout(() => { if (!nationDropdown.classList.contains("open")) nationDropdown.classList.add("hidden"); }, 300);
}

function toggleNationDropdown() {
    if (nationDropdown.classList.contains("open")) closeNationDropdown();
    else openNationDropdown();
}

function handleCollision(a, b, firstIndex, secondIndex) {
    const aIsRatte = a.nation === SECRET_TANK_NATION && a.tier === SECRET_TANK_TIER;
    const bIsRatte = b.nation === SECRET_TANK_NATION && b.tier === SECRET_TANK_TIER;
    if (aIsRatte || bIsRatte) {
        if (aIsRatte && bIsRatte) {
            spawnExplosion(a); spawnExplosion(b); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1);
        } else if (aIsRatte) {
            spawnExplosion(b); tanks.splice(secondIndex, 1);
        } else {
            spawnExplosion(a); tanks.splice(firstIndex, 1);
        }
        return 1;
    }
    if (a.nation === b.nation) {
        if (a.vehicleClass === b.vehicleClass && a.tier === b.tier && a.tier < 10) {
            spawnMergeEffect(a.x, a.y, a.nation); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1);
            tanks.push(new Tank(a.nation, a.tier + 1, a.x, a.y, a.adminSpawned || b.adminSpawned, undefined, a.vehicleClass));
            markUnlocked(a.nation, a.vehicleClass, a.tier + 1);
            return 1;
        }
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        if (Math.abs(dx) > canvas.width / 2) dx -= Math.sign(dx) * canvas.width;
        if (Math.abs(dy) > canvas.height / 2) dy -= Math.sign(dy) * canvas.height;
        const dist = Math.hypot(dx, dy);
        if (dist > 0.01) {
            const angle = Math.atan2(dy, dx);
            const overlap = a.getCollisionRadius() + b.getCollisionRadius() - dist;
            if (overlap > 0) {
                const push = Math.min(overlap / 2, 2);
                a.x -= Math.cos(angle) * push;
                a.y -= Math.sin(angle) * push;
                b.x += Math.cos(angle) * push;
                b.y += Math.sin(angle) * push;
                const clamp = (tank) => {
                    const hw = tank.getDisplayWidth() / 2;
                    tank.x = Math.max(-hw, Math.min(canvas.width + hw, tank.x));
                    tank.y = Math.max(-hw, Math.min(canvas.height + hw, tank.y));
                };
                clamp(a); clamp(b);
                a.speed *= 0.5; b.speed *= 0.5;
                const turnSpeed = 0.06;
                for (const [tank, target] of [[a, angle + Math.PI], [b, angle]]) {
                    let diff = target - tank.angle;
                    while (diff > Math.PI) diff -= Math.PI * 2;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    tank.angle += Math.sign(diff) * Math.min(Math.abs(diff), turnSpeed);
                }
            }
        }
        return 2;
    }
    if (a.nation !== b.nation) {
        if (a.tier === b.tier && a.vehicleClass !== b.vehicleClass) {
            // At equal tiers, a tank destroyer beats a regular tank.
            if (a.vehicleClass === "td") { spawnExplosion(b); tanks.splice(secondIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); }
            else { spawnExplosion(a); tanks.splice(firstIndex, 1); markUnlocked(b.nation, b.vehicleClass, b.tier); }
        } else if (a.tier > b.tier) { spawnExplosion(b); tanks.splice(secondIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); }
        else if (b.tier > a.tier) { spawnExplosion(a); tanks.splice(firstIndex, 1); markUnlocked(b.nation, b.vehicleClass, b.tier); }
        else { spawnExplosion(a); spawnExplosion(b); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); markUnlocked(b.nation, b.vehicleClass, b.tier); }
        return 1;
    }
    return 0;
}

function handleCollisions() {
    const cellSize = 432;
    const numCellsX = Math.ceil(canvas.width / cellSize);
    const numCellsY = Math.ceil(canvas.height / cellSize);
    let limit = 30;
    while (limit-- > 0) {
        const cells = new Map();
        tanks.forEach((tank, index) => {
            let cellX = Math.floor(tank.x / cellSize) % numCellsX;
            let cellY = Math.floor(tank.y / cellSize) % numCellsY;
            if (cellX < 0) cellX += numCellsX;
            if (cellY < 0) cellY += numCellsY;
            const key = `${cellX},${cellY}`;
            if (!cells.has(key)) cells.set(key, []);
            cells.get(key).push(index);
        });
        let handled = false;
        for (let i = 0; i < tanks.length && !handled; i += 1) {
            const a = tanks[i];
            let cellX = Math.floor(a.x / cellSize) % numCellsX;
            let cellY = Math.floor(a.y / cellSize) % numCellsY;
            if (cellX < 0) cellX += numCellsX;
            if (cellY < 0) cellY += numCellsY;
            for (let offsetY = -1; offsetY <= 1 && !handled; offsetY += 1) {
                for (let offsetX = -1; offsetX <= 1 && !handled; offsetX += 1) {
                    const checkX = (cellX + offsetX + numCellsX) % numCellsX;
                    const checkY = (cellY + offsetY + numCellsY) % numCellsY;
                    const nearby = cells.get(`${checkX},${checkY}`) || [];
                    for (const j of nearby) {
                        if (j <= i) continue;
                        const b = tanks[j];
                        const result = collide(a, b) && handleCollision(a, b, i, j);
                        if (result) {
                            saveTanks();
                            if (result === 1) handled = true;
                            break;
                        }
                    }
                }
            }
        }
        if (!handled) break;
    }
}

function drawBackground() { if (background.complete && background.naturalWidth > 0) { ctx.drawImage(background, 0, 0, canvas.width, canvas.height); return; } const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height); gradient.addColorStop(0, "#5c7c2f"); gradient.addColorStop(1, "#2e4b29"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height); }

function animate() { ctx.clearRect(0, 0, canvas.width, canvas.height); drawBackground(); updateEngineSound(); if (!isPaused) { fadeTracks(); tanks.forEach((tank) => tank.update()); } if (trackFadeFrames > 0) { ctx.save(); ctx.imageSmoothingEnabled = true; ctx.drawImage(trackCanvas, 0, 0, canvas.width, canvas.height); ctx.restore(); } tanks.forEach((tank) => tank.draw()); if (!isPaused) { handleCollisions(); effects.forEach((effect) => effect.update()); effects = effects.filter((effect) => (effect.particles && effect.particles.length > 0) || (effect.smoke && effect.smoke.length > 0) || (effect.risingSmoke && effect.risingSmoke.length > 0) || (effect.stars && effect.stars.length > 0)); } effects.forEach((effect) => effect.draw()); requestAnimationFrame(animate); }

loadTanks();
updateAdminButton();
renderNationDropdown();
updateUnlockCounter();
animate();

canvas.addEventListener("mousemove", (event) => { mouse.x = event.clientX; mouse.y = event.clientY; });
canvas.addEventListener("click", (event) => {
    startEngine();
    spawnCount++;
    clickCounter.textContent = "Spawns: " + spawnCount;
    try { localStorage.setItem(SPAWN_COUNT_KEY, spawnCount); } catch {}
    const options = getSpawnableVehicles();
    const choice = options[Math.floor(Math.random() * options.length)];
    tanks.push(new Tank(choice.nation, 1, event.clientX, event.clientY, false, undefined, choice.vehicleClass));
    saveTanks();
});

function showDialog(dialog) { dialog.classList.remove("hidden"); isPaused = true; }
function hideDialog(dialog) { dialog.classList.add("hidden"); }
function closeAllDialogs() {
    hideDialog(pauseDialog); hideDialog(explodeDialog); hideDialog(resetDialog); hideDialog(adminDialog);
    adminError.classList.add("hidden"); adminPassword.value = "";
    isPaused = false;
}

unlockToggleButton.addEventListener("click", () => {
    toggleNationDropdown();
});

closeTechTreeButton.addEventListener("click", () => { closeTechTreePanel(); });

document.addEventListener("click", (event) => {
    if (nationDropdown.classList.contains("open") &&
        !nationDropdown.contains(event.target) &&
        !unlockToggleButton.contains(event.target)) {
        closeNationDropdown();
    }
});

pauseButton.addEventListener("click", () => { if (!isPaused) showDialog(pauseDialog); else closeAllDialogs(); });
resumeButton.addEventListener("click", closeAllDialogs);

openExplodeDialogButton.addEventListener("click", () => { showDialog(explodeDialog); hideDialog(pauseDialog); });
openResetDialogButton.addEventListener("click", () => { showDialog(resetDialog); hideDialog(pauseDialog); });
function updateAdminButton() {
    openAdminDialogButton.textContent = adminMode ? "Disable admin mode" : "Enable admin mode";
}

muteEngineButton.addEventListener("click", () => {
    engineMuted = !engineMuted;
    muteEngineButton.textContent = engineMuted ? "Unmute engines" : "Mute engines";
});

openAdminDialogButton.addEventListener("click", () => {
    if (adminMode) {
        adminMode = false; saveAdminMode(); renderNationDropdown(); if (currentTechTreeNation) renderTechTree(currentTechTreeNation); closeAllDialogs(); updateAdminButton();
    } else {
        showDialog(adminDialog); hideDialog(pauseDialog);
    }
});

document.querySelectorAll(".cancelDialogButton").forEach((button) => {
    button.addEventListener("click", () => { closeAllDialogs(); });
});

confirmExplodeButton.addEventListener("click", () => {
    tanks.forEach((tank) => spawnExplosion(tank));
    tanks = [];
    saveTanks(); closeAllDialogs();
});

confirmResetButton.addEventListener("click", () => {
    unlocked = new Set(); for (const nation of nations) unlocked.add(`${nation}:tank:1`);
    saveUnlockedTanks(); tanks = []; effects = []; saveTanks(); closeAllDialogs();
    renderNationDropdown();
    if (currentTechTreeNation) renderTechTree(currentTechTreeNation);
    spawnCount = 0;
    clickCounter.textContent = "Spawns: 0";
    try { localStorage.setItem(SPAWN_COUNT_KEY, 0); } catch {}
    updateUnlockCounter();
});

adminPassword.addEventListener("input", () => adminError.classList.add("hidden"));
confirmAdminButton.addEventListener("click", () => {
    const pw = adminPassword.value.trim();
    if (pw === "1337") {
        adminMode = true; saveAdminMode(); adminError.classList.add("hidden");
        updateAdminButton(); renderNationDropdown(); if (currentTechTreeNation) renderTechTree(currentTechTreeNation); closeAllDialogs();
    } else {
        adminError.classList.remove("hidden");
    }
});

document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (!pauseDialog.classList.contains("hidden") || !explodeDialog.classList.contains("hidden") || !resetDialog.classList.contains("hidden") || !adminDialog.classList.contains("hidden")) {
            closeAllDialogs();
        } else if (techTreePanel.classList.contains("open")) {
            closeTechTreePanel();
        } else if (nationDropdown.classList.contains("open")) {
            closeNationDropdown();
        }
    }
});

window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; trackCanvas.width = Math.ceil(canvas.width * TRACK_RENDER_SCALE); trackCanvas.height = Math.ceil(canvas.height * TRACK_RENDER_SCALE); trackCtx.setTransform(TRACK_RENDER_SCALE, 0, 0, TRACK_RENDER_SCALE, 0, 0); trackFadeFrames = 0; });
