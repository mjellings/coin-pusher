import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { COIN_RADIUS, COIN_HALF_HEIGHT, KINDS, GEM_POINTS, MAX_PIECES, PLINKO } from "../game.js";
import { coinFaceBump, coinEdgeBump, glowSprite } from "./textures.js";

function coinMaterials(kind) {
  const gold = kind === "prize" ? 0xffb03a : 0xf3c14b;
  const face = new THREE.MeshPhysicalMaterial({
    color: gold,
    metalness: 1,
    roughness: 0.3,
    bumpMap: coinFaceBump(kind),
    bumpScale: kind === "prize" ? 4 : 3,
    clearcoat: 0.3,
    clearcoatRoughness: 0.2,
    emissive: kind === "prize" ? 0x8a3a00 : 0x000000,
    emissiveIntensity: kind === "prize" ? 0.35 : 0,
  });
  const edge = new THREE.MeshPhysicalMaterial({
    color: gold,
    metalness: 1,
    roughness: 0.3,
    bumpMap: coinEdgeBump(),
    bumpScale: 2,
    emissive: face.emissive,
    emissiveIntensity: face.emissiveIntensity,
  });
  // CylinderGeometry groups are: side, top cap, bottom cap.
  return [edge, face, face];
}

function instanced(geometry, material, count) {
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  mesh.count = 0;
  return mesh;
}

export function createPieces(scene) {
  const meshes = {
    coin: instanced(
      new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HALF_HEIGHT * 2, 48, 1),
      coinMaterials("coin"),
      MAX_PIECES,
    ),
    prize: instanced(
      new THREE.CylinderGeometry(KINDS.prize.radius, KINDS.prize.radius, KINDS.prize.halfHeight * 2, 56, 1),
      coinMaterials("prize"),
      32,
    ),
    gem: instanced(
      gemGeometry(),
      new THREE.MeshPhysicalMaterial({
        color: 0xff2f8f,
        metalness: 0,
        roughness: 0.05,
        clearcoat: 1,
        clearcoatRoughness: 0,
        iridescence: 0.6,
        emissive: 0xff1f7a,
        emissiveIntensity: 0.9,
        flatShading: true,
      }),
      32,
    ),
  };
  for (const mesh of Object.values(meshes)) scene.add(mesh);

  // Soft halos that follow the bonus pieces, so they stand out on a crowded board.
  const glowTexture = glowSprite();
  const halos = [];
  const haloFor = (index) => {
    if (!halos[index]) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: glowTexture,
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        }),
      );
      scene.add(sprite);
      halos[index] = sprite;
    }
    return halos[index];
  };

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3(1, 1, 1);

  return {
    sync(pieces, time) {
      const counts = { coin: 0, prize: 0, gem: 0 };
      let haloCount = 0;
      for (const piece of pieces) {
        const mesh = meshes[piece.kind];
        const index = counts[piece.kind];
        if (index >= mesh.instanceMatrix.count) continue;
        position.copy(piece.body.translation());
        quaternion.copy(piece.body.rotation());
        mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
        counts[piece.kind]++;
        if (piece.kind !== "coin") {
          const halo = haloFor(haloCount++);
          const pulse = 0.8 + 0.2 * Math.sin(time * 4 + haloCount);
          halo.visible = true;
          halo.position.copy(position);
          halo.position.y -= 0.1;
          halo.material.color.set(piece.kind === "gem" ? 0xd81f7a : 0xc86a10);
          halo.material.opacity = (piece.kind === "gem" ? 0.4 : 0.25) * pulse;
          halo.scale.setScalar(piece.kind === "gem" ? 2.2 : 2.6);
        }
      }
      for (let i = haloCount; i < halos.length; i++) halos[i].visible = false;
      for (const [kind, mesh] of Object.entries(meshes)) {
        mesh.count = counts[kind];
        mesh.instanceMatrix.needsUpdate = true;
      }
    },
  };
}

function gemGeometry() {
  const points = [];
  for (let i = 0; i < GEM_POINTS.length; i += 3) {
    points.push(new THREE.Vector3(GEM_POINTS[i], GEM_POINTS[i + 1], GEM_POINTS[i + 2]));
  }
  return new ConvexGeometry(points);
}

// The next coin, standing on its edge in the chosen slot at the top of the peg board.
export function createSlotGhost(scene) {
  const ghost = new THREE.Mesh(
    new THREE.CylinderGeometry(COIN_RADIUS, COIN_RADIUS, COIN_HALF_HEIGHT * 2, 48),
    new THREE.MeshPhysicalMaterial({
      color: 0xf3c14b,
      metalness: 1,
      roughness: 0.25,
      emissive: 0xffa020,
      emissiveIntensity: 0.4,
      transparent: true,
      opacity: 0.9,
    }),
  );
  ghost.rotation.x = Math.PI / 2;
  scene.add(ghost);
  let x = PLINKO.slots[1];
  return {
    update({ time, dt, slotX, ready, visible }) {
      // Glide to the chosen slot rather than jumping.
      x += (slotX - x) * Math.min(1, dt * 14);
      ghost.visible = visible;
      ghost.position.set(x, PLINKO.slotY + 0.05 + Math.sin(time * 3) * 0.04, PLINKO.z);
      ghost.material.opacity = ready ? 0.95 : 0.3;
      ghost.material.emissiveIntensity = ready ? 0.4 + 0.15 * Math.sin(time * 6) : 0.05;
    },
  };
}
