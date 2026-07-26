const API_BASE = window.location.origin;
const AUTH_TOKEN_KEY = 'tank-merge:auth-token';

function getToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}

async function apiFetch(path, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    try {
        const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
        const data = await res.json();
        return { ok: res.ok, data, status: res.status };
    } catch { return { ok: false, data: null, status: 0 }; }
}

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

let overrides = {};
let spawnOverrides = {};
let currentImage = null;
let imageLoaded = false;
let imgDisplayW = 0;
let imgDisplayH = 0;
let canvasOffsetX = 0;
let canvasOffsetY = 0;

const canvas = document.getElementById('tankCanvas');
const ctx = canvas.getContext('2d');

const nationSelect = document.getElementById('nationSelect');
const classSelect = document.getElementById('classSelect');
const tierSlider = document.getElementById('tierSlider');
const tierLabel = document.getElementById('tierLabel');
const assetName = document.getElementById('assetName');
const spawnX = document.getElementById('spawnX');
const spawnY = document.getElementById('spawnY');
const setFrontBtn = document.getElementById('setFrontBtn');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const overrideList = document.getElementById('overrideList');
const overrideCount = document.getElementById('overrideCount');
const imageInfo = document.getElementById('imageInfo');
const statusEl = document.getElementById('status');

let dragState = null;
let mouseDownOnSpawn = false;

function getCurrentKey() {
    return `${nationSelect.value}:${classSelect.value}:${tierSlider.value}`;
}

function getCurrentFilename() {
    const files = classSelect.value === 'td' ? tdFiles : tankFiles;
    return files[nationSelect.value]?.[parseInt(tierSlider.value) - 1] || null;
}

async function loadOverrides() {
    const result = await apiFetch('/api/admin/hitbox-overrides');
    if (result.ok && result.data) {
        overrides = result.data;
        spawnOverrides = overrides.spawn || {};
    } else {
        overrides = {};
        spawnOverrides = {};
    }
    renderOverrideList();
}

async function saveOverrides() {
    overrides.spawn = spawnOverrides;
    const result = await apiFetch('/api/admin/hitbox-overrides', {
        method: 'PUT',
        body: JSON.stringify(overrides)
    });
    if (result.ok) {
        statusEl.textContent = 'Saved at ' + new Date().toLocaleTimeString();
    } else {
        statusEl.textContent = 'Save failed!';
    }
}

function loadCurrentImage() {
    const fileName = getCurrentFilename();
    if (!fileName) {
        imageLoaded = false;
        currentImage = null;
        assetName.textContent = 'No asset found';
        renderCanvas();
        return;
    }
    assetName.textContent = fileName + '.png';
    if (currentImage && currentImage.dataset.file === fileName) {
        applyCurrentOverride();
        renderCanvas();
        return;
    }
    const img = new Image();
    img.dataset.file = fileName;
    img.onload = () => {
        currentImage = img;
        imageLoaded = true;
        applyCurrentOverride();
        renderCanvas();
    };
    img.onerror = () => {
        imageLoaded = false;
        currentImage = null;
        renderCanvas();
    };
    img.src = `assets/${fileName}.png`;
}

function applyCurrentOverride() {
    const key = getCurrentKey();
    const sp = spawnOverrides[key];
    if (sp) {
        spawnX.value = sp.sx;
        spawnY.value = sp.sy;
    } else {
        spawnX.value = '0.5';
        spawnY.value = '0';
    }
}

function getDefaultSpawn() {
    const key = getCurrentKey();
    const hb = overrides[key];
    if (hb) {
        return { sx: hb.x + hb.w / 2, sy: hb.y };
    }
    return { sx: 0.5, sy: 0 };
}

function renderCanvas() {
    const panel = document.getElementById('canvasPanel');
    const panelRect = panel.getBoundingClientRect();
    const cw = panelRect.width - 20;
    const ch = panelRect.height - 20;
    canvas.width = Math.max(100, cw);
    canvas.height = Math.max(100, ch);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0a0f0d';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (!imageLoaded || !currentImage) {
        ctx.fillStyle = '#3a4a3a';
        ctx.font = '16px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('No image loaded', canvas.width / 2, canvas.height / 2);
        return;
    }

    const imgW = currentImage.naturalWidth || 64;
    const imgH = currentImage.naturalHeight || 64;
    const maxW = canvas.width * 0.85;
    const maxH = canvas.height * 0.85;
    const scale = Math.min(maxW / imgW, maxH / imgH, 5);
    const drawW = imgW * scale;
    const drawH = imgH * scale;
    imgDisplayW = drawW;
    imgDisplayH = drawH;
    canvasOffsetX = (canvas.width - drawW) / 2;
    canvasOffsetY = (canvas.height - drawH) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(currentImage, canvasOffsetX, canvasOffsetY, drawW, drawH);

    const ox = parseFloat(spawnX.value) || 0.5;
    const oy = parseFloat(spawnY.value) || 0;
    const spPx = canvasOffsetX + ox * drawW;
    const spPy = canvasOffsetY + oy * drawH;

    ctx.save();
    ctx.shadowBlur = 8;
    ctx.shadowColor = 'rgba(0,0,0,0.9)';
    ctx.strokeStyle = '#ff6644';
    ctx.fillStyle = '#ff4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(spPx, spPy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spPx - 14, spPy);
    ctx.lineTo(spPx + 14, spPy);
    ctx.moveTo(spPx, spPy - 14);
    ctx.lineTo(spPx, spPy + 14);
    ctx.stroke();
    ctx.restore();

    ctx.fillStyle = 'rgba(20,20,20,0.8)';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    const sText = `spawn (${(ox * 100).toFixed(1)}%, ${(oy * 100).toFixed(1)}%)`;
    const tm = ctx.measureText(sText);
    const bx = spPx + 14;
    const by = spPy - 4;
    ctx.fillRect(bx - 4, by - tm.actualBoundingBoxAscent - 2, tm.width + 8, tm.actualBoundingBoxAscent + tm.actualBoundingBoxDescent + 4);
    ctx.fillStyle = '#ff8866';
    ctx.fillText(sText, bx, by);

    imageInfo.textContent = `${currentImage.dataset.file}.png  |  drag the crosshair to position the bullet spawn point`;
}

