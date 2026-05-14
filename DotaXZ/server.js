const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const session = require('express-session');

const app = express();
app.use(cors());
app.use(express.json()); // Чтобы сервер понимал логин и пароль
app.use(express.static(path.join(__dirname, 'public')));

// Настройка сессий (запоминаем, кто вошел)
app.use(session({
    secret: 'dota-secret-key',
    resave: false,
    saveUninitialized: false
}));

// ==========================================
// БЕЗОПАСНАЯ БАЗА ДАННЫХ (Файл users.json)
// ==========================================
const DB_FILE = './users.json';
if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify([])); // Создаем пустой файл, если его нет
}

// Регистрация
app.post('/api/register', (req, res) => {
    // Получаем данные. Берем оба варианта (steamId и steam_id), чтобы точно сработало!
    const username = req.body.username;
    const password = req.body.password;
    const steamId = req.body.steamId || req.body.steam_id; 

    if (!username || !password || !steamId) {
        return res.status(400).json({ error: 'Заполните все поля' });
    }

    const users = JSON.parse(fs.readFileSync(DB_FILE));
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: 'Логин занят' });
    }

    users.push({ username, password, steamId });
    fs.writeFileSync(DB_FILE, JSON.stringify(users, null, 2));
    res.json({ success: true });
});


// Вход
app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const users = JSON.parse(fs.readFileSync(DB_FILE));
    
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return res.status(400).json({ error: 'Неверный логин или пароль' });

    req.session.user = { username: user.username, steamId: user.steamId };
    res.json({ success: true });
});

// Проверка сессии
app.get('/api/me', (req, res) => {
    if (req.session.user) res.json({ loggedIn: true, user: req.session.user });
    else res.json({ loggedIn: false });
});

// Выход
app.post('/api/logout', (req, res) => {
    req.session.destroy();
    res.json({ success: true });
});

// ==========================================
// КЭШИРОВАНИЕ ДОТЫ И РОУТЫ
// ==========================================
let allHeroes = []; let itemIds = {}; let itemsData = {};

async function loadStaticData() {
    try {
        const [heroesRes, idsRes, itemsRes] = await Promise.all([
            axios.get('https://api.opendota.com/api/heroStats'),
            axios.get('https://api.opendota.com/api/constants/item_ids'),
            axios.get('https://api.opendota.com/api/constants/items')
        ]);
        allHeroes = heroesRes.data; itemIds = idsRes.data; itemsData = itemsRes.data;
        console.log('База Доты загружена.');
    } catch (err) { console.error('Ошибка загрузки базы Доты:', err.message); }
}

app.get('/api/search/:name', async (req, res) => {
    try {
        const response = await axios.get(`https://api.opendota.com/api/search?q=${req.params.name}`);
        res.json(response.data.slice(0, 10));
    } catch (err) { res.status(500).json({ error: 'Ошибка поиска' }); }
});

app.get('/api/player/:id', async (req, res) => {
    try {
        const [profile, wl, matches, heroes] = await Promise.all([
            axios.get(`https://api.opendota.com/api/players/${req.params.id}`),
            axios.get(`https://api.opendota.com/api/players/${req.params.id}/wl`),
            axios.get(`https://api.opendota.com/api/players/${req.params.id}/recentMatches`),
            axios.get(`https://api.opendota.com/api/players/${req.params.id}/heroes`)
        ]);

        const topHeroes = heroes.data.slice(0, 5).map(h => {
            const heroInfo = allHeroes.find(ah => ah.hero_id === Number(h.hero_id));
            return { name: heroInfo ? heroInfo.localized_name : 'Неизвестно', img: heroInfo ? `https://api.opendota.com${heroInfo.icon}` : '', games: h.games, winrate: ((h.win / h.games) * 100).toFixed(1) };
        });

        const recentMatches = matches.data.slice(0, 15).map(m => {
            const heroInfo = allHeroes.find(ah => ah.hero_id === m.hero_id);
            return { ...m, heroImg: heroInfo ? `https://api.opendota.com${heroInfo.icon}` : '' };
        });

        res.json({ profile: profile.data, winLoss: wl.data, matches: recentMatches, topHeroes: topHeroes });
    } catch (err) { res.status(500).json({ error: 'Ошибка загрузки профиля' }); }
});

app.get('/api/meta', (req, res) => {
    const totalProGames = allHeroes.reduce((sum, h) => sum + h.pro_pick, 0) / 10; 
    const heroes = allHeroes.map(h => ({
        name: h.localized_name, img: `https://api.opendota.com${h.icon}`, winrate: ((h.pro_win / h.pro_pick) * 100).toFixed(1) || 0, pickrate: ((h.pro_pick / totalProGames) * 100).toFixed(1) || 0, banrate: ((h.pro_ban / totalProGames) * 100).toFixed(1) || 0
    })).sort((a, b) => b.winrate - a.winrate);
    res.json(heroes);
});

app.get('/api/match/:matchId', async (req, res) => {
    try {
        const matchRes = await axios.get(`https://api.opendota.com/api/matches/${req.params.matchId}`);
        const match = matchRes.data;
        const getItemImg = (id) => {
            if (!id || id === 0) return null;
            const itemName = itemIds[id];
            if (itemName && itemsData[itemName]) return `https://api.opendota.com${itemsData[itemName].img}`;
            return null;
        };
        const players = match.players.map(p => {
            const hero = allHeroes.find(h => h.hero_id === p.hero_id);
            return {
                name: p.personaname || 'Скрытый профиль', heroName: hero ? hero.localized_name : 'Неизвестно', heroImg: hero ? `https://api.opendota.com${hero.icon}` : '',
                kills: p.kills, deaths: p.deaths, assists: p.assists, damage: p.hero_damage || 0, netWorth: p.net_worth || 0, isRadiant: p.player_slot < 128,
                items: [ getItemImg(p.item_0), getItemImg(p.item_1), getItemImg(p.item_2), getItemImg(p.item_3), getItemImg(p.item_4), getItemImg(p.item_5), getItemImg(p.item_neutral) ]
            };
        });
        res.json({ match_id: match.match_id, radiant_win: match.radiant_win, duration: Math.floor(match.duration / 60), players: players });
    } catch (err) { res.status(500).json({ error: 'Ошибка загрузки матча' }); }
});

loadStaticData().then(() => { app.listen(3000, () => console.log('Сервер работает на http://localhost:3000')); });