rentTechTreeNation) renderTechTree(currentTechTreeNation);
    }
    fieldTanks[currentField] = tanks;
    currentField = null;
    battleChat.classList.add('hidden');
    clickCounter.classList.remove('hidden');
    unlockCounter.classList.remove('hidden');
    speechBubbles = [];
    updateExplodeButton();
    tanks = fieldTanks.main;
    fieldBackButton.classList.add("hidden");
    fieldButton.classList.remove("hidden");
    closeFieldMenu();
}

function renderNationDropdown() {
    nationDropdown.innerHTML = "";
    for (const nation of nations) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "nationIconButton";
        btn.style.background = `url(assets/${nation}flag.png) center/cover no-repeat`;
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
    const inField = fieldTanks[nation]?.some(t => t.tier === tier && t.vehicleClass === vehicleClass);
    if (inField) slot.style.background = "rgba(80, 200, 80, 0.3)";
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
        if (unlocked.has(SECRET_TANK_KEY) || adminMode) {
            if (!ratteSpawned) slot.className += " adminClickable";
            slot.addEventListener("click", () => {
                if (ratteSpawned) return;
                ratteSpawned = true;
                slot.className = slot.className.replace(" adminClickable", "");
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
            spawnExplosion(a); spawnExplosion(b); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1); totalKills += 2;
        } else if (aIsRatte) {
            spawnExplosion(b); tanks.splice(secondIndex, 1); totalKills++;
        } else {
            spawnExplosion(a); tanks.splice(firstIndex, 1); totalKills++;
        }
        return 1;
    }
    if (a.nation === b.nation) {
        if (a.vehicleClass === b.vehicleClass && a.tier === b.tier && a.tier < 10) {
            spawnMergeEffect(a.x, a.y, a.nation); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1);
            tanks.push(new Tank(a.nation, a.tier + 1, a.x, a.y, a.adminSpawned || b.adminSpawned, undefined, a.vehicleClass));
            markUnlocked(a.nation, a.vehicleClass, a.tier + 1);
            totalMerges++;
            if (a.tier + 1 > highestTier) highestTier = a.tier + 1;
            if (a.tier + 1 < 10) getTankImage(a.nation, a.tier + 2, a.vehicleClass);
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
            if (a.vehicleClass === "td") { spawnExplosion(b); tanks.splice(secondIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); totalKills++; }
            else { spawnExplosion(a); tanks.splice(firstIndex, 1); markUnlocked(b.nation, b.vehicleClass, b.tier); totalKills++; }
        } else if (a.tier > b.tier) { spawnExplosion(b); tanks.splice(secondIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); totalKills++; }
        else if (b.tier > a.tier) { spawnExplosion(a); tanks.splice(firstIndex, 1); markUnlocked(b.nation, b.vehicleClass, b.tier); totalKills++; }
        else { spawnExplosion(a); spawnExplosion(b); tanks.splice(secondIndex, 1); tanks.splice(firstIndex, 1); markUnlocked(a.nation, a.vehicleClass, a.tier); markUnlocked(b.nation, b.vehicleClass, b.tier); totalKills += 2; }
        return 1;
    }
    return 0;
}

function handleCollisions() {
    if (currentField === "battle") return;
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
                        if (a.isChasing || b.isChasing) continue;
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

function isBattleObstacle(worldX, worldY) {
    if (!battleObstacleMap) return false;
    const fx = worldX / battleWorldWidth * battleMapWidth;
    const fy = worldY / battleWorldHeight * battleMapHeight;
    const ix = Math.floor(fx), iy = Math.floor(fy);
    if (ix < 0 || iy < 0 || ix >= battleMapWidth - 1 || iy >= battleMapHeight - 1) return true;
    const dx = fx - ix, dy = fy - iy;
    const idx = iy * battleMapWidth + ix;
    const v00 = battleObstacleMap[idx];
    const v10 = battleObstacleMap[idx + 1];
    const v01 = battleObstacleMap[idx + battleMapWidth];
    const v11 = battleObstacleMap[idx + battleMapWidth + 1];
    const v = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
    return v > 0.3;
}
function screenToWorld(sx, sy) {
    return { x: sx - canvas.width / 2 + camX, y: sy - canvas.height / 2 + camY };
}
function worldToScreen(wx, wy) {
    return { x: wx - camX + canvas.width / 2, y: wy - camY + canvas.height / 2 };
}

function drawBackground() {
    if (currentField === "battle" && battleFieldImg.complete && battleFieldImg.naturalWidth > 0 && battleWorldWidth) {
        ctx.save();
        ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);
        ctx.fillStyle = "#2d2d2d";
        ctx.fillRect(-camX, -camY, canvas.width, canvas.height);
        ctx.drawImage(battleFieldImg, 0, 0, battleFieldImg.naturalWidth, battleFieldImg.naturalHeight, 0, 0, battleWorldWidth, battleWorldHeight);
        ctx.restore();
        return;
    }
    if (currentField) {
        const fieldImg = { germany: germanField, ussr: ussrField, usa: usaField }[currentField];
        if (fieldImg && fieldImg.complete && fieldImg.naturalWidth > 0) {
            ctx.drawImage(fieldImg, 0, 0, canvas.width, canvas.height);
        } else {
            const c = tankColors[currentField] || "#5c7c2f";
            ctx.fillStyle = c;
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = "rgba(0,0,0,0.55)";
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        return;
    }
    if (background.complete && background.naturalWidth > 0) { ctx.drawImage(background, 0, 0, canvas.width, canvas.height); return; }
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, "#5c7c2f");
    gradient.addColorStop(1, "#2e4b29");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
}

let lastFrameTime = performance.now();

// --- BULLET SYSTEM START ---
class BulletTrail {
    constructor() {
        this.trails = new Map();
        this.trailId = 0;
        this.particles = [];
        this.bullets = [];
    }
    
    addTrail(trailPoints) {
        const id = ++this.trailId;
        this.trails.set(id, { points: trailPoints, createdAt: Date.now() });
        setTimeout(() => this.trails.delete(id), 600);
    }
    
