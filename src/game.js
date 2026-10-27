import RAPIER from "@dimforge/rapier3d-compat";

// All sizes are in game units: a coin is 1.2 units across.
export const COIN_RADIUS = 0.6;
export const COIN_HALF_HEIGHT = 0.08;

export const BOARD = {
  halfWidth: 4,
  frontZ: 3,
  backZ: -9,
  wallHeight: 6,
  // Coins that fall off the front edge within this distance of the centre are won;
  // the rest drop into the side gutters and are lost, like a real machine.
  winHalfWidth: 2.8,
};

export const PUSHER = {
  height: 1,
  depth: 6,
  // The pusher's front face sweeps between these two z positions.
  minFrontZ: -2.5,
  maxFrontZ: 0,
  period: 4,
};

// The fixed wall above the pusher that scrapes coins off its top as it pulls back.
export const BACK_WALL = { frontZ: -4, thickness: 0.5, gap: 0.03 };

export const DROP = {
  y: 4,
  z: -3.3,
  minX: -BOARD.halfWidth + COIN_RADIUS + 0.1,
  maxX: BOARD.halfWidth - COIN_RADIUS - 0.1,
  cooldown: 0.2,
};

// Everything that can sit on the board. Coins are the normal currency; prize coins and
// gems turn up now and then and pay out more when they're pushed off.
export const KINDS = {
  coin: { value: 1 },
  prize: { value: 5, radius: 0.85, halfHeight: 0.11 },
  gem: { value: 10 },
};

// Points of the gem's convex hull: a flat table on top, a hexagonal girdle and a pointed base.
export const GEM_POINTS = (() => {
  const points = [];
  const ring = (radius, y, offset = 0) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + offset;
      points.push(Math.cos(a) * radius, y, Math.sin(a) * radius);
    }
  };
  ring(0.32, 0.28);
  ring(0.55, 0.08, Math.PI / 6);
  points.push(0, -0.36, 0);
  return new Float32Array(points);
})();

const TIMESTEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 6;
const FALL_LIMIT_Y = -3;
const START_BANK = 50;
const PREFILL_COINS = 70;
// Keeps the physics cheap: no more drops once this many pieces are on the board.
export const MAX_PIECES = 260;
const BONUS_CHANCE = 0.03;
const LAND_SPEED = 2.5;

export async function createGame() {
  await RAPIER.init();
  const game = new Game();
  game.prefill(PREFILL_COINS);
  return game;
}

class Game {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.world.timestep = TIMESTEP;
    this.pieces = [];
    this.time = 0;
    this.accumulator = 0;
    this.lastDropAt = -Infinity;
    this.bank = START_BANK;
    this.won = 0;
    this.listeners = new Set();

