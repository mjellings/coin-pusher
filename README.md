# Coin Pusher

A 3D coin pusher game that runs in the browser, built with [Three.js](https://threejs.org/) for rendering and [Rapier](https://rapier.rs/) for physics.

## How to play

The machine has two tiers, each with its own moving pusher. Move the mouse (or your finger) to pick one of the five slots at the top, then click or tap to drop a coin. On a keyboard, the arrow keys pick a slot and Space drops.

Each coin bounces down the peg board onto the upper tier. The upper pusher shoves coins off its shelf onto the lower tier, and the lower pusher shoves them off the front. Coins that fall into the gold tray are won and go back into your stack. Coins that fall into the dark side gutters are lost.

Now and then a bonus drops onto the upper tier: a prize coin worth 5 or a gem worth 10.

The button in the top right mutes the sound.

## Running locally

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once to turn this on.

## Code layout

- `src/game.js`: the physics world: both tiers and pushers, the peg board, coins, bonus pieces and scoring. No rendering. It emits events (`drop`, `peg`, `land`, `win`, `lost`, `bonus`) that the rest of the game reacts to.
- `src/main.js`: wires everything together: input, the game loop, and turning game events into sound, particles and popups.
- `src/render/scene.js`: renderer, camera framing, lights, the reflection environment and the arcade-room backdrop.
- `src/render/cabinet.js`: the cabinet, shelf, peg board and slots, glass, rails, sign, marquee bulbs and LED strips.
- `src/render/pieces.js`: instanced coins, prize coins and gems, plus the waiting coin in the chosen slot.
- `src/render/effects.js`: particles and camera shake.
- `src/render/textures.js`: canvas-drawn textures (coin faces, reeded edges, brushed metal, the sign).
- `src/audio.js`: all sounds, synthesised with Web Audio.
- `src/hud.js`: counters, popups, the mute button and saved settings.
