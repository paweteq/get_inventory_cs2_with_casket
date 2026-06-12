const fs = require('fs');
const path = require('path');
const VDF = require('@node-steam/vdf');
const casehardened = require('./casehardened.js');
const {
    FadeCalculator,
    AmberFadeCalculator,
    AcidFadeCalculator,
} = require('csgo-fade-percentage-calculator');

// ============================ Dane gry ============================

const DATA_DIR = path.join(__dirname, '..', 'data');

function parse_vdf_file(file_path) {
    return VDF.parse(fs.readFileSync(file_path, 'utf8'));
}

// schemat przedmiotow (items, paint_kits, sticker_kits, prefabs, ...)
const schema = parse_vdf_file(path.join(DATA_DIR, 'items_game.txt'))['items_game'];
// tlumaczenia tokenow na angielskie nazwy
const tokens = parse_vdf_file(path.join(DATA_DIR, 'csgo_english.txt'))['lang']['Tokens'];

// kopia tokenow z kluczami pisanymi malymi literami (potrzebna dla agentow)
const tokens_lowercase = Object.fromEntries(
    Object.entries(tokens).map(([key, value]) => [key.toLowerCase(), value])
);

// Tlumaczy token (np. '#PaintKit_cu_ak47_rubber_Tag') na nazwe z plikow gry
function translate(token) {
    if (token == null) return undefined;
    return tokens[token.replace('#', '')];
}

function translate_case_insensitive(token) {
    if (token == null) return undefined;
    return tokens_lowercase[token.replace('#', '').toLowerCase()];
}

// ============================ Stale ============================

const WEAR_LEVELS = [
    { max: 0.07, name: 'Factory New' },
    { max: 0.15, name: 'Minimal Wear' },
    { max: 0.38, name: 'Field-Tested' },
    { max: 0.45, name: 'Well-Worn' },
    { max: 0.50, name: 'Battle-Scarred' },
];

// nazwy paint kitow -> faza Dopplera / kamien
const DOPPLER_PHASES = {
    am_doppler_phase1: 'Phase 1',
    am_doppler_phase2: 'Phase 2',
    am_doppler_phase3: 'Phase 3',
    am_doppler_phase4: 'Phase 4',
    am_gamma_doppler_phase1: 'Phase 1',
    am_gamma_doppler_phase2: 'Phase 2',
    am_gamma_doppler_phase3: 'Phase 3',
    am_gamma_doppler_phase4: 'Phase 4',
    am_blackpearl_marbleized_b: 'Black Pearl',
    am_sapphire_marbleized_b: 'Sapphire',
    am_ruby_marbleized: 'Ruby',
    am_emerald_marbleized: 'Emerald',
};

