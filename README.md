# CS2 Inventory Manager

A Node.js script that logs into a Steam account, connects to the CS2 Game Coordinator (GC), retrieves the inventory (including the contents of storage units), fetches the lowest CSFloat market price for each item, and saves everything to `output/data.json`.

## Project Structure

```
cs2_get_inventory/
├── src/
│   ├── index.js          # CLI entry: Steam login, GC connection, saving results
│   ├── server.js         # web app backend (Express, localhost)
│   ├── steam.js          # Steam login + Steam Guard flow (shared by web)
│   ├── items.js          # inventory processing (names, floats, stickers, caskets)
│   ├── prices.js         # CSFloat price + image fetching (cache, rate limit, retries)
│   ├── casehardened.js   # Case Hardened blue gem tiers
│   └── config.js         # config.json loader
├── public/
│   └── index.html        # web frontend (dark grid, single file)
├── data/                 # game data files (items_game.txt, translations)
├── scripts/
│   └── test.js           # scratch/test script
├── output/               # generated data.json (gitignored)
├── config.json           # your credentials (gitignored)
├── config.example.json   # config template
└── package.json
```

## Requirements

- Node.js
- Packages: `steam-user`, `globaloffensive`, `steam-totp`, `@node-steam/vdf`, `csgo-fade-percentage-calculator`, `express` (for the web app)

## Installation

1. Clone the repository and install dependencies:
   ```bash
   git clone https://github.com/your-username/steam-inventory-manager.git
   cd steam-inventory-manager/cs2_get_inventory
   npm install
   ```
2. Create your config:
   ```bash
   cp config.example.json config.json
   ```
   Fill in your Steam credentials (and optionally a CSFloat API key):
   ```json
   {
     "steam": {
       "accountName": "your_steam_login",
       "password": "your_steam_password"
     },
     "csfloat_api_key": ""
   }
   ```
   `config.json` is gitignored, so your credentials never end up in the repository.

## Usage

### Web app (recommended)

```bash
npm run web
```

Then open **http://127.0.0.1:3000** in your browser. The page asks for your Steam
login, password and (optionally) a CSFloat API key, then prompts for your Steam
Guard code, and finally shows your whole inventory as a grid of cards with item
images, prices and a total value. Everything runs locally on `127.0.0.1` — your
credentials never leave your machine and are not stored.

### CLI (writes a JSON file)

```bash
npm start
```

The script will:

1. Log into Steam and start "playing" CS2 (app ID 730).
2. Connect to the Game Coordinator and retrieve the inventory.
3. Process every item (including items inside storage units / caskets) — names, wear, paint seeds, Doppler phases, fade percentages, blue gem tiers, stickers, keychains.
4. Fetch the lowest buy-now price from the CSFloat market for every marketable item (`price_csfloat_usd`, in USD) plus the item image (`icon_url`). Doppler prices are filtered by phase via `paint_index`.
5. Save the result to `output/data.json`.

## CSFloat Prices

- Prices come from `GET https://csfloat.com/api/v1/listings` (lowest `buy_now` listing).
- Without an API key requests are throttled to one per 1.5 s; with a key (csfloat.com/profile → "developer" tab, set in `config.json` or the `CSFLOAT_API_KEY` env variable) the delay drops to 0.5 s.
- Identical items are fetched once (cache), rate-limit responses (429) are retried automatically.
- Items with no listings or no market (coins, untradeable items) get `price_csfloat_usd: null` or are skipped.

## License

MIT
