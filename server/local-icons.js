const fs = require('node:fs');
const path = require('node:path');

// Matches icon pack files such as "025-pikachu.png" or "025-pikachu-shiny@3x.png".
const ICON_FILE = /^(\d{3,4}-[a-z0-9-]+?)(-shiny)?(@[23]x)?\.png$/;

// Indexes a local icon pack laid out as <dir>/1x, <dir>/2x, <dir>/3x.
// Returns the base names ("025-pikachu") available in the 1x folder; the client
// builds sharper 3x/2x URLs from them and falls back to 1x.
function indexLocalIcons(dir) {
  if (!dir) return { available: false, keys: [] };
  const oneX = path.join(dir, '1x');
  try {
    const keys = new Set();
    for (const file of fs.readdirSync(oneX)) {
      const m = file.match(ICON_FILE);
      if (m) keys.add(m[1]);
    }
    return { available: keys.size > 0, dir: path.resolve(dir), keys: [...keys].sort() };
  } catch (err) {
    console.warn(`Local icons unavailable (${err.message})`);
    return { available: false, keys: [] };
  }
}

module.exports = { indexLocalIcons };
