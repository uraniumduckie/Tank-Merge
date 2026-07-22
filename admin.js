const API_BASE = window.location.origin;
const AUTH_TOKEN_KEY = 'tank-merge:auth-token';
let allUsers = [];
let searchTerm = '';

function getToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY); } catch { return null; }
}
function clearToken() {
    try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch {}
}

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

async function checkAuth() {
    const result = await apiFetch('/api/auth/me');
    const statusEl = document.getElementById('adminStatus');
    const logoutBtn = document.getElementById('logoutBtn');
    if (result.ok && result.data && result.data.user) {
        if (result.data.user.is_admin) {
            statusEl.textContent = `Logged in as ${result.data.user.username} (admin)`;
            logoutBtn.classList.remove('hidden');
            return true;
        } else {
            statusEl.textContent = `${result.data.user.username} — not an admin. Admin access required.`;
            return false;
        }
    } else {
        statusEl.textContent = 'Not authenticated. Please log in from the game first.';
        return false;
    }
}

async function loadDashboard() {
    const authorized = await checkAuth();
    if (!authorized) {
        document.querySelector('main').innerHTML = '<div class="error-message">Access denied. You need an admin account.<br><br>Default: username <strong>admin</strong>, password <strong>admin123</strong><br><br>Log in from the game first, then refresh.</div>';
        return;
    }
    const result = await apiFetch('/api/admin/dashboard');
    if (!result.ok || !result.data) {
        document.querySelector('main').innerHTML = '<div class="error-message">Failed to load dashboard.</div>';
        return;
    }
    const { stats, users } = result.data;
    document.getElementById('statTotalUsers').textContent = stats.totalUsers;
    document.getElementById('statGuests').textContent = stats.totalGuests;
    document.getElementById('statRegistered').textContent = stats.totalRegistered;
    document.getElementById('statTotalSpawns').textContent = stats.totalSpawns;
    document.getElementById('statTotalMerges').textContent = stats.totalMerges;
    document.getElementById('statTotalKills').textContent = stats.totalKills;

    allUsers = users;
    applyFilter();
}

function applyFilter() {
    const term = searchTerm.toLowerCase().trim();
    const filtered = !term ? allUsers : allUsers.filter(u =>
        (u.username && u.username.toLowerCase().includes(term)) ||
        (u.country && u.country.toLowerCase().includes(term)) ||
        (u.city && u.city.toLowerCase().includes(term)) ||
        (u.ip_address && u.ip_address.includes(term))
    );
    document.getElementById('userCountBadge').textContent = filtered.length;
    renderUsersTable(filtered);
}

function renderUsersTable(users) {
    const tbody = document.getElementById('usersBody');
    tbody.innerHTML = '';
    for (const u of users) {
        const tr = document.createElement('tr');
        let typeBadge = u.is_guest ? '<span class="badge badge-guest">Guest</span>' : '<span class="badge badge-registered">Registered</span>';
        if (u.is_admin) typeBadge += ' <span class="badge badge-admin">Admin</span>';
        const countryFlag = u.country && u.country !== 'Local' ? getFlagEmoji(u.country) : '';
        tr.innerHTML = `
            <td>${u.username || '(no name)'}</td>
            <td>${typeBadge}</td>
            <td>${countryFlag} ${u.country || '-'}</td>
            <td>${formatDate(u.created_at)}</td>
            <td>${formatDate(u.last_login)}</td>
            <td>${u.spawn_count ?? 0}</td>
            <td>${u.total_merges ?? 0}</td>
            <td>${u.total_kills ?? 0}</td>
            <td>${u.highest_tier ?? 1}</td>
            <td style="white-space:nowrap;">
                <button class="viewUserBtn" data-userid="${u.id}">View</button>
                <button class="actionBtn warn resetUserBtn" data-userid="${u.id}" data-username="${u.username || 'guest'}">Reset</button>
                <button class="actionBtn danger deleteUserBtn" data-userid="${u.id}" data-username="${u.username || 'guest'}">Del</button>
            </td>
        `;
        tbody.appendChild(tr);
    }
    tbody.querySelectorAll('.viewUserBtn').forEach(b => b.addEventListener('click', () => showUserDetail(b.dataset.userid)));
    tbody.querySelectorAll('.resetUserBtn').forEach(b => b.addEventListener('click', () => confirmReset(b.dataset.userid, b.dataset.username)));
    tbody.querySelectorAll('.deleteUserBtn').forEach(b => b.addEventListener('click', () => confirmDelete(b.dataset.userid, b.dataset.username)));
}

