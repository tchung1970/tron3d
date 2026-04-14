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
- **Collision check** per tick: walls, own trail, opponent trail, head-on crash.
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
