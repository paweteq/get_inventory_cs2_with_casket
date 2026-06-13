const https = require('https');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');

// Dyskowy cache cen z TTL 24h - ponowne uruchomienia nie pytaja CSFloata
// o te same przedmioty.
const CACHE_FILE = path.join(__dirname, '..', 'output', 'price_cache.json');
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Klucz API CSFloat (csfloat.com/profile -> zakladka "developer").
// Ustaw go w config.json ("csfloat_api_key"), zmiennej CSFLOAT_API_KEY albo przez set_api_key().
let API_KEY = process.env.CSFLOAT_API_KEY || config.csfloat_api_key || '';

function set_api_key(key) {
    if (key) API_KEY = key;
}

// Odstep miedzy zapytaniami (ms). Bez klucza API lepiej nie schodzic ponizej 1500.
function request_delay_ms() {
    return API_KEY ? 500 : 1500;
}

const MAX_RETRIES = 3;

// Mapa: cache_key -> { price, icon_url, ts }
const price_cache = new Map();
let last_cache_save = 0; // throttle zapisu na dysk (ms)

// Wczytuje cache z dysku przy starcie (pomija wpisy starsze niz TTL).
function load_cache() {
    try {
        const raw = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
        const now = Date.now();
        let loaded = 0;
        for (const [key, entry] of Object.entries(raw)) {
            if (entry && typeof entry.ts === 'number' && now - entry.ts < CACHE_TTL_MS) {
                price_cache.set(key, entry);
                loaded++;
            }
        }
        if (loaded) console.log('Wczytano ' + loaded + ' cen z cache (output/price_cache.json).');
    } catch (err) {
        // brak pliku albo niepoprawny - ignorujemy, zaczniemy z pustym cache
    }
}

// Zapisuje cache na dysk (tylko swieze wpisy).
function save_cache() {
    try {
        fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
        const now = Date.now();
        const out = {};
        for (const [key, entry] of price_cache.entries()) {
            if (entry && typeof entry.ts === 'number' && now - entry.ts < CACHE_TTL_MS) {
                out[key] = entry;
            }
        }
        fs.writeFileSync(CACHE_FILE, JSON.stringify(out));
    } catch (err) {
        console.error('Nie udalo sie zapisac cache cen:', err.message);
    }
}

load_cache();

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Zamienia nazwe generowana przez items.js na market_hash_name uzywany przez CSFloat
function to_market_hash_name(name) {
    if (!name) return null;
    let res = name;

    // przedmioty bez rynku
    if (res === 'Music KIT | Valve') return null;

    let prefix = '';
    if (res.includes('(★ StatTrak™)')) {
        res = res.replace('(★ StatTrak™)', '');
        prefix = '★ StatTrak™ ';
    } else if (res.includes('(★)')) {
        res = res.replace('(★)', '');
        prefix = '★ ';
    } else if (res.includes('(StatTrak™)')) {
        res = res.replace('(StatTrak™)', '');
        prefix = 'StatTrak™ ';
    } else if (res.includes('(souvenir)')) {
        res = res.replace('(souvenir)', '');
        prefix = 'Souvenir ';
    }

    // Keychain -> Charm, Graffiti -> Sealed Graffiti (nazwy rynkowe)
    if (res.startsWith('Keychain | ')) {
        res = res.replace('Keychain | ', 'Charm | ');
    }
    if (res.startsWith('Graffiti | ')) {
        res = res.replace('Graffiti | ', 'Sealed Graffiti | ');
    }
    if (res.startsWith('Music KIT | ')) {
        res = res.replace('Music KIT | ', 'Music Kit | ');
    }

    res = (prefix + res).replace(/\s+/g, ' ').replace(/\s+\|/g, ' |').trim();
    return res;
}

function fetch_json(url) {
    return new Promise((resolve, reject) => {
        const headers = { 'Accept': 'application/json', 'User-Agent': 'cs2-inventory-script' };
        if (API_KEY) headers['Authorization'] = API_KEY;
        https.get(url, { headers }, (response) => {
            let body = '';
            response.on('data', chunk => body += chunk);
            response.on('end', () => {
                if (response.statusCode === 429) {
                    return reject(new Error('RATE_LIMIT'));
                }
                if (response.statusCode < 200 || response.statusCode >= 300) {
                    return reject(new Error('HTTP ' + response.statusCode));
                }
                try {
                    resolve(JSON.parse(body));
                } catch (err) {
                    reject(new Error('Niepoprawny JSON z CSFloat'));
                }
            });
        }).on('error', reject);
    });
}