// warianty kolorow keychainow zalezne od seeda:
// special - konkretne seedy, ranges - przedzialy (min < seed <= max), fallback - reszta
const KEYCHAIN_SEED_VARIANTS = {
    'Semi-Precious': {
        special: { 11285: 'Emerald' },
        ranges: [
            [1, 10000, 'Light Green'], [10000, 20000, 'Dark Green'],
            [20000, 30000, 'Teal'], [30000, 50000, 'Cyan'],
            [50000, 60000, 'Light Blue'], [60000, 80000, 'Mix Blue / Purple'],
            [80000, 90000, 'Mix Purple / Blue'], [90000, 100000, 'Purple'],
        ],
    },
    'Baby Karat CT': { ranges: [[1, 50000, 'Bronze 1']], fallback: 'More Gold' },
    'Baby Karat T': { ranges: [[1, 50000, 'Bronze 1']], fallback: 'More Gold' },
    'Die-cast AK': {
        ranges: [
            [1, 10000, 'Gold'], [10000, 20000, 'Orange'], [20000, 25000, 'Red'],
            [25000, 60000, 'Pink'], [60000, 87000, 'Purple'],
            [87000, 98000, 'Blue'], [98000, 100000, 'Light Blue'],
        ],
    },
    'Titeenium AWP': {
        ranges: [
            [1, 20000, 'Yellow'], [20000, 40000, 'Green'], [40000, 60000, 'Cyan'],
            [60000, 80000, 'Blue'], [80000, 100000, 'Purple/Pink'],
        ],
    },
    "Lil' Teacup": { special: { 99606: 'Smoke' } },
    'Hot Wurst': {
        special: { 87807: 'Liquid fire', 7632: 'Liquid fire' },
        ranges: [[1, 15000, 'Worse HOLO Effect']],
        fallback: 'Better HOLO Effect',
    },
    "Chicken Lil'": { special: { 307: 'Blue Gem' } },
    'Hot Howl': { ranges: [[1, 15000, 'More Reddish']], fallback: 'More yellowish' },
    "Lil' Monster": { special: { 38: 'Red Tongue', 99205: 'Blue / Purple Tongue' } },
    'Diamond Dog': { ranges: [[1, 50000, 'More Pealescent'], [50000, 100000, 'More White']] },
    "That's Bananas": {
        ranges: [
            [1, 5000, 'Bronze'], [5000, 20000, 'Dark Yellow'],
            [20000, 98000, 'Yellow'], [98000, 100000, 'Lime Green'],
        ],
    },
    "Lil' SAS": { special: { 432: 'Red' } },
    'Hot Sauce': { special: { 741: 'Coca Cola', 99995: 'Pink eye' } },
    "Lil' Crass": {
        ranges: [
            [1, 25000, 'Red'], [25000, 40000, 'Orange'], [40000, 75000, 'Yellow'],
            [75000, 84000, 'Lime Green'], [84000, 93000, 'Green'],
            [93000, 97000, 'Teal'], [97000, 100000, 'Cyan'],
        ],
    },
};

// przedmioty recznie oznaczone jako pomijane
const IGNORED_ITEM_IDS = ['17293822569102708641', '17293822569110896676'];

// indeksy atrybutow GC
const ATTR_MUSIC_KIT_ID = 166;
const ATTR_GRAFFITI_TINT = 233;
const ATTR_KEYCHAIN_ID = 299;
const ATTR_KEYCHAIN_SEED = 306;
const ATTR_STORAGE_INFO = 277;

// ============================ Pomocnicze ============================

function get_schema_item(item) {
    return schema['items'][item.def_index];
}

// Zwraca value_bytes atrybutu o danym def_index albo null
function get_attribute_bytes(item, def_index) {
    const attribute = (item.attribute || []).find(a => a.def_index == def_index);
    return attribute ? attribute.value_bytes : null;
}

function get_wear_name(paint_wear) {
    for (const level of WEAR_LEVELS) {
        if (paint_wear <= level.max) return level.name;
    }
    return 'Battle-Scarred';
}

// Nazwa samej broni (np. "AK-47"), z fallbackiem na prefab
function get_weapon_base_name(item) {
    const schema_item = get_schema_item(item);
    const token = schema_item.item_name ?? schema['prefabs'][schema_item.prefab].item_name;
    return translate(token);
}

// ============================ Typ przedmiotu ============================

function analyze_item_type(item) {
    if (IGNORED_ITEM_IDS.includes(String(item.id))) return 'unknown';
    if (item?.attribute?.[0]?.def_index === ATTR_STORAGE_INFO) return 'unknown';

    const schema_name = get_schema_item(item).name;
    const name_lower = schema_name.toLowerCase();

    if (name_lower.includes('coin') || name_lower.includes('tournament_journal')) return 'coin';
    if (name_lower.includes('spraypaint')) return 'spraypaint';
    if (name_lower.includes('crate')) return 'crate';
    if (name_lower.includes('music')) return 'music';
    if (name_lower.includes('weapon')) return 'weapon_skin';
    if (name_lower.includes('casket')) return 'casket';
    if (schema_name === 'Fortius Quo Fidelius') return 'coin';
    if (schema_name === 'CSGO Ten Year Anniversary Memorabilia') return 'coin';
    if (schema_name.includes('Pin')) return 'pin';
    if (schema_name.includes('sticker')) return 'sticker';
    if (schema_name.includes('patch')) return 'patch';
    if (schema_name.includes('gloves')) return 'gloves';
    if (schema_name.includes('customplayer')) return 'customplayer';
    if (schema_name.includes('spray')) return 'spray';
    if (schema_name.includes('keychain')) return 'keychain';
    return 'unknown';
}

