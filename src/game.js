import RAPIER from "@dimforge/rapier3d-compat";
import { ITEMS, DUPLICATE_VALUE, SET_SHOWER, randomItem, isSetComplete, completedSets } from "./collection.js";
import {
  BONUS,
  SHOWER_BONUS,
  BAG_BONUS,
  PAIR_BONUS,
  PRIZE_BONUS,
  JACKPOT_SHOWER,
  GUARDS_SECONDS,
  QUICK_REFILL_MS,
} from "./bonuses.js";

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
  wallHeight: 14.2,
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
  // Upper tier: rides on the shelf. It keeps time with the lower pusher, so the coins it shoves
  // off the shelf land while the lower pusher is fully out.
  // It pulls all the way back under its wall, so nothing can stay sitting on top of it. The lip
  // overhangs its front edge near the top, so it catches coins standing on edge high up and
  // tips them over instead of shoving them along upright.
  { height: 0.8, depth: 5, baseY: SHELF.topY, minFrontZ: -8.45, maxFrontZ: -5.5, period: 4, phase: 0, lip: 0.4 },
];

// A clear scraper blade hanging over the lower pusher, in front of the shelf. Its bottom edge
// clears one flat coin on the pusher top, so as the pusher carries coins forward, any riding on
// top of others are held back and knocked off. Prize coins and collectables are as thin as
// coins so they fit under it too. It sits ahead of the pusher's rearmost reach, so the coins it
// holds back get shoved off the pusher's front edge by the shelf as the pusher pulls back,
// instead of piling up behind it.
export const SCRAPER = { z: -1.5, thickness: 0.08, clearance: 0.17, topY: 2 };

// The wall above the upper pusher that scrapes coins off it as it pulls back.
export const UPPER_WALL = { frontZ: -8, thickness: 0.5, bottomY: SHELF.topY + PUSHERS[1].height + 0.03 };

// A vertical peg board the coins fall through edge-on, between a back plate and front glass.
export const PLINKO = {
  z: -6.4,
  halfGap: 0.1,
  bottomY: 4.5,
  topY: 13.75,
  pegRadius: 0.09,
  // Pegs must sit far enough apart, across and diagonally, for a coin to pass between them.
  // Listed from the top. The first row sits well below the slots so coins fall freely first.
  rows: [11.8, 10.95, 10.1, 9.25, 8.4, 7.55, 6.7, 5.85, 5.0],
  pegSpacing: 1.6,
  slots: [-3.2, -1.6, 0, 1.6, 3.2],
  slotY: 13.2,
};

// The bonus gate slides back and forth along the bottom of the peg board. Its cup is wide enough
// for a coin; one that drops out of the board mostly inside it is caught and earns a credit for
// the slot machine. After a catch the gate shuts for a few seconds, so firing coins as fast as
// possible doesn't farm credits.
export const GATE = { halfWidth: 0.55, catchHalfWidth: 0.35, range: 3, period: 4, cooldown: 3 };

// The front face of the peg board's glass, plus room for a tumbling coin.
const PLINKO_FRONT_Z = PLINKO.z + PLINKO.halfGap + 0.1 + COIN_RADIUS + 0.1;

export const DROP = { cooldown: 0.25 };

