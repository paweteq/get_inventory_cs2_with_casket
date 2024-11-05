# Steam Inventory Manager

This project is a Node.js script that logs into a Steam account, connects to the Counter-Strike: Global Offensive (CS:GO) Game Coordinator (GC), retrieves the inventory, processes items, and saves them to a `data.json` file. 

## Table of Contents
- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Configuration](#configuration)
- [Script Details](#script-details)
- [License](#license)

## Requirements

This project requires the following Node.js packages:
- `steam-user`: A library for managing Steam account sessions.
- `globaloffensive`: A library for interacting with CS:GO's Game Coordinator (GC).
- `steam-totp`: A library for handling Steam's 2-factor authentication.
- `fs` (File System): Built-in Node.js module for file handling.

## Installation

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/steam-inventory-manager.git
   cd steam-inventory-manager
   install Required packages in Requirements
2. Configure:
   input your login and password in index file
## Configuration

Make sure to configure your Steam account credentials in the script:
```javascript
user.logOn({
    accountName: 'login_steam',
    password: 'password_steam',
});