function getFlagEmoji(country) {
    const map = { 'United States': '🇺🇸', 'US': '🇺🇸', 'USA': '🇺🇸', 'United Kingdom': '🇬🇧', 'UK': '🇬🇧', 'Germany': '🇩🇪', 'DE': '🇩🇪', 'France': '🇫🇷', 'FR': '🇫🇷', 'Russia': '🇷🇺', 'RU': '🇷🇺', 'China': '🇨🇳', 'CN': '🇨🇳', 'Japan': '🇯🇵', 'JP': '🇯🇵', 'Canada': '🇨🇦', 'CA': '🇨🇦', 'Australia': '🇦🇺', 'AU': '🇦🇺', 'Brazil': '🇧🇷', 'BR': '🇧🇷', 'India': '🇮🇳', 'IN': '🇮🇳', 'Local': '🖥️' };
    return map[country] || '';
}

let activityChart = null, pieChart = null, userMap = null;

async function showUserDetail(userId) {
    const section = document.getElementById('userDetailSection');
    const listSection = document.getElementById('usersSection');
    const content = document.getElementById('userDetailContent');
    const chartsSection = document.getElementById('userDetailCharts');
    listSection.classList.add('hidden');
    section.classList.remove('hidden');
    chartsSection.classList.add('hidden');
    content.innerHTML = '<div class="loading">Loading user details...</div>';

    const result = await apiFetch(`/api/admin/users/${userId}`);
    if (!result.ok || !result.data) {
        content.innerHTML = '<div class="error-message">Failed to load user details.</div>';
        return;
    }
    const { user, progress, eventTypeCounts, eventsByDay, recentEvents, accountAgeDays } = result.data;
    const unlockedTanks = (() => { try { return JSON.parse(progress?.unlocked_tanks || '[]'); } catch { return []; } })();
    document.getElementById('userDetailTitle').textContent = `User: ${user.username || '(guest)'}`;

    let typeBadge = user.is_guest ? '<span class="badge badge-guest">Guest</span>' : '<span class="badge badge-registered">Registered</span>';
    if (user.is_admin) typeBadge += ' <span class="badge badge-admin">Admin</span>';
    const flag = getFlagEmoji(user.country);
    const playTimeFormatted = formatPlayTime(progress?.total_play_time || 0);
    const unlockPercent = Math.round((unlockedTanks.length / 60) * 100);

    content.innerHTML = `
        <div class="detailGrid">
            <div class="detailItem"><div class="detailLabel">Username</div><div class="detailValue">${user.username || '(guest)'}<br>${typeBadge}</div></div>
            <div class="detailItem"><div class="detailLabel">📍 Location</div><div class="detailValue">${flag} ${user.city || 'Unknown'}, ${user.country || 'Unknown'}</div></div>
            <div class="detailItem"><div class="detailLabel">🌐 IP Address</div><div class="detailValue">${user.ip_address || '-'}</div></div>
            <div class="detailItem"><div class="detailLabel">🕒 Account Age</div><div class="detailValue">${accountAgeDays} day${accountAgeDays !== 1 ? 's' : ''}</div></div>
            <div class="detailItem"><div class="detailLabel">📅 Created</div><div class="detailValue">${formatDate(user.created_at)}</div></div>
            <div class="detailItem"><div class="detailLabel">🔑 Last Login</div><div class="detailValue">${formatDate(user.last_login)}</div></div>
        </div>
        <div class="detailGrid">
            <div class="detailItem"><div class="detailLabel">💥 Spawns</div><div class="detailValue">${progress?.spawn_count ?? 0}</div></div>
            <div class="detailItem"><div class="detailLabel">🔀 Merges</div><div class="detailValue">${progress?.total_merges ?? 0}</div></div>
            <div class="detailItem"><div class="detailLabel">💀 Kills</div><div class="detailValue">${progress?.total_kills ?? 0}</div></div>
            <div class="detailItem"><div class="detailLabel">🏆 Highest Tier</div><div class="detailValue">${progress?.highest_tier ?? 1}</div></div>
            <div class="detailItem"><div class="detailLabel">⏱ Play Time</div><div class="detailValue">${playTimeFormatted}</div></div>
            <div class="detailItem"><div class="detailLabel">📊 Sessions</div><div class="detailValue">${progress?.session_count ?? 0}</div></div>
        </div>
        <div class="progressBarContainer">
            <div class="detailLabel">Tank Unlock Progress</div>
            <div class="progressBar"><div class="progressFill" style="width:${unlockPercent}%"></div><span class="progressText">${unlockedTanks.length} / 60 (${unlockPercent}%)</span></div>
        </div>
        <div class="eventsSection">
            <h3>Recent Events (last 50)</h3>
            ${recentEvents && recentEvents.length > 0 ? `<table class="eventsTable"><thead><tr><th>Time</th><th>Type</th><th>Details</th></tr></thead><tbody>${recentEvents.map(e => `<tr><td>${formatDate(e.created_at)}</td><td><span class="badge" style="background:rgba(255,255,255,0.08)">${e.event_type}</span></td><td style="max-width:300px;overflow:hidden;text-overflow:ellipsis;">${e.details}</td></tr>`).join('')}</tbody></table>` : '<p style="color:#666;">No events yet.</p>'}
        </div>
    `;

    chartsSection.classList.remove('hidden');
    renderCharts(eventTypeCounts, eventsByDay);
    renderMap(user.latitude, user.longitude, user.city, user.country);
}

