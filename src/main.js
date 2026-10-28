import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./style.css";
import * as THREE from "three";
import { createGame, BOARD, PLINKO } from "./game.js";
import { createRenderer, createScene, createCamera, frameCamera, addLights, addBokeh } from "./render/scene.js";
import { buildCabinet } from "./render/cabinet.js";
import { createPieces, createSlotGhost } from "./render/pieces.js";
import { createParticles, createCameraShake } from "./render/effects.js";
import { createAudio } from "./audio.js";
import { createHud, loadSettings, saveSettings } from "./hud.js";
import { loadSave, writeSave, clearSave } from "./save.js";
import { createBook } from "./book.js";
import { ITEMS } from "./collection.js";
import { createSlots } from "./slots.js";
import { BONUS, pull, pullFor } from "./bonuses.js";
import { DEBUG, createDebugPanel } from "./debug.js";

const WIN_GROUP_SECONDS = 0.35;
const AUTOSAVE_SECONDS = 2;

const canvas = document.getElementById("scene");
const settings = loadSettings();

// The sign is drawn with the arcade font, so wait for it before building the cabinet.
await Promise.all([
  document.fonts.load('900 64px "Orbitron"'),
  document.fonts.load('700 32px "Rajdhani"'),
]).catch(() => {});

const renderer = createRenderer(canvas);
const scene = createScene(renderer);
const camera = createCamera();
addLights(scene);
const updateBokeh = addBokeh(scene);
const cabinet = buildCabinet(scene);
const pieces = createPieces(scene);
const ghost = createSlotGhost(scene);
const particles = createParticles(scene);
const shake = createCameraShake(camera);
const audio = createAudio({ muted: settings.muted });
const hud = createHud();
const book = createBook();
const slots = createSlots({
  onPull: () => audio.drop(),
  onStop: (reel, bonus) => {
    audio.wheelTick(1);
    if (reel === 2 && bonus === null) audio.land(3);
  },
});

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  const { position, target } = frameCamera(camera, width, height);
  shake.setRest(position, target);
  particles.setPixelScale(height * renderer.getPixelRatio());
}
resize();
window.addEventListener("resize", resize);

const game = await createGame(loadSave());
window.__game = game;

// Save every couple of seconds, and whenever the tab is hidden or closed.
setInterval(() => writeSave(game), AUTOSAVE_SECONDS * 1000);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") writeSave(game);
});
window.addEventListener("pagehide", () => writeSave(game));

// Screen position of a point in the scene, for placing popups.
const projected = new THREE.Vector3();
function toScreen(x, y, z) {
  projected.set(x, y, z).project(camera);
  return [(projected.x * 0.5 + 0.5) * window.innerWidth, (-projected.y * 0.5 + 0.5) * window.innerHeight];
}

// Wins that land close together are shown as one bigger "+N".
let pendingWin = null;
function flushWin() {
  if (!pendingWin) return;
  const { value, x, kind } = pendingWin;
  const [sx, sy] = toScreen(x, 0.6, BOARD.frontZ);
  hud.popup(`+${value}`, sx, sy, { kind, big: value >= 5 });
  pendingWin = null;
}

game.on((event) => {
  switch (event.type) {
    case "drop":
      audio.drop();
      cabinet.flashSlot(event.slot);
      break;
    case "peg":
      audio.peg(event.speed, event.y, event.x);
      if (event.speed > 3) particles.sparkle(event.x, event.y - 0.1, event.z + 0.25, 0.3);
      break;
    case "land":
      audio.land(event.speed, event.x);
      if (event.speed > 4) particles.sparkle(event.x, event.y, event.z, Math.min(1, event.speed / 12));
      break;
    case "win": {
      particles.burst(event.x, -0.4, BOARD.frontZ + 0.4, event);
      audio.win(event.value, event.kind, event.x);
      shake.add(event.kind === "coin" ? 0.25 : 0.6);
      if (!pendingWin) {
        pendingWin = { value: 0, x: 0, count: 0, kind: "coin", at: performance.now() };
      }
      pendingWin.value += event.value;
      pendingWin.x = (pendingWin.x * pendingWin.count + event.x) / (pendingWin.count + 1);
      pendingWin.count++;
      if (event.kind !== "coin") pendingWin.kind = event.kind;
      break;
    }
    case "lost":
      audio.lost(event.x);
      break;
    case "bonus": {
      audio.bonus();
      const [sx, sy] = toScreen(event.x, event.y, event.z);
      const text =
        event.kind === "collectable"
          ? `${ITEMS[event.item].icon} COLLECTABLE!`
          : event.kind === "gem"
            ? "GEM! +10"
            : "PRIZE COIN! ×5";
      hud.popup(text, sx, sy, { kind: event.kind, banner: true });
      break;
    }
    case "collect": {
      const item = ITEMS[event.item];
      particles.burst(event.x, -0.4, BOARD.frontZ + 0.4, { kind: "gem", value: 10 });
      shake.add(0.6);
      const [sx, sy] = toScreen(event.x, 0.6, BOARD.frontZ);
      if (event.isNew) {
        audio.collect();
        hud.popup(`${item.icon} NEW: ${item.name.toUpperCase()}!`, sx, sy - 40, { kind: "collectable", banner: true });
        book.markNew(event.item);
      } else {
        audio.win(event.value, "gem");
        hud.popup(`${item.icon} DUPLICATE +${event.value}`, sx, sy - 40, { kind: "collectable", banner: true });
      }
      book.render(game.collection);
      writeSave(game);
      break;
    }
    case "set": {
      audio.fanfare();
      shake.add(1);
      hud.popup(`${event.set.name.toUpperCase()} COMPLETE!`, window.innerWidth / 2, window.innerHeight * 0.4, {
        kind: "collectable",
        big: true,
        banner: true,
      });
      break;
    }
    case "gate": {
      audio.bonus();
      cabinet.flashGate();
      particles.sparkle(event.x, event.y, event.z + 0.3, 1);
      shake.add(0.4);
      const [sx, sy] = toScreen(event.x, event.y, event.z);
      hud.popup("🎰 +1 CREDIT", sx, sy, { kind: "gem", banner: true });
      writeSave(game);
      break;
    }
    case "award": {
      const bonus = BONUS[event.id];
      if (event.id === "jackpot") {
        audio.fanfare();
        shake.add(1.2);
      } else {
        audio.collect();
      }
      hud.popup(`${bonus.icon} ${bonus.name.toUpperCase()}!`, window.innerWidth / 2, window.innerHeight * 0.55, {
        kind: event.id === "jackpot" ? "gem" : "collectable",
        big: event.id === "jackpot",
        banner: true,
      });
      writeSave(game);
      break;
    }
    case "refill": {
      audio.bonus();
      hud.popup(`FREE COINS +${event.amount}`, window.innerWidth / 2, window.innerHeight * 0.3, { banner: true });
      break;
    }
  }
  hud.bank.set(game.bank);
  hud.won.set(game.won);
});
book.render(game.collection);
hud.bank.set(game.bank, { instant: true });
hud.won.set(game.won, { instant: true });
hud.bank.render();
hud.won.render();
hud.setMuted(settings.muted);