    addParticles(x, y) {
        for (let i = 0; i < 15; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 4;
            this.particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                decay: 0.02 + Math.random() * 0.02,
                size: 2 + Math.random() * 4
            });
        }
    }
    
    update() {
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.95;
            p.vy *= 0.95;
            p.life -= p.decay;
            if (p.life <= 0) this.particles.splice(i, 1);
        }
    }
    
    draw(ctx) {
        const now = Date.now();
        for (const [id, entry] of this.trails) {
            const trail = entry.points;
            if (!trail || trail.length < 2) continue;
            const age = (now - entry.createdAt) / 600;
            const alpha = Math.max(0, 1 - age);
            ctx.save();
            ctx.strokeStyle = `rgba(255, 255, 255, ${alpha * 0.7})`;
            ctx.lineWidth = 1.5;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(trail[0].x, trail[0].y);
            for (let i = 1; i < trail.length; i++) {
                ctx.lineTo(trail[i].x, trail[i].y);
            }
            ctx.stroke();
            ctx.restore();
        }
        
        ctx.save();
        for (const p of this.particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = `hsl(40, 100%, ${60 + p.life * 30}%)`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

const bulletTrail = new BulletTrail();
let destroyedTankNation = null;

const chatInput = document.getElementById('chatInput');
const battleChat = document.getElementById('battleChat');
let isChatOpen = false;

// --- BATTLE WEBSOCKET HANDLER ---
let ws = null;
let lastStateSend = 0;
const keys = { w: false, a: false, s: false, d: false };

document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        e.preventDefault();
        keys[key] = true;
        if (currentField === 'battle' && playerBattleTank && ws && ws.readyState === WebSocket.OPEN) {
            sendBattleState();
        }
    }
    if (key === ' ' && currentField === 'battle' && playerBattleTank && playerReloadRemaining <= 0) {
        e.preventDefault();
        playSound("assets/shoot.wav");
        const dw2 = playerBattleTank.getDisplayWidth();
        const frame = getFrameRect(playerBattleTank.nation, playerBattleTank.tier, playerBattleTank.vehicleClass);
        const dh2 = dw2 * frame.sh / frame.sw;
        const frontDist = dh2 / 2 + playerBattleTank.getPivotShift() + 2;
        const bx = playerBattleTank.x + Math.cos(playerBattleTank.angle) * frontDist;
        const by = playerBattleTank.y + Math.sin(playerBattleTank.angle) * frontDist;
        effects.push({
            x: bx, y: by, life: 1, particles: [1],
            update() { this.life -= 0.06; if (this.life <= 0) this.particles.pop(); },
            draw() {
                ctx.save();
                ctx.globalAlpha = Math.max(0, this.life);
                ctx.fillStyle = "#fffbe6";
                ctx.shadowBlur = 20;
                ctx.shadowColor = "#ffd700";
                ctx.beginPath();
                ctx.arc(this.x, this.y, 6, 0, Math.PI * 2);
                ctx.fill();
                ctx.shadowBlur = 0;
                ctx.fillStyle = "#ffd700";
                ctx.beginPath();
                ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }
        });
        if (ws && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'shoot' }));
        }
    }
    if (key === 't' && currentField === 'battle' && !isChatOpen) {
        e.preventDefault();
        isChatOpen = true;
        chatInput.focus();
        chatInput.placeholder = 'Type a message...';
    }
});

document.addEventListener('keyup', (e) => {
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        e.preventDefault();
        keys[key] = false;
        if (currentField === 'battle' && playerBattleTank && ws && ws.readyState === WebSocket.OPEN) {
            sendBattleState();
        }
    }
});

chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        sendChat();
        isChatOpen = false;
        chatInput.blur();
        chatInput.placeholder = 'Press T to chat';
    }
    if (e.key === 'Escape') {
        isChatOpen = false;
        chatInput.blur();
        chatInput.value = '';
        chatInput.placeholder = 'Press T to chat';
    }
});

chatInput.addEventListener('blur', () => {
    isChatOpen = false;
    chatInput.placeholder = 'Press T to chat';
    keys.w = false;
    keys.a = false;
    keys.s = false;
    keys.d = false;
});

function connectBattleWebSocket() {
    if (ws && ws.readyState === WebSocket.OPEN) return;
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);
    
    ws.onopen = () => {
        const token = getToken();
        if (token) {
            ws.send(JSON.stringify({ type: 'auth', token }));
        }
        battleConnectionReady = true;
        checkBattleReady();
    };
    
    ws.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            switch(msg.type) {
                case 'auth_ok':
                    if (playerBattleTank) {
                        const hb = playerBattleTank.getHitbox();
                        ws.send(JSON.stringify({
                            type: 'join_battle',
                            nation: playerBattleTank.nation,
                            tier: playerBattleTank.tier,
                            vehicleClass: playerBattleTank.vehicleClass,
                            labelName: playerBattleTank.labelName,
                            hbW: hb.w, hbH: hb.h, hbOX: hb.ox, hbOY: hb.oy
                        }));
                    }
                    break;
                case 'players':
                    updateBattlePlayers(msg.players, msg.bullets);
                    battleFirstStateReceived = true;
                    checkBattleReady();
                    break;
                case 'bullet_collide':
                    bulletTrail.addParticles(msg.x, msg.y);
                    if (msg.trail) bulletTrail.addTrail(msg.trail);
                    playSound("assets/hit.wav");
                    break;
                case 'hit':
                    bulletTrail.addParticles(msg.x, msg.y);
                    handlePlayerHit(msg);
                    break;
                case 'bullet_spawn':
                    bulletTrail.bullets.push(msg.bullet);
                    if (msg.bullet.ownerId !== currentUser.id) {
                        playSound("assets/shoot.wav");
                    }
                    break;
                case 'chat':
                    addChatMessage(msg);
                    break;
            }
        } catch (e) {
            console.warn('WebSocket message error:', e);
        }
    };
    
    ws.onclose = () => {
        setTimeout(connectBattleWebSocket, 2000);
    };
}

function sendBattleState() {
    if (!ws || ws.readyState !== WebSocket.OPEN || !playerBattleTank) return;
    const now = Date.now();
    if (now - lastStateSend < 33) return;
    lastStateSend = now;
    const hb = playerBattleTank.getHitbox();
    ws.send(JSON.stringify({
        type: 'state',
        x: playerBattleTank.x,
        y: playerBattleTank.y,
        angle: playerBattleTank.angle,
        speed: playerBattleTank.speed,
        hbW: hb.w, hbH: hb.h, hbOX: hb.ox, hbOY: hb.oy
    }));
}

