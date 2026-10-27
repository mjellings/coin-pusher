import "@fontsource/orbitron/700.css";
import "@fontsource/orbitron/800.css";
import "@fontsource/orbitron/900.css";
import "@fontsource/rajdhani/600.css";
import "@fontsource/rajdhani/700.css";
import "./style.css";
import * as THREE from "three";
import { createGame, BOARD, DROP } from "./game.js";
import { createRenderer, createScene, createCamera, frameCamera, addLights, addBokeh } from "./render/scene.js";
import { buildCabinet } from "./render/cabinet.js";
import { createPieces, createAimGuide } from "./render/pieces.js";
import { createParticles, createCameraShake } from "./render/effects.js";
import { createPostProcessing } from "./render/post.js";
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
const { key: keyLight } = addLights(scene);
const updateBokeh = addBokeh(scene);
const cabinet = buildCabinet(scene);
const pieces = createPieces(scene);
const aim = createAimGuide(scene);
const particles = createParticles(scene);
const shake = createCameraShake(camera);
const post = createPostProcessing(renderer, scene, camera);
const audio = createAudio({ muted: settings.muted });
const hud = createHud();

function applyQuality() {
  keyLight.shadow.mapSize.setScalar(settings.quality === "high" ? 2048 : 1024);
  keyLight.shadow.map?.dispose();
  keyLight.shadow.map = null;
  post.setQuality(settings.quality, window.innerWidth, window.innerHeight);
  hud.setQuality(settings.quality);
}

function resize() {
  const { position, target } = frameCamera(camera, window.innerWidth, window.innerHeight);
  shake.setRest(position, target);
  post.resize(window.innerWidth, window.innerHeight);
  particles.setPixelScale(window.innerHeight * renderer.getPixelRatio());
}

applyQuality();
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
      const [sx, sy] = toScreen(event.x, DROP.y + 1.5, DROP.z);
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

const raycaster = new THREE.Raycaster();
const dropPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DROP.y);
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();

function aimAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(dropPlane, hit)) {
    aim.x = THREE.MathUtils.clamp(hit.x, DROP.minX, DROP.maxX);
  }
}

let drops = 0;
canvas.addEventListener("pointermove", aimAt);
canvas.addEventListener("pointerdown", (event) => {
  audio.unlock();
  aimAt(event);
  if (game.drop(aim.x) && ++drops === 3) hud.fadeHint();
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
hud.qualityButton.addEventListener("click", () => {
  settings.quality = settings.quality === "high" ? "low" : "high";
  settings.qualityChosen = true;
  applyQuality();
  resize();
  saveSettings(settings);
});

document.getElementById("loading").classList.add("done");

// If High can't hold a smooth frame rate in the first few seconds, drop to Low automatically,
// unless the player has picked a quality themselves.
const frameWatch = { frames: 0, time: 0, checks: 0 };
function watchFrameRate(dt) {
  if (settings.qualityChosen || settings.quality !== "high" || frameWatch.checks >= 3) return;
  frameWatch.frames++;
  frameWatch.time += dt;
  if (frameWatch.time < 2) return;
  const fps = frameWatch.frames / frameWatch.time;
  frameWatch.frames = 0;
  frameWatch.time = 0;
  // The first sample includes start-up hitches, so only act on later ones.
  if (frameWatch.checks++ > 0 && fps < 45) {
    settings.quality = "low";
    applyQuality();
    resize();
    saveSettings(settings);
  }
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  const dt = Math.min(clock.getDelta(), 0.1);
  const time = clock.elapsedTime;
  watchFrameRate(dt);
  game.update(dt);
  if (pendingWin && performance.now() - pendingWin.at > WIN_GROUP_SECONDS * 1000) flushWin();

  pieces.sync(game.pieces, time);
  cabinet.pusher.position.copy(game.pusher.translation());
  cabinet.update(time);
  aim.update({
    time,
    landingY: game.landingHeight(aim.x),
    ready: game.canDrop(),
    visible: game.bank > 0,
    camera,
  });
  particles.update(dt);
  updateBokeh(time);
  shake.update(dt, time);
  hud.update(dt);
  audio.update(game.pusherSpeed());
  post.render();
});
