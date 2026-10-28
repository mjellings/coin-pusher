import * as THREE from "three";
import { BOARD, SHELF, PUSHERS, UPPER_WALL, PLINKO, PEGS, DEFLECTORS, LIP_HALF_THICKNESS, GATE } from "../game.js";
import { brushedMetal, signTexture, pegBoardTexture } from "./textures.js";

const SIGN_BOTTOM = PLINKO.topY + 0.75;
export const SIGN_TOP = SIGN_BOTTOM + 1.85;
const BACK_TOP = SIGN_TOP + 0.5;

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
    pusher: new THREE.MeshPhysicalMaterial({
      color: 0x8c929c,
      metalness: 1,
      roughness: 0.6,
      roughnessMap: brushed,
      envMapIntensity: 1.2,
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
    pegBoard: new THREE.MeshStandardMaterial({ map: pegBoardTexture(), roughness: 0.5, metalness: 0.2 }),
    peg: new THREE.MeshStandardMaterial({ color: 0xffd27a, metalness: 1, roughness: 0.25, emissive: 0x6a4210, emissiveIntensity: 0.6 }),
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

  // Lower playfield and the cabinet body underneath it.
  box(halfWidth * 2, 1, length, materials.playfield, 0, -0.5, midZ);
  box(halfWidth * 2 + 1.4, 6, length + 1.6, materials.lacquer, 0, -4, midZ + 0.3, { cast: false });

  // The shelf, with the upper playfield on top and an LED strip along its front edge.
  const shelfBottom = PUSHERS[0].height + SHELF.gap;
  const shelfDepth = SHELF.frontZ - backZ;
  const shelfMidZ = backZ + shelfDepth / 2;
  box(halfWidth * 2, SHELF.topY - shelfBottom - 0.1, shelfDepth, materials.lacquer, 0, (shelfBottom + SHELF.topY - 0.1) / 2, shelfMidZ);
  box(halfWidth * 2, 0.1, shelfDepth, materials.playfield, 0, SHELF.topY - 0.05, shelfMidZ);
  box(halfWidth * 2, 0.08, 0.1, materials.chrome, 0, SHELF.topY - 0.04, SHELF.frontZ - 0.03, { cast: false });
  const shelfLed = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2, 0.06, 0.04),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 3) }),
  );
  shelfLed.position.set(0, SHELF.topY - 0.25, SHELF.frontZ + 0.02);
  scene.add(shelfLed);

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

  // The back wall above the upper pusher, rising past the glass to carry the sign.
  const backHeight = BACK_TOP - UPPER_WALL.bottomY;
  box(
    halfWidth * 2 + 1.4,
    backHeight,
    UPPER_WALL.thickness,
    materials.lacquer,
    0,
    UPPER_WALL.bottomY + backHeight / 2,
    UPPER_WALL.frontZ - UPPER_WALL.thickness / 2,
  );
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(7.4, 1.85),
    new THREE.MeshBasicMaterial({ map: signTexture(), color: new THREE.Color(1.3, 1.3, 1.3) }),
  );
  sign.position.set(0, (SIGN_BOTTOM + SIGN_TOP) / 2, UPPER_WALL.frontZ + 0.01);
  scene.add(sign);

  const slots = buildPegBoard(scene, materials, box);

  // Win tray below the front edge, with dark side gutters where coins are lost.
  box(winHalfWidth * 2, 0.3, 3, materials.tray, 0, -2.4, frontZ + 1.2);
  const gutterWidth = halfWidth + 0.7 - winHalfWidth;
  // Shown while the side guards bonus is running.
  const guardMaterial = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0.4, 2.4, 1.2),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const guards = [];
  for (const side of [-1, 1]) {
    box(gutterWidth, 0.3, 3, materials.gutter, side * (winHalfWidth + gutterWidth / 2), -2.7, frontZ + 1.2);
    box(0.08, 0.7, 3, materials.chrome, side * winHalfWidth, -2.15, frontZ + 1.2);
    // A glowing barrier along the front edge, in front of the gutter.
    const guard = new THREE.Mesh(new THREE.BoxGeometry(halfWidth - winHalfWidth, 0.35, 0.08), guardMaterial);
    guard.position.set(side * (winHalfWidth + (halfWidth - winHalfWidth) / 2), 0.1, frontZ + 0.08);
    guard.visible = false;
    scene.add(guard);
    guards.push(guard);
  }

  // Both pushers, each with a colour-cycling LED strip along its front edge.
  const ledMaterials = [];
  const pushers = PUSHERS.map((config) => {
    const mesh = box(halfWidth * 2 - 0.04, config.height, config.depth, materials.pusher, 0, 0, 0);
    if (config.lip) {
      const lip = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 - 0.04, LIP_HALF_THICKNESS * 2, config.lip), materials.chrome);
      lip.position.set(0, config.height / 2 - LIP_HALF_THICKNESS, config.depth / 2 + config.lip / 2);
      lip.castShadow = true;
      mesh.add(lip);
    }
    const led = new THREE.MeshBasicMaterial({ color: 0xff3fb4 });
    ledMaterials.push(led);
    for (const y of [config.height / 2 - 0.12, -config.height / 2 + 0.15]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(halfWidth * 2 - 0.1, 0.08, 0.04), led);
      strip.position.set(0, y, config.depth / 2 + 0.02);
      mesh.add(strip);
    }
    return mesh;
  });

  // A cyan LED strip under the front lip of the lower playfield.
  const lip = new THREE.Mesh(
    new THREE.BoxGeometry(halfWidth * 2, 0.06, 0.06),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.2, 3) }),
  );
  lip.position.set(0, -0.12, frontZ + 0.02);
  scene.add(lip);

  const marquee = buildMarquee(scene);
  const ledColor = new THREE.Color();

  return {
    pushers,
    setSelectedSlot: slots.select,
    flashSlot: slots.flash,
    setGateX: slots.setGateX,
    flashGate: slots.flashGate,
    setGuards(on) {
      for (const guard of guards) guard.visible = on;
    },
    update(time, dt) {
      guardMaterial.opacity = 0.4 + Math.sin(time * 6) * 0.15;
      ledMaterials.forEach((material, i) => {
        ledColor.setHSL((time * 0.08 + i * 0.5) % 1, 1, 0.55).multiplyScalar(2.4);
        material.color.copy(ledColor);
      });
      marquee(time);
      slots.update(time, dt);
    },
  };
}