function updateBattlePlayers(players, bullets) {
    const now = Date.now();
    const incoming = bullets || [];
    const merged = [];
    for (const b of incoming) {
        const existing = bulletTrail.bullets.find(o => o.id === b.id);
        if (existing) {
            existing.prevX = existing.x; existing.prevY = existing.y;
            existing.x = b.x; existing.y = b.y; existing.angle = b.angle;
            existing.lastUpdate = now;
            if (!existing.localTrail) existing.localTrail = [];
            existing.localTrail.push({ x: existing.x, y: existing.y });
            if (existing.localTrail.length > 12) existing.localTrail.shift();
            merged.push(existing);
        } else {
            b.prevX = b.x; b.prevY = b.y;
            b.lastUpdate = now;
            b.localTrail = [{ x: b.x, y: b.y }];
            merged.push(b);
        }
    }
    bulletTrail.bullets = merged;
    const incomingEnemies = (players || []).filter(p => !currentUser || p.id !== currentUser.id);
    for (const inc of incomingEnemies) {
        const existing = enemyPlayers.find(e => e.id === inc.id);
        if (existing) {
            existing.prevX = existing.x; existing.prevY = existing.y;
            existing.prevAngle = existing.angle;
            existing.lx = inc.x; existing.ly = inc.y; existing.la = inc.angle;
            existing.lastUpdate = now;
        } else {
            inc.prevX = inc.x; inc.prevY = inc.y; inc.prevAngle = inc.angle;
            inc.lx = inc.x; inc.ly = inc.y; inc.la = inc.angle;
            inc.lastUpdate = now;
            inc.lastTrackX = inc.x;
            inc.lastTrackY = inc.y;
            enemyPlayers.push(inc);
        }
    }
    enemyPlayers = enemyPlayers.filter(e => incomingEnemies.some(i => i.id === e.id));
    if (currentUser) {
        const self = (players || []).find(p => p.id === currentUser.id);
        playerReloadRemaining = self ? self.reloadRemaining || 0 : playerReloadRemaining;
        if (self && playerBattleTank) {
            playerBattleTank.hp = self.hp;
            playerBattleTank.maxHP = self.maxHP;
        }
    }
    if (enemyPlayers.length > 0) {
        console.log(`Received ${enemyPlayers.length} enemy player(s):`, enemyPlayers.map(e => e.username || e.id));
    }
}

