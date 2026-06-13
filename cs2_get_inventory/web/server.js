const express = require('express');
const path = require('path');
const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');
const items_manager = require('../src/items.js');
const prices = require('../src/prices.js');
const { load_image_map, attach_images } = require('./images.js');

const PORT = 3000;
const CS2_APP_ID = 730;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Stan pojedynczej sesji (apka lokalna - jedna sesja na raz)
let session = { state: 'idle' };

function logoff_quietly() {
    if (session.user) {
        try { session.user.logOff(); } catch (err) { /* ignorujemy */ }
    }
}

app.get('/api/status', (req, res) => {
    res.json({
        state: session.state,
        message: session.message || null,
        progress: session.progress || null,
    });
});

app.post('/api/login', (req, res) => {
    const { accountName, password, csfloatApiKey } = req.body || {};
    if (!accountName || !password) {
        return res.status(400).json({ error: 'Podaj login i haslo Steam.' });
    }
    if (!['idle', 'error', 'done'].includes(session.state)) {
        return res.status(409).json({ error: 'Pobieranie juz trwa.' });
    }

    logoff_quietly();
    if (csfloatApiKey) prices.set_api_key(csfloatApiKey.trim());

    const user = new SteamUser();
    const csgo = new GlobalOffensive(user);
    session = { state: 'logging_in', user, csgo };

    user.on('steamGuard', (domain, callback) => {
        session.state = 'steam_guard';
        session.guardCallback = callback;
        session.message = domain
            ? `Kod Steam Guard zostal wyslany na e-mail (${domain}).`
            : 'Podaj kod z aplikacji mobilnej Steam Guard.';
    });

    user.on('loggedOn', () => {
        session.state = 'connecting_gc';
        session.message = 'Zalogowano, lacze z Game Coordinatorem...';
        user.setPersona(SteamUser.EPersonaState.Online);
        user.gamesPlayed(CS2_APP_ID);
    });

    user.on('error', (err) => {
        session.state = 'error';
        session.message = 'Blad Steam: ' + err.message;
    });

    csgo.on('connectedToGC', async () => {
        try {
            session.state = 'fetching';
            session.message = 'Pobieram ekwipunek i zawartosc magazynow...';
            const items = await items_manager.Process_Items(csgo.inventory, csgo);

            session.progress = { done: 0, total: prices.count_items(items) };
            session.state = 'pricing';
            session.message = 'Pobieram ceny z CSFloat...';
            await prices.Add_Prices(items, session.progress);

            session.state = 'images';
            session.message = 'Dopasowuje obrazki przedmiotow...';
            try {
                const map = await load_image_map();
                attach_images(items, map);
            } catch (err) {
                console.error('Obrazki niedostepne:', err.message);
            }

            session.result = items;
            session.state = 'done';
            session.message = null;
            user.logOff();
        } catch (err) {
            session.state = 'error';
            session.message = 'Blad przetwarzania: ' + (err.message || err);
            logoff_quietly();
        }
    });

    res.json({ ok: true });
});

app.post('/api/steam-guard', (req, res) => {
    const { code } = req.body || {};
    if (session.state !== 'steam_guard' || !session.guardCallback) {
        return res.status(400).json({ error: 'Kod Steam Guard nie jest teraz wymagany.' });
    }
    if (!code) {
        return res.status(400).json({ error: 'Podaj kod.' });
    }
    session.state = 'logging_in';
    session.message = 'Weryfikuje kod...';
    const callback = session.guardCallback;
    session.guardCallback = null;
    callback(code.trim());
    res.json({ ok: true });
});

app.get('/api/inventory', (req, res) => {
    if (session.state !== 'done' || !session.result) {
        return res.status(404).json({ error: 'Dane nie sa jeszcze gotowe.' });
    }
    res.json(session.result);
});

app.listen(PORT, () => {
    console.log(`CS2 Inventory Manager dziala: http://localhost:${PORT}`);
});