// Aiming picks the slot nearest to where the pointer crosses the peg board.
const raycaster = new THREE.Raycaster();
const boardPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PLINKO.z);
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();
let slot = 1;

function selectSlot(index) {
  slot = THREE.MathUtils.clamp(index, 0, PLINKO.slots.length - 1);
  cabinet.setSelectedSlot(slot);
}
selectSlot(slot);

function aimAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(boardPlane, hit)) selectSlot(game.nearestSlot(hit.x));
}

let drops = 0;
function dropCoin() {
  audio.unlock();
  if (game.drop(slot) && ++drops === 3) hud.fadeHint();
}

canvas.addEventListener("pointermove", aimAt);
canvas.addEventListener("pointerdown", (event) => {
  if (book.isOpen || slots.isOpen) return;
  aimAt(event);
  dropCoin();
});
// Keyboard: arrow keys pick a slot, space or enter drops.
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement || book.isOpen || slots.isOpen) return;
  if (event.key === "ArrowLeft") selectSlot(slot - 1);
  else if (event.key === "ArrowRight") selectSlot(slot + 1);
  else if (event.key === " " || event.key === "Enter") dropCoin();
  else return;
  event.preventDefault();
});
book.button.addEventListener("click", () => {
  audio.unlock();
  book.open(game.collection);
});
book.onClose(() => book.close());
window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && book.isOpen) book.close();
  if (event.key === "Escape" && slots.isOpen) slots.close();
});
slots.button.addEventListener("click", () => {
  audio.unlock();
  slots.open();
});
slots.onClose(() => slots.close());
book.reset.addEventListener("click", () => {
  if (!window.confirm("Start a new game? Your coins, winnings and Collection Book will be reset.")) return;
  clearSave();
  location.reload();
});
hud.muteButton.addEventListener("click", () => {
  audio.unlock();
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  hud.setMuted(settings.muted);
  saveSettings(settings);
});

// One pull of the slot machine per credit. The credit is spent, and any bonus paid, once the
// reels stop. The debug panel can make the next pull land on a chosen result.
let forced;
slots.pullButton.addEventListener("click", () => {
  if (slots.spinning || game.credits <= 0) return;
  audio.unlock();
  const result = forced !== undefined ? pullFor(forced) : pull();
  forced = undefined;
  slots.spin(result, (bonus) => game.spendCredit(bonus));
});

if (DEBUG) {
  createDebugPanel({
    game,
    audio,
    forcePull(bonus) {
      game.credits++;
      forced = bonus;
      slots.open();
    },
  });
}

document.getElementById("loading").classList.add("done");

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  game.update(dt);
  const now = Date.now();
  game.tickRefill(now);
  hud.setRefill({
    msLeft: game.refillAt === null ? null : game.refillAt - now,
    amount: game.refillAmount(),
    empty: game.bank === 0,
  });
  slots.setCredits(game.credits);
  cabinet.setGateX(game.gateX());
  cabinet.setGateOpen(game.gateOpen);
  cabinet.setGuards(game.guardsUp);
  const boosts = [];
  if (game.guardsUp) boosts.push({ ...BONUS.guards, msLeft: game.guardsLeft * 1000 });
  if (game.quickRefills(now)) boosts.push({ ...BONUS.refills, msLeft: game.quickRefillsUntil - now });
  hud.setBoosts(boosts);
  if (pendingWin && performance.now() - pendingWin.at > WIN_GROUP_SECONDS * 1000) flushWin();

  pieces.sync(game.pieces, time);
  game.pushers.forEach(({ body }, i) => cabinet.pushers[i].position.copy(body.translation()));
  cabinet.update(time, dt);
  ghost.update({ time, dt, slotX: PLINKO.slots[slot], ready: game.canDrop(), visible: game.bank > 0 });
  particles.update(dt);
  updateBokeh(time);
  shake.update(dt, time);
  hud.update(dt);
  audio.update(game.pusherSpeed());
  renderer.render(scene, camera);
});