function drawEnemyTank(enemy) {
    const img = getTankImage(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
    const frameRect = getFrameRect(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
    const displayWidth = computeDisplayWidth(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
    const displayHeight = computeDisplayHeight(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
    // Always draw a colored circle at the enemy's feet for visibility
    ctx.save();
    ctx.translate(enemy.x, enemy.y);
    ctx.fillStyle = tankColors[enemy.nation] || "#ff4444";
    ctx.shadowBlur = 16;
    ctx.shadowColor = "rgba(0,0,0,0.6)";
    ctx.beginPath();
    ctx.arc(0, 0, displayWidth * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.rotate(enemy.angle + Math.PI / 2);
    ctx.translate(0, -getEnemyPivotShift(enemy.nation, enemy.tier, enemy.vehicleClass || "tank"));
    if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, frameRect.sx, frameRect.sy, frameRect.sw, frameRect.sh, -displayWidth / 2, -displayHeight / 2, displayWidth, displayHeight);
    } else {
        const t = Date.now() / 800;
        ctx.strokeStyle = tankColors[enemy.nation] || "#fff";
        ctx.lineWidth = Math.max(3, Math.min(displayWidth, displayHeight) * 0.14);
        const radius = Math.min(displayWidth, displayHeight) * 0.42;
        ctx.shadowColor = tankColors[enemy.nation] || "#fff";
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(0, 0, radius, t * Math.PI * 2, t * Math.PI * 2 + Math.PI * 1.5);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }
    ctx.restore();
    const name = enemy.labelName || getTankName(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
    if (!tagsHidden) {
        ctx.save();
        ctx.font = "11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        const boxWidth = ctx.measureText(name).width + 12;
        ctx.translate(enemy.x, enemy.y - displayHeight / 2 - 10);
        ctx.fillStyle = "rgba(0, 0, 0, 0.72)";
        ctx.beginPath();
        ctx.roundRect(-boxWidth / 2, -9, boxWidth, 18, 5);
        ctx.fill();
        ctx.fillStyle = "#f6f6f6";
        ctx.fillText(name, 0, 0);
        ctx.restore();
    }
    if (enemy.hp !== undefined && enemy.maxHP) {
        const barW = displayWidth * 0.8;
        const barH = 3;
        const barX = enemy.x - barW / 2;
        const barY = enemy.y - displayHeight / 2 - (tagsHidden ? 4 : 24);
        ctx.fillStyle = "#333";
        ctx.fillRect(barX, barY, barW, barH);
        const frac = Math.max(0, Math.min(1, enemy.hp / enemy.maxHP));
        ctx.fillStyle = frac > 0.5 ? "#4ade80" : frac > 0.25 ? "#facc15" : "#ef4444";
        ctx.fillRect(barX, barY, barW * frac, barH);
    }
}

function handlePlayerHit(msg) {
    playSound("assets/collide.wav");
    if (msg.x != null && msg.y != null) {
        effects.push(new ExplosionEffect(msg.x, msg.y, null, null, null));
    }
    const showDmg = (x, y, dmg) => {
        if (!window.damageNumbers) window.damageNumbers = [];
        window.damageNumbers.push({ x, y: y - 30, text: '-' + dmg, life: 1, vy: -1.5 });
    };
    if (msg.targetId === currentUser.id) {
        const shooter = enemyPlayers.find(p => p.id === msg.shooterId);
        if (playerBattleTank && shooter && shooter.nation === playerBattleTank.nation) return;
        if (playerBattleTank) {
            if (msg.hp !== undefined) playerBattleTank.hp = msg.hp;
            if (msg.damage) showDmg(playerBattleTank.x, playerBattleTank.y, msg.damage);
            if (msg.hp !== undefined && msg.hp <= 0) {
                destroyedTankNation = playerBattleTank.nation;
                if (!fieldTanks[destroyedTankNation]) fieldTanks[destroyedTankNation] = [];
                fieldTanks[destroyedTankNation].push(playerBattleTank);
                fieldTanks.battle = fieldTanks.battle.filter(t => t !== playerBattleTank);
                playerBattleTank = null;
                enemyPlayers = [];
                battleTracks = [];
                if (ws) {
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(JSON.stringify({ type: 'leave_battle' }));
                    }
                    ws.onclose = null;
                    ws.close();
                    ws = null;
                }
                saveTanks();
                showDialog(destroyedDialog);
            }
        }
    } else {
        const enemy = enemyPlayers.find(p => p.id === msg.targetId);
        if (enemy && msg.hp !== undefined) enemy.hp = msg.hp;
        if (msg.hp !== undefined && msg.hp <= 0) {
            enemyPlayers = enemyPlayers.filter(p => p.id !== msg.targetId);
        }
        if (msg.damage && enemy) showDmg(enemy.x, enemy.y, msg.damage);
    }
}

let speechBubbles = [];

function drawSpeechBubble(x, y, text, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = 'bold 11px Arial';
    const m = ctx.measureText(text);
    const pw = m.width + 14;
    const ph = 22;
    const bx = x - pw / 2;
    const by = y - 38 - ph;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath();
    ctx.roundRect ? ctx.roundRect(bx, by, pw, ph, 4) : ctx.rect(bx, by, pw, ph);
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, by + ph / 2);
    ctx.restore();
}

function addChatMessage(msg) {
    speechBubbles.push({ userId: msg.userId, text: msg.text, life: 5, maxLife: 5 });
}

function sendChat() {
    const text = chatInput.value.trim();
    if (!text || !ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(JSON.stringify({ type: 'chat', text }));
    chatInput.value = '';
}

// --- BULLET SYSTEM END ---

function animate() {
    const now = performance.now();
    const dt = (now - lastFrameTime) / 1000;
    lastFrameTime = now;
    if (currentField === "battle" && playerBattleTank && battleWorldWidth) {
        camX += (playerBattleTank.x - camX) * 0.08;
        camY += (playerBattleTank.y - camY) * 0.08;
        const halfW = canvas.width / 2;
        const halfH = canvas.height / 2;
        if (battleWorldWidth <= canvas.width) camX = battleWorldWidth / 2;
        else camX = Math.max(halfW, Math.min(battleWorldWidth - halfW, camX));
        if (battleWorldHeight <= canvas.height) camY = battleWorldHeight / 2;
        else camY = Math.max(halfH, Math.min(battleWorldHeight - halfH, camY));
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawBackground();
    updateEngineSound();
        if (!isPaused) {
        totalPlayTime += dt;
        fadeTracks();
        
        // --- FIX: Handle Player-Controlled Battle Tank ---
        if (currentField === "battle" && playerBattleTank) {
            let turnInput = 0;
            let moveInput = 0;
            if (keys.w) moveInput = 1;
            if (keys.s) moveInput = -0.5;
            if (keys.a) turnInput = -1;
            if (keys.d) turnInput = 1;
            
            let targetTurn = 0;
            if (moveInput !== 0) {
                const speedRatio = Math.abs(playerBattleTank.speed) / (playerBattleTank.topSpeed || 0.1);
                const maxTurnRate = playerBattleTank.minTurnRate + (playerBattleTank.pivotTurnRate - playerBattleTank.minTurnRate) * Math.max(0, 1 - speedRatio * 0.8);
                targetTurn = turnInput * maxTurnRate;
            } else if (turnInput !== 0) {
                targetTurn = turnInput * playerBattleTank.pivotTurnRate * 0.7;
            }
            if (playerBattleTank.turnSpeed < targetTurn) {
                playerBattleTank.turnSpeed = Math.min(targetTurn, playerBattleTank.turnSpeed + playerBattleTank.turnAcceleration);
            } else if (playerBattleTank.turnSpeed > targetTurn) {
                playerBattleTank.turnSpeed = Math.max(targetTurn, playerBattleTank.turnSpeed - playerBattleTank.turnAcceleration);
            }
            if (!playerBattleTank.wouldOverlapIfTurned(playerBattleTank.turnSpeed)) {
                playerBattleTank.angle += playerBattleTank.turnSpeed;
            } else {
                playerBattleTank.turnSpeed = 0;
            }
            
            const targetSpeed = moveInput > 0 ? playerBattleTank.topSpeed : playerBattleTank.baseSpeed * moveInput;
            if (playerBattleTank.speed < targetSpeed) {
                playerBattleTank.speed = Math.min(targetSpeed, playerBattleTank.speed + playerBattleTank.acceleration);
            } else if (playerBattleTank.speed > targetSpeed) {
                playerBattleTank.speed = Math.max(targetSpeed, playerBattleTank.speed - playerBattleTank.braking);
            }
            
            playerBattleTank.resolveMovement();
            
            // Generate track marks when moving
            if (playerBattleTank.x !== playerBattleTank.lastTrackX || playerBattleTank.y !== playerBattleTank.lastTrackY) {
                drawTrackSegment(playerBattleTank.lastTrackX, playerBattleTank.lastTrackY, playerBattleTank.x, playerBattleTank.y, playerBattleTank.getDisplayWidth());
                playerBattleTank.lastTrackX = playerBattleTank.x;
                playerBattleTank.lastTrackY = playerBattleTank.y;
            }
            
            // Re-sync with server frequently
            if (ws && ws.readyState === WebSocket.OPEN) {
                const now = Date.now();
                if (now - lastStateSend > 33) {
                    lastStateSend = now;
                    const hb = playerBattleTank.getHitbox();
                    ws.send(JSON.stringify({
                        type: 'state',
                        x: playerBattleTank.x,
                        y: playerBattleTank.y,
                        angle: playerBattleTank.angle,
                        hbW: hb.w, hbH: hb.h, hbOX: hb.ox, hbOY: hb.oy
                    }));
                }
            }
        } else {
            // Update all OTHER tanks (AI behavior only)
            tanks.forEach((tank) => tank.update());
        }
    }
    if (currentField !== "battle" && trackFadeFrames > 0) {
        ctx.save();
        ctx.imageSmoothingEnabled = true;
        ctx.drawImage(trackCanvas, 0, 0, canvas.width, canvas.height);
        ctx.restore();
    }
    if (currentField === "battle") {
        ctx.save();
        ctx.translate(canvas.width / 2 - camX, canvas.height / 2 - camY);
        for (const t of battleTracks) {
            const alpha = t.life / 90;
            ctx.save();
            ctx.globalAlpha = alpha * 0.38;
            ctx.strokeStyle = "#202418";
            ctx.lineWidth = 4;
            ctx.lineCap = "round";
            const trackWidth = 5 + (t.tankWidth || 54) * 0.1;
            const angle = Math.atan2(t.ty - t.fy, t.tx - t.fx);
            for (const side of [-1, 1]) {
                ctx.beginPath();
                ctx.moveTo(t.fx + Math.sin(angle) * trackWidth * -side, t.fy + -Math.cos(angle) * trackWidth * -side);
                ctx.lineTo(t.tx + Math.sin(angle) * trackWidth * -side, t.ty + -Math.cos(angle) * trackWidth * -side);
                ctx.stroke();
            }
            ctx.restore();
        }
        battleTracks = battleTracks.filter(t => { t.life--; return t.life > 0; });
        
        // Draw Bullet Trails & Particles
        bulletTrail.update();
        bulletTrail.draw(ctx);
        
        // Draw Bullets
        for (const b of bulletTrail.bullets) {
            const t = b.lastUpdate ? Math.min(1, (Date.now() - b.lastUpdate) / 33) : 0;
            const bx = b.prevX != null ? b.prevX + (b.x - b.prevX) * t : b.x;
            const by = b.prevY != null ? b.prevY + (b.y - b.prevY) * t : b.y;
            if (b.localTrail && b.localTrail.length > 1) {
                ctx.save();
                ctx.lineWidth = 1.5;
                ctx.lineCap = "round";
                const len = b.localTrail.length;
                for (let i = 1; i < len; i++) {
                    const alpha = (i / len) * 0.5;
                    ctx.strokeStyle = `rgba(255, 255, 255, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(b.localTrail[i - 1].x, b.localTrail[i - 1].y);
                    ctx.lineTo(b.localTrail[i].x, b.localTrail[i].y);
                    ctx.stroke();
                }
                ctx.restore();
            }
            ctx.save();
            ctx.fillStyle = '#262624';
            ctx.shadowBlur = 8;
            ctx.shadowColor = 'rgba(0,0,0,0.5)';
            ctx.beginPath();
            ctx.arc(bx, by, 2, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
        
        // Interpolate enemy positions and draw
        for (const enemy of enemyPlayers) {
            if (enemy.lx != null && enemy.lastUpdate) {
                const t = Math.min(1, (Date.now() - enemy.lastUpdate) / 33);
                enemy.x = enemy.prevX + (enemy.lx - enemy.prevX) * t;
                enemy.y = enemy.prevY + (enemy.ly - enemy.prevY) * t;
                let da = enemy.la - enemy.prevAngle;
                while (da > Math.PI) da -= Math.PI * 2;
                while (da < -Math.PI) da += Math.PI * 2;
                enemy.angle = enemy.prevAngle + da * t;
            }
            if (enemy.x !== enemy.lastTrackX || enemy.y !== enemy.lastTrackY) {
                const displayWidth = computeDisplayWidth(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
                drawTrackSegment(enemy.lastTrackX, enemy.lastTrackY, enemy.x, enemy.y, displayWidth);
                enemy.lastTrackX = enemy.x;
                enemy.lastTrackY = enemy.y;
            }
            drawEnemyTank(enemy);
        }
        
        if (debugMode) {
            // Obstacle map overlay
            if (battleDebugOverlay && battleWorldWidth && battleWorldHeight) {
                ctx.save();
                ctx.globalAlpha = 0.6;
                ctx.drawImage(battleDebugOverlay, 0, 0, battleWorldWidth, battleWorldHeight);
                ctx.restore();
            }
            // Player tank hitbox
            if (playerBattleTank) {
                const hb = playerBattleTank.getHitbox();
                const a = playerBattleTank.angle + Math.PI / 2;
                const cos = Math.cos(a), sin = Math.sin(a);
                const cx = playerBattleTank.x + hb.ox * cos - hb.oy * sin;
                const cy = playerBattleTank.y + hb.ox * sin + hb.oy * cos;
                const hw2 = hb.w / 2, hh = hb.h / 2;
                const pts = [
                    [cx + hw2 * cos - hh * sin, cy + hw2 * sin + hh * cos],
                    [cx - hw2 * cos - hh * sin, cy - hw2 * sin + hh * cos],
                    [cx - hw2 * cos + hh * sin, cy - hw2 * sin - hh * cos],
                    [cx + hw2 * cos + hh * sin, cy + hw2 * sin - hh * cos]
                ];
                ctx.strokeStyle = "#00ffff";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.closePath();
                ctx.stroke();
                const radius = Math.sqrt(hb.w * hb.w + hb.h * hb.h) / 2;
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "#00ffff";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(playerBattleTank.x, playerBattleTank.y, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
            // Enemy tank hitboxes
            for (const enemy of enemyPlayers) {
                const hb = getEnemyHitbox(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
                const a = enemy.angle + Math.PI / 2;
                const cos = Math.cos(a), sin = Math.sin(a);
                const cx = enemy.x + hb.ox * cos - hb.oy * sin;
                const cy = enemy.y + hb.ox * sin + hb.oy * cos;
                const hw2 = hb.w / 2, hh = hb.h / 2;
                const pts = [
                    [cx + hw2 * cos - hh * sin, cy + hw2 * sin + hh * cos],
                    [cx - hw2 * cos - hh * sin, cy - hw2 * sin + hh * cos],
                    [cx - hw2 * cos + hh * sin, cy - hw2 * sin - hh * cos],
                    [cx + hw2 * cos + hh * sin, cy + hw2 * sin - hh * cos]
                ];
                ctx.strokeStyle = "#ffff00";
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(pts[0][0], pts[0][1]);
                for (let i = 1; i < 4; i++) ctx.lineTo(pts[i][0], pts[i][1]);
                ctx.closePath();
                ctx.stroke();
                const radius = getEnemyCollisionRadius(enemy.nation, enemy.tier, enemy.vehicleClass || "tank");
                ctx.setLineDash([4, 4]);
                ctx.strokeStyle = "#ffff00";
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(enemy.x, enemy.y, radius, 0, Math.PI * 2);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }
        
    }
    tanks.forEach((tank) => tank.draw());
    if (grabbedTank) {
        const wm = currentField === "battle" ? screenToWorld(mouse.x, mouse.y) : { x: mouse.x, y: mouse.y };
        const targetX = wm.x + grabDx;
        const targetY = wm.y + grabDy;
        grabVx += (targetX - grabbedTank.x) * 0.25;
        grabVy += (targetY - grabbedTank.y) * 0.25;
        grabVx *= 0.65;
        grabVy *= 0.75;
        grabbedTank.x += grabVx;
        grabbedTank.y += grabVy;
        if (currentField === "battle" && battleObstacleMap && isBattleObstacle(grabbedTank.x, grabbedTank.y)) {
            grabbedTank.x -= grabVx;
            grabbedTank.y -= grabVy;
            grabVx = 0;
            grabVy = 0;
        }
        wobblePhase += dt * 12;
        const wobbleAmp = currentField ? 0.28 : 0.12;
        const wobble = Math.sin(wobblePhase) * wobbleAmp;
        grabbedTank.angle = grabAngle + wobble;
        grabbedTank.draw();
        if (currentField) {
            heartTimer++;
            if (heartTimer % 20 === 0) spawnHeartEffect(grabbedTank.x, grabbedTank.y);
        }
    }
    if (!isPaused) {
        handleCollisions();
        effects.forEach((effect) => effect.update());
        effects = effects.filter((effect) => (effect.particles && effect.particles.length > 0) || (effect.smoke && effect.smoke.length > 0) || (effect.risingSmoke && effect.risingSmoke.length > 0) || (effect.stars && effect.stars.length > 0));
        for (let i = speechBubbles.length - 1; i >= 0; i--) {
            speechBubbles[i].life -= dt;
            if (speechBubbles[i].life <= 0) speechBubbles.splice(i, 1);
        }
        if (window.damageNumbers) {
            for (let i = window.damageNumbers.length - 1; i >= 0; i--) {
                const dn = window.damageNumbers[i];
                dn.life -= dt * 2;
                dn.y += dn.vy;
                if (dn.life <= 0) window.damageNumbers.splice(i, 1);
            }
        }
    }
    effects.forEach((effect) => effect.draw());
    if (window.damageNumbers) {
        for (const dn of window.damageNumbers) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, dn.life);
            ctx.font = "bold 16px sans-serif";
            ctx.textAlign = "center";
            ctx.fillStyle = "#ff4444";
            ctx.strokeStyle = "#000";
            ctx.lineWidth = 3;
            ctx.strokeText(dn.text, dn.x, dn.y);
            ctx.fillText(dn.text, dn.x, dn.y);
            ctx.restore();
        }
    }
    if (currentField === "battle") {
        for (const sb of speechBubbles) {
            const alpha = Math.min(1, sb.life * 2);
            if (sb.userId === currentUser.id && playerBattleTank) {
                drawSpeechBubble(playerBattleTank.x, playerBattleTank.y, sb.text, alpha);
            } else {
                const enemy = enemyPlayers.find(e => e.id === sb.userId);
                if (enemy) drawSpeechBubble(enemy.x, enemy.y, sb.text, alpha);
            }
        }
    }
    ctx.restore();
    if (currentField === "battle" && playerBattleTank && playerBattleTank.hp !== undefined && playerBattleTank.maxHP) {
        const hpW = 400;
        const hpH = 22;
        const hpX = canvas.width / 2 - hpW / 2;
        const hpY = canvas.height - 48;
        const hpFrac = Math.max(0, Math.min(1, playerBattleTank.hp / playerBattleTank.maxHP));
        ctx.fillStyle = "rgba(12, 20, 15, 0.88)";
        ctx.beginPath();
        ctx.roundRect(hpX - 10, hpY - 8, hpW + 20, hpH + 24, 10);
        ctx.fill();
        ctx.fillStyle = "rgba(0,0,0,0.5)";
        ctx.beginPath();
        ctx.roundRect(hpX, hpY, hpW, hpH, 5);
        ctx.fill();
        ctx.fillStyle = hpFrac > 0.5 ? "#4ade80" : hpFrac > 0.25 ? "#facc15" : "#ef4444";
        ctx.beginPath();
        ctx.roundRect(hpX, hpY, Math.max(hpH, hpW * hpFrac), hpH, 5);
        ctx.fill();
        ctx.font = "bold 14px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 2;
        const hpText = `${playerBattleTank.hp} / ${playerBattleTank.maxHP}`;
        ctx.strokeText(hpText, canvas.width / 2, hpY + hpH / 2);
        ctx.fillText(hpText, canvas.width / 2, hpY + hpH / 2);
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillStyle = "#ddd";
        ctx.fillText("HP", hpX - 32, hpY + 3);
    }
    requestAnimationFrame(animate);
}

initAuth();
loadTanks();
for (let i = fieldTanks.battle.length - 1; i >= 0; i--) {
    const t = fieldTanks.battle[i];
    if (!fieldTanks[t.nation]) fieldTanks[t.nation] = [];
    fieldTanks[t.nation].push(t);
}
fieldTanks.battle.length = 0;
updateAdminButton();
updateExplodeButton();
renderNationDropdown();
updateUnlockCounter();
preloadAllAssets();
animate();
// connectBattleWebSocket(); // Connect to battle server
setInterval(() => { if (currentUser && getToken()) syncProgress(); }, 30000);

const loadingOverlay = document.getElementById('loadingOverlay');
const startOverlay = document.getElementById('startOverlay');
if (getToken()) {
    setTimeout(() => {
        if (!authReady) {
            loadingOverlay.classList.add('hidden');
            startOverlay.classList.remove('hidden');
        }
    }, 3000);
} else {
    setTimeout(() => {
        if (!authReady) {
            loadingOverlay.classList.add('hidden');
            startOverlay.classList.remove('hidden');
        }
    }, 600);
}

canvas.addEventListener("mousemove", (event) => { mouse.x = event.clientX; mouse.y = event.clientY; });
canvas.addEventListener("mousedown", (event) => {
    if (grabbedTank || isPaused) return;
    if (currentField === "battle") return;
    const mx = currentField === "battle" ? event.clientX - canvas.width / 2 + camX : event.clientX;
    const my = currentField === "battle" ? event.clientY - canvas.height / 2 + camY : event.clientY;
    for (const tank of tanks) {
        if (tank.containsPoint(mx, my)) {
            grabbedTank = tank;
            grabbedTank.speed = 0;
            grabbedTank.turnSpeed = 0;
            grabDx = tank.x - mx;
            grabDy = tank.y - my;
            grabAngle = tank.angle;
            wobblePhase = 0;
            grabVx = 0;
            grabVy = 0;
            grabStartX = tank.x;
            grabStartY = tank.y;
            heartTimer = 0;
            const idx = tanks.indexOf(tank);
            if (idx !== -1) tanks.splice(idx, 1);
            return;
        }
    }
    if (currentField) return;
    startEngine();
    spawnCount++;
    clickCounter.textContent = "Spawns: " + spawnCount;
    try { localStorage.setItem(SPAWN_COUNT_KEY, spawnCount); } catch {}
    syncProgress();
    const options = getSpawnableVehicles();
    const choice = options[Math.floor(Math.random() * options.length)];
    tanks.push(new Tank(choice.nation, 1, event.clientX, event.clientY, false, undefined, choice.vehicleClass));
    getTankImage(choice.nation, 2, choice.vehicleClass);
    saveTanks();
});
canvas.addEventListener("mouseup", (event) => {
    if (grabbedTank) handleTankDrop(event);
});
document.addEventListener("mouseup", (event) => {
    if (grabbedTank) handleTankDrop(event);
});

function handleTankDrop(event) {
    if (currentField) {
        const dist = Math.hypot(grabbedTank.x - grabStartX, grabbedTank.y - grabStartY);
        if (dist < 5) {
            tanks.push(grabbedTank);
            startRenameTank(grabbedTank);
            grabbedTank = null;
            return;
        }
        grabbedTank.angle = grabAngle;
        grabbedTank.lastTrackX = grabbedTank.x;
        grabbedTank.lastTrackY = grabbedTank.y;
        tanks.push(grabbedTank);
        grabbedTank = null;
        return;
    }
    const box = fieldButton.getBoundingClientRect();
    if (!fieldButton.classList.contains("hidden") &&
        event.clientX >= box.left && event.clientX <= box.right &&
        event.clientY >= box.top && event.clientY <= box.bottom) {
        const nation = grabbedTank.nation;
        if (!fieldTanks[nation]) fieldTanks[nation] = [];
        const dup = fieldTanks[nation].some(t => t.nation === grabbedTank.nation && t.tier === grabbedTank.tier && t.vehicleClass === grabbedTank.vehicleClass);
        if (dup) {
            grabbedTank.angle = grabAngle;
            grabbedTank.lastTrackX = grabbedTank.x;
            grabbedTank.lastTrackY = grabbedTank.y;
            tanks.push(grabbedTank);
        } else {
            fieldTanks[nation].push(grabbedTank);
            spawnTransferEffect(event.clientX, event.clientY);
            playSound("assets/merge.wav");
            saveTanks();
            maybeUnlockSecretTank();
            if (currentTechTreeNation === nation) renderTechTree(nation);
        }
    } else {
        grabbedTank.angle = grabAngle;
        grabbedTank.lastTrackX = grabbedTank.x;
        grabbedTank.lastTrackY = grabbedTank.y;
        tanks.push(grabbedTank);
    }
    grabbedTank = null;
}

let renameInput = null;
let renameTarget = null;
let renameContainer = null;
let battleButton = null;

function startRenameTank(tank) {
    if (renameContainer) renameContainer.remove();
    tank.frozen = true;
    renameTarget = tank;
    renameContainer = document.createElement("div");
    renameContainer.style.cssText = "position:fixed;z-index:30;display:flex;gap:6px;align-items:center;";
    renameInput = document.createElement("input");
    renameInput.type = "text";
    renameInput.value = tank.labelName;
    renameInput.style.cssText = "background:rgba(12,20,15,0.94);color:#f5f5f5;border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:6px 10px;font:14px sans-serif;text-align:center;outline:none;width:140px;";
    renameInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { const t = renameTarget; commitRename(); if (!(t.nation === SECRET_TANK_NATION && t.tier === SECRET_TANK_TIER)) { pendingBattleTank = t; showDialog(battleConfirmDialog); hideDialog(pauseDialog); } }
        if (e.key === "Escape") { cancelRename(); }
    });
    let blurTimer = null;
    renameInput.addEventListener("blur", () => {
        blurTimer = setTimeout(() => { if (renameInput) commitRename(); }, 100);
    });
    renameInput.addEventListener("focus", () => {
        if (blurTimer) { clearTimeout(blurTimer); blurTimer = null; }
    });
    battleButton = document.createElement("button");
    battleButton.textContent = "⚔";
    battleButton.title = "To Battle";
    battleButton.style.cssText = "background:rgba(200,80,40,0.9);color:#fff;border:none;border-radius:6px;padding:6px 10px;font:16px sans-serif;cursor:pointer;";
    battleButton.addEventListener("click", () => { const t = renameTarget; commitRename(); pendingBattleTank = t; showDialog(battleConfirmDialog); hideDialog(pauseDialog); });
    battleButton.addEventListener("mousedown", (e) => e.stopPropagation());
    renameContainer.appendChild(renameInput);
    const isRatte = tank.nation === SECRET_TANK_NATION && tank.tier === SECRET_TANK_TIER;
    if (!isRatte) renameContainer.appendChild(battleButton);
    positionRenameInput();
    document.body.appendChild(renameContainer);
    renameInput.focus();
    renameInput.select();
}

function positionRenameInput() {
    if (!renameContainer || !renameTarget) return;
    let px = renameTarget.x, py = renameTarget.y;
    if (currentField === "battle") {
        px = renameTarget.x - camX + canvas.width / 2;
        py = renameTarget.y - camY + canvas.height / 2;
    }
    renameContainer.style.left = (px - 100) + "px";
    renameContainer.style.top = (py - 60) + "px";
}

function sendToBattle(tank) {
    if (!tank) return;
    if (tank.nation === SECRET_TANK_NATION && tank.tier === SECRET_TANK_TIER) return;
    
    // 1. Close the popup immediately
    closeAllDialogs();
    pendingBattleTank = null;

    // 2. Remove the tank from its nation field (Transfer, not Copy)
    const nation = tank.nation;
    const idx = fieldTanks[nation]?.indexOf(tank);
    if (idx !== undefined && idx >= 0) {
        fieldTanks[nation].splice(idx, 1);
    }

    // 3. Add to battle field
    fieldTanks.battle.push(tank);
    
    // 4. Spawn in the correct colored circle based on nation
    const SPAWN_PIXELS = {
        germany: { x: 104.5, y: 204.5 },
        ussr: { x: 571.5, y: 829.5 },
        usa: { x: 1055.5, y: 338.5 }
    };
    if (battleMapWidth && battleWorldWidth) {
        const spawnPixel = SPAWN_PIXELS[tank.nation] || SPAWN_PIXELS.ussr;
        tank.x = (spawnPixel.x / battleMapWidth) * battleWorldWidth;
        tank.y = (spawnPixel.y / battleMapHeight) * battleWorldHeight;

        let tries = 0;
        while (isBattleObstacle(tank.x, tank.y) && tries < 40) {
            tank.x += (Math.random() - 0.5) * 100;
            tank.y += (Math.random() - 0.5) * 100;
            tries++;
        }
    }

    if (battleWorldWidth) {
        tank.angle = Math.atan2(battleWorldHeight / 2 - tank.y, battleWorldWidth / 2 - tank.x);
    }

    // 5. Setup Player Control
    playerBattleTank = tank;
    camX = tank.x;
    camY = tank.y;
    battleConnectionReady = false;
    battleFirstStateReceived = false;
    showBattleConnecting();
    if (battleWorldWidth) {
        const halfW = canvas.width / 2;
        const halfH = canvas.height / 2;
        if (battleWorldWidth <= canvas.width) camX = battleWorldWidth / 2;
        else camX = Math.max(halfW, Math.min(battleWorldWidth - halfW, camX));
        if (battleWorldHeight <= canvas.height) camY = battleWorldHeight / 2;
        else camY = Math.max(halfH, Math.min(battleWorldHeight - halfH, camY));
    }

    saveTanks();
    if (currentTechTreeNation === nation) renderTechTree(nation);
    cancelRename();
    
    // 6. Switch fields AND start the WebSocket connection
    switchToField("battle");
    connectBattleWebSocket();
}

function commitRename() {
    if (!renameInput || !renameTarget) return;
    const val = renameInput.value.trim();
    if (val) {
        renameTarget.labelName = val;
        ctx.save();
        ctx.font = "bold 15px sans-serif";
        renameTarget.labelBoxWidth = ctx.measureText(renameTarget.labelName).width + 16;
        ctx.restore();
    }
    renameTarget.frozen = false;
    if (renameContainer) { renameContainer.remove(); renameContainer = null; renameInput = null; }
    renameTarget = null;
    saveTanks();
}

function cancelRename() {
    if (!renameContainer || !renameTarget) return;
    renameTarget.frozen = false;
    if (renameContainer) { renameContainer.remove(); renameContainer = null; renameInput = null; }
    renameTarget = null;
}

function showDialog(dialog) { dialog.classList.remove("hidden"); isPaused = true; }
function hideDialog(dialog) { dialog.classList.add("hidden"); }
function closeAllDialogs() {
    hideDialog(pauseDialog); hideDialog(explodeDialog); hideDialog(resetDialog); hideDialog(adminDialog); hideDialog(battleConfirmDialog); hideDialog(destroyedDialog); hideDialog(beatGameDialog);
    adminError.classList.add("hidden"); adminPassword.value = "";
    isPaused = false;
}

unlockToggleButton.addEventListener("click", () => {
    toggleNationDropdown();
});

fieldButton.addEventListener("click", toggleFieldMenu);
fieldBackButton.addEventListener("click", leaveField);

document.addEventListener("click", (event) => {
    if (fieldMenu.classList.contains("open") &&
        !fieldMenu.contains(event.target) &&
        !fieldButton.contains(event.target)) {
        closeFieldMenu();
    }
});

closeTechTreeButton.addEventListener("click", () => { closeTechTreePanel(); });
backTechTreeButton.addEventListener("click", () => { closeTechTreePanel(); openNationDropdown(); });

document.addEventListener("click", (event) => {
    if (nationDropdown.classList.contains("open") &&
        !nationDropdown.contains(event.target) &&
        !unlockToggleButton.contains(event.target)) {
        closeNationDropdown();
    }
});

pauseButton.addEventListener("click", () => { if (!isPaused) showDialog(pauseDialog); else closeAllDialogs(); });
resumeButton.addEventListener("click", closeAllDialogs);

openExplodeDialogButton.addEventListener("click", () => { if (currentField) return; showDialog(explodeDialog); hideDialog(pauseDialog); });
function updateExplodeButton() { openExplodeDialogButton.disabled = !!currentField; }
openResetDialogButton.addEventListener("click", () => { showDialog(resetDialog); hideDialog(pauseDialog); });
function updateAdminButton() {
    openAdminDialogButton.textContent = adminMode ? "Disable admin mode" : "Enable admin mode";
}

muteEngineToggle.addEventListener("change", () => { engineMuted = muteEngineToggle.checked; });
hideTagsToggle.addEventListener("change", () => { tagsHidden = hideTagsToggle.checked; });
debugToggle.addEventListener("change", () => { debugMode = debugToggle.checked; });

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
    cancelRename();
    let ratteTank = null;
    tanks.forEach((tank) => {
        if (tank.nation === SECRET_TANK_NATION && tank.tier === SECRET_TANK_TIER) ratteTank = tank;
        spawnExplosion(tank);
    });
    tanks.length = 0;
    saveTanks();
    if (ratteTank) {
        closeAllDialogs();
        const x = ratteTank.x;
        const y = ratteTank.y;
        for (let i = 0; i < 6; i++) {
            const ex = new ExplosionEffect(x + (Math.random() - 0.5) * 200, y + (Math.random() - 0.5) * 200, null, null, null);
            ex.particles.forEach((p) => { p.vx *= 3; p.vy *= 3; p.life *= 1.5; });
            ex.smoke.forEach((s) => { s.vx *= 3; s.vy *= 3; s.life *= 1.5; });
            ex.risingSmoke.forEach((s) => { s.vx *= 3; s.vy *= 3; s.life *= 1.5; });
            effects.push(ex);
        }
        for (let i = 0; i < 40; i++) {
            const sp = new StarParticle(x, y);
            sp.vx *= 4;
            sp.vy *= 4;
            sp.life *= 3;
            sp.decay /= 3;
            sp.size *= 3;
            sp.stars = [true];
            effects.push(sp);
        }
        setTimeout(() => {
            beatGameDialog.classList.remove("hidden");
            isPaused = true;
        }, 2000);
    } else {
        closeAllDialogs();
    }
});

confirmBattleButton.addEventListener("click", () => {
    if (pendingBattleTank) sendToBattle(pendingBattleTank);
    pendingBattleTank = null;
    closeAllDialogs();
});

confirmResetButton.addEventListener("click", () => {
    unlocked = new Set(); for (const nation of nations) unlocked.add(`${nation}:tank:1`);
    spawnCount = 0;
    totalMerges = 0;
    totalKills = 0;
    highestTier = 1;
    try { localStorage.setItem(SPAWN_COUNT_KEY, 0); } catch {}
    saveUnlockedTanks();
    for (const key of Object.keys(fieldTanks)) fieldTanks[key].length = 0;
    tanks = fieldTanks[currentField || 'main'];
    effects = []; saveTanks(); closeAllDialogs();
    renderNationDropdown();
    if (currentTechTreeNation) renderTechTree(currentTechTreeNation);
    clickCounter.textContent = "Spawns: 0";
    updateUnlockCounter();
});

adminPassword.addEventListener("input", () => adminError.classList.add("hidden"));
confirmAdminButton.addEventListener("click", () => {
    const pw = adminPassword.value.trim();
    if (pw === "VladLox") {
        adminMode = true; saveAdminMode(); adminError.classList.add("hidden");
        updateAdminButton(); renderNationDropdown(); if (currentTechTreeNation) renderTechTree(currentTechTreeNation); closeAllDialogs();
    } else {
        adminError.classList.remove("hidden");
    }
});

openAdminDashboardButton.addEventListener("click", () => {
    window.open('/admin.html', '_blank');
    closeAllDialogs();
});

document.getElementById('logoutButton').addEventListener("click", () => {
    clearToken();
    closeAllDialogs();
    location.reload();
});

document.getElementById('confirmDestroyedButton').addEventListener('click', () => {
    hideDialog(destroyedDialog);
    isPaused = false;
    if (destroyedTankNation) {
        switchToField(destroyedTankNation);
        saveTanks();
    }
    destroyedTankNation = null;
});

confirmBeatGameButton.addEventListener('click', () => {
    hideDialog(beatGameDialog);
    isPaused = false;
});

document.getElementById('guestButton').addEventListener('click', startAsGuest);
document.getElementById('startLoginBtn').addEventListener('click', startLogin);
document.getElementById('startRegisterBtn').addEventListener('click', startRegister);
document.getElementById('startUsername').addEventListener('keydown', e => { if (e.key === 'Enter') startLogin(); });
document.getElementById('startPassword').addEventListener('keydown', e => { if (e.key === 'Enter') startLogin(); });
document.getElementById('startUsername').addEventListener('input', () => document.getElementById('startError').classList.add('hidden'));
document.getElementById('startPassword').addEventListener('input', () => document.getElementById('startError').classList.add('hidden'));

document.addEventListener("keydown", (e) => {
    if (e.target.tagName === 'INPUT') return;
    const key = e.key.toLowerCase();
    
    // WASD for movement
    if (key === 'w' || key === 'a' || key === 's' || key === 'd') {
        e.preventDefault();
        keys[key] = true;
    }
});

window.addEventListener("resize", () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; trackCanvas.width = Math.ceil(canvas.width * TRACK_RENDER_SCALE); trackCanvas.height = Math.ceil(canvas.height * TRACK_RENDER_SCALE); trackCtx.setTransform(TRACK_RENDER_SCALE, 0, 0, TRACK_RENDER_SCALE, 0, 0); trackFadeFrames = 0; });
window.addEventListener("beforeunload", () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'leave_battle' }));
        ws.onclose = null;
        ws.close();
    }
});