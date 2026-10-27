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
  winHalfWidth: 3,
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

const TIMESTEP = 1 / 120;
const MAX_STEPS_PER_FRAME = 6;
const FALL_LIMIT_Y = -3;
const START_BANK = 50;
const PREFILL_COINS = 70;

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
    this.coins = [];
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

  spawnCoin(x, y, z, tilt = 0.3) {
    const q = randomTilt(tilt);
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y, z)
        .setRotation(q)
        .setLinearDamping(0.05)
        .setAngularDamping(0.8)
        .setCcdEnabled(true),
    );
    this.world.createCollider(
      RAPIER.ColliderDesc.cylinder(COIN_HALF_HEIGHT, COIN_RADIUS).setFriction(0.4).setRestitution(0.05).setDensity(1),
      body,
    );
    this.coins.push(body);
    return body;
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
      this.spawnCoin(x + jitter(), 1.3 + layer * 0.4, z + jitter(), 0.05);
    }
    this.simulate(4, { scoring: false });
    // Anything that fell off while settling doesn't count.
    this.removeFallenCoins(() => {});
  }

  canDrop() {
    return this.bank > 0 && this.time - this.lastDropAt >= DROP.cooldown;
  }

  drop(x) {
    if (!this.canDrop()) return false;
    const clampedX = Math.min(DROP.maxX, Math.max(DROP.minX, x));
    this.bank -= 1;
    this.lastDropAt = this.time;
    this.spawnCoin(clampedX, DROP.y, DROP.z);
    this.emit({ type: "drop" });
    return true;
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
    const p = this.pusher.translation();
    this.pusher.setNextKinematicTranslation({ x: p.x, y: p.y, z: this.pusherCenterZ(this.time) });
    this.world.step();
    if (scoring) {
      this.removeFallenCoins((coin) => {
        if (coin.z > BOARD.frontZ && Math.abs(coin.x) < BOARD.winHalfWidth) {
          this.bank += 1;
          this.won += 1;
          this.emit({ type: "win" });
        } else {
          this.emit({ type: "lost" });
        }
      });
    }
  }

  removeFallenCoins(onRemove) {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const body = this.coins[i];
      const pos = body.translation();
      if (pos.y < FALL_LIMIT_Y) {
        onRemove(pos);
        this.world.removeRigidBody(body);
        this.coins.splice(i, 1);
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
