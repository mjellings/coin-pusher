// The Collection Book panel: every set, which items you've found, and what finishing a set gives.

import { SETS, isSetComplete, ITEMS } from "./collection.js";
import { REFILL } from "./game.js";

const TOTAL = Object.keys(ITEMS).length;

export function createBook() {
  const root = document.getElementById("book");
  const sets = document.getElementById("book-sets");
  const count = document.getElementById("book-count");
  const button = document.getElementById("book-button");
  const close = document.getElementById("book-close");
  const reset = document.getElementById("reset-game");
  let fresh = new Set();

  function render(collection) {
    const found = Object.keys(collection).filter((id) => collection[id] > 0).length;
    count.textContent = `${found}/${TOTAL}`;
    sets.replaceChildren(
      ...SETS.map((set) => {
        const done = isSetComplete(set, collection);
        const have = set.items.filter((item) => collection[item.id] > 0).length;
        const section = document.createElement("section");
        section.className = `book-set${done ? " complete" : ""}`;
        section.style.setProperty("--set", set.color);
        section.innerHTML = `
          <h3><span>${set.name}</span><span class="progress">${done ? "Complete!" : `${have}/${set.items.length}`}</span></h3>
          <ol class="cards"></ol>
          <p class="reward">${done ? "Reward earned" : "Reward"}: coin shower + ${REFILL.perSet} extra free coins per top-up</p>`;
        const cards = section.querySelector(".cards");
        for (const item of set.items) {
          const owned = collection[item.id] ?? 0;
          const card = document.createElement("li");
          card.className = `card${owned ? " owned" : ""}${fresh.has(item.id) ? " fresh" : ""}`;
          card.title = owned ? item.name : "Not found yet";
          card.innerHTML = `
            <span class="icon">${owned ? item.icon : "?"}</span>
            <span class="name">${owned ? item.name : "???"}</span>
            <span class="rarity" aria-label="Rarity">${"★".repeat(6 - item.weight)}</span>
            ${owned > 1 ? `<span class="dupes">×${owned}</span>` : ""}`;
          cards.append(card);
        }
        return section;
      }),
    );
  }

  return {
    button,
    reset,
    render,
    // Something new arrived: light up the button until the book is opened.
    markNew(id) {
      fresh.add(id);
      button.classList.add("has-new");
    },
    get isOpen() {
      return !root.hidden;
    },
    open(collection) {
      render(collection);
      root.hidden = false;
      button.classList.remove("has-new");
      fresh = new Set();
      close.focus();
    },
    close() {
      root.hidden = true;
      button.focus();
    },
    onClose(listener) {
      close.addEventListener("click", listener);
      root.addEventListener("click", (event) => {
        if (event.target === root) listener();
      });
    },
  };
}
