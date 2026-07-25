const fs = require('fs');
const path = require('path');
const PngJS = require('pngjs').PNG;

class BattleServer {
    constructor() {
        this.players = new Map();
        this.bullets = [];
        this.lastShotTime = new Map();
        this.bulletIdCounter = 0;
        this.tickInterval = null;
        this.battleObstacleMap = null;
        this.battleBulletObstacleMap = null;
        this.battleMapWidth = 1195;
        this.battleMapHeight = 896;
        this.BATTLE_WORLD_SCALE = 2.5;
        this.battleWorldWidth = Math.round(1195 * this.BATTLE_WORLD_SCALE);
        this.battleWorldHeight = Math.round(896 * this.BATTLE_WORLD_SCALE);
        this.battleSpawns = {
            germany: { x: 104.5, y: 204.5 },
            ussr: { x: 571.5, y: 829.5 },
            usa: { x: 1055.5, y: 338.5 }
        };
    }

    async loadMap() {
        const filePath = path.resolve(__dirname, '..', 'assets', 'map_layout.png');
        const data = fs.readFileSync(filePath);
        return new Promise((resolve, reject) => {
            const png = new PngJS({ filterType: 4 });
            png.on('parsed', () => {
                this.battleMapWidth = png.width;
                this.battleMapHeight = png.height;
                this.battleWorldWidth = Math.round(png.width * this.BATTLE_WORLD_SCALE);
                this.battleWorldHeight = Math.round(png.height * this.BATTLE_WORLD_SCALE);
                this.battleObstacleMap = new Uint8Array(png.width * png.height);
                this.battleBulletObstacleMap = new Uint8Array(png.width * png.height);
                for (let i = 0; i < png.data.length; i += 4) {
                    const r = png.data[i], g = png.data[i + 1], b = png.data[i + 2];
                    const idx = i / 4;
                    const isGreen = g > r && g > b && g > 60;
                    const isBlue = b > r && b > g && b > 60;
                    this.battleObstacleMap[idx] = isGreen || isBlue ? 1 : 0; // Tanks collide with Green & Blue
                    this.battleBulletObstacleMap[idx] = isBlue ? 1 : 0; // Bullets ONLY collide with Blue
                }
                resolve();
            });
            png.on('error', reject);
            png.end(data);
        });
    }

    isObstacle(worldX, worldY) {
        if (!this.battleObstacleMap) return false;
        const fx = worldX / this.battleWorldWidth * this.battleMapWidth;
        const fy = worldY / this.battleWorldHeight * this.battleMapHeight;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        if (ix < 0 || iy < 0 || ix >= this.battleMapWidth - 1 || iy >= this.battleMapHeight - 1) return true;
        const dx = fx - ix, dy = fy - iy;
        const idx = iy * this.battleMapWidth + ix;
        const v00 = this.battleObstacleMap[idx];
        const v10 = this.battleObstacleMap[idx + 1];
        const v01 = this.battleObstacleMap[idx + this.battleMapWidth];
        const v11 = this.battleObstacleMap[idx + this.battleMapWidth + 1];
        const v = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
        return v > 0.3;
    }

    isBulletObstacle(worldX, worldY) {
        if (!this.battleBulletObstacleMap) return false;
        const fx = worldX / this.battleWorldWidth * this.battleMapWidth;
        const fy = worldY / this.battleWorldHeight * this.battleMapHeight;
        const ix = Math.floor(fx), iy = Math.floor(fy);
        if (ix < 0 || iy < 0 || ix >= this.battleMapWidth - 1 || iy >= this.battleMapHeight - 1) return true;
        const dx = fx - ix, dy = fy - iy;
        const idx = iy * this.battleMapWidth + ix;
        const v00 = this.battleBulletObstacleMap[idx];
        const v10 = this.battleBulletObstacleMap[idx + 1];
        const v01 = this.battleBulletObstacleMap[idx + this.battleMapWidth];
        const v11 = this.battleBulletObstacleMap[idx + this.battleMapWidth + 1];
        const v = v00 * (1 - dx) * (1 - dy) + v10 * dx * (1 - dy) + v01 * (1 - dx) * dy + v11 * dx * dy;
        return v > 0.3;
    }

