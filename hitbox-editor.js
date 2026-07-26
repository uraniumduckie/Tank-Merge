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
let currentImage = null;
let imageLoaded = false;
let canvasScale = 1;
let canvasOffsetX = 0;
let canvasOffsetY = 0;
let imgDisplayW = 0;
let imgDisplayH = 0;

const canvas = document.getElementById('tankCanvas');
const ctx = canvas.getContext('2d');

const nationSelect = document.getElementById('nationSelect');
const classSelect = document.getElementById('classSelect');
const tierSlider = document.getElementById('tierSlider');
const tierLabel = document.getElementById('tierLabel');
const assetName = document.getElementById('assetName');
const hbX = document.getElementById('hbX');
const hbY = document.getElementById('hbY');
const hbW = document.getElementById('hbW');
const hbH = document.getElementById('hbH');
const dimPixels = document.getElementById('dimPixels');
const imageInfo = document.getElementById('imageInfo');
const saveBtn = document.getElementById('saveBtn');
const deleteBtn = document.getElementById('deleteBtn');
const codeBtn = document.getElementById('codeBtn');
const resetBtn = document.getElementById('resetBtn');
const overrideList = document.getElementById('overrideList');
const overrideCount = document.getElementById('overrideCount');
const codeOutput = document.getElementById('codeOutput');
const codeContent = document.getElementById('codeContent');
const overlay = document.getElementById('overlay');
const copyCode = document.getElementById('copyCode');
const closeCode = document.getElementById('closeCode');
const statusEl = document.getElementById('status');

let dragState = null;

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
    } else {
        overrides = {};
    }
    renderOverrideList();
}

