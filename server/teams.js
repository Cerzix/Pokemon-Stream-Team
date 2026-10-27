const fs = require('node:fs');

const MAX_NAME = 40;

// Named party presets ("saved teams"), stored as { [name]: slots[] } in one JSON file.
function createTeams(filePath, sanitizeSlots) {
  let teams = {};
  try {
    teams = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    teams = {};
  }

  function save() {
    fs.writeFileSync(filePath, JSON.stringify(teams, null, 2));
  }

  function cleanName(name) {
    const trimmed = String(name ?? '').trim().slice(0, MAX_NAME);
    if (!trimmed) throw new Error('Team name is required');
    return trimmed;
  }

  return {
    list: () => teams,
    put(name, slots) {
      teams[cleanName(name)] = sanitizeSlots(slots);
      save();
      return teams;
    },
    remove(name) {
      delete teams[cleanName(name)];
      save();
      return teams;
    },
  };
}

module.exports = { createTeams };
