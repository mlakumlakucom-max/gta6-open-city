# gta6-open-city

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/mlakumlakucom-max/gta6-open-city/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/mlakumlakucom-max/gta6-open-city/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Neon Bay — an original open-world crime game that runs in a desktop browser from static files, no network needed. A sun-soaked coastal city to explore on foot and by car: steal a car, outrun the police, and run missions for Rae. Every street, car, character, name and story is original — nothing from any commercial game.

## Play

```sh
node serve.ts
```

Then open http://localhost:8080.

- **W A S D** — move · **Mouse drag** — look around · **Shift** — run
- **E** — steal / enter a car, **E** again to get out
- **W / S** — drive & brake · **A / D** — steer · **Esc** — pause
- First mission: steal a car and deliver it to the green beacon at the garage on Palm Row.

The game is Three.js (vendored under `game/vendor/`), split into one-job modules under `game/src/`: `world.js` (the city), `vehicles.js` (traffic and driving), `pedestrians.js`, `police.js` (wanted level and chases), `missions.js`, `hud.js` (including the minimap), `audio.js` (synthesised sound), `input.js`, `config.js` and `main.js`. Progress (cash and completed missions) saves to `localStorage`.

Referral code: mlakumlakucom-max
