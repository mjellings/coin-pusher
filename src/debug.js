// A test panel for trying out bonuses without waiting for them. Only shown with ?debug in the
// address, e.g. https://mjellings.github.io/coin-pusher/?debug

import { BONUSES } from "./bonuses.js";

export const DEBUG = new URLSearchParams(location.search).has("debug");

export function createDebugPanel({ game, forcePull }) {
  const root = document.createElement("div");
  root.id = "debug";
  root.innerHTML = `
    <button class="panel control debug-toggle" type="button" aria-expanded="false" aria-label="Debug panel">🐞</button>
    <div class="debug-sheet panel" hidden>
      <h3>Slot machine: add a credit that lands on</h3>
      <div class="debug-grid" data-group="spins"></div>
      <h3>Board</h3>
      <div class="debug-grid" data-group="board"></div>
    </div>`;
  document.body.append(root);
  const toggle = root.querySelector(".debug-toggle");
  const sheet = root.querySelector(".debug-sheet");
  toggle.addEventListener("click", () => {
    sheet.hidden = !sheet.hidden;
    toggle.setAttribute("aria-expanded", String(!sheet.hidden));
  });

  const add = (group, label, action) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = label;
    button.addEventListener("click", action);
    root.querySelector(`[data-group="${group}"]`).append(button);
  };
  // These open the slot machine, so tuck the panel away to leave the spin button clear.
  const pullTo = (bonus) => () => {
    forcePull(bonus);
    sheet.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  };
  for (const bonus of BONUSES) add("spins", `${bonus.icon} ${bonus.name}`, pullTo(bonus.id));
  add("spins", "❌ A loss", pullTo(null));
  add("spins", "🎲 Random", pullTo(undefined));
  add("spins", "🎰 +5 credits", () => {
    game.credits += 5;
  });
  add("board", "🪙 +50 coins", () => {
    game.bank += 50;
    game.emit({ type: "debug" });
  });
  add("board", "🫙 Empty bank", () => {
    game.bank = 0;
    game.emit({ type: "debug" });
  });
  add("board", "⏩ Free coins now", () => {
    // Top-ups only come while the bank is low, so empty it first if it's full.
    if (game.refillAt === null) game.bank = 0;
    game.refillAt = Date.now();
    game.tickRefill();
  });
  add("board", "🌧️ Coin shower", () => {
    game.showerLeft += 20;
  });
  add("board", "🎁 Collectable", () => game.spawnCollectable());
  add("board", "🏅 Prize coin", () => game.spawnBonus("prize"));
  add("board", "💎 Gem", () => game.spawnBonus("gem"));
}