// The plinko board: a printed back plate, gold pegs, chrome deflectors, front glass, and a header
// along the top with a lit opening for each slot.
function buildPegBoard(scene, materials, box) {
  const { halfWidth } = BOARD;
  const height = PLINKO.topY - PLINKO.bottomY;
  const midY = PLINKO.bottomY + height / 2;

  const plate = box(halfWidth * 2, height, 0.1, materials.pegBoard, 0, midY, PLINKO.z - PLINKO.halfGap - 0.05, { cast: false });
  plate.receiveShadow = true;
  box(halfWidth * 2, height, 0.02, materials.glass, 0, midY, PLINKO.z + PLINKO.halfGap + 0.05, { cast: false, receive: false });
  // Chrome trim along the bottom edge of the board.
  box(halfWidth * 2, 0.1, PLINKO.halfGap * 2 + 0.3, materials.chrome, 0, PLINKO.bottomY - 0.05, PLINKO.z);

  const pegs = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(PLINKO.pegRadius, PLINKO.pegRadius, PLINKO.halfGap * 2 + 0.1, 16),
    materials.peg,
    PEGS.length,
  );
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
  const unit = new THREE.Vector3(1, 1, 1);
  PEGS.forEach((peg, i) => {
    pegs.setMatrixAt(i, matrix.compose(new THREE.Vector3(peg.x, peg.y, PLINKO.z), rotation, unit));
  });
  pegs.castShadow = true;
  scene.add(pegs);

  for (const deflector of DEFLECTORS) {
    const mesh = box(1, 0.12, PLINKO.halfGap * 2 + 0.1, materials.chrome, deflector.x, deflector.y, PLINKO.z);
    mesh.rotation.z = (deflector.side * Math.PI) / 4;
  }

  // Header with the slot openings.
  const headerY = PLINKO.topY + 0.3;
  box(halfWidth * 2 + 0.2, 0.6, PLINKO.halfGap * 2 + 0.5, materials.lacquer, 0, headerY, PLINKO.z);
  const slotMaterials = PLINKO.slots.map(() => new THREE.MeshBasicMaterial({ color: 0xffffff }));
  PLINKO.slots.forEach((x, i) => {
    const light = new THREE.Mesh(new THREE.BoxGeometry(1, 0.14, 0.04), slotMaterials[i]);
    light.position.set(x, headerY, PLINKO.z + PLINKO.halfGap + 0.27);
    scene.add(light);
  });

  // The bonus gate: a lit gold cup under the bottom of the board that slides from side to side.
  // Coins that drop into it spin the bonus wheel.
  const gateMaterial = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.5) });
  const gate = new THREE.Group();
  const gateDepth = PLINKO.halfGap * 2 + 0.36;
  const cup = new THREE.Mesh(new THREE.BoxGeometry(GATE.halfWidth * 2 + 0.4, 0.08, gateDepth), gateMaterial);
  gate.add(cup);
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, gateDepth), materials.chrome);
    post.position.set(side * (GATE.halfWidth + 0.24), 0.11, 0);
    gate.add(post);
  }
  gate.position.set(0, PLINKO.bottomY - 0.2, PLINKO.z);
  scene.add(gate);
  let gateFlash = 0;
  const gateIdle = new THREE.Color(3, 2.2, 0.5);
  const gateDim = new THREE.Color(1.2, 0.7, 0.15);
  const gateHit = new THREE.Color(4, 4, 4);

  // A glowing arrow above the chosen slot.
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.4, 3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 2.2, 0.6) }),
  );
  arrow.rotation.x = Math.PI;
  scene.add(arrow);

  let selected = 1;
  const flashes = PLINKO.slots.map(() => 0);
  const idle = new THREE.Color(0.5, 0.25, 0.6);
  const active = new THREE.Color(3, 2.1, 0.7);
  const flash = new THREE.Color(3, 3, 3);
  return {
    select(i) {
      selected = i;
    },
    flash(i) {
      flashes[i] = 1;
    },
    setGateX(x) {
      gate.position.x = x;
    },
    flashGate() {
      gateFlash = 1;
    },
    update(time, dt) {
      gateFlash = Math.max(0, gateFlash - dt * 1.5);
      gateMaterial.color.copy(gateDim).lerp(gateIdle, 0.5 + Math.sin(time * 8) * 0.5).lerp(gateHit, gateFlash);
      gate.scale.setScalar(1 + gateFlash * 0.3);
      slotMaterials.forEach((material, i) => {
        flashes[i] = Math.max(0, flashes[i] - dt * 4);
        material.color.copy(i === selected ? active : idle).lerp(flash, flashes[i]);
      });
      arrow.position.set(PLINKO.slots[selected], headerY + 0.65 + Math.sin(time * 5) * 0.08, PLINKO.z + 0.2);
    },
  };
}

