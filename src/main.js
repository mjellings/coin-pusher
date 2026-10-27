import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { createGame, BOARD, PUSHER, BACK_WALL, DROP, COIN_RADIUS, COIN_HALF_HEIGHT } from "./game.js";

const MAX_COINS = 600;

const canvas = document.getElementById("scene");
const bankEl = document.getElementById("bank");
const wonEl = document.getElementById("won");
const refillBtn = document.getElementById("refill");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x120d0a);
scene.environment = new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);

scene.add(new THREE.HemisphereLight(0xfff1d6, 0x2a1a10, 0.6));
const keyLight = new THREE.DirectionalLight(0xffe2b0, 2.2);
keyLight.position.set(4, 14, 8);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -8, right: 8, top: 10, bottom: -10, near: 1, far: 40 });
keyLight.shadow.bias = -0.0005;
scene.add(keyLight);

const materials = {
  floor: new THREE.MeshStandardMaterial({ color: 0x5b1e2a, roughness: 0.55, metalness: 0.1 }),
  chrome: new THREE.MeshStandardMaterial({ color: 0xd9dde3, roughness: 0.25, metalness: 1 }),
  cabinet: new THREE.MeshStandardMaterial({ color: 0x2b1b12, roughness: 0.7 }),
  tray: new THREE.MeshStandardMaterial({ color: 0x8a5a1c, roughness: 0.4, metalness: 0.6 }),
  glass: new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.05,
    transmission: 0.9,
    transparent: true,
    opacity: 0.15,
  }),
  coin: new THREE.MeshStandardMaterial({ color: 0xf5c04a, roughness: 0.28, metalness: 1 }),
};

function box(w, h, d, material, x, y, z, { cast = true, receive = true } = {}) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = cast;
  mesh.receiveShadow = receive;
  scene.add(mesh);
  return mesh;
}

function buildCabinet() {
  const { halfWidth, frontZ, backZ, wallHeight } = BOARD;
  const length = frontZ - backZ;
  const midZ = backZ + length / 2;

  box(halfWidth * 2, 1, length, materials.floor, 0, -0.5, midZ);
  // Chrome lip along the front edge.
  box(halfWidth * 2, 0.12, 0.15, materials.chrome, 0, -0.06, frontZ - 0.075, { cast: false });
  for (const side of [-1, 1]) {
    box(0.5, wallHeight, length, materials.glass, side * (halfWidth + 0.25), wallHeight / 2, midZ, {
      cast: false,
      receive: false,
    });
    // Chrome rail on top of each side.
    box(0.6, 0.15, length, materials.chrome, side * (halfWidth + 0.25), 1.4, midZ);
  }
  const wallBottom = PUSHER.height + BACK_WALL.gap;
  box(
    halfWidth * 2 + 1,
    wallHeight - wallBottom,
    BACK_WALL.thickness,
    materials.cabinet,
    0,
    wallBottom + (wallHeight - wallBottom) / 2,
    BACK_WALL.frontZ - BACK_WALL.thickness / 2,
  );
  // Win tray below the front edge, with darker side gutters where coins are lost.
  const winWidth = BOARD.winHalfWidth * 2;
  box(winWidth, 0.3, 3, materials.tray, 0, -2.4, frontZ + 1.2);
  const gutterWidth = halfWidth + 0.5 - BOARD.winHalfWidth;
  for (const side of [-1, 1]) {
    box(gutterWidth, 0.3, 3, materials.cabinet, side * (BOARD.winHalfWidth + gutterWidth / 2), -2.6, frontZ + 1.2);
    box(0.08, 0.6, 3, materials.chrome, side * BOARD.winHalfWidth, -2.2, frontZ + 1.2);
  }

  const pusher = box(halfWidth * 2 - 0.04, PUSHER.height, PUSHER.depth, materials.chrome, 0, 0, 0);
  return pusher;
}

const pusherMesh = buildCabinet();

const coinGeometry = new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HALF_HEIGHT * 2, 40);
const coinMesh = new THREE.InstancedMesh(coinGeometry, materials.coin, MAX_COINS);
coinMesh.castShadow = true;
coinMesh.receiveShadow = true;
coinMesh.frustumCulled = false;
scene.add(coinMesh);

const ghost = new THREE.Mesh(
  coinGeometry,
  new THREE.MeshStandardMaterial({ color: 0xf5c04a, metalness: 1, roughness: 0.3, transparent: true, opacity: 0.5 }),
);
ghost.position.set(0, DROP.y, DROP.z);
scene.add(ghost);

function resize() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  // Pull the camera back on narrow screens so the full width of the board stays in view.
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const distance = Math.max(12, (BOARD.halfWidth + 1) / (halfFovTan * camera.aspect));
  camera.position.set(0, distance * 0.8, BOARD.frontZ + distance * 0.65);
  camera.lookAt(0, 0, -1.5);
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

const raycaster = new THREE.Raycaster();
const dropPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -DROP.y);
const pointer = new THREE.Vector2();
const hit = new THREE.Vector3();

function aimAt(event) {
  const rect = canvas.getBoundingClientRect();
  pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(pointer, camera);
  if (raycaster.ray.intersectPlane(dropPlane, hit)) {
    ghost.position.x = THREE.MathUtils.clamp(hit.x, DROP.minX, DROP.maxX);
  }
}

const game = await createGame();
window.__game = game;
document.getElementById("loading").remove();

function updateHud() {
  bankEl.textContent = game.bank;
  wonEl.textContent = game.won;
  refillBtn.hidden = game.bank > 0;
}
game.on(updateHud);
updateHud();

canvas.addEventListener("pointermove", aimAt);
canvas.addEventListener("pointerdown", (event) => {
  aimAt(event);
  game.drop(ghost.position.x);
});
refillBtn.addEventListener("click", () => game.refill());

const matrix = new THREE.Matrix4();
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3(1, 1, 1);

function syncMeshes() {
  const count = Math.min(game.coins.length, MAX_COINS);
  for (let i = 0; i < count; i++) {
    const body = game.coins[i];
    position.copy(body.translation());
    quaternion.copy(body.rotation());
    coinMesh.setMatrixAt(i, matrix.compose(position, quaternion, scale));
  }
  coinMesh.count = count;
  coinMesh.instanceMatrix.needsUpdate = true;
  pusherMesh.position.copy(game.pusher.translation());
  ghost.visible = game.bank > 0;
  ghost.material.opacity = game.canDrop() ? 0.55 : 0.2;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  game.update(clock.getDelta());
  syncMeshes();
  renderer.render(scene, camera);
});