function renderCharts(eventTypeCounts, eventsByDay) {
    if (activityChart) { activityChart.destroy(); activityChart = null; }
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    if (eventsByDay && eventsByDay.length > 0) {
        activityChart = new Chart(document.getElementById('activityChart'), {
            type: 'bar',
            data: {
                labels: eventsByDay.map(e => e.day),
                datasets: [
                    { label: 'Spawns', data: eventsByDay.map(e => e.spawns || 0), backgroundColor: 'rgba(100, 180, 255, 0.7)', borderColor: 'rgba(100, 180, 255, 1)', borderWidth: 1 },
                    { label: 'Merges', data: eventsByDay.map(e => e.merges || 0), backgroundColor: 'rgba(80, 200, 120, 0.7)', borderColor: 'rgba(80, 200, 120, 1)', borderWidth: 1 },
                    { label: 'Kills', data: eventsByDay.map(e => e.kills || 0), backgroundColor: 'rgba(255, 100, 100, 0.7)', borderColor: 'rgba(255, 100, 100, 1)', borderWidth: 1 }
                ]
            },
            options: { responsive: true, plugins: { title: { display: true, text: 'Activity Over Time', color: '#ccc' }, legend: { labels: { color: '#ccc' } } }, scales: { x: { ticks: { color: '#999' } }, y: { ticks: { color: '#999' }, beginAtZero: true } } }
        });
    } else {
        document.getElementById('activityChart').parentElement.innerHTML = '<div class="chartPlaceholder">No activity data yet.</div>';
    }
    if (eventTypeCounts && eventTypeCounts.length > 0) {
        const colors = { spawn: 'rgba(100, 180, 255, 0.8)', merge: 'rgba(80, 200, 120, 0.8)', kill: 'rgba(255, 100, 100, 0.8)', unlock: 'rgba(255, 200, 50, 0.8)', session_start: 'rgba(180, 120, 255, 0.8)', session_end: 'rgba(255, 150, 50, 0.8)' };
        pieChart = new Chart(document.getElementById('eventPieChart'), {
            type: 'pie',
            data: { labels: eventTypeCounts.map(e => e.event_type), datasets: [{ data: eventTypeCounts.map(e => e.count), backgroundColor: eventTypeCounts.map(e => colors[e.event_type] || 'rgba(200,200,200,0.8)') }] },
            options: { responsive: true, plugins: { title: { display: true, text: 'Event Distribution', color: '#ccc' }, legend: { position: 'bottom', labels: { color: '#ccc' } } } }
        });
    } else {
        document.getElementById('eventPieChart').parentElement.innerHTML = '<div class="chartPlaceholder">No event data yet.</div>';
    }
}