// ============================ Nazwy przedmiotow ============================

function get_weapon_skin_name(item) {
    const weapon_name = get_weapon_base_name(item);
    const skin_name = translate(schema['paint_kits'][item.paint_index].description_tag);
    const wear_name = get_wear_name(item.paint_wear);

    let marker = '';
    if (item.rarity == 6 && item.quality == 3) marker = ' (★)';
    else if (item.rarity == 6 && item.quality == 9) marker = ' (★ StatTrak™)';
    else if (item.quality == 12) marker = ' (souvenir)';
    else if (item.quality == 9) marker = ' (StatTrak™)';

    return `${weapon_name}${marker} | ${skin_name} (${wear_name})`;
}

function get_glove_name(item) {
    const glove_name = translate(get_schema_item(item).item_name);
    const skin_name = translate(schema['paint_kits'][item.paint_index].description_tag);
    const wear_name = get_wear_name(item.paint_wear);
    return `${glove_name} (★) | ${skin_name} (${wear_name})`;
}

function get_sticker_kit_name(sticker_id) {
    return translate(schema['sticker_kits'][sticker_id].item_name);
}

function get_graffiti_name(item) {
    const base_name = get_sticker_kit_name(item.stickers[0].sticker_id);
    const tint_bytes = get_attribute_bytes(item, ATTR_GRAFFITI_TINT);
    if (tint_bytes == null) {
        return `Graffiti | ${base_name}`;
    }
    const tint_name = translate('Attrib_SprayTintValue_' + tint_bytes.readInt32LE(0));
    return `Graffiti | ${base_name} (${tint_name})`;
}

function get_music_kit_name(item) {
    const kit_id = get_attribute_bytes(item, ATTR_MUSIC_KIT_ID).readInt32LE(0);
    const definition_name = schema['music_definitions'][kit_id].name;
    if (definition_name === 'valve_01') {
        return 'Music KIT | Valve';
    }
    let name = translate('coupon_' + definition_name);
    if (item.quality == 9) {
        name = name.replace('|', '(StatTrak™) |');
    }
    return name;
}

function get_keychain_name(item) {
    const keychain_id = get_attribute_bytes(item, ATTR_KEYCHAIN_ID).readInt32LE(0);
    const loc_name = schema['keychain_definitions'][keychain_id].loc_name;
    return 'Keychain | ' + translate(loc_name);
}

function get_item_name(item, item_type) {
    switch (item_type) {
        case 'weapon_skin': return get_weapon_skin_name(item);
        case 'gloves': return get_glove_name(item);
        case 'spraypaint':
        case 'spray': return get_graffiti_name(item);
        case 'sticker': return 'Sticker | ' + get_sticker_kit_name(item.stickers[0].sticker_id);
        case 'patch': return 'Patch | ' + get_sticker_kit_name(item.stickers[0].sticker_id);
        case 'music': return get_music_kit_name(item);
        case 'keychain': return get_keychain_name(item);
        case 'customplayer': return translate_case_insensitive(get_schema_item(item).item_name);
        case 'crate':
        case 'pin':
        case 'coin': return translate(get_schema_item(item).item_name);
        default: return undefined;
    }
}

// ============================ Szczegoly przedmiotow ============================

// Lista naklejek na broni: [{ name, wear }]
function get_sticker_list(item) {
    return item.stickers.map(sticker => ({
        name: get_sticker_kit_name(sticker.sticker_id),
        wear: sticker.wear != null ? sticker.wear.toFixed(2) : 1.00,
    }));
}

// Faza Dopplera / kamien na podstawie paint kita
function get_doppler_phase(item) {
    const paint_kit_name = schema['paint_kits'][item.paint_index].name;
    for (const [key, phase] of Object.entries(DOPPLER_PHASES)) {
        if (key.includes(paint_kit_name)) return phase;
    }
    return null;
}

