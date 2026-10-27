# Coin Pusher

A 3D coin pusher game that runs in the browser, built with [Three.js](https://threejs.org/) for rendering and [Rapier](https://rapier.rs/) for physics.

## How to play

Move the mouse (or your finger) to aim, then click or tap to drop a coin onto the pusher. Coins pushed off the front edge into the gold tray are won and go back into your stack. Coins that fall into the dark side gutters are lost.

## Running locally

```sh
npm install
npm run dev
```

Then open the address Vite prints (usually http://localhost:5173).

## Deploying

Every push to `main` builds the game and publishes it to GitHub Pages. In the repository's **Settings → Pages**, set **Source** to **GitHub Actions** once to turn this on.

## Code layout

- `src/game.js`: the physics world, the board, the pusher, coins and scoring. No rendering.
- `src/main.js`: the Three.js scene, camera, input and HUD, drawn from the game state each frame.
