import RAPIER from "@dimforge/rapier3d-compat";

// All sizes are in game units: a coin is 0.9 units across.
export const COIN_RADIUS = 0.45;
export const COIN_HALF_HEIGHT = 0.06;

// The machine has two tiers. Coins come in through slots at the top, bounce down a plinko
// peg board onto the upper tier, get pushed off its edge onto the lower tier, and are won
// when the lower pusher shoves them off the front.
export const BOARD = {
  halfWidth: 4,
  frontZ: 3,
  backZ: -10,
  wallHeight: 10.8,
  // Coins that fall off the front edge within this distance of the centre are won;
  // the rest drop into the side gutters and are lost, like a real machine.
  winHalfWidth: 2.8,
};

// A fixed shelf at the back of the lower tier. Its top is the upper tier's playfield, and its
// front face scrapes coins off the lower pusher as it pulls back.
export const SHELF = { topY: 2.6, frontZ: -4, gap: 0.03 };

export const PUSHERS = [
  // Lower tier: slides under the shelf.
  { height: 1, depth: 6, baseY: 0, minFrontZ: -2.5, maxFrontZ: 0, period: 4, phase: 0 },
  // Upper tier: rides on the shelf, out of step with the lower one.
  // It pulls all the way back under its wall, so nothing can stay sitting on top of it. The lip
  // overhangs its front edge near the top, so it catches coins standing on edge high up and
  // tips them over instead of shoving them along upright.
  { height: 0.8, depth: 5, baseY: SHELF.topY, minFrontZ: -8.45, maxFrontZ: -5.5, period: 5, phase: Math.PI, lip: 0.4 },
];

// The wall above the upper pusher that scrapes coins off it as it pulls back.
export const UPPER_WALL = { frontZ: -8, thickness: 0.5, bottomY: SHELF.topY + PUSHERS[1].height + 0.03 };

// A vertical peg board the coins fall through edge-on, between a back plate and front glass.
export const PLINKO = {
  z: -6.4,
  halfGap: 0.1,
  bottomY: 4.5,
  topY: 10.35,
  pegRadius: 0.09,
  // Pegs must sit far enough apart, across and diagonally, for a coin to pass between them.
  // Listed from the top. The first row sits well below the slots so coins fall freely first.
  rows: [8.4, 7.55, 6.7, 5.85, 5.0],
  pegSpacing: 1.6,
  slots: [-3.2, -1.6, 0, 1.6, 3.2],
  slotY: 9.8,
};

export const DROP = { cooldown: 0.25 };

// Everything that can sit on the board. Coins are the normal currency; prize coins and
// gems turn up now and then and pay out more when they're pushed off.
export const KINDS = {
  coin: { value: 1 },
  prize: { value: 5, radius: 0.64, halfHeight: 0.083 },
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
  ring(0.24, 0.21);
  ring(0.41, 0.06, Math.PI / 6);
  points.push(0, -0.27, 0);
  return new Float32Array(points);
})();

// Peg positions, row by row. Rows alternate between three pegs (under the middle slots) and
// four (between the slots), so a coin can't fall straight through. The three-peg rows have a
// slanted deflector at each wall instead of an outer peg, so coins can't get wedged against
// the glass.
export const PEGS = PLINKO.rows.flatMap((y, row) =>
  (row % 2 === 0 ? [-2, 0, 2] : [-3, -1, 1, 3]).map((x) => ({ x: (x * PLINKO.pegSpacing) / 2, y })),
);
export const DEFLECTORS = PLINKO.rows
  .filter((_, row) => row % 2 === 0)
  .flatMap((y) => [-1, 1].map((side) => ({ side, x: side * (BOARD.halfWidth - 0.3), y })));

const TIMESTEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 6;
const FALL_LIMIT_Y = -3;
const START_BANK = 50;
// Keeps the physics cheap: no more drops once this many pieces are on the board.
export const MAX_PIECES = 320;
const BONUS_CHANCE = 0.03;
const LAND_SPEED = 2.5;
const PEG_HIT_SPEED = 1.5;
// Collision groups, as (membership << 16) | filter. Coins inside the peg board don't collide with
// each other, so a quick run of drops can't stack up and jam between the pegs; they still hit
// the pegs, walls and everything else.
const COIN_GROUP = 0x0001;
const BOARD_COIN_GROUP = 0x0002;
const NORMAL_GROUPS = (COIN_GROUP << 16) | 0xffff;
const IN_BOARD_GROUPS = (BOARD_COIN_GROUP << 16) | (0xffff & ~(COIN_GROUP | BOARD_COIN_GROUP));
export const LIP_HALF_THICKNESS = 0.05;

