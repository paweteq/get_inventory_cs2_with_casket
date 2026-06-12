const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

let config;
try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (err) {
    console.error('Brak pliku config.json. Skopiuj config.example.json do config.json i uzupelnij dane logowania.');
    process.exit(1);
}

module.exports = config;