function renderMap(lat, lon, city, country) {
    const mapContainer = document.getElementById('userMapContainer');
    const mapEl = document.getElementById('userMap');
    if (userMap) { userMap.remove(); userMap = null; }
    if (lat && lon && (lat !== 0 || lon !== 0)) {
        mapContainer.classList.remove('hidden');
        mapEl.style.height = '280px';
        userMap = L.map(mapEl).setView([lat, lon], 10);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap contributors', maxZoom: 18 }).addTo(userMap);
        L.marker([lat, lon]).addTo(userMap).bindPopup(`<b>${city || 'Unknown'}</b><br>${country || ''}`).openPopup();
        setTimeout(() => userMap.invalidateSize(), 200);
    } else {
        mapContainer.classList.add('hidden');
    }
}

function formatPlayTime(seconds) {
    if (!seconds || seconds === 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    return hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    try { const d = new Date(dateStr + 'Z'); return d.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return dateStr; }
}

let confirmResolve = null;

function showConfirm(title, message) {
    return new Promise(resolve => {
        confirmResolve = resolve;
        document.getElementById('confirmDialogTitle').textContent = title;
        document.getElementById('confirmDialogMessage').textContent = message;
        document.getElementById('confirmDialog').classList.remove('hidden');
    });
}

function hideConfirm() {
    document.getElementById('confirmDialog').classList.add('hidden');
}

async function confirmDelete(userId, username) {
    const ok = await showConfirm('Delete User', `Delete user "${username}" and all their data? This cannot be undone.`);
    if (!ok) return;
    const result = await apiFetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
    if (result.ok) {
        allUsers = allUsers.filter(u => u.id !== userId);
        applyFilter();
        document.getElementById('statTotalUsers').textContent = allUsers.length;
    }
}

async function confirmReset(userId, username) {
    const ok = await showConfirm('Reset Progress', `Reset all game progress for "${username}"? Events will also be cleared.`);
    if (!ok) return;
    const result = await apiFetch(`/api/admin/users/${userId}/reset`, { method: 'POST' });
    if (result.ok) {
        const idx = allUsers.findIndex(u => u.id === userId);
        if (idx !== -1) {
            allUsers[idx].spawn_count = 0;
            allUsers[idx].total_merges = 0;
            allUsers[idx].total_kills = 0;
            allUsers[idx].highest_tier = 1;
        }
        applyFilter();
    }
}

document.getElementById('confirmDialogOk').addEventListener('click', () => {
    hideConfirm();
    if (confirmResolve) { confirmResolve(true); confirmResolve = null; }
});

document.getElementById('confirmDialogCancel').addEventListener('click', () => {
    hideConfirm();
    if (confirmResolve) { confirmResolve(false); confirmResolve = null; }
});

document.getElementById('userSearchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    applyFilter();
});

document.getElementById('backToGameBtn').addEventListener('click', () => window.location.href = '/');
document.getElementById('backToListBtn').addEventListener('click', () => {
    document.getElementById('userDetailSection').classList.add('hidden');
    document.getElementById('userDetailCharts').classList.add('hidden');
    document.getElementById('usersSection').classList.remove('hidden');
    if (activityChart) { activityChart.destroy(); activityChart = null; }
    if (pieChart) { pieChart.destroy(); pieChart = null; }
    if (userMap) { userMap.remove(); userMap = null; }
});
document.getElementById('refreshBtn').addEventListener('click', () => location.reload());
document.getElementById('logoutBtn').addEventListener('click', () => { clearToken(); location.reload(); });

loadDashboard();
