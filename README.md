# Tron Light Cycles

Three flavors of the classic Tron light-cycle duel — a desktop Python build, a 2D browser port, and a 3D browser port with a cameo from the Recognizer.

| Version | Stack | Entry point |
| --- | --- | --- |
| Desktop 2D | Python + Pygame | [`tron.py`](tron.py) |
| Web 2D | HTML + Canvas 2D | [`web/`](web/) |
| Web 3D | HTML + Three.js + Bloom | [`web3d/`](web3d/) |

All three share the same engine design: grid-based movement, flood-fill AI, and a first-to-N match structure (Python/Web 2D: first to 5, Web 3D: first to 3).

## Project layout

```
.
├── tron.py              # desktop pygame version (fullscreen, neon)
├── requirements.txt     # pygame
├── yellow.png           # human cycle sprite
├── purple.png           # AI cycle sprite
├── sound.wav            # engine loop
├── web/
│   ├── index.html       # 2D canvas shell
│   ├── style.css
│   └── game.js          # grid engine + flood-fill AI + neon rendering
└── web3d/
    ├── index.html       # 3D scene shell (importmap -> three.js CDN)
    ├── style.css        # HUD / menu overlay
    └── game.js          # Three.js scene, chase cam, bloom, Recognizer
```

## Controls

### Desktop 2D / Web 2D

| Action | Keys |
| --- | --- |
| Move | Arrow keys or `W` `A` `S` `D` |
| Start / next round | `Enter` or `Space` |
| Pause | `P` |
| Quit / reset match | `Q` or `Esc` |

### Web 3D

| Action | Keys |
| --- | --- |
| Turn left / right (relative to cycle) | `←` `→` |
| Start round / pause / resume / next round / new match | `Space` |
| Reset match | `Esc` (or `Q`) |

The 3D build uses **relative steering** — `←`/`→` rotate the cycle 90° from its current heading, matching how chase-cam driving games feel. `↑`/`↓` are ignored (only swallowed to prevent page scroll).

Web versions also accept touch swipes (horizontal swipe = left/right turn in 3D).

## Running

### Desktop (Python + Pygame)

```bash
pip install -r requirements.txt
python3 tron.py
```

Launches fullscreen on the primary display. The grid auto-sizes to the native resolution.

### Web 2D / Web 3D

Both are fully static. Serve the directory with any HTTP server:

```bash
# from the project root
python3 -m http.server 8000
# then open http://localhost:8000/web/ or http://localhost:8000/web3d/
```

Opening `index.html` directly via `file://` works for the 2D version but **will break the 3D version** — browsers block ES module imports and CDN importmaps over `file://`. Use a local server.

The 3D version loads Three.js 0.160 from `unpkg.com` at runtime (no build step, no `node_modules`).

## Gameplay notes

- Grid-based: each cycle moves exactly one cell per tick (80–110 ms depending on version).
- 180° reversals are blocked — you can't turn back into your own trail.
- Collisions check walls, both trails, and head-on crashes.
- **AI**: flood-fills the reachable space from each candidate move and picks the move that preserves the most room, breaking ties in favor of going straight. Not unbeatable, but it won't suicide into walls.
- First to N rounds wins the match (Python/Web 2D: 5, Web 3D: 3).

## Web 3D specifics

- Shader grid floor with minor + major cyan lines, soft vignette, `FogExp2` horizon haze.
- Light walls rendered as continuous ribbon segments (one stretched box per straight run, finalized at each turn) rather than per-cell instances — seamless corners, cheap draw count.
- Cycles are classic 1982 Tron-style: solid colour bulbous shell, chunky rounded wheels with dark hubs, tinted canopy dome with a sloped windshield (rider enclosed, not visible externally).
- Player is **yellow**, AI is **red**.
- AI uses a short-horizon flood-fill (25 cells) plus a small straight-line bias — deterministic and deliberate, but short-sighted enough to be outplanned by a human.
- UnrealBloomPass + ACES tone mapping for the neon glow, tuned low-strength / high-threshold so only the brightest accents bloom.
- Chase camera smoothly lerps position and look target; cycle rotation smoothly interpolates on turns; visual position lerps between ticks so motion is silky regardless of tick rate.
- Recognizer drifts across the sky above the arena with a pulsing beacon and under-belly light; respawns on the opposite side with randomized z / speed / direction when it exits.
- Wireframe skyline megastructures sit beyond the arena boundary; a starfield dome above sells the nighttime Grid look.

## Deployment

Any static host works. The included 3D build is currently hosted at `/tron3d/` behind nginx:

```nginx
server {
    listen 443 ssl http2;
    server_name your.domain;
    root /var/www/html;
    # /tron/ and /tron3d/ are served as-is
}
```

Copy the contents of `web/` to `/<webroot>/tron/` and `web3d/` to `/<webroot>/tron3d/`. No build step required.

## Assets

- `yellow.png`, `purple.png` — cycle sprites (used by the desktop and web 2D versions)
- `sound.wav` — looping engine drone

## License

Personal project. Tron is a trademark of The Walt Disney Company; this is fan code, not affiliated with Disney.