// Rows of bulbs around the cabinet with a chasing pattern, drawn as one instanced mesh.
function buildMarquee(scene) {
  const { halfWidth, frontZ, wallHeight } = BOARD;
  const points = [];
  const line = (from, to, count) => {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : i / (count - 1);
      points.push(new THREE.Vector3().lerpVectors(from, to, t));
    }
  };
  const top = wallHeight + 0.26;
  const backZ = UPPER_WALL.frontZ + 0.06;
  // Up the front corner posts and along the top rails. One continuous path, so the chase runs
  // all the way round.
  line(new THREE.Vector3(-halfWidth - 0.25, 1.6, frontZ + 0.2), new THREE.Vector3(-halfWidth - 0.25, top - 0.3, frontZ + 0.2), 16);
  line(new THREE.Vector3(-halfWidth - 0.25, top, frontZ), new THREE.Vector3(-halfWidth - 0.25, top, UPPER_WALL.frontZ + 0.3), 18);
  line(new THREE.Vector3(halfWidth + 0.25, top, UPPER_WALL.frontZ + 0.3), new THREE.Vector3(halfWidth + 0.25, top, frontZ), 18);
  line(new THREE.Vector3(halfWidth + 0.25, top - 0.3, frontZ + 0.2), new THREE.Vector3(halfWidth + 0.25, 1.6, frontZ + 0.2), 16);
  // A frame of bulbs round the sign.
  line(new THREE.Vector3(-3.9, SIGN_TOP + 0.1, backZ), new THREE.Vector3(3.9, SIGN_TOP + 0.1, backZ), 19);
  line(new THREE.Vector3(3.9, SIGN_TOP - 0.35, backZ), new THREE.Vector3(3.9, SIGN_BOTTOM + 0.25, backZ), 3);
  line(new THREE.Vector3(3.9, SIGN_BOTTOM - 0.1, backZ), new THREE.Vector3(-3.9, SIGN_BOTTOM - 0.1, backZ), 19);
  line(new THREE.Vector3(-3.9, SIGN_BOTTOM + 0.25, backZ), new THREE.Vector3(-3.9, SIGN_TOP - 0.35, backZ), 3);
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
        color.copy(palette[(i - frontRow + Math.floor(time * 3)) % palette.length]);
      } else {
        color.copy((i + step) % 4 === 0 ? warm : dim);
        if ((i + step) % 4 === 1) color.lerp(warm, 0.35);
      }
      bulbs.setColorAt(i, color);
    }
    bulbs.instanceColor.needsUpdate = true;
  };
}
