# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running

```bash
# from the project root
python3 -m http.server 8000
# → http://localhost:8000/web3d/
```

The build **must** be served over HTTP — `web3d/index.html` uses an ES module importmap to pull Three.js 0.160 from `unpkg.com` at runtime. Opening via `file://` will fail. No build step, no `node_modules`, no test suite, no lint config.

## Architecture

Single implementation, all in `web3d/game.js` (~905 lines). Three.js scene with chase camera, UnrealBloomPass, and a Recognizer drifting overhead.

Game engine invariants:

- **Grid-based movement**: one cell per tick (80–110 ms). Position is integer grid coords; visual position lerps between ticks so motion is smooth regardless of tick rate.
- **Collision check** per tick: walls (out of bounds), trail cells (own or opponent), and simultaneous same-cell entry (both heads moving into the same empty cell) — all three end the round. Same-cell entry specifically kills both cycles at the shared cell so they never render as two stacked meshes in one tile. The arena boundary is rendered as a tall translucent red glass wall with a yellow/black diagonal hazard band at the base and red warning rails — the tall red wall + hazard stripe make the boundary unmistakable.
- **TIE is head-on only**: `TIE ROUND` fires only when both heads step into the same cell on the same tick and neither had already crashed into a wall or trail. That's a true head-on; both meshes die at the shared cell so nothing stacks. Any other simultaneous crash (player hits AI trail while AI independently hits player trail, wall + trail combo, etc.) resolves with AI taking the round — the player's visible mistake always scores as a loss, never a tie.
- **Crash visual**: on crash, `finalizeSegment` extends the crashing cycle's trail ribbon all the way to the crash cell so the impact point is visible, then the cycle's mesh is positioned at the crash cell's world position (clamped to `±HALF` so wall crashes render at the boundary rather than past it), hidden, and `spawnExplosion` fires a particle burst + additive flash + expanding shockwave ring at that spot. `updateExplosions` ticks the active list every frame.
- **Crash cause**: `tick()` records `cyc.crashCause` as one of `wall`, `own`, `opp` for each crashed cycle, and the end-of-round message surfaces it ("Hit the wall" / "Hit own trail" / "Hit opponent trail") so the player can tell at a glance why the round ended.
- **Crash → message delay**: crashes enter a `crashing` phase that holds the HUD end-of-round panel for ~900 ms so the explosion is visible (the panel background is ~85% opaque and otherwise covers the FX). Input is ignored during `crashing`; the phase advances to `round_over` or `match_over` when the delay elapses.
- **180° reversal is blocked** — inputs that would turn a cycle directly back into its own trail are ignored.
- **Flood-fill AI** with depth cap ~25 cells: from each legal candidate move, flood reachable open cells and pick the move preserving the most room; tiebreak toward going straight. The cap keeps it short-sighted (beatable by a human).
- **Match length**: first-to-3.

### Things to preserve when editing

- **Relative steering**: `←`/`→` rotate the cycle 90° from its current heading (not absolute directions). `↑`/`↓` are swallowed only to prevent page scroll.
- **Light walls are ribbon segments**, not per-cell instances — one stretched box per straight run, finalized on each turn. Preserve this to keep draw count low and corners seamless.
- **Bloom is tuned low-strength / high-threshold** so only the brightest accents glow; raising strength blows out the whole scene.
- Chase cam lerps position and look target every frame; cycle rotation interpolates on turns. Tick rate and frame rate are decoupled.
- Recognizer respawns on the opposite side with randomized z / speed / direction on exit.

## Deployment

Static hosting. Copy `web3d/` contents to `/<webroot>/tron3d/`. No build step.

When making a change to `game.js` or `style.css`, bump the `?v=` query string in `index.html` so browsers don't serve a cached asset after redeploy (`index.html` itself is served with `Cache-Control: no-store` via meta tags, so it will always re-fetch and pick up the new query).
