const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');
const items_manager = require('./items.js');
const steam_images = require('./steam_images.js');

const CS2_APP_ID = 730;

// Loguje sie do Steam, laczy z Game Coordinatorem CS2 i zwraca przetworzony
// ekwipunek (bez cen - ceny dolicza prices.js). Po przetworzeniu uzupelnia
// zdjecia i naprawia nazwy na podstawie publicznego ekwipunku Steam.
//
// opcje:
//   accountName, password           - dane logowania
//   getGuardCode()                  - async; ma zwrocic kod Steam Guard, gdy Steam o niego poprosi
//   onStatus(text)                  - opcjonalny; informuje o etapie ('logowanie', 'GC', ...)
//
// Zwraca Promise<inventory[]> albo odrzuca z bledem.
function fetch_inventory({ accountName, password, getGuardCode, onStatus }) {
    return new Promise((resolve, reject) => {
        const user = new SteamUser();
        const csgo = new GlobalOffensive(user);
        let settled = false;

        const status = (text) => { if (onStatus) onStatus(text); };

        const finish = (err, data) => {
            if (settled) return;
            settled = true;
            try { user.logOff(); } catch (e) { /* ignore */ }
            if (err) reject(err);
            else resolve(data);
        };

        // Bezpiecznik TYLKO na samo polaczenie z GC (1 min). Po polaczeniu
        // przetwarzanie ekwipunku/magazynow moze trwac dowolnie dlugo - duze
        // ekwipunki z wieloma magazynami robia osobne zapytanie na kazdy magazyn.
        let connectTimeout = setTimeout(() => {
            finish(new Error('Przekroczono czas oczekiwania na polaczenie z Game Coordinator (1 min).'));
        }, 60000);
        const clearConnectTimeout = () => {
            if (connectTimeout) { clearTimeout(connectTimeout); connectTimeout = null; }
        };

        user.logOn({ accountName, password });

        // Steam Guard - prosimy frontend o kod
        user.on('steamGuard', (domain, callback) => {
            status('steam_guard');
            Promise.resolve()
                .then(() => getGuardCode(domain))
                .then((code) => callback(code))
                .catch((e) => finish(e));
        });

        user.on('loggedOn', () => {
            status('zalogowano');
            user.setPersona(SteamUser.EPersonaState.Online);
            user.gamesPlayed(CS2_APP_ID);
        });

        user.on('error', (err) => {
            clearConnectTimeout();
            finish(translate_steam_error(err));
        });

        csgo.on('connectedToGC', async () => {
            // polaczono z GC - kasujemy bezpiecznik, przetwarzanie bez limitu czasu
            clearConnectTimeout();
            status('pobieranie_ekwipunku');
            try {
                const items = await items_manager.Process_Items(csgo.inventory, csgo);

                // Uzupelnienie zdjec i nazw z publicznego ekwipunku Steam.
                // Niezbedne dla medali/monet/graffiti/music kitow, ktorych nie ma
                // na CSFloat. Bledy (prywatny ekwipunek itp.) sa nieblokujace.
                try {
                    const steamid64 = user.steamID ? user.steamID.getSteamID64() : null;
                    const imgMap = await steam_images.fetch_image_map(steamid64);
                    steam_images.enrich(items, imgMap);
                } catch (e) {
                    console.warn('Uzupelnianie zdjec/nazw pominiete:', e.message);
                }

                finish(null, items);
            } catch (err) {
                finish(err);
            }
        });
    });
}

// Zamienia kody bledow steam-user na czytelne komunikaty po polsku.
function translate_steam_error(err) {
    const code = err && err.eresult;
    const map = {
        5: 'Niepoprawny login lub haslo.',
        63: 'Wymagany kod Steam Guard (lub byl niepoprawny).',
        65: 'Niepoprawny kod Steam Guard.',
        84: 'Zbyt wiele prob logowania. Odczekaj chwile i sprobuj ponownie.',
        50: 'Konto zalogowane w innym miejscu.',
    };
    const message = map[code] || (err && err.message) || 'Blad logowania do Steam.';
    const out = new Error(message);
    out.eresult = code;
    return out;
}

module.exports = { fetch_inventory };