    this.buildBoard();
  }

  buildBoard() {
    const { halfWidth, frontZ, backZ, wallHeight } = BOARD;
    const length = frontZ - backZ;
    const fixed = (hx, hy, hz, x, y, z) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(0.5),
      );

    // Floor, top surface at y = 0.
    fixed(halfWidth, 0.5, length / 2, 0, -0.5, backZ + length / 2);
    // Side walls.
    for (const side of [-1, 1]) {
      fixed(0.25, wallHeight / 2, length / 2, side * (halfWidth + 0.25), wallHeight / 2, backZ + length / 2);
    }
    // Back wall above the pusher, leaving a gap too thin for a coin.
    const wallBottom = PUSHER.height + BACK_WALL.gap;
    const wallHalfHeight = (wallHeight - wallBottom) / 2;
    fixed(
      halfWidth,
      wallHalfHeight,
      BACK_WALL.thickness / 2,
      0,
      wallBottom + wallHalfHeight,
      BACK_WALL.frontZ - BACK_WALL.thickness / 2,
    );

    const pusherBody = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(0, PUSHER.height / 2 + 0.005, this.pusherCenterZ(0)),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfWidth - 0.02, PUSHER.height / 2, PUSHER.depth / 2).setFriction(0.5),
      pusherBody,
    );
    this.pusher = pusherBody;
  }

  pusherFrontZ(t) {
    const mid = (PUSHER.minFrontZ + PUSHER.maxFrontZ) / 2;
    const amplitude = (PUSHER.maxFrontZ - PUSHER.minFrontZ) / 2;
    return mid + amplitude * Math.sin((2 * Math.PI * t) / PUSHER.period);
  }

  pusherCenterZ(t) {
    return this.pusherFrontZ(t) - PUSHER.depth / 2;
  }

  // How fast the pusher is moving right now, from 0 (turning round) to 1 (full speed).
  pusherSpeed() {
    return Math.abs(Math.cos((2 * Math.PI * this.time) / PUSHER.period));
  }

  spawn(kind, x, y, z, tilt = 0.3) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(randomTilt(tilt))
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    this.world.createCollider(colliderFor(kind).setFriction(0.4).setRestitution(0.15).setDensity(1), body);
    const piece = { kind, value: KINDS[kind].value, body, prevVy: 0, lastLandAt: -Infinity };
    this.pieces.push(piece);
    return piece;
  }

  // Lay coins flat in loose layers and let them settle, so the game starts with a full, stable playfield.
  prefill(count) {
    const spacing = COIN_RADIUS * 2 + 0.05;
    const columns = Math.floor((DROP.maxX - DROP.minX) / spacing) + 1;
    const minZ = BACK_WALL.frontZ + COIN_RADIUS + 0.1;
    const maxZ = BOARD.frontZ - COIN_RADIUS - 0.4;
    const rows = Math.floor((maxZ - minZ) / spacing) + 1;
    for (let i = 0; i < count; i++) {
      const layer = Math.floor(i / (columns * rows));
      const offset = (layer % 2) * spacing * 0.5;
      const x = Math.min(DROP.maxX, DROP.minX + (i % columns) * spacing + offset);
      const z = Math.min(maxZ, minZ + (Math.floor(i / columns) % rows) * spacing + offset);
      const jitter = () => (Math.random() - 0.5) * 0.15;
      this.spawn("coin", x + jitter(), 1.3 + layer * 0.4, z + jitter(), 0.05);
    }
    // One prize coin on the board from the start, so there's something to aim for.
    this.spawn("prize", (Math.random() - 0.5) * 3, 2.5, 0.3, 0.05);
    this.simulate(4, { scoring: false });
    // Anything that fell off while settling doesn't count.
    this.removeFallenPieces(() => {});
  }

  canDrop() {
    return this.bank > 0 && this.pieces.length < MAX_PIECES && this.time - this.lastDropAt >= DROP.cooldown;
  }

  drop(x) {
    if (!this.canDrop()) return false;
    const clampedX = clampDropX(x);
    this.bank -= 1;
    this.lastDropAt = this.time;
    this.spawn("coin", clampedX, DROP.y, DROP.z);
    this.emit({ type: "drop", x: clampedX });
    if (Math.random() < BONUS_CHANCE) this.spawnBonus();
    return true;
  }

  spawnBonus(kind = Math.random() < 0.4 ? "gem" : "prize") {
    const x = DROP.minX + Math.random() * (DROP.maxX - DROP.minX);
    this.spawn(kind, x, DROP.y + 1.5, DROP.z, 0.6);
    this.emit({ type: "bonus", kind, x });
  }

  refill(amount = 20) {
    this.bank += amount;
    this.emit({ type: "bank" });
  }

  // Where a coin dropped at this x would first land, for the aim guide.
  landingHeight(x) {
    const ray = new RAPIER.Ray({ x: clampDropX(x), y: DROP.y, z: DROP.z }, { x: 0, y: -1, z: 0 });
    const hit = this.world.castRay(ray, DROP.y + 1, true);
    return hit ? DROP.y - hit.timeOfImpact : PUSHER.height;
  }

  update(dt) {
    this.accumulator = Math.min(this.accumulator + dt, TIMESTEP * MAX_STEPS_PER_FRAME);
    while (this.accumulator >= TIMESTEP) {
      this.step();
      this.accumulator -= TIMESTEP;
    }
  }

  simulate(seconds, { scoring = true } = {}) {
    const steps = Math.round(seconds / TIMESTEP);
    for (let i = 0; i < steps; i++) this.step({ scoring });
  }

  step({ scoring = true } = {}) {
    this.time += TIMESTEP;
    const p = this.pusher.translation();
    this.pusher.setNextKinematicTranslation({ x: p.x, y: p.y, z: this.pusherCenterZ(this.time) });
    this.world.step();
    if (!scoring) return;
    this.detectLandings();
    this.removeFallenPieces((piece, pos) => {
      if (pos.z > BOARD.frontZ && Math.abs(pos.x) < BOARD.winHalfWidth) {
        this.bank += piece.value;
        this.won += piece.value;
        this.emit({ type: "win", kind: piece.kind, value: piece.value, x: pos.x, z: pos.z });
      } else {
        this.emit({ type: "lost", kind: piece.kind, x: pos.x, z: pos.z });
      }
    });
  }

  // A piece has landed when its fall is stopped sharply. Used for clinks and sparkles.
  detectLandings() {
    let events = 0;
    for (const piece of this.pieces) {
      const { body } = piece;
      if (body.isSleeping()) {
        piece.prevVy = 0;
        continue;
      }
      const vy = body.linvel().y;
      const impact = -piece.prevVy;
      if (impact > LAND_SPEED && vy - piece.prevVy > LAND_SPEED * 0.8 && this.time - piece.lastLandAt > 0.12) {
        piece.lastLandAt = this.time;
        if (events++ < 4) {
          const pos = body.translation();
          this.emit({ type: "land", kind: piece.kind, speed: impact, x: pos.x, y: pos.y, z: pos.z });
        }
      }
      piece.prevVy = vy;
    }
  }

  removeFallenPieces(onRemove) {
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const piece = this.pieces[i];
      const pos = piece.body.translation();
      if (pos.y < FALL_LIMIT_Y) {
        onRemove(piece, pos);
        this.world.removeRigidBody(piece.body);
        this.pieces.splice(i, 1);
      }
    }
  }

  on(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  emit(event) {
    for (const listener of this.listeners) listener(event);
  }
}

function colliderFor(kind) {
  if (kind === "gem") return RAPIER.ColliderDesc.convexHull(GEM_POINTS);
  if (kind === "prize") return RAPIER.ColliderDesc.cylinder(KINDS.prize.halfHeight, KINDS.prize.radius);
  return RAPIER.ColliderDesc.cylinder(COIN_HALF_HEIGHT, COIN_RADIUS);
}

function clampDropX(x) {
  return Math.min(DROP.maxX, Math.max(DROP.minX, x));
}

function randomTilt(amount) {
  const ax = (Math.random() - 0.5) * amount;
  const az = (Math.random() - 0.5) * amount;
  const ay = Math.random() * Math.PI * 2;
  // Euler (XYZ) to quaternion.
  const [cx, sx] = [Math.cos(ax / 2), Math.sin(ax / 2)];
  const [cy, sy] = [Math.cos(ay / 2), Math.sin(ay / 2)];
  const [cz, sz] = [Math.cos(az / 2), Math.sin(az / 2)];
  return {
    x: sx * cy * cz + cx * sy * sz,
    y: cx * sy * cz - sx * cy * sz,
    z: cx * cy * sz + sx * sy * cz,
    w: cx * cy * cz - sx * sy * sz,
  };
}
