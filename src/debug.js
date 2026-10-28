// A test panel for trying out bonuses without waiting for them. Only shown with ?debug in the
// address, e.g. https://mjellings.github.io/coin-pusher/?debug

import { BONUSES } from "./bonuses.js";

export const DEBUG = new URLSearchParams(location.search).has("debug");

export function createDebugPanel({ game, forceSpin }) {
  const root = document.createElement("div");
  root.id = "debug";
  root.innerHTML = `
    <button class="panel control debug-toggle" type="button" aria-expanded="false" aria-label="Debug panel">🐞</button>
    <div class="debug-sheet panel" hidden>
      <h3>Spin the wheel to</h3>
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
  for (const bonus of BONUSES) add("spins", `${bonus.icon} ${bonus.name}`, () => forceSpin(bonus.id));
  add("spins", "🎲 Random spin", () => forceSpin(null));
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
