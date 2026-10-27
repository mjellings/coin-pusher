import * as THREE from "three";

// Textures drawn on canvases at start-up, so the game ships with no image files.

function canvas(width, height = width) {
  const el = document.createElement("canvas");
  el.width = width;
  el.height = height;
  return [el, el.getContext("2d")];
}

function texture(el, { srgb = false, repeat } = {}) {
  const tex = new THREE.CanvasTexture(el);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(...repeat);
  }
  tex.anisotropy = 8;
  return tex;
}

// Height map for a coin face: raised rim, a ring of beads and a centre emblem.
// White is high. Used as a bump map so the face catches the light like a minted coin.
export function coinFaceBump(kind = "coin") {
  const size = 512;
  const [el, ctx] = canvas(size);
  const c = size / 2;
  ctx.fillStyle = "#555";
  ctx.fillRect(0, 0, size, size);

  // Raised rim.
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = size * 0.07;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.46, 0, Math.PI * 2);
  ctx.stroke();

  // Bead ring.
  ctx.fillStyle = "#ddd";
  const beads = kind === "prize" ? 40 : 32;
  for (let i = 0; i < beads; i++) {
    const a = (i / beads) * Math.PI * 2;
    ctx.beginPath();
    ctx.arc(c + Math.cos(a) * size * 0.37, c + Math.sin(a) * size * 0.37, size * 0.012, 0, Math.PI * 2);
    ctx.fill();
  }

  // Slightly sunken field with a soft gradient so the emblem pops.
  const field = ctx.createRadialGradient(c, c, 0, c, c, size * 0.34);
  field.addColorStop(0, "#4a4a4a");
  field.addColorStop(1, "#3a3a3a");
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.33, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f0f0f0";
  if (kind === "prize") {
    star(ctx, c, c - size * 0.02, size * 0.2, size * 0.09, 5);
    ctx.font = `900 ${size * 0.11}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("×5", c, c + size * 0.22);
  } else {
    ctx.font = `900 ${size * 0.34}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("1", c, c + size * 0.02);
    star(ctx, c, c - size * 0.24, size * 0.04, size * 0.018, 5);
    star(ctx, c, c + size * 0.25, size * 0.04, size * 0.018, 5);
  }
  return texture(el);
}

function star(ctx, x, y, outer, inner, points) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

// Reeded edge: fine vertical ridges around the rim of the coin.
export function coinEdgeBump() {
  const [el, ctx] = canvas(64, 8);
  for (let x = 0; x < 64; x++) {
    const v = 128 + 110 * Math.sin((x / 64) * Math.PI * 2 * 4);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(x, 0, 1, 8);
  }
  return texture(el, { repeat: [12, 1] });
}

// Fine horizontal streaks for brushed metal, used as a roughness map.
export function brushedMetal() {
  const [el, ctx] = canvas(512, 64);
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, 512, 64);
  for (let i = 0; i < 1400; i++) {
    const v = 105 + Math.random() * 50;
    ctx.fillStyle = `rgba(${v},${v},${v},0.35)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 64, 40 + Math.random() * 200, 1);
  }
  return texture(el, { repeat: [4, 1] });
}

// Soft round glow used for bokeh, halos and sparkles.
export function glowSprite() {
  const [el, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(el, { srgb: true });
}

// Bokeh disc with a slightly brighter edge, like an out-of-focus light.
export function bokehSprite() {
  const [el, ctx] = canvas(128);
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 60);
  g.addColorStop(0, "rgba(255,255,255,0.35)");
  g.addColorStop(0.8, "rgba(255,255,255,0.5)");
  g.addColorStop(0.92, "rgba(255,255,255,0.7)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  return texture(el, { srgb: true });
}

// The neon sign on the back wall. Drawn once; bloom does the glowing.
export function signTexture() {
  const [el, ctx] = canvas(1024, 256);
  ctx.fillStyle = "#12050f";
  ctx.fillRect(0, 0, 1024, 256);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = '900 128px "Orbitron", sans-serif';
  ctx.lineJoin = "round";
  ctx.shadowColor = "#ff3fb4";
  ctx.shadowBlur = 30;
  ctx.strokeStyle = "#ff5fc4";
  ctx.lineWidth = 10;
  ctx.strokeText("COIN PUSHER", 512, 118);
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffe9f6";
  ctx.fillText("COIN PUSHER", 512, 118);
  ctx.font = '700 34px "Rajdhani", sans-serif';
  ctx.fillStyle = "#ffcf5a";
  ctx.fillText("★  PUSH  ·  WIN  ·  REPEAT  ★", 512, 212);
  return texture(el, { srgb: true });
}

// Dim arcade-room backdrop: a warm floor glow fading up into darkness.
export function roomBackdrop() {
  const [el, ctx] = canvas(16, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0, "#07040c");
  g.addColorStop(0.55, "#140a18");
  g.addColorStop(1, "#2a1310");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 16, 512);
  return texture(el, { srgb: true });
}