    start() {
        if (this.tickInterval) return;
        this.tickInterval = setInterval(() => this.tick(), 20);
    }

    stop() {
        if (this.tickInterval) {
            clearInterval(this.tickInterval);
            this.tickInterval = null;
        }
    }

    tick() {
        this.updateBullets();
        this.broadcast();
    }

    getMaxHP(tier, vehicleClass) {
        const baseHP = [0, 300, 400, 500, 600, 700, 1000, 1200, 1400, 2000, 2500];
        const hp = baseHP[Math.min(tier, 10)] || 300;
        if (vehicleClass === 'td' && tier < 8) return Math.round(hp * 0.85);
        return hp;
    }

    getDamage(tier, vehicleClass) {
        const baseDmg = [0, 35, 50, 70, 100, 140, 200, 250, 300, 390, 480];
        const dmg = baseDmg[Math.min(tier, 10)] || 35;
        const multiplier = vehicleClass === 'td' ? 1.5 : 1;
        return Math.round(dmg * multiplier);
    }

    getReloadTime(tier, vehicleClass) {
        const base = 2 + (tier - 1) * 0.5;
        return vehicleClass === 'td' ? base + 3 : base;
    }

    getTankRadius(tier) {
        // Matches the client sprite sizing
        return Math.max(16, (Math.round((Number(tier) || 1) * 8 + 42) * 0.5) * 0.43);
    }

    getTankHitbox(tier, vehicleClass, angle) {
        const width = Math.max(16, (tier * 8 + 42) * 0.5);
        const height = vehicleClass === 'td' ? width * 0.7 : width * 0.8;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const hw = width / 2;
        const hh = height / 2;
        return [
            { x: -hw * cos - (-hh) * sin, y: -hw * sin + (-hh) * cos },
            { x: hw * cos - (-hh) * sin, y: hw * sin + (-hh) * cos },
            { x: hw * cos - hh * sin, y: hw * sin + hh * cos },
            { x: -hw * cos - hh * sin, y: -hw * sin + hh * cos }
        ];
    }

    getCollisionRadius(hbW, hbH) {
        return Math.sqrt(hbW * hbW + hbH * hbH) / 2;
    }

