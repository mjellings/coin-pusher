import * as THREE from "three";
import { BOARD } from "../game.js";
import { bokehSprite, roomBackdrop } from "./textures.js";

export function createRenderer(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.9;
  return renderer;
}

export function createScene(renderer) {
  const scene = new THREE.Scene();
  scene.background = roomBackdrop();
  scene.environment = arcadeEnvironment(renderer);
  scene.environmentIntensity = 0.55;
  scene.fog = new THREE.Fog(0x0c0610, 30, 70);
  return scene;
}

// A small studio of coloured light panels, baked into an environment map. This is what the
// gold coins and chrome reflect, so they pick up warm highlights plus a hint of arcade neon.
function arcadeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x2c2226);
  const panel = (color, intensity, w, h, x, y, z) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }),
    );
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    env.add(mesh);
  };
  panel(0xffe0b0, 1.3, 8, 4, 0, 10, 2); // warm overhead softbox
  panel(0xfff4e0, 1.0, 10, 3, 0, 4, 10); // front fill
  panel(0xff3fb4, 0.6, 2, 8, -9, 3, -2); // magenta neon strip
  panel(0x3fd8ff, 0.6, 2, 8, 9, 3, -2); // cyan neon strip
  panel(0xffb347, 0.8, 12, 1, 0, -3, -9); // amber floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(env, 0.03).texture;
  pmrem.dispose();
  return texture;
}

export function addLights(scene) {
  // Warm key light from above and in front, casting the soft shadows.
  const key = new THREE.DirectionalLight(0xffe0b8, 2.0);
  key.position.set(3, 18, 8);
  key.target.position.set(0, 3, -3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 11, bottom: -11, near: 2, far: 45 });
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  key.shadow.radius = 4;
  scene.add(key, key.target);

  // Cool, soft fill from the opposite side so shadows never go black.
  const fill = new THREE.DirectionalLight(0xb8c8ff, 0.5);
  fill.position.set(-8, 6, 6);
  scene.add(fill);

  // Rim light from behind to catch coin edges and separate them from the board.
  const rim = new THREE.DirectionalLight(0xffd2b0, 0.9);
  rim.position.set(0, 7, -12);
  scene.add(rim);

  scene.add(new THREE.HemisphereLight(0xffe8d0, 0x2a1020, 0.35));

  // A warm pool of light on the playfield.
  const spot = new THREE.SpotLight(0xffcc88, 4, 24, Math.PI / 4.5, 0.6, 1.5);
  spot.position.set(0, 12, 3);
  spot.target.position.set(0, 1.5, -2.5);
  scene.add(spot, spot.target);

  return { key };
}

// Out-of-focus arcade lights floating in the dark room behind the cabinet.
export function addBokeh(scene) {
  const texture = bokehSprite();
  const colors = [0xff3fb4, 0x3fd8ff, 0xffb347, 0x9b5cff, 0xff6a3d, 0x5cffb0];
  const group = new THREE.Group();
  const lights = [];
  for (let i = 0; i < 46; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: colors[i % colors.length],
      transparent: true,
      opacity: 0.25,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    });
    const sprite = new THREE.Sprite(material);
    const side = Math.random() < 0.5 ? -1 : 1;
    sprite.position.set(
      (Math.random() - 0.5) * 70,
      2 + Math.random() * 22,
      -18 - Math.random() * 22,
    );
    // Keep some lights in the side margins too, so wide screens aren't empty.
    if (i % 3 === 0) sprite.position.set(side * (10 + Math.random() * 14), -4 + Math.random() * 14, -6 - Math.random() * 10);
    const size = 1.5 + Math.random() * 4;
    sprite.scale.set(size, size, 1);
    sprite.userData = { phase: Math.random() * Math.PI * 2, speed: 0.3 + Math.random() * 0.6, base: 0.12 + Math.random() * 0.22 };
    group.add(sprite);
    lights.push(sprite);
  }
  scene.add(group);

  // The arcade floor under the cabinet.
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ color: 0x120810, roughness: 0.6, metalness: 0.2 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -7;
  floor.receiveShadow = true;
  scene.add(floor);

  return (time) => {
    for (const sprite of lights) {
      const { phase, speed, base } = sprite.userData;
      sprite.material.opacity = base * (0.7 + 0.3 * Math.sin(time * speed + phase));
    }
  };
}

export function createCamera() {
  return new THREE.PerspectiveCamera(42, 1, 0.1, 150);
}

// Frames the board, pulling back on narrow screens so its full width stays in view.
export function frameCamera(camera, width, height) {
  camera.aspect = width / height;
  const halfFovTan = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // The machine is tall, so on wide screens the height decides how far back to stand.
  const distance = Math.max(21, (BOARD.halfWidth + 1.4) / (halfFovTan * camera.aspect));
  const position = new THREE.Vector3(0, 4.4 + distance * 0.45, BOARD.frontZ + distance * 0.88);
  const target = new THREE.Vector3(0, 4.4, -3);
  camera.position.copy(position);
  camera.lookAt(target);
  camera.updateProjectionMatrix();
  return { position, target };
}