// Pobiera najnizsza cene (USD) i icon_url dla danego market_hash_name.
// Zwraca { price, icon_url, ts }. paint_index dla Dopplerow (wlasciwa faza).
async function get_lowest_price(market_hash_name, paint_index) {
    const cache_key = market_hash_name + (paint_index ? '|' + paint_index : '');
    const cached = price_cache.get(cache_key);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return cached;
    }

    let url = 'https://csfloat.com/api/v1/listings?sort_by=lowest_price&limit=1&type=buy_now'
        + '&market_hash_name=' + encodeURIComponent(market_hash_name);
    if (paint_index) {
        url += '&paint_index=' + paint_index;
    }

    let result = { price: null, icon_url: null };
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const json = await fetch_json(url);
            // API zwraca tablice albo obiekt { data: [...] }
            const listings = Array.isArray(json) ? json : (json && json.data ? json.data : []);
            if (listings.length > 0) {
                const listing = listings[0];
                if (listing.price != null) result.price = listing.price / 100; // centy -> USD
                if (listing.item && listing.item.icon_url) result.icon_url = listing.item.icon_url;
            }
            break;
        } catch (err) {
            if (err.message === 'RATE_LIMIT' && attempt < MAX_RETRIES) {
                console.log('CSFloat rate limit, czekam 10s... (' + market_hash_name + ')');
                await sleep(10000);
            } else {
                console.error('Blad pobierania ceny dla "' + market_hash_name + '": ' + err.message);
                break;
            }
        }
    }

    result.ts = Date.now();
    price_cache.set(cache_key, result);
    await sleep(request_delay_ms());
    return result;
}

function count_items(items) {
    let count = 0;
    for (const item of items) {
        if (Array.isArray(item.items)) count += count_items(item.items);
        else if (item.name) count++;
    }
    return count;
}

// Przechodzi po wyniku Process_Items (wraz z zawartoscia magazynow)
// i dopisuje kazdemu przedmiotowi price_csfloat_usd oraz icon_url.
// on_progress (opcjonalny) dostaje { done, total } po kazdym przedmiocie.
async function Add_Prices(items, progress, on_progress) {
    const is_top_level = !progress;
    if (!progress) {
        progress = { done: 0, total: count_items(items) };
        console.log('Pobieram ceny z CSFloat dla ' + progress.total + ' przedmiotow...');
    }
    for (const item of items) {
        // magazyn (casket) - wchodzimy do srodka
        if (Array.isArray(item.items)) {
            await Add_Prices(item.items, progress, on_progress);
            continue;
        }
        if (!item.name) continue;

        progress.done++;
        if (on_progress) on_progress({ done: progress.done, total: progress.total });

        if (item.tradeable === false) {
            continue; // np. monety - brak rynku
        }
        const market_hash_name = to_market_hash_name(item.name);
        if (!market_hash_name) continue;

        // dla Dopplerow filtrujemy po paint_index, zeby trafic we wlasciwa faze
        const use_paint_index = item.name.includes('Doppler') ? item.paint_index : null;

        const { price, icon_url } = await get_lowest_price(market_hash_name, use_paint_index);
        item.market_hash_name = market_hash_name;
        item.price_csfloat_usd = price;
        if (icon_url) item.icon_url = icon_url;
        console.log('[' + progress.done + '/' + progress.total + '] ' + market_hash_name + ': '
            + (price != null ? price + ' USD' : 'brak ofert / blad'));

        // zapis cache na biezaco (co ~5s) - przy duzych ekwipunkach nie tracimy postepu
        const now = Date.now();
        if (now - last_cache_save > 5000) { last_cache_save = now; save_cache(); }
    }
    if (is_top_level) save_cache(); // finalny zapis cen
    return items;
}

module.exports = { Add_Prices, to_market_hash_name, get_lowest_price, set_api_key, count_items };
