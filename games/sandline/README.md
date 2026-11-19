# Sandline Duel

Portrait 1v1 top-down auto-fire shooter for mobile web. Solo vs bot (Easy, Normal, Hard) or online 1v1 by room code.
Three.js r128, plain classic scripts, no build step, no asset files (all art and audio are procedural).

Parked here on a session branch until it moves to its own repository. It is unrelated to the Atlas pipeline in this repo.

## Run locally
Serve this folder with any static server and open `index.html`. Online play needs the claude.ai artifact `room`
capability, so locally it is hidden unless `tools/fake-room.js` is injected (the browser test does this).

## Layout
- `js/core.js` shared contract: tuning, map, weapons, cosmetics catalog, events, module APIs
- `js/world.js` map logic (collision, line of sight, pathfinding) and map art
- `js/combat.js`, `js/bot.js` rules, dash, bot AI
- `js/view.js` renderer, characters, effects, camera
- `js/audio.js` synthesized sound and music
- `js/net.js` online play over the artifact `room` presence channel (host-authoritative combat)
- `js/profile.js` XP, unlocks, equipped cosmetics (localStorage)
- `js/main.js` state machine, input, HUD and menus

## Tests
- `node tests/world.test.js`, `node tests/sim.test.js [rounds]`, `node tests/net.test.js`, `node tests/audio.smoke.js`
- Browser: `node tools/release.js <this folder> <out dir> solo|online` (Playwright, needs `vendor/three.min.js` r128 locally)
