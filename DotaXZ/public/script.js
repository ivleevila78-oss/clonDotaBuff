let currentUser = null;

// Проверка авторизации при загрузке сайта
async function checkAuth() {
    const res = await fetch('/api/me');
    const data = await res.json();
    
    const navLinks = document.getElementById('navLinks');
    if (data.loggedIn) {
        currentUser = data.user;
        navLinks.innerHTML = `
            <span onclick="showSection('searchSection')">Поиск</span>
            <span onclick="loadMeta()">Мета Патча</span>
            <span onclick="loadProfile('${currentUser.steamId}')" style="color: #10B981;">Моя Статистика (${currentUser.username})</span>
            <span onclick="logout()" style="color: #EF4444;">Выйти</span>
        `;
        showSection('searchSection');
    } else {
        currentUser = null;
        navLinks.innerHTML = `
            <span onclick="showSection('searchSection')">Поиск</span>
            <span onclick="loadMeta()">Мета Патча</span>
            <span onclick="showSection('authSection')" style="color: #3B82F6;">Войти / Регистрация</span>
        `;
        showSection('authSection');
    }
}

// ==========================================
// ЛОГИКА АВТОРИЗАЦИИ
// ==========================================
let isRegisterMode = false;

function toggleAuthMode() {
    isRegisterMode = !isRegisterMode;
    document.getElementById('authTitle').innerText = isRegisterMode ? 'Регистрация' : 'Вход в аккаунт';
    document.getElementById('authBtn').innerText = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
    document.getElementById('authSteamId').style.display = isRegisterMode ? 'inline-block' : 'none';
    document.getElementById('authBtn').setAttribute('onclick', isRegisterMode ? 'register()' : 'login()');
}

async function register() {
    const username = document.getElementById('authUsername').value;
    const password = document.getElementById('authPassword').value;
    const steamId = document.getElementById('authSteamId').value;

    const res = await fetch('/api/register', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, steamId })
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    
    alert('Успешно! Теперь войдите в аккаунт.');
    toggleAuthMode();
}

async function login() {
    const username = document.getElementById('authUsername').value;
    const password = document.getElementById('authPassword').value;

    const res = await fetch('/api/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (data.error) return alert(data.error);
    
    await checkAuth();
}

async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    await checkAuth();
}

// ==========================================
// ОСНОВНАЯ ЛОГИКА САЙТА
// ==========================================
function showSection(sectionId) {
    document.querySelectorAll('.content-section').forEach(sec => sec.classList.remove('active'));
    document.getElementById(sectionId).classList.add('active');
}

async function searchPlayer() {
    const name = document.getElementById('searchInput').value;
    if (!name) return;
    document.getElementById('searchResults').innerHTML = '<h3 style="text-align:center;">Ищем...</h3>';
    const res = await fetch(`/api/search/${name}`);
    const players = await res.json();
    let html = '';
    players.forEach(p => {
        html += `<div class="player-card" onclick="loadProfile('${p.account_id}')">
                    <img src="${p.avatarfull}" alt="avatar"><h3>${p.personaname}</h3>
                 </div>`;
    });
    document.getElementById('searchResults').innerHTML = html;
}

async function loadProfile(accountId) {
    showSection('profileSection');
    document.getElementById('matchTable').innerHTML = '<tr><td colspan="4">Загрузка матчей...</td></tr>';
    
    const res = await fetch(`/api/player/${accountId}`);
    const data = await res.json();

    document.getElementById('pAvatar').src = data.profile.profile.avatarfull;
    document.getElementById('pName').innerText = data.profile.profile.personaname;
    const w = data.winLoss.win; const l = data.winLoss.lose;
    document.getElementById('pWins').innerText = w; document.getElementById('pLosses').innerText = l;
    document.getElementById('pWinrate').innerText = ((w / (w + l)) * 100).toFixed(1);

    let heroesHtml = '';
    data.topHeroes.forEach(h => {
        heroesHtml += `<tr><td><img src="${h.img}" width="40" style="border-radius:4px;"></td><td><b>${h.name}</b></td><td>${h.games}</td><td style="color: ${h.winrate > 50 ? '#10B981' : '#EF4444'}">${h.winrate}%</td></tr>`;
    });
    document.getElementById('topHeroesTable').innerHTML = heroesHtml;

    let matchHtml = '';
    data.matches.forEach(m => {
        const isRadiant = m.player_slot < 128;
        const isWin = (isRadiant && m.radiant_win) || (!isRadiant && !m.radiant_win);
        matchHtml += `
            <tr class="match-row" onclick="loadMatchDetails(${m.match_id})">
                <td><img src="${m.heroImg}" width="45" style="border-radius:4px;"></td>
                <td style="color: #3B82F6; text-decoration: underline;">${m.match_id}</td>
                <td>${m.kills} / <span class="loss">${m.deaths}</span> / ${m.assists}</td>
                <td class="${isWin ? 'win' : 'loss'}">${isWin ? 'Победа' : 'Поражение'}</td>
            </tr>`;
    });
    document.getElementById('matchTable').innerHTML = matchHtml;
}

async function loadMatchDetails(matchId) {
    showSection('matchDetailsSection');
    document.getElementById('matchTitle').innerHTML = `Загрузка матча ${matchId}...`;
    document.getElementById('radiantTable').innerHTML = ''; document.getElementById('direTable').innerHTML = '';

    const res = await fetch(`/api/match/${matchId}`);
    const match = await res.json();

    const resultText = match.radiant_win ? '<span class="win">Победа Света</span>' : '<span class="loss">Победа Тьмы</span>';
    document.getElementById('matchTitle').innerHTML = `Матч ${matchId} — ${resultText} (${match.duration} мин.)`;

    let radiantHtml = ''; let direHtml = '';
    match.players.forEach(p => {
        let itemsHtml = '';
        for(let i = 0; i < 6; i++) itemsHtml += p.items[i] ? `<img src="${p.items[i]}" class="item-img">` : `<div class="item-img"></div>`;
        itemsHtml += p.items[6] ? `<img src="${p.items[6]}" class="item-img neutral-item">` : `<div class="item-img neutral-item"></div>`;

        const rowHtml = `<tr><td><img src="${p.heroImg}" width="40" style="border-radius:4px;"></td><td><b>${p.name}</b></td><td>${p.kills} / <span class="loss">${p.deaths}</span> / ${p.assists}</td><td>${p.damage.toLocaleString()}</td><td style="color: #F59E0B;">${p.netWorth.toLocaleString()}</td><td>${itemsHtml}</td></tr>`;
        if (p.isRadiant) radiantHtml += rowHtml; else direHtml += rowHtml;
    });

    document.getElementById('radiantTable').innerHTML = radiantHtml;
    document.getElementById('direTable').innerHTML = direHtml;
}

async function register() {
    // .trim() удаляет случайные невидимые пробелы в начале и конце
    const username = document.getElementById('authUsername').value.trim();
    const password = document.getElementById('authPassword').value.trim();
    const steamId = document.getElementById('authSteamId').value.trim();

    // Проверяем прямо в браузере перед отправкой
    if (!username || !password || !steamId) {
        return alert('Пожалуйста, заполните все 3 поля!');
    }

    const res = await fetch('/api/register', {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username, password: password, steamId: steamId })
    });
    
    const data = await res.json();
    if (data.error) return alert(data.error);
    
    alert('Успешно! Теперь войдите в аккаунт.');
    toggleAuthMode(); // Возвращаем окно в режим входа
}

// Запуск
checkAuth();