function pixelToImage(px, py) {
    if (imgDisplayW === 0 || imgDisplayH === 0) return null;
    return {
        x: (px - canvasOffsetX) / imgDisplayW,
        y: (py - canvasOffsetY) / imgDisplayH,
    };
}

canvas.addEventListener('mousedown', (e) => {
    if (!imageLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const sx = parseFloat(spawnX.value) || 0.5;
    const sy = parseFloat(spawnY.value) || 0;
    const spPx = canvasOffsetX + sx * imgDisplayW;
    const spPy = canvasOffsetY + sy * imgDisplayH;
    if (Math.hypot(mx - spPx, my - spPy) < 16) {
        mouseDownOnSpawn = true;
        dragState = { type: 'spawn', startX: mx, startY: my };
        return;
    }
    const pt = pixelToImage(mx, my);
    if (pt && pt.x >= 0 && pt.x <= 1 && pt.y >= 0 && pt.y <= 1) {
        mouseDownOnSpawn = true;
        dragState = { type: 'spawn', startX: mx, startY: my };
        spawnX.value = pt.x.toFixed(4);
        spawnY.value = pt.y.toFixed(4);
        renderCanvas();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const pt = pixelToImage(mx, my);
    if (pt) {
        spawnX.value = Math.max(-0.1, Math.min(1.1, pt.x)).toFixed(4);
        spawnY.value = Math.max(-0.1, Math.min(1.1, pt.y)).toFixed(4);
        renderCanvas();
    }
});

canvas.addEventListener('mouseup', () => { dragState = null; mouseDownOnSpawn = false; });
canvas.addEventListener('mouseleave', () => { dragState = null; mouseDownOnSpawn = false; });

[spawnX, spawnY].forEach(el => el.addEventListener('input', () => { if (imageLoaded) renderCanvas(); }));

tierSlider.addEventListener('input', () => {
    tierLabel.textContent = tierSlider.value;
    loadCurrentImage();
});

nationSelect.addEventListener('change', loadCurrentImage);
classSelect.addEventListener('change', loadCurrentImage);

setFrontBtn.addEventListener('click', () => {
    const def = getDefaultSpawn();
    spawnX.value = def.sx.toFixed(4);
    spawnY.value = def.sy.toFixed(4);
    renderCanvas();
});

saveBtn.addEventListener('click', async () => {
    const key = getCurrentKey();
    spawnOverrides[key] = {
        sx: parseFloat(spawnX.value) || 0.5,
        sy: parseFloat(spawnY.value) || 0,
    };
    await saveOverrides();
    renderOverrideList();
    renderCanvas();
});

deleteBtn.addEventListener('click', async () => {
    const key = getCurrentKey();
    if (spawnOverrides[key]) {
        delete spawnOverrides[key];
        await saveOverrides();
        spawnX.value = '0.5';
        spawnY.value = '0';
        renderOverrideList();
        renderCanvas();
    }
});

function renderOverrideList() {
    const keys = Object.keys(spawnOverrides);
    overrideCount.textContent = `(${keys.length})`;
    if (keys.length === 0) {
        overrideList.innerHTML = '<div class="empty-overrides">No spawn overrides saved yet.</div>';
        return;
    }
    overrideList.innerHTML = '';
    for (const key of keys) {
        const sp = spawnOverrides[key];
        const div = document.createElement('div');
        div.className = 'override-item';
        div.innerHTML = `
            <span class="key">${key}</span>
            <span class="vals">sx:${sp.sx.toFixed(3)} sy:${sp.sy.toFixed(3)}</span>
            <button class="del-btn" title="Delete">&times;</button>
        `;
        div.querySelector('.key').addEventListener('click', () => navigateToKey(key));
        div.querySelector('.del-btn').addEventListener('click', async () => {
            delete spawnOverrides[key];
            await saveOverrides();
            renderOverrideList();
            if (getCurrentKey() === key) {
                spawnX.value = '0.5';
                spawnY.value = '0';
                renderCanvas();
            }
        });
        overrideList.appendChild(div);
    }
}

function navigateToKey(key) {
    const parts = key.split(':');
    if (parts.length === 3) {
        nationSelect.value = parts[0];
        classSelect.value = parts[1];
        tierSlider.value = parts[2];
        tierLabel.textContent = parts[2];
        loadCurrentImage();
    }
}

document.getElementById('backToGame').addEventListener('click', () => { window.location.href = '/'; });
document.getElementById('backToAdmin').addEventListener('click', () => { window.location.href = '/admin.html'; });

async function init() {
    statusEl.textContent = 'Checking auth...';
    const me = await apiFetch('/api/auth/me');
    if (!me.ok || !me.data || !me.data.user || !me.data.user.is_admin) {
        document.querySelector('#editorLayout').innerHTML = '<div style="padding:40px;text-align:center;color:#c06060;">Access denied. You need admin privileges.<br><br><a href="/admin.html" style="color:#80b090;">Back to Admin Dashboard</a></div>';
        statusEl.textContent = 'Not authorized';
        return;
    }
    statusEl.textContent = 'Loading...';
    await loadOverrides();
    loadCurrentImage();
    statusEl.textContent = 'Ready';
}

init();