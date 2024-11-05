const SteamUser = require('steam-user');
const GlobalOffensive = require('globaloffensive');
const SteamTotp = require('steam-totp');
const fs = require('fs');
const items_manager = require('./items.js')

let user = new SteamUser();
user.logOn({
    accountName: 'login_steam',
    password: 'passsword_steam',
})
user.on('loggedOn', () => {
    console.log('Logged in');
    user.setPersona(SteamUser.EPersonaState.Online);
    user.gamesPlayed(730);
});
let csgo = new GlobalOffensive(user);
csgo.on('connectedToGC', async ()  => {
    console.log('Connected to GC');
    inventory = csgo.inventory;
    const items = await items_manager.Process_Items(inventory, csgo)
    const jsonString = JSON.stringify(items, null, 2); 


fs.writeFile('data.json', jsonString, (err) => {
    if (err) {
        console.error("An error occurred while saving the file:", err);
    } else {
        console.log("The data can be in the data.json file.");
    }
});
});
csgo.on('disconnectedFromGC', (reason) => {
    if (reason == GlobalOffensive.GCConnectionStatus.GC_GOING_DOWN) {
        console.log('GC going down');    
    }
});
