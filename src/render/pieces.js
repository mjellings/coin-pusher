import * as THREE from "three";
import { ConvexGeometry } from "three/examples/jsm/geometries/ConvexGeometry.js";
import { COIN_RADIUS, COIN_HALF_HEIGHT, KINDS, GEM_POINTS, MAX_PIECES, DROP } from "../game.js";
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
          halo.material.opacity = 0.4 * pulse;
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

// The coin waiting to be dropped, a beam showing where it will fall and a ring where it will land.
export function createAimGuide(scene) {
  const group = new THREE.Group();
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
  group.add(ghost);

  const beamMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 1 } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform float uStrength;
      varying vec2 vUv;
      void main() {
        float edge = 1.0 - abs(vUv.x - 0.5) * 2.0;
        float dashes = 0.55 + 0.45 * step(0.5, fract(vUv.y * 6.0 + uTime * 1.5));
        float alpha = edge * edge * dashes * (0.25 + 0.5 * vUv.y) * uStrength;
        gl_FragColor = vec4(vec3(1.0, 0.8, 0.4) * 1.6, alpha);
      }
    `,
  });
  const beam = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 1), beamMaterial);
  group.add(beam);

  const ring = new THREE.Mesh(
    new THREE.RingGeometry(COIN_RADIUS * 0.85, COIN_RADIUS * 1.05, 48),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(2.4, 1.7, 0.6),
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  group.add(ring);
  scene.add(group);

  let x = 0;
  return {
    get x() {
      return x;
    },
    set x(value) {
      x = value;
    },
    update({ time, landingY, ready, visible, camera }) {
      group.visible = visible;
      const bob = Math.sin(time * 3) * 0.06;
      ghost.position.set(x, DROP.y + 0.3 + bob, DROP.z);
      ghost.rotation.set(0.25, time * 1.2, 0);
      ghost.material.opacity = ready ? 0.95 : 0.35;
      ghost.material.emissiveIntensity = ready ? 0.4 + 0.15 * Math.sin(time * 6) : 0.05;

      const top = DROP.y + 0.2;
      const bottom = landingY + 0.02;
      beam.scale.y = Math.max(0.01, top - bottom);
      beam.position.set(x, (top + bottom) / 2, DROP.z);
      // Billboard the beam around its vertical axis so it always faces the camera.
      beam.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - DROP.z);
      beamMaterial.uniforms.uTime.value = time;
      beamMaterial.uniforms.uStrength.value = ready ? 1 : 0.3;

      ring.position.set(x, bottom + 0.01, DROP.z);
      const pulse = 1 + 0.08 * Math.sin(time * 6);
      ring.scale.setScalar(pulse);
      ring.material.opacity = ready ? 0.8 : 0.25;
    },
  };
}
