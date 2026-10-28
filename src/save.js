// Saves the game in the browser, so a player can close the tab and carry on where they left off.

const SAVE_KEY = "coin-pusher:save";
const SAVE_VERSION = 1;
let enabled = true;

export function loadSave() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return save?.version === SAVE_VERSION ? save : null;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  if (!enabled) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, savedAt: Date.now(), ...game.snapshot() }));
  } catch {
    // Storage can be unavailable (private windows); progress just won't persist.
  }
}

// Wipes the save and stops further saves, so the page can reload into a fresh game without the
// autosave writing the old one back first.
export function clearSave() {
  enabled = false;
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to clear.
  }
}
