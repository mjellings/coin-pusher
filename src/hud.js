// The on-screen panels: rolling counters, "+N" popups and the sound and quality buttons.

const SETTINGS_KEY = "coin-pusher:settings";

export function loadSettings() {
  const defaults = {
    muted: false,
    // Phones and tablets start on Low; everything else on High.
    quality: matchMedia("(pointer: coarse)").matches ? "low" : "high",
    // Set once the player picks a quality themselves, so we stop choosing for them.
    qualityChosen: false,
  };
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
  const hint = document.getElementById("hint");
  const muteButton = document.getElementById("mute");
  const qualityButton = document.getElementById("quality");
  const qualityValue = qualityButton.querySelector(".quality-value");

  return {
    bank,
    won,
    refill,
    muteButton,
    qualityButton,
    setMuted(muted) {
      muteButton.setAttribute("aria-pressed", String(muted));
      muteButton.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
    },
    setQuality(quality) {
      qualityValue.textContent = quality === "high" ? "High" : "Low";
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