export async function createGame() {
  await RAPIER.init();
  const game = new Game();
  game.prefill();
  return game;
}

class Game {
  constructor() {
    this.world = new RAPIER.World({ x: 0, y: -30, z: 0 });
    this.world.timestep = TIMESTEP;
    this.eventQueue = new RAPIER.EventQueue(true);
    this.pieces = [];
    this.time = 0;
    this.accumulator = 0;
    this.lastDropAt = -Infinity;
    this.bank = START_BANK;
    this.won = 0;
    this.listeners = new Set();
    this.pegHandles = new Set();

    this.buildBoard();
  }

  buildBoard() {
    const { halfWidth, frontZ, backZ, wallHeight } = BOARD;
    const length = frontZ - backZ;
    const fixed = (hx, hy, hz, x, y, z, friction = 0.5) =>
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(hx, hy, hz).setTranslation(x, y, z).setFriction(friction),
      );

    // Lower playfield, top surface at y = 0.
    fixed(halfWidth, 0.5, length / 2, 0, -0.5, backZ + length / 2);
    // Side walls, tall enough to enclose the peg board.
    for (const side of [-1, 1]) {
      fixed(0.25, wallHeight / 2, length / 2, side * (halfWidth + 0.25), wallHeight / 2, backZ + length / 2, 0.2);
    }

    // The shelf: from just above the lower pusher up to the upper playfield.
    const shelfBottom = PUSHERS[0].height + SHELF.gap;
    const shelfDepth = SHELF.frontZ - backZ;
    fixed(
      halfWidth,
      (SHELF.topY - shelfBottom) / 2,
      shelfDepth / 2,
      0,
      (shelfBottom + SHELF.topY) / 2,
      backZ + shelfDepth / 2,
    );

    // Upper scraper wall, from just above the upper pusher to the top of the cabinet.
    const wallHalf = (wallHeight - UPPER_WALL.bottomY) / 2;
    fixed(halfWidth, wallHalf, UPPER_WALL.thickness / 2, 0, UPPER_WALL.bottomY + wallHalf, UPPER_WALL.frontZ - UPPER_WALL.thickness / 2);

