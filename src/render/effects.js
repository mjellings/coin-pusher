import * as THREE from "three";
import { glowSprite } from "./textures.js";

const MAX_PARTICLES = 900;

// One pool of additive glowing particles for sparkles, win bursts and bonus confetti.
export function createParticles(scene) {
  const positions = new Float32Array(MAX_PARTICLES * 3);
  const colors = new Float32Array(MAX_PARTICLES * 3);
  const sizes = new Float32Array(MAX_PARTICLES);
  const velocities = new Float32Array(MAX_PARTICLES * 3);
  const life = new Float32Array(MAX_PARTICLES);
  const maxLife = new Float32Array(MAX_PARTICLES);
  const baseSize = new Float32Array(MAX_PARTICLES);
  const gravity = new Float32Array(MAX_PARTICLES);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1).setUsage(THREE.DynamicDrawUsage));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: { uMap: { value: glowSprite() }, uScale: { value: 400 } },
    vertexShader: /* glsl */ `
      attribute float size;
      varying vec3 vColor;
      uniform float uScale;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = size * uScale / -mv.z;
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap;
      varying vec3 vColor;
      void main() {
        float a = texture2D(uMap, gl_PointCoord).a;
        gl_FragColor = vec4(vColor * 2.5, a);
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  let next = 0;
  const color = new THREE.Color();

  function emit({ x, y, z, count, speed = 3, spread = 1, up = 1, colors: palette, size = 0.3, lifetime = 0.8, fall = 12 }) {
    for (let n = 0; n < count; n++) {
      const i = next;
      next = (next + 1) % MAX_PARTICLES;
      positions.set([x, y, z], i * 3);
      const angle = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.6);
      velocities[i * 3] = Math.cos(angle) * s * spread;
      velocities[i * 3 + 1] = s * up * (0.6 + Math.random() * 0.8);
      velocities[i * 3 + 2] = Math.sin(angle) * s * spread;
      color.set(palette[Math.floor(Math.random() * palette.length)]);
      colors.set([color.r, color.g, color.b], i * 3);
      maxLife[i] = life[i] = lifetime * (0.6 + Math.random() * 0.6);
      baseSize[i] = size * (0.6 + Math.random() * 0.8);
      gravity[i] = fall;
    }
  }

  return {
    setPixelScale(height) {
      material.uniforms.uScale.value = height * 0.55;
    },
    sparkle(x, y, z, strength = 1) {
      emit({
        x,
        y: y + 0.1,
        z,
        count: Math.round(5 + 6 * strength),
        speed: 2.2,
        spread: 0.8,
        colors: [0xffffff, 0xffe9a8, 0xffd060],
        size: 0.22,
        lifetime: 0.45,
        fall: 6,
      });
    },
    burst(x, y, z, { value = 1, kind = "coin" } = {}) {
      const palette =
        kind === "gem"
          ? [0xff3f9f, 0xff9ad8, 0xffffff, 0x9b5cff]
          : kind === "prize"
            ? [0xffb030, 0xfff0a0, 0xff6a3d, 0xffffff]
            : [0xffd060, 0xfff0b0, 0xffffff];
      emit({ x, y, z, count: 18 + Math.min(60, value * 6), speed: 6, spread: 0.9, up: 1.3, colors: palette, size: 0.35, lifetime: 1.1, fall: 14 });
    },
    update(dt) {
      for (let i = 0; i < MAX_PARTICLES; i++) {
        if (life[i] <= 0) {
          sizes[i] = 0;
          continue;
        }
        life[i] -= dt;
        const k = i * 3;
        velocities[k + 1] -= gravity[i] * dt;
        velocities[k] *= 0.985;
        velocities[k + 2] *= 0.985;
        positions[k] += velocities[k] * dt;
        positions[k + 1] += velocities[k + 1] * dt;
        positions[k + 2] += velocities[k + 2] * dt;
        const t = Math.max(0, life[i] / maxLife[i]);
        sizes[i] = baseSize[i] * (t < 0.8 ? t / 0.8 : 1) * (0.7 + 0.3 * Math.sin(life[i] * 40));
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.size.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

// A small decaying shake applied on top of the camera's resting position.
export function createCameraShake(camera) {
  let trauma = 0;
  let rest = null;
  let target = null;
  return {
    setRest(position, lookTarget) {
      rest = position.clone();
      target = lookTarget.clone();
    },
    add(amount) {
      trauma = Math.min(1, trauma + amount);
    },
    update(dt, time) {
      if (!rest) return;
      trauma = Math.max(0, trauma - dt * 1.8);
      const shake = trauma * trauma * 0.25;
      camera.position.set(
        rest.x + shake * Math.sin(time * 47),
        rest.y + shake * Math.sin(time * 53 + 1),
        rest.z + shake * 0.5 * Math.sin(time * 41 + 2),
      );
      camera.lookAt(target);
    },
  };
}
