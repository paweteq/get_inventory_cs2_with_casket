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
- `@node-steam/vdf`: tool to read valve files to convert to json

## Installation

1. Clone this repository to your local machine:
   ```bash
   git clone https://github.com/your-username/steam-inventory-manager.git
   cd steam-inventory-manager
   ```
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
```
## Usage

To run this script:

1. **Edit Configuration**  
   ```bash
   node index.js
   ```
## Script Details

The script automates the process of logging into a Steam account, connecting to the CS:GO Game Coordinator, retrieving and processing the inventory, and saving it as `data.json`. Below is a breakdown of each step and key events handled in the script:

### Key Steps

1. **Login to Steam**  
   - The script initializes a `SteamUser` instance and logs into Steam using the provided credentials.
   - Upon successful login, the script sets the Steam account status to online and starts "playing" CS:GO (app ID `730`), which is necessary to access CS:GO-related features.

2. **Connect to the Game Coordinator (GC)**  
   - After logging in, the script creates a `GlobalOffensive` instance using the logged-in `SteamUser` instance.
   - The script then listens for the `connectedToGC` event, which confirms a successful connection to the CS:GO Game Coordinator (GC).
   
3. **Retrieve and Process Inventory**  
   - Once connected to the GC, the script retrieves the CS:GO inventory and processes it using the external module `items.js`.
   - The `items_manager.Process_Items` function (from `items.js`) takes the inventory data, processes it, and returns a structured JSON object containing details about each item.

4. **Save Data to `data.json`**  
   - The processed inventory data is then saved to a file named `data.json` in the project directory.
   - If the save operation is successful, a confirmation message is printed; otherwise, an error message is shown.

### Event Listeners

The script handles the following events to manage the connection to Steam and the CS:GO Game Coordinator:

- **`loggedOn`**  
  Triggered when the login to Steam is successful. The script then sets the user’s online status and starts playing CS:GO.

- **`connectedToGC`**  
  Triggered when the script successfully connects to the CS:GO Game Coordinator. This event initiates the inventory retrieval and processing sequence.

- **`disconnectedFromGC`**  
  Triggered when the script is disconnected from the CS:GO Game Coordinator. If the disconnection is due to the GC going down (status `GC_GOING_DOWN`), the script logs this information.

### Additional Files

- **`items.js`**  
  This file contains the `Process_Items` function, which takes the raw inventory data and returns a structured JSON object for further use.

### Dependencies

This script relies on the following libraries:
- `steam-user` for managing the Steam account session.
- `globaloffensive` for connecting to the CS:GO Game Coordinator and retrieving inventory data.
- `steam-totp` for handling 2-factor authentication if needed.
- `fs` for file handling and saving inventory data to `data.json`.

---

This breakdown should help you understand how each part of the script works and how the events and functions interact to achieve the final output.
