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

const WIN_GROUP_SECONDS = 0.35;

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

const game = await createGame();
window.__game = game;

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
      audio.peg(event.speed, event.y);
      if (event.speed > 3) particles.sparkle(event.x, event.y - 0.1, event.z + 0.25, 0.3);
      break;
    case "land":
      audio.land(event.speed);
      if (event.speed > 4) particles.sparkle(event.x, event.y, event.z, Math.min(1, event.speed / 12));
      break;
    case "win": {
      particles.burst(event.x, -0.4, BOARD.frontZ + 0.4, event);
      audio.win(event.value, event.kind);
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
    case "bonus": {
      audio.bonus();
      const [sx, sy] = toScreen(event.x, event.y, event.z);
      hud.popup(event.kind === "gem" ? "GEM! +10" : "PRIZE COIN! ×5", sx, sy, { kind: event.kind, banner: true });
      break;
    }
  }
  hud.bank.set(game.bank);
  hud.won.set(game.won);
  hud.refill.hidden = game.bank > 0;
});
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
  aimAt(event);
  dropCoin();
});
// Keyboard: arrow keys pick a slot, space or enter drops.
window.addEventListener("keydown", (event) => {
  if (event.target instanceof HTMLButtonElement) return;
  if (event.key === "ArrowLeft") selectSlot(slot - 1);
  else if (event.key === "ArrowRight") selectSlot(slot + 1);
  else if (event.key === " " || event.key === "Enter") dropCoin();
  else return;
  event.preventDefault();
});
hud.refill.addEventListener("click", () => {
  audio.unlock();
  game.refill();
});
hud.muteButton.addEventListener("click", () => {
  audio.unlock();
  settings.muted = !settings.muted;
  audio.setMuted(settings.muted);
  hud.setMuted(settings.muted);
  saveSettings(settings);
});

document.getElementById("loading").classList.add("done");

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  game.update(dt);
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
