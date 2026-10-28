// The on-screen panels: rolling counters, "+N" popups and the sound button.

const SETTINGS_KEY = "coin-pusher:settings";

export function loadSettings() {
  const defaults = { muted: false };
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return defaults;
  }
}

export function saveSettings(settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage can be unavailable (private windows); settings just won't persist.
  }
}

// A number that rolls towards its target instead of jumping, and bumps when it goes up.
function rollingCounter(panel, valueEl) {
  let shown = 0;
  let target = 0;
  let bumpTimer = 0;
  return {
    set(value, { instant = false } = {}) {
      if (value > target && !instant) {
        panel.classList.add("bump");
        clearTimeout(bumpTimer);
        bumpTimer = setTimeout(() => panel.classList.remove("bump"), 180);
      }
      target = value;
      if (instant) shown = value;
    },
    update(dt) {
      if (shown === target) return;
      const diff = target - shown;
      // Close a fixed share of the gap each frame, at least one step, so big payouts roll visibly.
      const step = Math.sign(diff) * Math.max(1, Math.abs(diff) * Math.min(1, dt * 10));
      shown = Math.abs(step) >= Math.abs(diff) ? target : shown + step;
      valueEl.textContent = Math.round(shown);
    },
    render() {
      valueEl.textContent = Math.round(shown);
    },
  };
}

export function createHud() {
  const bank = rollingCounter(document.getElementById("bank-panel"), document.getElementById("bank"));
  const won = rollingCounter(document.getElementById("won-panel"), document.getElementById("won"));
  const popups = document.getElementById("popups");
  const refill = document.getElementById("refill");
  const refillAmount = document.getElementById("refill-amount");
  const refillCountdown = document.getElementById("refill-countdown");
  const refillTimer = document.getElementById("refill-timer");
  const hint = document.getElementById("hint");
  const muteButton = document.getElementById("mute");

  return {
    bank,
    won,
    muteButton,
    // The countdown to the next free coins: a small line under the coin counter, and a bigger
    // panel in the middle of the screen once the bank is empty.
    setRefill({ msLeft, amount, empty }) {
      const counting = msLeft !== null;
      const text = counting ? formatTime(msLeft) : "";
      refillTimer.hidden = !counting || empty;
      refillTimer.textContent = `+${amount} in ${text}`;
      refill.hidden = !empty || !counting;
      refillAmount.textContent = amount;
      refillCountdown.textContent = text;
    },
    setMuted(muted) {
      muteButton.setAttribute("aria-pressed", String(muted));
      muteButton.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
    },
    fadeHint() {
      hint.classList.add("faded");
    },
    popup(text, x, y, { kind = "coin", big = false, banner = false } = {}) {
      const el = document.createElement("div");
      el.className = `popup ${kind}${big ? " big" : ""}${banner ? " banner" : ""}`;
      el.textContent = text;
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      popups.append(el);
      el.addEventListener("animationend", () => el.remove());
    },
    update(dt) {
      bank.update(dt);
      won.update(dt);
    },
  };
}

function formatTime(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}
