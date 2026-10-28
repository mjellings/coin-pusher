// The slot machine panel: three reels that spin for one credit each and stop left to right on the
// line the game picked. A winning line pays a bonus once the last reel has stopped.

import { SYMBOLS, PAYTABLE, BONUS } from "./bonuses.js";

const STOP_SECONDS = [1.0, 1.5, 2.1];
// Symbols scrolled past before each reel stops, so later reels spin for longer.
const RUN = [18, 26, 36];

export function createSlots({ onStop, onPull } = {}) {
  const root = document.getElementById("slots");
  const button = document.getElementById("slots-button");
  const count = document.getElementById("slots-count");
  const close = document.getElementById("slots-close");
  const pullButton = document.getElementById("slots-pull");
  const credits = document.getElementById("slots-credits");
  const result = document.getElementById("slots-result");
  const strips = [...root.querySelectorAll(".strip")];
  let spinning = false;
  let shownCredits = -1;

  document.getElementById("paytable").replaceChildren(
    ...PAYTABLE.map(({ line, bonus }) => {
      const row = document.createElement("li");
      const { name, detail } = BONUS[bonus];
      const symbols = line.map((s) => (s === "·" ? "<span class=\"any\">any</span>" : s)).join("");
      row.innerHTML = `<span class="line">${symbols}</span><span class="prize"><strong>${name}</strong> ${detail}</span>`;
      return row;
    }),
  );

  // Each strip shows three symbols, with the payline across the middle one.
  const cell = (symbol) => `<span>${symbol}</span>`;
  const randomSymbol = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)];
  for (const strip of strips) strip.innerHTML = [randomSymbol(), randomSymbol(), randomSymbol()].map(cell).join("");

  function setResult(text, kind = "") {
    result.textContent = text;
    result.className = `slots-result ${kind}`;
  }

  return {
    button,
    pullButton,
    get isOpen() {
      return !root.hidden;
    },
    get spinning() {
      return spinning;
    },
    open() {
      root.hidden = false;
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
    // Keeps the credit count, the button badge and the spin button in step with the game.
    setCredits(value) {
      if (value === shownCredits) return;
      shownCredits = value;
      count.textContent = value;
      credits.textContent = value;
      button.classList.toggle("has-new", value > 0);
      pullButton.disabled = spinning || value <= 0;
      if (!spinning && value <= 0 && !result.textContent) setResult("Drop coins through the gold gate to earn credits");
    },
    // Spins to show the given line, then hands back the bonus (or null) once every reel has stopped.
    spin({ reels, bonus }, done) {
      if (spinning) return;
      spinning = true;
      pullButton.disabled = true;
      setResult("Good luck!");
      onPull?.();
      strips.forEach((strip, i) => {
        // Build a fresh strip: what's showing now on top, a run of random symbols, then the result
        // in the middle row. The strip slides up until the result sits on the payline.
        const current = [...strip.children].map((el) => el.textContent);
        const symbols = [...current, ...Array.from({ length: RUN[i] }, randomSymbol), reels[i], randomSymbol()];
        // The row above the result.
        symbols.splice(symbols.length - 2, 0, randomSymbol());
        strip.innerHTML = symbols.map(cell).join("");
        strip.style.transition = "none";
        strip.style.transform = "translateY(0)";
        void strip.offsetHeight;
        const rows = symbols.length - 3;
        strip.style.transition = `transform ${STOP_SECONDS[i]}s cubic-bezier(0.15, 0.6, 0.25, 1.06)`;
        strip.style.transform = `translateY(calc(var(--cell) * -${rows}))`;
        setTimeout(() => {
          // Keep just the three visible symbols so the next spin starts from them.
          strip.style.transition = "none";
          strip.style.transform = "translateY(0)";
          strip.innerHTML = symbols.slice(-3).map(cell).join("");
          onStop?.(i, i === 2 ? bonus : undefined);
          if (i < 2) return;
          spinning = false;
          done?.(bonus);
          if (bonus) {
            const { icon, name, detail } = BONUS[bonus];
            setResult(`${icon} ${name}! ${detail}`, bonus === "jackpot" ? "win jackpot" : "win");
          } else {
            setResult("No win this time");
          }
          shownCredits = -1;
        }, STOP_SECONDS[i] * 1000);
      });
    },
  };
}
