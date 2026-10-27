import * as THREE from "three";
import { BOARD, PUSHER, BACK_WALL } from "../game.js";
import { brushedMetal, signTexture } from "./textures.js";

const SIGN_TOP = 5.6;
const BACK_WALL_TOP = 7;

export function buildCabinet(scene) {
  const { halfWidth, frontZ, backZ, wallHeight, winHalfWidth } = BOARD;
  const length = frontZ - backZ;
  const midZ = backZ + length / 2;
  const brushed = brushedMetal();

  const materials = {
    playfield: new THREE.MeshPhysicalMaterial({
      color: 0x7a1428,
      roughness: 0.45,
      metalness: 0.05,
      clearcoat: 0.8,
      clearcoatRoughness: 0.15,
    }),
    chrome: new THREE.MeshPhysicalMaterial({
      color: 0xd0d4dc,
      metalness: 1,
      roughness: 0.55,
      roughnessMap: brushed,
      envMapIntensity: 1.8,
    }),
    lacquer: new THREE.MeshPhysicalMaterial({
      color: 0x1a0a14,
      roughness: 0.35,
      metalness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.1,
    }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.04,
      transparent: true,
      opacity: 0.07,
      envMapIntensity: 0.6,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
    pusher: new THREE.MeshPhysicalMaterial({
      color: 0x8c929c,
      metalness: 1,
      roughness: 0.6,
      roughnessMap: brushed,
      envMapIntensity: 1.2,
    }),
    tray: new THREE.MeshStandardMaterial({ color: 0xc8902c, roughness: 0.3, metalness: 1 }),
    gutter: new THREE.MeshStandardMaterial({ color: 0x0c0508, roughness: 0.8 }),
  };

  const box = (w, h, d, material, x, y, z, { cast = true, receive = true } = {}) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
    mesh.position.set(x, y, z);
    mesh.castShadow = cast;
    mesh.receiveShadow = receive;
    scene.add(mesh);
    return mesh;
  };

  // Playfield and the cabinet body underneath it.
  box(halfWidth * 2, 1, length, materials.playfield, 0, -0.5, midZ);
  box(halfWidth * 2 + 1.4, 6, length + 1.6, materials.lacquer, 0, -4, midZ + 0.3, { cast: false });

  for (const side of [-1, 1]) {
    const x = side * (halfWidth + 0.25);
    box(0.5, wallHeight, length, materials.glass, x, wallHeight / 2, midZ, { cast: false, receive: false });
    // Brushed rails along the bottom and top of each glass panel, and a corner post at the front.
    box(0.7, 0.18, length + 0.2, materials.chrome, x, 1.3, midZ);
    box(0.7, 0.18, length + 0.2, materials.chrome, x, wallHeight + 0.09, midZ);
    box(0.7, wallHeight, 0.25, materials.chrome, x, wallHeight / 2, frontZ + 0.05);
    // Lacquered side skirt below the playfield.
    box(0.6, 1.4, length, materials.lacquer, side * (halfWidth + 0.3), 0.5, midZ, { cast: false });
  }

  // Back wall, rising above the glass to carry the sign.
  const wallBottom = PUSHER.height + BACK_WALL.gap;
  const backWallHeight = BACK_WALL_TOP - wallBottom;
  box(
    halfWidth * 2 + 1.4,
    backWallHeight,
    BACK_WALL.thickness,
    materials.lacquer,
    0,
    wallBottom + backWallHeight / 2,
    BACK_WALL.frontZ - BACK_WALL.thickness / 2,
  );

  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.85),
    new THREE.MeshBasicMaterial({ map: signTexture(), color: new THREE.Color(1.3, 1.3, 1.3) }),
  );
  sign.position.set(0, SIGN_TOP - 1.05, BACK_WALL.frontZ + 0.01);
  scene.add(sign);

  // Win tray below the front edge, with dark side gutters where coins are lost.
  box(winHalfWidth * 2, 0.3, 3, materials.tray, 0, -2.4, frontZ + 1.2);
  const gutterWidth = halfWidth + 0.7 - winHalfWidth;
  for (const side of [-1, 1]) {
    box(gutterWidth, 0.3, 3, materials.gutter, side * (winHalfWidth + gutterWidth / 2), -2.7, frontZ + 1.2);
    box(0.08, 0.7, 3, materials.chrome, side * winHalfWidth, -2.15, frontZ + 1.2);
  }

  // Pusher, with a colour-cycling LED strip along its front edge.
  const pusher = box(halfWidth * 2 - 0.04, PUSHER.height, PUSHER.depth, materials.pusher, 0, 0, 0);
  const pusherLed = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2 - 0.1, 0.1, 0.04),
    new THREE.MeshBasicMaterial({ color: 0xff3fb4 }),
  );
  pusherLed.position.set(0, PUSHER.height / 2 - 0.12, PUSHER.depth / 2 + 0.02);
  pusher.add(pusherLed);
  const pusherLedLow = pusherLed.clone();
  pusherLedLow.material = pusherLed.material;
  pusherLedLow.position.y = -PUSHER.height / 2 + 0.15;
  pusher.add(pusherLedLow);

  // A cyan LED strip under the front lip of the playfield.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 3) }),
  );
  lip.position.set(0, -0.12, frontZ + 0.02);
  scene.add(lip);

  const marquee = buildMarquee(scene);
  const ledColor = new THREE.Color();

  return {
    pusher,
    update(time) {
      ledColor.setHSL((time * 0.08) % 1, 1, 0.55).multiplyScalar(2.4);
      pusherLed.material.color.copy(ledColor);
      marquee(time);
    },
  };
}

