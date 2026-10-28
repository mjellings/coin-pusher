// Saves the game in the browser, so a player can close the tab and carry on where they left off.

const SAVE_KEY = "coin-pusher:save";
const SAVE_VERSION = 1;

export function loadSave() {
  try {
    const save = JSON.parse(localStorage.getItem(SAVE_KEY) || "null");
    return save?.version === SAVE_VERSION ? save : null;
  } catch {
    return null;
  }
}

export function writeSave(game) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ version: SAVE_VERSION, ...game.snapshot() }));
  } catch {
    // Storage can be unavailable (private windows); progress just won't persist.
  }
}
