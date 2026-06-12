const https = require('https');
const config = require('./config.js');

// Klucz API CSFloat (csfloat.com/profile -> zakladka "developer").
// Ustaw go w config.json ("csfloat_api_key") albo w zmiennej srodowiskowej CSFLOAT_API_KEY.
const API_KEY = process.env.CSFLOAT_API_KEY || config.csfloat_api_key || '';
// Odstep miedzy zapytaniami (ms). Bez klucza API lepiej nie schodzic ponizej 1500.
const REQUEST_DELAY_MS = API_KEY ? 500 : 1500;
const MAX_RETRIES = 3;
// ========================================================

const price_cache = new Map();

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

// Pobiera najnizsza cene (w USD) dla danego market_hash_name.
// paint_index podajemy dla Dopplerow, zeby cena dotyczyla wlasciwej fazy.
async function get_lowest_price(market_hash_name, paint_index) {
    const cache_key = market_hash_name + (paint_index ? '|' + paint_index : '');
    if (price_cache.has(cache_key)) {
        return price_cache.get(cache_key);
    }

    let url = 'https://csfloat.com/api/v1/listings?sort_by=lowest_price&limit=1&type=buy_now'
        + '&market_hash_name=' + encodeURIComponent(market_hash_name);
    if (paint_index) {
        url += '&paint_index=' + paint_index;
    }

    let price = null;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const json = await fetch_json(url);
            // API zwraca tablice albo obiekt { data: [...] }
            const listings = Array.isArray(json) ? json : (json && json.data ? json.data : []);
            if (listings.length > 0 && listings[0].price != null) {
                price = listings[0].price / 100; // cena w centach -> USD
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

    price_cache.set(cache_key, price);
    await sleep(REQUEST_DELAY_MS);
    return price;
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
// i dopisuje kazdemu przedmiotowi price_csfloat_usd.
async function Add_Prices(items, progress) {
    if (!progress) {
        progress = { done: 0, total: count_items(items) };
        console.log('Pobieram ceny z CSFloat dla ' + progress.total + ' przedmiotow...');
    }
    for (const item of items) {
        // magazyn (casket) - wchodzimy do srodka
        if (Array.isArray(item.items)) {
            await Add_Prices(item.items, progress);
            continue;
        }
        if (!item.name) continue;

        progress.done++;

        if (item.tradeable === false) {
            continue; // np. monety - brak rynku
        }
        const market_hash_name = to_market_hash_name(item.name);
        if (!market_hash_name) continue;

        // dla Dopplerow filtrujemy po paint_index, zeby trafic we wlasciwa faze
        const use_paint_index = item.name.includes('Doppler') ? item.paint_index : null;

        const price = await get_lowest_price(market_hash_name, use_paint_index);
        item.market_hash_name = market_hash_name;
        item.price_csfloat_usd = price;
        console.log('[' + progress.done + '/' + progress.total + '] ' + market_hash_name + ': '
            + (price != null ? price + ' USD' : 'brak ofert / blad'));
    }
    return items;
}

module.exports = { Add_Prices, to_market_hash_name, get_lowest_price };
