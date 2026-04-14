# Tron 3D

A browser-based 3D Tron light-cycle duel built with Three.js, featuring neon bloom, a chase camera, and a Recognizer cameo drifting across the Grid.

## Live game

https://ai.tchung.org/tron3d/

## Running Locally

The build is fully static, but **must** be served over HTTP — `web3d/index.html` uses an ES module importmap to load Three.js 0.160 from `unpkg.com`, and browsers block module imports over `file://`.

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000/web3d/
```

No build step, no `node_modules`.

## Controls

| Action | Keys |
| --- | --- |
| Turn left / right (relative to cycle) | `←` `→` |
| Start round / pause / resume / next round / new match | `Space` |
| Reset match | `Esc` |

Steering is **relative** — `←`/`→` rotate the cycle 90° from its current heading, matching chase-cam driving games. `↑`/`↓` are swallowed only to prevent page scroll. Touch swipes work too (horizontal swipe = left/right turn).

## Gameplay

- Grid-based: each cycle moves exactly one cell per tick.
- 180° reversals are blocked — you can't turn back into your own trail.
- Rounds end when a cycle's head lands on a wall, a trail cell (own or opponent), or the same empty cell the opponent is also moving into that tick; the end-of-round message shows what was hit ("Hit the wall" / "Hit own trail" / "Hit opponent trail"). Simultaneous same-cell entry kills both cycles at the shared cell so they never render as two stacked meshes.
- TIE ROUND only happens on a strict head-on ram: both heads stepping into the same cell on the same tick AND moving in exactly opposite directions (i.e. charging at each other on the same axis). Perpendicular same-cell convergence or any other simultaneous crash resolves as AI takes the round.
- Player is **yellow**, AI is **red**.
- AI uses a short-horizon flood-fill (25 cells) plus a small straight-line bias — deterministic and deliberate, but short-sighted enough to be outplanned by a human.
- First to 3 rounds wins the match.

## Rendering notes

- Shader grid floor with minor + major cyan lines, soft vignette, `FogExp2` horizon haze.
- Arena boundary is visualized as a tall translucent red glass wall with a yellow/black diagonal hazard stripe along the base and red warning rails — the edge reads as an unmistakable "do not cross" warning.
- Light walls rendered as continuous ribbon segments (one stretched box per straight run, finalized at each turn) rather than per-cell instances — seamless corners, cheap draw count.
- Cycles are classic 1982 Tron-style: solid colour bulbous shell, chunky rounded wheels with dark hubs, tinted canopy dome with a sloped windshield.
- UnrealBloomPass + ACES tone mapping for the neon glow, tuned low-strength / high-threshold so only the brightest accents bloom.
- Chase camera smoothly lerps position and look target; cycle rotation smoothly interpolates on turns; visual position lerps between ticks so motion is silky regardless of tick rate.
- Recognizer drifts across the sky above the arena with a pulsing beacon and under-belly light; respawns on the opposite side with randomized z / speed / direction when it exits.
- Crashes spawn a particle burst, additive flash sphere, and expanding ground shockwave ring at the impact cell, tinted to the cycle's colour.
- Wireframe skyline megastructures sit beyond the arena boundary; a starfield dome above sells the nighttime Grid look.

## Project layout

```
.
└── web3d/
    ├── index.html       # 3D scene shell (importmap -> three.js CDN)
    ├── style.css        # HUD / menu overlay
    ├── game.js          # Three.js scene, chase cam, bloom, Recognizer
    └── sound.wav        # looping engine drone
```

## Deployment

Any static host. Copy the contents of `web3d/` to `/<webroot>/tron3d/` behind your HTTP server. No build step required.
