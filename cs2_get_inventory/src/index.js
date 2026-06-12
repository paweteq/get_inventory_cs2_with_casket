const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');
const fs = require('fs');
const path = require('path');
const config = require('./config.js');
const items_manager = require('./items.js');
const prices = require('./prices.js');

const OUTPUT_PATH = path.join(__dirname, '..', 'output', 'data.json');
const CS2_APP_ID = 730;

const user = new SteamUser();
const csgo = new GlobalOffensive(user);

user.logOn({
    accountName: config.steam.accountName,
    password: config.steam.password,
});

user.on('loggedOn', () => {
    console.log('Logged in');
    user.setPersona(SteamUser.EPersonaState.Online);
    user.gamesPlayed(CS2_APP_ID);
});

user.on('error', (err) => {
    console.error('Steam error:', err.message);
});

csgo.on('connectedToGC', async () => {
    console.log('Connected to GC');
    try {
        const items = await items_manager.Process_Items(csgo.inventory, csgo);
        await prices.Add_Prices(items);
        fs.writeFileSync(OUTPUT_PATH, JSON.stringify(items, null, 2));
        console.log('The data can be found in the output/data.json file.');
    } catch (err) {
        console.error('An error occurred while processing the inventory:', err);
    }
});

csgo.on('disconnectedFromGC', (reason) => {
    if (reason === GlobalOffensive.GCConnectionStatus.GC_GOING_DOWN) {
        console.log('GC going down');
    }
});
