const fs = require('fs');
const path = require('path');

// Mapa nazw przedmiotow -> URL obrazka (Steam CDN), na podstawie ByMykel/CSGO-API.
// Pobierana raz i cache'owana na dysku.

const CACHE_PATH = path.join(__dirname, 'images_cache.json');
const SOURCE_URL = 'https://raw.githubusercontent.com/ByMykel/CSGO-API/main/public/api/en/all.json';

let image_map = null;

async function load_image_map() {
    if (image_map) return image_map;

    if (fs.existsSync(CACHE_PATH)) {
        image_map = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
        return image_map;
    }

    console.log('Pobieram baze obrazkow przedmiotow (jednorazowo)...');
    const response = await fetch(SOURCE_URL);
    if (!response.ok) throw new Error('Nie udalo sie pobrac bazy obrazkow: HTTP ' + response.status);
    const all_items = await response.json();

    image_map = {};
    for (const key of Object.keys(all_items)) {
        const item = all_items[key];
        if (item && item.name && item.image) {
            image_map[item.name] = item.image;
        }
    }
    fs.writeFileSync(CACHE_PATH, JSON.stringify(image_map));
    console.log('Baza obrazkow zapisana (' + Object.keys(image_map).length + ' nazw).');
    return image_map;
}

const WEAR_SUFFIX = / \((Factory New|Minimal Wear|Field-Tested|Well-Worn|Battle-Scarred)\)$/;

// Dopasowuje obrazek do market_hash_name, probujac coraz ogolniejszych wariantow nazwy
function find_image(map, market_hash_name) {
    if (!market_hash_name) return null;

    const candidates = [market_hash_name];
    const no_wear = market_hash_name.replace(WEAR_SUFFIX, '');
    candidates.push(no_wear);

    const no_prefix = no_wear.replace(/^(★ )?(StatTrak™ )?(Souvenir )?/, '').trim();
    candidates.push(no_prefix, '★ ' + no_prefix);

    // np. graffiti z odcieniem: "Sealed Graffiti | Eco (Brick Red)" -> "Sealed Graffiti | Eco"
    candidates.push(no_prefix.replace(/ \([^)]*\)$/, ''));

    for (const name of candidates) {
        if (map[name]) return map[name];
    }
    return null;
}

// Dopisuje pole image kazdemu przedmiotowi (rekurencyjnie, razem z magazynami)
function attach_images(items, map) {
    for (const item of items) {
        if (Array.isArray(item.items)) {
            attach_images(item.items, map);
            continue;
        }
        item.image = find_image(map, item.market_hash_name || item.name);
    }
}

module.exports = { load_image_map, attach_images };