    // Peg board: back plate, front glass, a lid over the slots, and the pegs themselves.
    const boardHalfHeight = (PLINKO.topY - PLINKO.bottomY) / 2;
    const boardMidY = PLINKO.bottomY + boardHalfHeight;
    for (const side of [-1, 1]) {
      fixed(halfWidth, boardHalfHeight, 0.05, 0, boardMidY, PLINKO.z + side * (PLINKO.halfGap + 0.05), 0.05);
    }
    fixed(halfWidth, 0.05, PLINKO.halfGap + 0.1, 0, PLINKO.topY + 0.05, PLINKO.z);
    for (const deflector of DEFLECTORS) {
      // Tilted 45° so its top slopes down towards the middle of the board.
      const angle = (deflector.side * Math.PI) / 4;
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(0.5, 0.06, PLINKO.halfGap + 0.05)
          .setTranslation(deflector.x, deflector.y, PLINKO.z)
          .setRotation({ x: 0, y: 0, z: Math.sin(angle / 2), w: Math.cos(angle / 2) })
          .setFriction(0.05),
      );
    }
    const pegRotation = { x: Math.SQRT1_2, y: 0, z: 0, w: Math.SQRT1_2 };
    for (const peg of PEGS) {
      const collider = this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(PLINKO.halfGap + 0.05, PLINKO.pegRadius)
          .setTranslation(peg.x, peg.y, PLINKO.z)
          .setRotation(pegRotation)
          .setRestitution(0.45)
          .setFriction(0.1)
          .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      );
      this.pegHandles.add(collider.handle);
    }

    this.pushers = PUSHERS.map((config) => {
      const body = this.world.createRigidBody(
        RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(
          0,
          config.baseY + config.height / 2 + 0.005,
          this.pusherCenterZ(config, 0),
        ),
      );
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfWidth - 0.02, config.height / 2, config.depth / 2).setFriction(0.5),
        body,
      );
      if (config.lip) {
        this.world.createCollider(
          RAPIER.ColliderDesc.cuboid(halfWidth - 0.02, LIP_HALF_THICKNESS, config.lip / 2)
            .setTranslation(0, config.height / 2 - LIP_HALF_THICKNESS, config.depth / 2 + config.lip / 2)
            .setFriction(0.3),
          body,
        );
      }
      return { config, body };
    });
  }

  pusherFrontZ(config, t) {
    const mid = (config.minFrontZ + config.maxFrontZ) / 2;
    const amplitude = (config.maxFrontZ - config.minFrontZ) / 2;
    return mid + amplitude * Math.sin((2 * Math.PI * t) / config.period + config.phase);
  }

  pusherCenterZ(config, t) {
    return this.pusherFrontZ(config, t) - config.depth / 2;
  }

  // How fast the lower pusher is moving right now, from 0 (turning round) to 1 (full speed).
  pusherSpeed() {
    return Math.abs(Math.cos((2 * Math.PI * this.time) / PUSHERS[0].period));
  }

  spawn(kind, x, y, z, { tilt = 0.3, rotation } = {}) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(rotation ?? randomTilt(tilt))
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      colliderFor(kind).setFriction(0.4).setRestitution(0.15).setDensity(1).setCollisionGroups(NORMAL_GROUPS),
      body,
    );
    const piece = { kind, value: KINDS[kind].value, body, collider, prevVy: 0, lastLandAt: -Infinity, inBoard: false };
    this.pieces.push(piece);
    return piece;
  }

  // Lay coins flat over both tiers and let them settle, so the game starts with a full,
  // stable playfield.
  prefill() {
    const spacing = COIN_RADIUS * 2 + 0.05;
    const minX = -BOARD.halfWidth + COIN_RADIUS + 0.1;
    const columns = Math.floor((2 * -minX) / spacing) + 1;
    const lay = (minZ, maxZ, y, layers = 1) => {
      const rows = Math.floor((maxZ - minZ) / spacing) + 1;
      for (let layer = 0; layer < layers; layer++) {
        const offset = (layer % 2) * spacing * 0.5;
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < columns - layer; c++) {
            const jitter = () => (Math.random() - 0.5) * 0.15;
            const x = minX + c * spacing + offset + jitter();
            const z = Math.min(maxZ, minZ + r * spacing + offset) + jitter();
            this.spawn("coin", x, y + layer * 0.4, z, { tilt: 0.05 });
          }
        }
      }
    };
    // Lower tier: in front of the shelf, two layers deep.
    lay(SHELF.frontZ + COIN_RADIUS + 0.1, BOARD.frontZ - COIN_RADIUS - 0.4, 1.3, 2);
    // Upper tier: on the upper pusher, and between its furthest reach and the shelf edge.
    lay(UPPER_WALL.frontZ + COIN_RADIUS + 0.1, PUSHERS[1].minFrontZ - COIN_RADIUS, SHELF.topY + PUSHERS[1].height + 0.3);
    lay(PUSHERS[1].maxFrontZ + COIN_RADIUS + 0.05, SHELF.frontZ - COIN_RADIUS - 0.2, SHELF.topY + 0.3);
    // One prize coin on the lower tier from the start, so there's something to aim for.
    this.spawn("prize", (Math.random() - 0.5) * 3, 2.5, 0.3, { tilt: 0.05 });
    this.simulate(4, { scoring: false });
    // Anything that fell off while settling doesn't count.
    this.removeFallenPieces(() => {});
  }

  canDrop() {
    return this.bank > 0 && this.pieces.length < MAX_PIECES && this.time - this.lastDropAt >= DROP.cooldown;
  }

  // The slot nearest to a point across the machine.
  nearestSlot(x) {
    let best = 0;
    PLINKO.slots.forEach((slotX, i) => {
      if (Math.abs(slotX - x) < Math.abs(PLINKO.slots[best] - x)) best = i;
    });
    return best;
  }

  drop(slot) {
    if (!this.canDrop()) return false;
    // A little sideways jitter so coins never balance on the peg right under the slot.
    const x = PLINKO.slots[slot] + (Math.random() < 0.5 ? -1 : 1) * (0.06 + Math.random() * 0.1);
    this.bank -= 1;
    this.lastDropAt = this.time;
    // Stand the coin on its edge (axis along z) so it fits between the peg board's back plate
    // and glass, at a random angle within that plane.
    const half = Math.random() * Math.PI;
    const [c, s] = [Math.cos(half), Math.sin(half)];
    const rotation = { x: Math.SQRT1_2 * c, y: Math.SQRT1_2 * s, z: Math.SQRT1_2 * s, w: Math.SQRT1_2 * c };
    // Coins in the board can overlap, so stagger their depth slightly to keep them from flickering.
    const z = PLINKO.z + (Math.random() - 0.5) * 0.06;
    const piece = this.spawn("coin", x, PLINKO.slotY, z, { rotation });
    piece.inBoard = true;
    piece.collider.setCollisionGroups(IN_BOARD_GROUPS);
    this.emit({ type: "drop", slot, x });
    if (Math.random() < BONUS_CHANCE) this.spawnBonus();
    return true;
  }

  // Bonus pieces are too big for the peg board, so they drop straight onto the upper tier.
  spawnBonus(kind = Math.random() < 0.4 ? "gem" : "prize") {
    const x = (Math.random() - 0.5) * 5;
    const y = PLINKO.bottomY + 1.5;
    const z = SHELF.frontZ - 1;
    this.spawn(kind, x, y, z, { tilt: 0.6 });
    this.emit({ type: "bonus", kind, x, y, z });
  }

  refill(amount = 20) {
    this.bank += amount;
    this.emit({ type: "bank" });
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
    for (const { config, body } of this.pushers) {
      const p = body.translation();
      body.setNextKinematicTranslation({ x: p.x, y: p.y, z: this.pusherCenterZ(config, this.time) });
    }
    this.world.step(this.eventQueue);
    if (!scoring) {
      this.eventQueue.drainCollisionEvents(() => {});
      return;
    }
    this.detectPegHits();
    this.unstickCoins();
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

  // A ping each time a coin strikes a peg on the way down.
  detectPegHits() {
    this.eventQueue.drainCollisionEvents((handle1, handle2, started) => {
      if (!started) return;
      const peg = this.pegHandles.has(handle1) ? handle1 : this.pegHandles.has(handle2) ? handle2 : null;
      if (peg === null) return;
      const coin = this.world.getCollider(peg === handle1 ? handle2 : handle1)?.parent();
      if (!coin) return;
      const v = coin.linvel();
      const speed = Math.hypot(v.x, v.y);
      if (speed < PEG_HIT_SPEED) return;
      const pos = this.world.getCollider(peg).translation();
      this.emit({ type: "peg", speed, x: pos.x, y: pos.y, z: pos.z });
    });
  }

  // Coins in the peg board pass through each other. Once a coin has dropped clear of the board
  // it collides with other coins again. One that comes to rest on a peg gets a sideways nudge.
  unstickCoins() {
    for (const piece of this.pieces) {
      if (!piece.inBoard) continue;
      const pos = piece.body.translation();
      if (pos.y < PLINKO.bottomY - COIN_RADIUS - 0.05) {
        piece.inBoard = false;
        piece.collider.setCollisionGroups(NORMAL_GROUPS);
        continue;
      }
      const v = piece.body.linvel();
      piece.stillFor = Math.hypot(v.x, v.y) < 0.3 ? (piece.stillFor ?? 0) + TIMESTEP : 0;
      if (piece.stillFor > 0.5) {
        const side = Math.abs(pos.x) < 0.05 ? (Math.random() < 0.5 ? -1 : 1) : -Math.sign(pos.x);
        piece.body.setLinvel({ x: side * 2, y: 1, z: 0 }, true);
        piece.stillFor = 0;
      }
    }
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
        const pos = body.translation();
        // Bounces inside the peg board are reported as peg hits instead.
        if (pos.y < PLINKO.bottomY && events++ < 4) {
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