    tankHitsObstacle(x, y, angle, hbW, hbH, hbOX, hbOY) {
        if (!this.battleObstacleMap) return false;
        const a = angle + Math.PI / 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        const cx = x + hbOX * cos - hbOY * sin;
        const cy = y + hbOX * sin + hbOY * cos;
        const hw = hbW / 2, hh = hbH / 2;
        const corners = [
            [cx + hw * cos - hh * sin, cy + hw * sin + hh * cos],
            [cx - hw * cos - hh * sin, cy - hw * sin + hh * cos],
            [cx - hw * cos + hh * sin, cy - hw * sin - hh * cos],
            [cx + hw * cos + hh * sin, cy + hw * sin - hh * cos]
        ];
        if (corners.some(([px, py]) => this.isObstacle(px, py))) return true;
        if (this.isObstacle(x, y)) return true;
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            const x1 = corners[i][0], y1 = corners[i][1];
            const x2 = corners[j][0], y2 = corners[j][1];
            for (let t = 0.2; t < 1; t += 0.2) {
                if (this.isObstacle(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t)) return true;
            }
        }
        return false;
    }

    resolveCollisions(x, y, angle, hbW, hbH, hbOX, hbOY, userId) {
        let newX = x, newY = y;
        
        // Try X first, then Y for sliding behavior
        if (this.tankHitsObstacle(newX, y, angle, hbW, hbH, hbOX, hbOY)) {
            if (!this.tankHitsObstacle(x, newY, angle, hbW, hbH, hbOX, hbOY)) {
                newX = x;
            } else {
                newX = x;
                newY = y;
            }
        } else {
            newY = y;
        }
        
        // Tank-to-tank sliding (OBB vs OBB)
        for (const [id, other] of this.players) {
            if (id === userId) continue;
            if (!this.obbOverlap(newX, newY, angle, hbW, hbH, hbOX, hbOY,
                                 other.x, other.y, other.angle, other.hbW || 30, other.hbH || 24, other.hbOX || 0, other.hbOY || 0)) continue;
            const dx = newX - other.x;
            const dy = newY - other.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 0.001) continue;
            const overlap = 4;
            const nx = dx / dist;
            const ny = dy / dist;
            const perpX = -ny, perpY = nx;
            const slideX = newX + perpX * overlap;
            const slideY = newY + perpY * overlap;
            
            if (!this.tankHitsObstacle(slideX, slideY, angle, hbW, hbH, hbOX, hbOY)) {
                newX = slideX;
                newY = slideY;
            } else {
                newX += nx * overlap * 0.5;
                newY += ny * overlap * 0.5;
                other.x -= nx * overlap * 0.5;
                other.y -= ny * overlap * 0.5;
            }
        }
        
        return { x: newX, y: newY };
    }

    lineOBBHit(x1, y1, x2, y2, cx, cy, angle, hbW, hbH, hbOX, hbOY) {
        const a = angle + Math.PI / 2;
        const cos = Math.cos(a), sin = Math.sin(a);
        const ocx = cx + hbOX * cos - hbOY * sin;
        const ocy = cy + hbOX * sin + hbOY * cos;
        const hw = hbW / 2, hh = hbH / 2;
        const corners = [
            { x: ocx + (-hw) * cos - (-hh) * sin, y: ocy + (-hw) * sin + (-hh) * cos },
            { x: ocx + (hw) * cos - (-hh) * sin, y: ocy + (hw) * sin + (-hh) * cos },
            { x: ocx + (hw) * cos - (hh) * sin, y: ocy + (hw) * sin + (hh) * cos },
            { x: ocx + (-hw) * cos - (hh) * sin, y: ocy + (-hw) * sin + (hh) * cos }
        ];
        // line-segment vs each edge
        for (let i = 0; i < 4; i++) {
            const j = (i + 1) % 4;
            if (this.segmentsIntersect(x1, y1, x2, y2, corners[i].x, corners[i].y, corners[j].x, corners[j].y)) return true;
        }
        // endpoint inside OBB
        return this.pointInOBB(x1, y1, ocx, ocy, hw, hh, cos, sin)
            || this.pointInOBB(x2, y2, ocx, ocy, hw, hh, cos, sin);
    }
    segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
        const d1x = bx - ax, d1y = by - ay;
        const d2x = dx - cx, d2y = dy - cy;
        const denom = d1x * d2y - d1y * d2x;
        if (Math.abs(denom) < 1e-10) return false;
        const t = ((cx - ax) * d2y - (cy - ay) * d2x) / denom;
        const u = ((cx - ax) * d1y - (cy - ay) * d1x) / denom;
        return t >= 0 && t <= 1 && u >= 0 && u <= 1;
    }
    pointInOBB(px, py, ocx, ocy, hw, hh, cos, sin) {
        const dx = px - ocx, dy = py - ocy;
        const lx = dx * cos + dy * sin;
        const ly = -dx * sin + dy * cos;
        return Math.abs(lx) <= hw && Math.abs(ly) <= hh;
    }
    obbOverlap(ax, ay, aAngle, aW, aH, aOX, aOY, bx, by, bAngle, bW, bH, bOX, bOY) {
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
            const aProj = this._projOBB(aCx, aCy, aHw, aHh, aCos, aSin, axis);
            const bProj = this._projOBB(bCx, bCy, bHw, bHh, bCos, bSin, axis);
            if (aProj.max < bProj.min || bProj.max < aProj.min) return false;
        }
        return true;
    }
    _projOBB(cx, cy, hw, hh, cos, sin, axis) {
        const dotCenter = cx * axis.x + cy * axis.y;
        const du = hw * Math.abs(cos * axis.x + sin * axis.y);
        const dv = hh * Math.abs(-sin * axis.x + cos * axis.y);
        return { min: dotCenter - du - dv, max: dotCenter + du + dv };
    }

    updateBullets() {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            if (!b.trail) b.trail = [];
            b.trail.push({ x: b.x, y: b.y });
            if (b.trail.length > 10) b.trail.shift();
            
            b.x += Math.cos(b.angle) * b.speed;
            b.y += Math.sin(b.angle) * b.speed;
            b.life--;
            
            if (this.isBulletObstacle(b.x, b.y)) {
                const collideMsg = JSON.stringify({ 
                    type: 'bullet_collide', 
                    x: b.x, 
                    y: b.y,
                    trail: b.trail
                });
                for (const [, p2] of this.players) {
                    try { p2.ws.send(collideMsg); } catch {}
                }
                this.bullets.splice(i, 1);
                continue;
            }
            
            if (b.life <= 0 || b.x < 0 || b.x > this.battleWorldWidth || b.y < 0 || b.y > this.battleWorldHeight) {
                this.bullets.splice(i, 1);
                continue;
            }
            
            const prevPos = b.trail && b.trail.length > 0 ? b.trail[b.trail.length - 1] : null;
            const bx0 = prevPos ? prevPos.x : b.x;
            const by0 = prevPos ? prevPos.y : b.y;
            for (const [, p] of this.players) {
                if (p.id === b.ownerId) continue;
                if (!this.lineOBBHit(bx0, by0, b.x, b.y, p.x, p.y, p.angle, p.hbW, p.hbH, p.hbOX, p.hbOY)) continue;
                const shooter = this.players.get(b.ownerId);
                if (shooter && shooter.nation === p.nation) continue;
                this.bullets.splice(i, 1);
                const dmg = this.getDamage(shooter ? shooter.tier : 1, shooter ? shooter.vehicleClass : 'tank') + Math.round((Math.random() - 0.5) * 30);
                p.hp -= dmg;
                const msg = JSON.stringify({ 
                    type: 'hit', 
                    bulletId: b.id, 
                    targetId: p.id, 
                    shooterId: b.ownerId,
                    x: b.x,
                    y: b.y,
                    damage: dmg,
                    hp: Math.max(0, p.hp)
                });
                for (const [, p2] of this.players) {
                    try { p2.ws.send(msg); } catch {}
                }
                if (p.hp <= 0) {
                    this.players.delete(p.id);
                }
                break;
            }
        }
    }

    broadcast() {
        const playerList = [];
        for (const [, p] of this.players) {
            playerList.push({
                id: p.id,
                username: p.username,
                x: p.x,
                y: p.y,
                angle: p.angle,
                nation: p.nation,
                tier: p.tier,
                vehicleClass: p.vehicleClass,
                labelName: p.labelName,
                hp: p.hp,
                maxHP: this.getMaxHP(p.tier || 1, p.vehicleClass || 'tank'),
                reloadRemaining: Math.max(0, (this.lastShotTime.get(p.id) || 0) + (this.getReloadTime(p.tier || 1, p.vehicleClass) * 1000) - Date.now()) / 1000
            });
        }
        const bulletList = this.bullets.map(b => ({ id: b.id, x: b.x, y: b.y, angle: b.angle, ownerId: b.ownerId, trail: b.trail || [] }));

        if (playerList.length === 0 && bulletList.length === 0) return;
        const msg = JSON.stringify({ type: 'players', players: playerList, bullets: bulletList });
        for (const [, p] of this.players) {
            try { p.ws.send(msg); } catch {}
        }
    }

    addPlayer(userId, userData, ws) {
        if (this.players.has(userId)) {
            const p = this.players.get(userId);
            p.ws = ws;
            if (userData.nation) p.nation = userData.nation;
            if (userData.tier) p.tier = userData.tier;
            if (userData.vehicleClass) p.vehicleClass = userData.vehicleClass;
            if (userData.labelName !== undefined) p.labelName = userData.labelName;
            if (userData.hbW !== undefined) { p.hbW = userData.hbW; p.hbH = userData.hbH; p.hbOX = userData.hbOX; p.hbOY = userData.hbOY; }
            return;
        }
        const spawn = this.battleSpawns[userData.nation] || this.battleSpawns.ussr;
        const x = spawn.x / this.battleMapWidth * this.battleWorldWidth;
        const y = spawn.y / this.battleMapHeight * this.battleWorldHeight;
        this.players.set(userId, {
            id: userId,
            username: userData.username,
            ws,
            x,
            y,
            angle: 0,
            nation: userData.nation || 'usa',
            tier: userData.tier || 1,
            vehicleClass: userData.vehicleClass || 'tank',
            labelName: userData.labelName || '',
            hp: this.getMaxHP(userData.tier || 1, userData.vehicleClass || 'tank'),
            hbW: userData.hbW || 30, hbH: userData.hbH || 24, hbOX: userData.hbOX || 0, hbOY: userData.hbOY || 0
        });
    }

    removePlayer(userId) {
        this.players.delete(userId);
    }

    updateState(userId, data) {
        const p = this.players.get(userId);
        if (!p) return;
        let x = Number(data.x), y = Number(data.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return;
        const angle = Number.isFinite(data.angle) ? data.angle : p.angle;
        const hbW = data.hbW ?? p.hbW ?? 30;
        const hbH = data.hbH ?? p.hbH ?? 24;
        const hbOX = data.hbOX ?? p.hbOX ?? 0;
        const hbOY = data.hbOY ?? p.hbOY ?? 0;
        const myRadius = this.getCollisionRadius(hbW, hbH);
        const pad = myRadius + 2;
        
        if (x < pad) x = pad;
        if (x > this.battleWorldWidth - pad) x = this.battleWorldWidth - pad;
        if (y < pad) y = pad;
        if (y > this.battleWorldHeight - pad) y = this.battleWorldHeight - pad;
        
        const resolved = this.resolveCollisions(x, y, angle, hbW, hbH, hbOX, hbOY, userId);
        x = resolved.x;
        y = resolved.y;
        
        p.x = x;
        p.y = y;
        p.angle = angle;
        if (data.nation !== undefined) p.nation = data.nation;
        if (data.tier !== undefined) p.tier = data.tier;
        if (data.vehicleClass !== undefined) p.vehicleClass = data.vehicleClass;
        if (data.labelName !== undefined) p.labelName = data.labelName;
        if (data.tier !== undefined || data.vehicleClass !== undefined) {
            p.hp = this.getMaxHP(p.tier || 1, p.vehicleClass || 'tank');
        }
        if (data.hbW !== undefined) { p.hbW = data.hbW; p.hbH = data.hbH; p.hbOX = data.hbOX; p.hbOY = data.hbOY; }
    }

    getPlayerList(excludeId) {
        const list = [];
        for (const [id, p] of this.players) {
            if (excludeId !== undefined && id === excludeId) continue;
            list.push({
                id: p.id, username: p.username, x: p.x, y: p.y, angle: p.angle,
                nation: p.nation, tier: p.tier, vehicleClass: p.vehicleClass, labelName: p.labelName
            });
        }
        return list;
    }

    handleChat(userId, text) {
        const p = this.players.get(userId);
        if (!p || !text || text.trim().length === 0) return;
        const msg = JSON.stringify({
            type: 'chat',
            userId: userId,
            username: p.username || 'Unknown',
            nation: p.nation || 'usa',
            text: text.trim().slice(0, 120)
        });
        for (const [, p2] of this.players) {
            try { p2.ws.send(msg); } catch {}
        }
    }

    handleShoot(userId) {
        const p = this.players.get(userId);
        if (!p) return;
        const now = Date.now();
        const lastShot = this.lastShotTime.get(userId) || 0;
        const reloadTime = this.getReloadTime(p.tier || 1, p.vehicleClass);
        const cooldown = reloadTime * 1000;
        
        if (now - lastShot < cooldown) return;
        this.lastShotTime.set(userId, now);
        
        const frontDist = (p.hbH || 24) / 2 + (p.hbOY || 0) + 2;
        const bx = p.x + Math.cos(p.angle) * frontDist;
        const by = p.y + Math.sin(p.angle) * frontDist;
        const bullet = {
            id: ++this.bulletIdCounter,
            x: bx,
            y: by,
            angle: p.angle,
            speed: 70,
            life: 100,
            ownerId: userId
        };
        this.bullets.push(bullet);
        
        const spawnMsg = JSON.stringify({
            type: 'bullet_spawn',
            bullet: { id: bullet.id, x: bullet.x, y: bullet.y, angle: bullet.angle, ownerId: bullet.ownerId }
        });
        for (const [, p2] of this.players) {
            try { p2.ws.send(spawnMsg); } catch {}
        }
    }
}

module.exports = BattleServer;