// Everything that can sit on the board. Coins are the normal currency; prize coins and
// gems turn up now and then and pay out more when they're pushed off.
export const KINDS = {
  coin: { value: 1 },
  prize: { value: 5, radius: 0.64, halfHeight: COIN_HALF_HEIGHT },
  gem: { value: 10 },
  // Collectables pay nothing themselves; they go in the Collection Book.
  collectable: { value: 0, radius: 0.55, halfHeight: COIN_HALF_HEIGHT },
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
const COLLECTABLE_CHANCE = 0.025;
// Free coins: while the bank is below the cap, a top-up arrives every so often, even while the
// game is closed. Each finished set in the Collection Book makes the top-up bigger.
export const REFILL = { everyMs: 2 * 60 * 1000, amount: 10, cap: 30, perSet: 5 };
const SHOWER_INTERVAL = 0.05;
const LAND_SPEED = 2.5;
const PEG_HIT_SPEED = 1.5;
// Coins, prize coins and collectables standing on edge (tilted more than about 60°) for this long
// get tipped over flat, falling away from the player where they can, as coins on a real machine
// nearly always lie flat.
const UPRIGHT = { cos: 0.5, after: 0.1, retry: 0.3, spin: 12 };
// Collision groups, as (membership << 16) | filter. Coins inside the peg board don't collide with
// each other, so a quick run of drops can't stack up and jam between the pegs; they still hit
// the pegs, walls and everything else.
const COIN_GROUP = 0x0001;
const BOARD_COIN_GROUP = 0x0002;
const NORMAL_GROUPS = (COIN_GROUP << 16) | 0xffff;
// Gems are too tall to fit under the scraper over the lower pusher, so they pass through it.
const GEM_GROUP = 0x0004;
const GEM_GROUPS = (GEM_GROUP << 16) | 0xffff;
const SCRAPER_GROUPS = (0xffff << 16) | (0xffff & ~GEM_GROUP);
const IN_BOARD_GROUPS = (BOARD_COIN_GROUP << 16) | (0xffff & ~(COIN_GROUP | BOARD_COIN_GROUP));
export const LIP_HALF_THICKNESS = 0.05;

// Starts from a saved game when there is one, otherwise from a freshly filled board.
export async function createGame(save) {
  await RAPIER.init();
  const game = new Game();
  if (!save || !game.restore(save)) game.prefill();
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
    this.collection = {};
    this.refillAt = null;
    this.showerLeft = 0;
    this.nextShowerAt = 0;
    this.credits = 0;
    this.gateOpenAt = 0;
    this.guardsLeft = 0;
    this.quickRefillsUntil = 0;
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

    // Slippery facings on the shelf front and the scraper blade over the lower pusher, so coins
    // dragged back against them by the pusher slide down flat instead of being propped up on edge.
    const slippery = (hx, hy, hz, x, y, z) => {
      const collider = fixed(hx, hy, hz, x, y, z, 0);
      collider.setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min);
      return collider;
    };
    slippery(halfWidth, (SHELF.topY - shelfBottom) / 2, 0.01, 0, (shelfBottom + SHELF.topY) / 2, SHELF.frontZ + 0.01);
    const scraperBottom = PUSHERS[0].height + SCRAPER.clearance;
    const scraperHalf = (SCRAPER.topY - scraperBottom) / 2;
    slippery(halfWidth, scraperHalf, SCRAPER.thickness / 2, 0, scraperBottom + scraperHalf, SCRAPER.z).setCollisionGroups(
      SCRAPER_GROUPS,
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
      // A slippery facing on the front, so a coin pushed up against it slides back down flat
      // instead of being held up on its edge.
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfWidth - 0.02, config.height / 2 - 0.01, 0.01)
          .setTranslation(0, 0, config.depth / 2)
          .setFriction(0)
          .setFrictionCombineRule(RAPIER.CoefficientCombineRule.Min),
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

  spawn(kind, x, y, z, { tilt = 0.3, rotation, item } = {}) {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(rotation ?? randomTilt(tilt))
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    const collider = this.world.createCollider(
      colliderFor(kind).setFriction(0.4).setRestitution(0.15).setDensity(1).setCollisionGroups(kind === "gem" ? GEM_GROUPS : NORMAL_GROUPS),
      body,
    );
    const piece = { kind, value: KINDS[kind].value, body, collider, prevVy: 0, lastLandAt: -Infinity, inBoard: false, item };
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
    // And a collectable, so the Collection Book shows up early.
    this.spawn("collectable", (Math.random() - 0.5) * 3, 2.5, -1.8, { tilt: 0.05, item: randomItem(this.collection) });
    this.simulate(4, { scoring: false });
    // Anything that fell off while settling doesn't count.
    this.removeFallenPieces(() => {});
  }

  // Everything needed to put the machine back as it was: the scores, where the pushers are in
  // their stroke, and every piece on the board, rounded to keep the save small.
  snapshot() {
    const round = (n) => Math.round(n * 1000) / 1000;
    const vec = (v, keys = "xyz") => [...keys].map((k) => round(v[k]));
    return {
      bank: this.bank,
      won: this.won,
      time: round(this.time),
      collection: this.collection,
      refillAt: this.refillAt,
      showerLeft: this.showerLeft,
      credits: this.credits,
      guardsLeft: round(this.guardsLeft),
      quickRefillsUntil: this.quickRefillsUntil,
      pieces: this.pieces.map(({ kind, body, inBoard, item }) => ({
        kind,
        ...(item && { item }),
        p: vec(body.translation()),
        r: vec(body.rotation(), "xyzw"),
        v: vec(body.linvel()),
        w: vec(body.angvel()),
        ...(inBoard && { inBoard: true }),
      })),
    };
  }

  restore(save) {
    const valid = (a, n) => Array.isArray(a) && a.length === n && a.every(Number.isFinite);
    const pieces = Array.isArray(save.pieces) ? save.pieces : [];
    if (!Number.isFinite(save.bank) || !Number.isFinite(save.won)) return false;
    this.bank = save.bank;
    this.won = save.won;
    this.time = Number.isFinite(save.time) ? save.time : 0;
    if (save.collection && typeof save.collection === "object") {
      for (const [id, count] of Object.entries(save.collection)) {
        if (ITEMS[id] && Number.isFinite(count) && count > 0) this.collection[id] = count;
      }
    }
    this.refillAt = Number.isFinite(save.refillAt) ? save.refillAt : null;
    this.showerLeft = Number.isFinite(save.showerLeft) ? save.showerLeft : 0;
    // Older saves kept unused wheel spins; they carry over as credits.
    const credits = save.credits ?? save.spins;
    this.credits = Number.isFinite(credits) ? credits : 0;
    this.guardsLeft = Number.isFinite(save.guardsLeft) ? save.guardsLeft : 0;
    this.quickRefillsUntil = Number.isFinite(save.quickRefillsUntil) ? save.quickRefillsUntil : 0;
    for (const { config, body } of this.pushers) {
      const p = body.translation();
      body.setTranslation({ x: p.x, y: p.y, z: this.pusherCenterZ(config, this.time) }, true);
    }
    for (const saved of pieces.slice(0, MAX_PIECES)) {
      if (!KINDS[saved.kind] || !valid(saved.p, 3) || !valid(saved.r, 4)) continue;
      if (saved.kind === "collectable" && !ITEMS[saved.item]) continue;
      const [x, y, z] = saved.p;
      // Older versions could pour shower coins into the peg board itself, where they wedged
      // between its plates. Pour those again instead.
      if (!saved.inBoard && saved.kind === "coin" && y > PLINKO.bottomY && Math.abs(z - PLINKO.z) < PLINKO.halfGap + 0.5) {
        this.showerLeft++;
        continue;
      }
      const [rx, ry, rz, rw] = saved.r;
      const piece = this.spawn(saved.kind, x, y, z, { rotation: { x: rx, y: ry, z: rz, w: rw }, item: saved.item });
      if (valid(saved.v, 3)) piece.body.setLinvel({ x: saved.v[0], y: saved.v[1], z: saved.v[2] }, true);
      if (valid(saved.w, 3)) piece.body.setAngvel({ x: saved.w[0], y: saved.w[1], z: saved.w[2] }, true);
      if (saved.inBoard) {
        piece.inBoard = true;
        piece.collider.setCollisionGroups(IN_BOARD_GROUPS);
      }
    }
    return true;
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
    else if (Math.random() < COLLECTABLE_CHANCE) this.spawnCollectable();
    return true;
  }

  // Bonus pieces are too big for the peg board, so they drop straight onto the upper tier.
  spawnBonus(kind = Math.random() < 0.4 ? "gem" : "prize", { quiet = false } = {}) {
    const x = (Math.random() - 0.5) * 5;
    const y = PLINKO.bottomY + 1.5;
    const z = SHELF.frontZ - 1;
    this.spawn(kind, x, y, z, { tilt: 0.6 });
    if (!quiet) this.emit({ type: "bonus", kind, x, y, z });
  }

  spawnCollectable(item = randomItem(this.collection), { quiet = false } = {}) {
    const x = (Math.random() - 0.5) * 5;
    const y = PLINKO.bottomY + 1.5;
    const z = SHELF.frontZ - 1;
    this.spawn("collectable", x, y, z, { tilt: 0.6, item });
    if (!quiet) this.emit({ type: "bonus", kind: "collectable", item, x, y, z });
  }

  // Where the bonus gate is right now, across the machine.
  gateX(t = this.time) {
    return GATE.range * Math.sin((2 * Math.PI * t) / GATE.period);
  }

  get gateOpen() {
    return this.time >= this.gateOpenAt;
  }

  get guardsUp() {
    return this.guardsLeft > 0;
  }

  quickRefills(now = Date.now()) {
    return now < this.quickRefillsUntil;
  }

  // Uses up a slot machine credit and pays out what the reels landed on (nothing for a loss).
  spendCredit(id, now = Date.now()) {
    if (this.credits <= 0) return;
    this.credits--;
    if (BONUS[id]) this.award(id, now);
  }

  award(id, now = Date.now()) {
    switch (id) {
      case "pair":
        this.bank += PAIR_BONUS;
        this.won += PAIR_BONUS;
        break;
      case "shower":
        this.showerLeft += SHOWER_BONUS;
        break;
      case "bag":
        this.bank += BAG_BONUS;
        this.won += BAG_BONUS;
        break;
      case "prizes":
        for (let i = 0; i < PRIZE_BONUS; i++) this.spawnBonus("prize", { quiet: true });
        break;
      case "collectable":
        this.spawnCollectable(undefined, { quiet: true });
        break;
      case "guards":
        // Winning a timed bonus again restarts its timer rather than adding to it.
        this.guardsLeft = GUARDS_SECONDS;
        break;
      case "refills":
        this.quickRefillsUntil = now + QUICK_REFILL_MS;
        // Bring the next top-up forward to match the faster rate.
        if (this.refillAt !== null) this.refillAt = Math.min(this.refillAt, now + this.refillInterval(now));
        break;
      case "jackpot": {
        this.showerLeft += JACKPOT_SHOWER;
        this.spawnBonus("gem", { quiet: true });
        const missing = Object.keys(ITEMS).filter((item) => !this.collection[item]);
        const item = missing.length ? missing[Math.floor(Math.random() * missing.length)] : randomItem(this.collection);
        this.spawnCollectable(item, { quiet: true });
        break;
      }
    }
    this.emit({ type: "award", id });
  }

  // A collectable pushed off the front goes in the book. One you already have pays coins instead.
  collect(item, pos) {
    const isNew = !this.collection[item];
    this.collection[item] = (this.collection[item] ?? 0) + 1;
    const value = isNew ? 0 : DUPLICATE_VALUE;
    this.bank += value;
    this.won += value;
    this.emit({ type: "collect", item, isNew, value, x: pos.x, z: pos.z });
    const set = ITEMS[item].set;
    if (isNew && isSetComplete(set, this.collection)) {
      this.showerLeft += SET_SHOWER;
      this.emit({ type: "set", set });
    }
  }

  // Coins rain onto the upper tier one after another, so they don't all land in a heap.
  pourShower() {
    if (this.showerLeft <= 0 || this.time < this.nextShowerAt || this.pieces.length >= MAX_PIECES) return;
    this.nextShowerAt = this.time + SHOWER_INTERVAL;
    this.showerLeft--;
    const x = (Math.random() - 0.5) * 6;
    // They start just below the bottom of the peg board, so keep them clear of its glass.
    const z = SHELF.frontZ - 0.4 - Math.random() * (SHELF.frontZ - 0.4 - PLINKO_FRONT_Z);
    this.spawn("coin", x, PLINKO.bottomY + 0.5, z, { tilt: 1.5 });
  }

  refillAmount() {
    return REFILL.amount + REFILL.perSet * completedSets(this.collection).length;
  }

  refillInterval(now = Date.now()) {
    return this.quickRefills(now) ? REFILL.everyMs / 2 : REFILL.everyMs;
  }

  // Free coins, checked against the real clock so they build up while the game is closed.
  tickRefill(now = Date.now()) {
    if (this.bank >= REFILL.cap) {
      this.refillAt = null;
      return;
    }
    if (this.refillAt === null) this.refillAt = now + this.refillInterval(now);
    let granted = 0;
    while (this.refillAt !== null && now >= this.refillAt) {
      const amount = Math.min(this.refillAmount(), REFILL.cap - this.bank);
      this.bank += amount;
      granted += amount;
      this.refillAt = this.bank >= REFILL.cap ? null : this.refillAt + this.refillInterval(this.refillAt);
    }
    if (granted) this.emit({ type: "refill", amount: granted });
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
    this.tipUprightCoins();
    if (this.guardsLeft > 0) this.guardsLeft = Math.max(0, this.guardsLeft - TIMESTEP);
    this.detectLandings();
    this.pourShower();
    this.removeFallenPieces((piece, pos) => {
      // While the side guards are up, everything pushed off the front is won.
      const won = pos.z > BOARD.frontZ && (Math.abs(pos.x) < BOARD.winHalfWidth || this.guardsUp);
      if (won && piece.kind === "collectable") {
        this.collect(piece.item, pos);
      } else if (won) {
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
  // it collides with other coins again, unless it came out through the bonus gate, which keeps
  // it and earns a slot machine credit. One that comes to rest on a peg gets a sideways nudge.
  unstickCoins() {
    const caught = [];
    for (const piece of this.pieces) {
      if (!piece.inBoard) continue;
      const pos = piece.body.translation();
      if (pos.y < PLINKO.bottomY - COIN_RADIUS - 0.05) {
        piece.inBoard = false;
        piece.collider.setCollisionGroups(NORMAL_GROUPS);
        if (this.gateOpen && caught.length === 0 && Math.abs(pos.x - this.gateX()) < GATE.catchHalfWidth) caught.push(piece);
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
    for (const piece of caught) {
      const pos = piece.body.translation();
      this.removePiece(piece);
      this.credits++;
      this.gateOpenAt = this.time + GATE.cooldown;
      this.emit({ type: "gate", x: pos.x, y: pos.y, z: pos.z });
    }
  }

  removePiece(piece) {
    this.world.removeRigidBody(piece.body);
    this.pieces.splice(this.pieces.indexOf(piece), 1);
  }

  // Coins only stay up on edge by rolling or leaning, so a quick spin about the right axis lays
  // them down. The coin's top edge goes towards the back of the machine, or sideways if its face
  // points across.
  tipUprightCoins() {
    for (const piece of this.pieces) {
      if (piece.inBoard || piece.kind === "gem") continue;
      const { body } = piece;
      if (body.isSleeping()) continue;
      const r = body.rotation();
      // The coin's face normal (its local y axis) in world space.
      const ax = 2 * (r.x * r.y - r.w * r.z);
      const ay = 1 - 2 * (r.x * r.x + r.z * r.z);
      const az = 2 * (r.y * r.z + r.w * r.x);
      if (Math.abs(ay) > UPRIGHT.cos) {
        piece.uprightFor = 0;
        continue;
      }
      piece.uprightFor = (piece.uprightFor ?? 0) + TIMESTEP;
      if (piece.uprightFor < UPRIGHT.after) continue;
      // Give each tip time to work before trying again.
      piece.uprightFor = -UPRIGHT.retry;
      // Tip the top edge along the face normal, whichever way points further back. If that didn't
      // work last time, it's probably leaning on a pusher or wall, so tip it the other way.
      const length = Math.hypot(ax, az) || 1;
      piece.tipForward = piece.tippedAt > this.time - UPRIGHT.retry - 0.5 ? !piece.tipForward : false;
      piece.tippedAt = this.time;
      const sign = (az > 0) !== piece.tipForward ? -1 : 1;
      const [dx, dz] = [(sign * ax) / length, (sign * az) / length];
      // Spinning about up × d swings the top edge towards d.
      const w = body.angvel();
      body.setAngvel({ x: w.x + dz * UPRIGHT.spin, y: w.y, z: w.z - dx * UPRIGHT.spin }, true);
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
  if (kind === "collectable") return RAPIER.ColliderDesc.cylinder(KINDS.collectable.halfHeight, KINDS.collectable.radius);
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