// Wariant koloru keychaina na podstawie seeda
function analyze_keychain_seed(seed, name) {
    for (const [keychain_name, rules] of Object.entries(KEYCHAIN_SEED_VARIANTS)) {
        if (!name.includes(keychain_name)) continue;
        if (rules.special && rules.special[seed] != null) {
            return rules.special[seed];
        }
        for (const [min, max, variant] of rules.ranges || []) {
            if (seed > min && seed <= max) return variant;
        }
        return rules.fallback || null;
    }
    return null;
}

// Procent fade'a dla skinow Fade / Amber Fade / Acid Fade
function get_fade_percentage(item, item_name) {
    const weapon_name = get_weapon_base_name(item);
    if (item_name.includes('Acid')) {
        return AcidFadeCalculator.getFadePercentage(weapon_name, item.paint_seed);
    }
    if (item_name.includes('Amber')) {
        return AmberFadeCalculator.getFadePercentage(weapon_name, item.paint_seed);
    }
    return FadeCalculator.getFadePercentage(weapon_name, item.paint_seed);
}

// Ustawia pola tradeable / marketable
function set_trade_status(item_res, item, item_type) {
    if (item_type === 'coin' || item_res.name === 'Music KIT | Valve') {
        item_res.tradeable = false;
    } else if (item_type === 'spraypaint' || item_type === 'spray') {
        item_res.tradeable = Boolean(item.tradable_after);
    } else {
        item_res.tradeable = true;
    }
    if (item_res.tradeable) {
        item_res.marketable = !(item.tradable_after && item.tradable_after > Date.now());
    }
}

// ============================ Magazyny (caskets) ============================

function get_casket_contents(csgo, casket) {
    return new Promise((resolve, reject) => {
        if (casket.casket_contained_item_count == 0) {
            return resolve([]);
        }
        csgo.getCasketContents(casket.id, (err, contents) => {
            if (err) return reject(err);
            resolve(Process_Items(contents, csgo));
        });
    });
}

// ============================ Glowne przetwarzanie ============================

async function Process_Items(inventory, csgo) {
    const result = [];

    for (const item of inventory) {
        const item_type = analyze_item_type(item);
        if (item_type === 'unknown') continue;

        // magazyn - przetwarzamy rekurencyjnie jego zawartosc
        if (item_type === 'casket') {
            result.push({
                id: item.id,
                custom_name: item.custom_name,
                items: await get_casket_contents(csgo, item),
            });
            continue;
        }

        const item_res = {
            id: item.id,
            def_index: item.def_index,
            rarity: item.rarity,
            name: get_item_name(item, item_type),
        };

        if (item_type === 'weapon_skin' && item.stickers?.length > 0) {
            item_res.stickers = get_sticker_list(item);
        }

        if (item_res.name.includes('Doppler')) {
            const phase = get_doppler_phase(item);
            if (phase != null) item_res.info_seed = phase;
        }

        set_trade_status(item_res, item, item_type);

        if (item.paint_wear) item_res.paint_wear = item.paint_wear;
        if (item.paint_seed) item_res.paint_seed = item.paint_seed;
        if (item.paint_index) item_res.paint_index = item.paint_index;

        const keychain_seed_bytes = get_attribute_bytes(item, ATTR_KEYCHAIN_SEED);
        if (keychain_seed_bytes != null) {
            item_res.keychain_seed = keychain_seed_bytes.readInt32LE(0);
        }

        if (item_type === 'keychain') {
            const variant = analyze_keychain_seed(item_res.keychain_seed, item_res.name);
            if (variant != null) item_res.info_seed = variant;
        }

        if (item_res.name.includes('Case Hardened')) {
            const gem_tier = casehardened.Check_Gem(item_res.name, item.paint_seed);
            if (gem_tier != null) item_res.info_seed = gem_tier;
        }

        if (['Acid', 'Amber', 'Fade'].some(word => item_res.name.includes(word))) {
            item_res.fade_percentage = get_fade_percentage(item, item_res.name);
        }

        item_res.type = item_type;
        result.push(item_res);
    }

    return result;
}

module.exports = { Process_Items, analyze_keychain_seed, get_wear_name };
