const express = require('express');
const fs = require('fs');
const path = require('path');
const steam = require('./steam.js');
const prices = require('./prices.js');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const HOST = '127.0.0.1'; // tylko lokalnie - dane logowania nie wychodza poza komputer
const PORT = process.env.PORT || 3000;

// Cache calego wyniku (24h) - po starcie strony ekwipunek laduje sie od razu,
// bez logowania, jesli ostatnie dane sa swiezsze niz doba.
const RESULT_FILE = path.join(__dirname, '..', 'output', 'inventory_cache.json');
const RESULT_TTL_MS = 24 * 60 * 60 * 1000;

function save_result(result) {
    try {
        fs.mkdirSync(path.dirname(RESULT_FILE), { recursive: true });
        fs.writeFileSync(RESULT_FILE, JSON.stringify(result));
    } catch (err) {
        console.error('Nie udalo sie zapisac cache wyniku:', err.message);
    }
}

// Zwraca zapisany wynik, jesli jest swiezy (<24h), inaczej null.
function load_fresh_result() {
    try {
        const r = JSON.parse(fs.readFileSync(RESULT_FILE, 'utf8'));
        if (r && typeof r.cached_at === 'number' && Date.now() - r.cached_at < RESULT_TTL_MS) {
            return r;
        }
    } catch (err) { /* brak pliku - ok */ }
    return null;
}

// Pojedyncza sesja w pamieci (narzedzie lokalne, jednoosobowe).
// status: idle | logowanie | steam_guard | pobieranie_ekwipunku | pobieranie_cen | gotowe | error
let session = null;

function reset_session() {
    session = {
        status: 'idle',
        progress: { done: 0, total: 0 },
        result: null,
        error: null,
        guardResolver: null,
    };
}
reset_session();

// Suma wartosci ekwipunku (USD), bez duplikatow po id.
function sum_value(items) {
    const seen = new Set();
    let total = 0;
    (function walk(list) {
        for (const it of list) {
            if (Array.isArray(it.items)) { walk(it.items); continue; }
            if (!it.name || seen.has(it.id)) continue;
            seen.add(it.id);
            if (typeof it.price_csfloat_usd === 'number') total += it.price_csfloat_usd;
        }
    })(items);
    return Math.round(total * 100) / 100;
}

// Start logowania + pobierania. Zwraca od razu, dalej frontend odpytuje /api/status.
app.post('/api/login', async (req, res) => {
    const { accountName, password, apiKey } = req.body || {};
    if (!accountName || !password) {
        return res.status(400).json({ error: 'Podaj login i haslo.' });
    }
    if (session.status !== 'idle' && session.status !== 'gotowe' && session.status !== 'error') {
        return res.status(409).json({ error: 'Logowanie juz trwa.' });
    }

    reset_session();
    session.status = 'logowanie';
    if (apiKey) prices.set_api_key(apiKey);

    res.json({ ok: true });

    try {
        const inventory = await steam.fetch_inventory({
            accountName,
            password,
            onStatus: (text) => { session.status = text; },
            getGuardCode: () => new Promise((resolve) => {
                session.status = 'steam_guard';
                session.guardResolver = resolve;
            }),
        });

        // ekwipunek pobrany - teraz ceny + zdjecia
        session.status = 'pobieranie_cen';
        const total = prices.count_items(inventory);
        session.progress = { done: 0, total };

        // wynik trzymamy od razu i zapisujemy na biezaco (co ~5s), zeby przy
        // bardzo duzych ekwipunkach lub awarii nie stracic postepu
        session.result = { items: inventory, total_usd: 0, count: total, cached_at: Date.now() };
        let lastSave = 0;
        const persist = () => {
            session.result.total_usd = sum_value(inventory);
            session.result.cached_at = Date.now();
            save_result(session.result);
        };

        await prices.Add_Prices(inventory, null, (p) => {
            session.progress = p;
            const now = Date.now();
            if (now - lastSave > 5000) { lastSave = now; persist(); }
        });

        persist(); // finalny zapis pelnego wyniku
        session.status = 'gotowe';
    } catch (err) {
        console.error('Blad sesji:', err.message);
        session.error = err.message;
        session.status = 'error';
    }
});

// Podanie kodu Steam Guard.
app.post('/api/guard', (req, res) => {
    const { code } = req.body || {};
    if (!code) return res.status(400).json({ error: 'Podaj kod Steam Guard.' });
    if (session.status !== 'steam_guard' || !session.guardResolver) {
        return res.status(409).json({ error: 'Steam nie oczekuje teraz na kod.' });
    }
    const resolve = session.guardResolver;
    session.guardResolver = null;
    session.status = 'logowanie';
    resolve(code.trim());
    res.json({ ok: true });
});

// Status sesji (frontend odpytuje co ~1s).
// Gdy nic nie trwa, a na dysku jest swiezy cache (<24h) - zglaszamy gotowe.
app.get('/api/status', (req, res) => {
    const working = ['logowanie', 'steam_guard', 'zalogowano',
        'pobieranie_ekwipunku', 'pobieranie_cen'].includes(session.status);

    let ready = session.status === 'gotowe';
    let from_cache = false;
    if (!working && !ready && load_fresh_result()) {
        ready = true;
        from_cache = true;
    }

    res.json({
        status: session.status,
        progress: session.progress,
        error: session.error,
        ready,
        from_cache,
    });
});

// Gotowy ekwipunek z cenami (z sesji albo ze swiezego cache na dysku).
app.get('/api/inventory', (req, res) => {
    const result = session.result || load_fresh_result();
    if (!result) {
        return res.status(409).json({ error: 'Ekwipunek nie jest jeszcze gotowy.' });
    }
    res.json(result);
});

app.listen(PORT, HOST, () => {
    console.log(`\n  CS2 Inventory dziala na: http://${HOST}:${PORT}\n`);
});
