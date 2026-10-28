// The bonus wheel overlay: a prize wheel drawn once onto a canvas, spun with a CSS rotation, and
// a banner underneath saying what it landed on. It doesn't block play, so coins keep dropping
// while it spins.

import { SLICES } from "./bonuses.js";

const SPIN_SECONDS = 4;
const SETTLE_SECONDS = 1.6;
const SIZE = 480;

export function createWheel({ onTick } = {}) {
  const root = document.getElementById("wheel");
  const canvas = document.getElementById("wheel-canvas");
  const result = document.getElementById("wheel-result");
  canvas.width = canvas.height = SIZE;
  draw(canvas.getContext("2d"));

  let turn = 0; // Current rotation, in turns, clockwise.
  let spin = null;

  function setTurn(value) {
    turn = value;
    canvas.style.transform = `rotate(${turn * 360}deg)`;
  }

  // The slice under the pointer at a given rotation.
  function sliceAt(value) {
    const at = (((-value % 1) + 1) % 1);
    return SLICES.findIndex((s) => at < s.start + s.size);
  }

  return {
    get busy() {
      return spin !== null;
    },
    // Spins to land on a point of the wheel (a fraction of a turn), then calls back once the
    // result has been on screen for a moment.
    spin(at, slice, done) {
      root.hidden = false;
      root.classList.remove("landed", "jackpot");
      result.textContent = "";
      const from = turn % 1;
      // Five whole turns, then on round until the chosen point is under the pointer.
      const to = from + 5 + ((((1 - at - from) % 1) + 1) % 1);
      setTurn(from);
      spin = { from, to, t: 0, slice, done, landed: false, lastSlice: sliceAt(from) };
    },
    update(dt) {
      if (!spin) return;
      spin.t += dt;
      if (!spin.landed) {
        const p = Math.min(1, spin.t / SPIN_SECONDS);
        const eased = 1 - Math.pow(1 - p, 4);
        setTurn(spin.from + (spin.to - spin.from) * eased);
        const current = sliceAt(turn);
        if (current !== spin.lastSlice) {
          spin.lastSlice = current;
          onTick?.(1 - eased);
        }
        if (p >= 1) {
          spin.landed = true;
          spin.t = 0;
          const { bonus } = spin.slice;
          result.innerHTML = `<strong>${bonus.icon} ${bonus.name}</strong><span>${bonus.detail}</span>`;
          root.classList.add("landed");
          root.classList.toggle("jackpot", bonus.id === "jackpot");
        }
      } else if (spin.t >= SETTLE_SECONDS) {
        const { done, slice } = spin;
        spin = null;
        done(slice.bonus);
      }
    },
    hide() {
      root.hidden = true;
    },
  };
}

function draw(ctx) {
  const c = SIZE / 2;
  const r = c - 14;
  ctx.clearRect(0, 0, SIZE, SIZE);

  // Chrome rim.
  const rim = ctx.createRadialGradient(c, c, r - 6, c, c, c);
  rim.addColorStop(0, "#fff6d8");
  rim.addColorStop(0.5, "#c8902c");
  rim.addColorStop(1, "#5a3a10");
  ctx.fillStyle = rim;
  ctx.beginPath();
  ctx.arc(c, c, c - 2, 0, Math.PI * 2);
  ctx.fill();

  // Angles run clockwise from the top.
  const angle = (fraction) => fraction * Math.PI * 2 - Math.PI / 2;
  for (const { bonus, start, size } of SLICES) {
    const a0 = angle(start);
    const a1 = angle(start + size);
    const fill = ctx.createRadialGradient(c, c, r * 0.15, c, c, r);
    fill.addColorStop(0, shade(bonus.color, 0.55));
    fill.addColorStop(1, bonus.color);
    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.moveTo(c, c);
    ctx.arc(c, c, r, a0, a1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 246, 216, 0.85)";
    ctx.lineWidth = 3;
    ctx.stroke();

    // Label along the middle of the slice, reading outwards.
    const mid = (a0 + a1) / 2;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(mid);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const jackpot = bonus.id === "jackpot";
    ctx.font = `${jackpot ? 26 : 30}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.fillText(bonus.icon, r - 12, 1);
    if (!jackpot) {
      ctx.font = '800 19px "Orbitron", sans-serif';
      ctx.fillStyle = "#fff";
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 4;
      ctx.fillText(bonus.short, r - 54, 2);
    }
    ctx.restore();
  }

  // Bulbs round the rim.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    ctx.fillStyle = i % 2 ? "#fff3c0" : "#ffcf5a";
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * (c - 8), c + Math.sin(a) * (c - 8), 4, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Mixes a hex colour towards black.
function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift) => Math.round(((n >> shift) & 255) * amount);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}
