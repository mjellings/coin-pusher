# Coin Pusher

A 3D coin pusher game that runs in the browser, built with [Three.js](https://threejs.org/) for rendering and [Rapier](https://rapier.rs/) for physics.

## How to play

Move the mouse (or your finger) to aim, then click or tap to drop a coin onto the pusher. The glowing beam and ring show where it will land. Coins pushed off the front edge into the gold tray are won and go back into your stack. Coins that fall into the dark side gutters are lost.

Now and then a bonus drops in: a prize coin worth 5 or a gem worth 10.

The buttons in the top right mute the sound and switch graphics quality between High and Low. Low turns off post-processing (bloom, ambient occlusion, vignette) and lowers shadow and pixel resolution, for phones and slower laptops. Phones start on Low, and High drops to Low on its own if it can't keep a smooth frame rate.

## Running locally

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once to turn this on.

## Code layout

- `src/game.js`: the physics world, the board, the pusher, coins, bonus pieces and scoring. No rendering. It emits events (`drop`, `land`, `win`, `lost`, `bonus`) that the rest of the game reacts to.
- `src/main.js`: wires everything together: input, the game loop, and turning game events into sound, particles and popups.
- `src/render/scene.js`: renderer, camera framing, lights, the reflection environment and the arcade-room backdrop.
- `src/render/cabinet.js`: the cabinet, glass, rails, sign, marquee bulbs and LED strips.
- `src/render/pieces.js`: instanced coins, prize coins and gems, plus the aim guide.
- `src/render/effects.js`: particles and camera shake.
- `src/render/post.js`: post-processing and the quality setting.
- `src/render/textures.js`: canvas-drawn textures (coin faces, reeded edges, brushed metal, the sign).
- `src/audio.js`: all sounds, synthesised with Web Audio.
- `src/hud.js`: counters, popups, buttons and saved settings.
