const https = require('https');

// Pobiera publiczny ekwipunek CS2 ze Steam Community (JSON z polami icon_url
// i market_hash_name dla KAZDEGO przedmiotu - w tym medali, monet, graffiti,
// music kitow), niezaleznie od CSFloat. Mapuje po asset id (w CS2 = id przedmiotu z GC).
//
// Zwraca Map<assetid, { icon_url, market_hash_name, name }>.
// Przy bledzie / prywatnym ekwipunku zwraca pusta mape (nie wywala niczego).

function get_json(url) {
    return new Promise((resolve, reject) => {
        const headers = {
            'Accept': 'application/json',
            'User-Agent': 'Mozilla/5.0 cs2-inventory',
        };
        https.get(url, { headers }, (response) => {
            // przekierowania (np. na prywatny / brak) traktujemy jako brak danych
            if (response.statusCode >= 300) {
                response.resume();
                return reject(new Error('HTTP ' + response.statusCode));
            }
            let body = '';
            response.on('data', (c) => body += c);
            response.on('end', () => {
                try { resolve(JSON.parse(body)); }
                catch (e) { reject(new Error('Niepoprawny JSON z ekwipunku Steam')); }
            });
        }).on('error', reject);
    });
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetch_image_map(steamid64) {
    const map = new Map();
    if (!steamid64) return map;

    let start_assetid = null;
    let guard = 0;
    try {
        while (guard++ < 20) {
            let url = `https://steamcommunity.com/inventory/${steamid64}/730/2?l=english&count=2000`;
            if (start_assetid) url += '&start_assetid=' + start_assetid;

            const data = await get_json(url);
            if (!data || !Array.isArray(data.assets) || !Array.isArray(data.descriptions)) break;

            // descriptions sa zdeduplikowane po classid_instanceid
            const desc = {};
            for (const d of data.descriptions) {
                desc[d.classid + '_' + d.instanceid] = d;
            }
            for (const a of data.assets) {
                const d = desc[a.classid + '_' + a.instanceid];
                if (d && d.icon_url) {
                    map.set(String(a.assetid), {
                        icon_url: d.icon_url,
                        market_hash_name: d.market_hash_name || null,
                        name: d.name || null,
                    });
                }
            }

            if (data.more_items && data.last_assetid) {
                start_assetid = data.last_assetid;
                await sleep(800); // delikatnie dla Steam
            } else {
                break;
            }
        }
    } catch (err) {
        console.warn('Nie udalo sie pobrac zdjec z ekwipunku Steam (' + err.message + '). '
            + 'Medale moga nie miec zdjec - upewnij sie, ze ekwipunek jest publiczny.');
    }
    return map;
}

// Uzupelnia brakujace icon_url i naprawia nazwy zawierajace "undefined"
// na podstawie mapy z ekwipunku Steam. Dziala rekurencyjnie (magazyny).
function enrich(items, map) {
    let filled = 0, fixed = 0;
    (function walk(list) {
        for (const it of list) {
            if (Array.isArray(it.items)) { walk(it.items); continue; }
            if (it.id == null) continue;
            const d = map.get(String(it.id));
            if (!d) continue;
            if (!it.icon_url && d.icon_url) { it.icon_url = d.icon_url; filled++; }
            if (it.name && it.name.includes('undefined') && d.market_hash_name) {
                it.name = d.market_hash_name;
                fixed++;
            }
        }
    })(items);
    if (filled || fixed) {
        console.log(`Ekwipunek Steam: uzupelniono ${filled} zdjec, naprawiono ${fixed} nazw.`);
    }
    return items;
}

module.exports = { fetch_image_map, enrich };