async function saveOverrides() {
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

function computeAutoHitbox(img) {
    const c = document.createElement("canvas");
    c.width = img.naturalWidth || 64;
    c.height = img.naturalHeight || 64;
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
    return {
        x: minX / c.width,
        y: minY / c.height,
        w: (maxX - minX + 1) / c.width,
        h: (maxY - minY + 1) / c.height,
    };
}

function applyCurrentOverride() {
    const key = getCurrentKey();
    if (overrides[key]) {
        const hb = overrides[key];
        hbX.value = hb.x;
        hbY.value = hb.y;
        hbW.value = hb.w;
        hbH.value = hb.h;
    } else {
        setAutoHitbox();
    }
}

function setAutoHitbox() {
    if (imageLoaded && currentImage) {
        const auto = computeAutoHitbox(currentImage);
        hbX.value = auto.x.toFixed(4);
        hbY.value = auto.y.toFixed(4);
        hbW.value = auto.w.toFixed(4);
        hbH.value = auto.h.toFixed(4);
    } else {
        hbX.value = '0';
        hbY.value = '0';
        hbW.value = '1';
        hbH.value = '1';
    }
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
    canvasScale = scale;
    canvasOffsetX = (canvas.width - drawW) / 2;
    canvasOffsetY = (canvas.height - drawH) / 2;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(currentImage, canvasOffsetX, canvasOffsetY, drawW, drawH);

    dimPixels.textContent = `Image: ${imgW} x ${imgH} px`;

    const ox = parseFloat(hbX.value) || 0;
    const oy = parseFloat(hbY.value) || 0;
    const ow = parseFloat(hbW.value) || 1;
    const oh = parseFloat(hbH.value) || 1;

    const hbXPx = canvasOffsetX + ox * drawW;
    const hbYPx = canvasOffsetY + oy * drawH;
    const hbWPx = ow * drawW;
    const hbHPx = oh * drawH;

    ctx.strokeStyle = 'rgba(0, 255, 255, 0.9)';
    ctx.lineWidth = 2;
    ctx.strokeRect(hbXPx, hbYPx, hbWPx, hbHPx);

    ctx.fillStyle = 'rgba(0, 255, 255, 0.08)';
    ctx.fillRect(hbXPx, hbYPx, hbWPx, hbHPx);

    const handleSize = 8;
    const handles = getHandles(hbXPx, hbYPx, hbWPx, hbHPx);
    for (const h of handles) {
        ctx.fillStyle = 'rgba(0, 255, 255, 0.9)';
        ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 1;
        ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    }

    const info = `${(ox * 100).toFixed(1)}%, ${(oy * 100).toFixed(1)}% / ${(ow * 100).toFixed(1)}% x ${(oh * 100).toFixed(1)}%`;
    imageInfo.textContent = `${currentImage.dataset.file}.png — hitbox: ${info}`;
}

function getHandles(x, y, w, h) {
    const margin = 4;
    return [
        { id: 'tl', x: x - margin, y: y - margin },
        { id: 'tm', x: x + w / 2, y: y - margin },
        { id: 'tr', x: x + w + margin, y: y - margin },
        { id: 'ml', x: x - margin, y: y + h / 2 },
        { id: 'mr', x: x + w + margin, y: y + h / 2 },
        { id: 'bl', x: x - margin, y: y + h + margin },
        { id: 'bm', x: x + w / 2, y: y + h + margin },
        { id: 'br', x: x + w + margin, y: y + h + margin },
    ];
}

function getHitboxRect() {
    const ox = parseFloat(hbX.value) || 0;
    const oy = parseFloat(hbY.value) || 0;
    const ow = parseFloat(hbW.value) || 1;
    const oh = parseFloat(hbH.value) || 1;
    return {
        x: canvasOffsetX + ox * imgDisplayW,
        y: canvasOffsetY + oy * imgDisplayH,
        w: ow * imgDisplayW,
        h: oh * imgDisplayH,
    };
}

function pixelToHitbox(px, py) {
    if (imgDisplayW === 0 || imgDisplayH === 0) return null;
    const hbXfrac = (px - canvasOffsetX) / imgDisplayW;
    const hbYfrac = (py - canvasOffsetY) / imgDisplayH;
    return { x: hbXfrac, y: hbYfrac };
}

canvas.addEventListener('mousedown', (e) => {
    if (!imageLoaded) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hbRect = getHitboxRect();
    const hbXPx = hbRect.x;
    const hbYPx = hbRect.y;
    const hbWPx = hbRect.w;
    const hbHPx = hbRect.h;

    const handleSize = 8;
    const handles = getHandles(hbXPx, hbYPx, hbWPx, hbHPx);
    for (const h of handles) {
        if (Math.abs(mx - h.x) < handleSize && Math.abs(my - h.y) < handleSize) {
            dragState = { type: 'handle', handleId: h.id, startX: mx, startY: my, origX: parseFloat(hbX.value) || 0, origY: parseFloat(hbY.value) || 0, origW: parseFloat(hbW.value) || 1, origH: parseFloat(hbH.value) || 1 };
            return;
        }
    }

    if (mx >= hbXPx && mx <= hbXPx + hbWPx && my >= hbYPx && my <= hbYPx + hbHPx) {
        dragState = { type: 'move', startX: mx, startY: my, origX: parseFloat(hbX.value) || 0, origY: parseFloat(hbY.value) || 0 };
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (!dragState) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const dx = mx - dragState.startX;
    const dy = my - dragState.startY;
    const dxFrac = dx / imgDisplayW;
    const dyFrac = dy / imgDisplayH;

    if (dragState.type === 'move') {
        let newX = Math.max(0, Math.min(1, dragState.origX + dxFrac));
        let newY = Math.max(0, Math.min(1, dragState.origY + dyFrac));
        hbX.value = newX.toFixed(4);
        hbY.value = newY.toFixed(4);
    } else if (dragState.type === 'handle') {
        const h = dragState.handleId;
        let ox = dragState.origX;
        let oy = dragState.origY;
        let ow = dragState.origW;
        let oh = dragState.origH;

        if (h.includes('l')) { ox = dragState.origX + dxFrac; ow = dragState.origW - dxFrac; }
        if (h.includes('r')) { ow = dragState.origW + dxFrac; }
        if (h.includes('t')) { oy = dragState.origY + dyFrac; oh = dragState.origH - dyFrac; }
        if (h.includes('b')) { oh = dragState.origH + dyFrac; }

        if (ow > 0.005 && oh > 0.005 && ox >= 0 && oy >= 0 && ox + ow <= 1) {
            hbX.value = ox.toFixed(4);
            hbY.value = oy.toFixed(4);
            hbW.value = ow.toFixed(4);
            hbH.value = oh.toFixed(4);
        }
    }
    renderCanvas();
});

canvas.addEventListener('mouseup', () => { dragState = null; });
canvas.addEventListener('mouseleave', () => { dragState = null; });

function onParamChange() {
    if (imageLoaded) renderCanvas();
}

[hbX, hbY, hbW, hbH].forEach(el => el.addEventListener('input', onParamChange));

tierSlider.addEventListener('input', () => {
    tierLabel.textContent = tierSlider.value;
    loadCurrentImage();
});

nationSelect.addEventListener('change', loadCurrentImage);
classSelect.addEventListener('change', loadCurrentImage);

saveBtn.addEventListener('click', async () => {
    const key = getCurrentKey();
    overrides[key] = {
        x: parseFloat(hbX.value) || 0,
        y: parseFloat(hbY.value) || 0,
        w: parseFloat(hbW.value) || 1,
        h: parseFloat(hbH.value) || 1,
    };
    await saveOverrides();
    renderOverrideList();
    renderCanvas();
});

deleteBtn.addEventListener('click', async () => {
    const key = getCurrentKey();
    if (overrides[key]) {
        delete overrides[key];
        await saveOverrides();
        setAutoHitbox();
        renderOverrideList();
        renderCanvas();
    }
});

resetBtn.addEventListener('click', () => {
    setAutoHitbox();
    renderCanvas();
});

codeBtn.addEventListener('click', () => {
    const entries = Object.entries(overrides);
    if (entries.length === 0) {
        statusEl.textContent = 'No overrides to generate code for.';
        return;
    }
    let code = '// Hitbox overrides — paste into computeTankHitbox() after auto-computation\n';
    for (const [key, hb] of entries) {
        code += `if (key === "${key}") {\n`;
        code += `    const hb = tankHitboxData[key];\n`;
        code += `    if (hb) { hb.x = ${hb.x}; hb.y = ${hb.y}; hb.w = ${hb.w}; hb.h = ${hb.h}; }\n`;
        code += `}\n`;
    }
    codeContent.textContent = code;
    codeOutput.style.display = 'block';
    overlay.style.display = 'block';
});

function closeCodePopup() {
    codeOutput.style.display = 'none';
    overlay.style.display = 'none';
}

closeCode.addEventListener('click', closeCodePopup);
overlay.addEventListener('click', closeCodePopup);

copyCode.addEventListener('click', () => {
    navigator.clipboard.writeText(codeContent.textContent).then(() => {
        statusEl.textContent = 'Code copied to clipboard!';
        setTimeout(() => { closeCodePopup(); }, 500);
    }).catch(() => {
        statusEl.textContent = 'Failed to copy.';
    });
});

function renderOverrideList() {
    const keys = Object.keys(overrides);
    overrideCount.textContent = `(${keys.length})`;
    if (keys.length === 0) {
        overrideList.innerHTML = '<div class="empty-overrides">No overrides saved yet.</div>';
        return;
    }
    overrideList.innerHTML = '';
    for (const key of keys) {
        const hb = overrides[key];
        const div = document.createElement('div');
        div.className = 'override-item';
        div.innerHTML = `
            <span class="key">${key}</span>
            <span class="vals">x:${hb.x.toFixed(3)} y:${hb.y.toFixed(3)} w:${hb.w.toFixed(3)} h:${hb.h.toFixed(3)}</span>
            <button class="del-btn" title="Delete override">&times;</button>
        `;
        div.querySelector('.key').addEventListener('click', () => {
            navigateToKey(key);
        });
        div.querySelector('.del-btn').addEventListener('click', async () => {
            delete overrides[key];
            await saveOverrides();
            renderOverrideList();
            if (getCurrentKey() === key) {
                setAutoHitbox();
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