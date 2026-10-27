const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');

const DEFAULTS = {
  port: 8642,
  // Use "0.0.0.0" to reach the control panel from another device on your network.
  host: '127.0.0.1',
  // Folder of an icon pack named like "1x/001-bulbasaur.png" / "3x/001-bulbasaur-shiny@3x.png".
  localIconDir: null,
};

// Reads config.json, creating it with defaults on first run.
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(DEFAULTS, null, 2) + '\n');
    return { ...DEFAULTS };
  }
  try {
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) };
  } catch (err) {
    console.error(`config.json is not valid JSON (${err.message}); using defaults.`);
    return { ...DEFAULTS };
  }
}

module.exports = { loadConfig, ROOT };