// Rows of bulbs around the cabinet with a chasing pattern, drawn as one instanced mesh.
function buildMarquee(scene) {
  const { halfWidth, frontZ } = BOARD;
  const points = [];
  const line = (from, to, count) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      points.push(new THREE.Vector3().lerpVectors(from, to, t));
    }
  };
  const top = BOARD.wallHeight + 0.26;
  const signZ = BACK_WALL.frontZ + 0.06;
  // Up the front corner posts, along the top rails, then round the sign. One continuous path,
  // so the chase runs all the way around.
  line(new THREE.Vector3(-halfWidth - 0.25, 1.6, frontZ + 0.2), new THREE.Vector3(-halfWidth - 0.25, top - 0.3, frontZ + 0.2), 9);
  line(new THREE.Vector3(-halfWidth - 0.25, top, frontZ), new THREE.Vector3(-halfWidth - 0.25, top, BACK_WALL.frontZ + 0.3), 14);
  line(new THREE.Vector3(-halfWidth - 0.4, top + 0.25, signZ), new THREE.Vector3(halfWidth + 0.4, top + 0.25, signZ), 20);
  line(new THREE.Vector3(halfWidth + 0.25, top, BACK_WALL.frontZ + 0.3), new THREE.Vector3(halfWidth + 0.25, top, frontZ), 14);
  line(new THREE.Vector3(halfWidth + 0.25, top - 0.3, frontZ + 0.2), new THREE.Vector3(halfWidth + 0.25, 1.6, frontZ + 0.2), 9);
  // A frame of bulbs round the sign.
  const signBottom = SIGN_TOP - 2.1;
  line(new THREE.Vector3(-3.9, SIGN_TOP, signZ), new THREE.Vector3(3.9, SIGN_TOP, signZ), 19);
  line(new THREE.Vector3(3.9, SIGN_TOP - 0.45, signZ), new THREE.Vector3(3.9, signBottom + 0.45, signZ), 3);
  line(new THREE.Vector3(3.9, signBottom, signZ), new THREE.Vector3(-3.9, signBottom, signZ), 19);
  line(new THREE.Vector3(-3.9, signBottom + 0.45, signZ), new THREE.Vector3(-3.9, SIGN_TOP - 0.45, signZ), 3);
  // A row across the front of the cabinet, below the win tray.
  const frontRow = points.length;
  line(new THREE.Vector3(-halfWidth - 0.4, -1.1, frontZ + 2.75), new THREE.Vector3(halfWidth + 0.4, -1.1, frontZ + 2.75), 17);

  const bulbs = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.09, 12, 8),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    points.length,
  );
  const matrix = new THREE.Matrix4();
  points.forEach((p, i) => bulbs.setMatrixAt(i, matrix.makeTranslation(p.x, p.y, p.z)));
  scene.add(bulbs);

  // The bar the front row sits on.
  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2 + 1.4, 0.4, 0.2),
    new THREE.MeshPhysicalMaterial({ color: 0x1a0a14, roughness: 0.35, clearcoat: 1 }),
  );
  bar.position.set(0, -1.1, frontZ + 2.65);
  scene.add(bar);

  const warm = new THREE.Color(3, 2.1, 1.1);
  const dim = new THREE.Color(0.35, 0.22, 0.12);
  const palette = [new THREE.Color(3, 0.6, 1.8), new THREE.Color(0.6, 2.2, 3), new THREE.Color(3, 2.2, 0.5)];
  const color = new THREE.Color();
  return (time) => {
    const step = Math.floor(time * 10);
    for (let i = 0; i < points.length; i++) {
      if (i >= frontRow) {
        const j = i - frontRow;
        color.copy(palette[(j + Math.floor(time * 3)) % palette.length]);
      } else {
        color.copy((i + step) % 4 === 0 ? warm : dim);
        if ((i + step) % 4 === 1) color.lerp(warm, 0.35);
      }
      bulbs.setColorAt(i, color);
    }
    bulbs.instanceColor.needsUpdate = true;
  };
}
