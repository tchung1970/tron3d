(() => {
  'use strict';

  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const cycleSound = document.getElementById('cycleSound');
  cycleSound.volume = 0.35;

  const MOVE_MS = 80;
  const WIN_SCORE = 5;

  const COLORS = {
    yellow: '#ffd640',
    yellowRGB: '255, 214, 64',
    yellowCore: '#fff3a8',
    yellowDark: 'rgba(120, 90, 0, 0.85)',
    purple: '#c250ff',
    purpleRGB: '194, 80, 255',
    purpleCore: '#f0c6ff',
    purpleDark: 'rgba(70, 20, 110, 0.85)',
    bgTop: '#06081a',
    bgBottom: '#0e1434',
    gridMinor: 'rgba(60, 72, 120, 0.28)',
    gridMajor: 'rgba(100, 120, 190, 0.38)',
    white: '#ffffff',
    dim: '#98a2c0',
    accent: '#6fdcff',
    panelBg: 'rgba(10, 14, 28, 0.78)',
    panelBorder: 'rgba(111, 220, 255, 0.7)',
  };

  const UP = [0, -1], DOWN = [0, 1], LEFT = [-1, 0], RIGHT = [1, 0];
  const dkey = (d) => `${d[0]},${d[1]}`;
  const OPPOSITE = new Map([
    [dkey(UP), DOWN], [dkey(DOWN), UP], [dkey(LEFT), RIGHT], [dkey(RIGHT), LEFT],
  ]);
  const eq = (a, b) => a[0] === b[0] && a[1] === b[1];

  const playerImg = new Image(); playerImg.src = 'yellow.png';
  const aiImg = new Image(); aiImg.src = 'purple.png';
  const assetsReady = Promise.all([playerImg, aiImg].map(img => new Promise(res => {
    if (img.complete) return res();
    img.onload = res;
    img.onerror = res;
  })));

  let DPR = 1, WINDOW_W = 0, WINDOW_H = 0, GRID_W = 0, GRID_H = 0, cellPx = 24;
  let bgCanvas = null;
  let playerTrailCanvas = null, aiTrailCanvas = null;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    cellPx = Math.max(16, Math.min(38, Math.floor(Math.min(w, h * 1.6) / 50)));
    GRID_W = Math.floor(w / cellPx);
    GRID_H = Math.floor(h / cellPx);
    WINDOW_W = GRID_W * cellPx;
    WINDOW_H = GRID_H * cellPx;
    canvas.width = Math.floor(WINDOW_W * DPR);
    canvas.height = Math.floor(WINDOW_H * DPR);
    canvas.style.width = WINDOW_W + 'px';
    canvas.style.height = WINDOW_H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    cacheBackground();
    resetTrailCanvases();
    if (player) redrawAllTrails();
  }

  function cacheBackground() {
    bgCanvas = document.createElement('canvas');
    bgCanvas.width = WINDOW_W;
    bgCanvas.height = WINDOW_H;
    const b = bgCanvas.getContext('2d');
    const grad = b.createLinearGradient(0, 0, 0, WINDOW_H);
    grad.addColorStop(0, COLORS.bgTop);
    grad.addColorStop(1, COLORS.bgBottom);
    b.fillStyle = grad;
    b.fillRect(0, 0, WINDOW_W, WINDOW_H);
    b.strokeStyle = COLORS.gridMinor;
    b.lineWidth = 1;
    b.beginPath();
    for (let x = 0; x <= WINDOW_W; x += cellPx) { b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, WINDOW_H); }
    for (let y = 0; y <= WINDOW_H; y += cellPx) { b.moveTo(0, y + 0.5); b.lineTo(WINDOW_W, y + 0.5); }
    b.stroke();
    b.strokeStyle = COLORS.gridMajor;
    b.beginPath();
    for (let x = 0; x <= WINDOW_W; x += cellPx * 5) { b.moveTo(x + 0.5, 0); b.lineTo(x + 0.5, WINDOW_H); }
    for (let y = 0; y <= WINDOW_H; y += cellPx * 5) { b.moveTo(0, y + 0.5); b.lineTo(WINDOW_W, y + 0.5); }
    b.stroke();
    const rg = b.createRadialGradient(
      WINDOW_W / 2, WINDOW_H / 2, Math.min(WINDOW_W, WINDOW_H) * 0.25,
      WINDOW_W / 2, WINDOW_H / 2, Math.max(WINDOW_W, WINDOW_H) * 0.75
    );
    rg.addColorStop(0, 'rgba(0,0,0,0)');
    rg.addColorStop(1, 'rgba(0,0,0,0.6)');
    b.fillStyle = rg;
    b.fillRect(0, 0, WINDOW_W, WINDOW_H);
  }

  function resetTrailCanvases() {
    playerTrailCanvas = document.createElement('canvas');
    playerTrailCanvas.width = WINDOW_W; playerTrailCanvas.height = WINDOW_H;
    aiTrailCanvas = document.createElement('canvas');
    aiTrailCanvas.width = WINDOW_W; aiTrailCanvas.height = WINDOW_H;
  }

  function paintTrailCell(tctx, cx, cy, which) {
    const x = cx * cellPx, y = cy * cellPx;
    const outer = which === 'yellow' ? COLORS.yellowDark : COLORS.purpleDark;
    const inner = which === 'yellow' ? COLORS.yellow : COLORS.purple;
    const core = which === 'yellow' ? COLORS.yellowCore : COLORS.purpleCore;
    const r = Math.max(2, cellPx * 0.22);
    roundRect(tctx, x, y, cellPx, cellPx, r);
    tctx.fillStyle = outer; tctx.fill();
    const inset = Math.max(2, cellPx * 0.18);
    roundRect(tctx, x + inset, y + inset, cellPx - 2 * inset, cellPx - 2 * inset, r * 0.7);
    tctx.fillStyle = inner; tctx.fill();
    const cSize = Math.max(3, cellPx * 0.32);
    roundRect(tctx, x + (cellPx - cSize) / 2, y + (cellPx - cSize) / 2, cSize, cSize, cSize * 0.3);
    tctx.fillStyle = core; tctx.fill();
  }

  function roundRect(c, x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + rr, y);
    c.arcTo(x + w, y, x + w, y + h, rr);
    c.arcTo(x + w, y + h, x, y + h, rr);
    c.arcTo(x, y + h, x, y, rr);
    c.arcTo(x, y, x + w, y, rr);
    c.closePath();
  }

  function redrawAllTrails() {
    const pc = playerTrailCanvas.getContext('2d');
    const ac = aiTrailCanvas.getContext('2d');
    pc.clearRect(0, 0, WINDOW_W, WINDOW_H);
    ac.clearRect(0, 0, WINDOW_W, WINDOW_H);
    for (const [x, y] of player.trailList) paintTrailCell(pc, x, y, 'yellow');
    for (const [x, y] of ai.trailList) paintTrailCell(ac, x, y, 'purple');
  }

  // --- game state ---
  let player = null, ai = null;
  let score = { player: 0, ai: 0 };
  let phase = 'ready';
  let roundWinner = null;
  let paused = false;
  let tickAccum = 0, crashFlash = 0, timeMs = 0;

  function newCycle(x, y, dir, which) {
    return {
      head: [x, y],
      trail: new Set([`${x},${y}`]),
      trailList: [[x, y]],
      dir, nextDir: dir, which,
    };
  }

  function resetRound() {
    player = newCycle(Math.floor(GRID_W * 3 / 4), Math.floor(GRID_H / 2), LEFT, 'yellow');
    ai = newCycle(Math.floor(GRID_W / 4), Math.floor(GRID_H / 2), RIGHT, 'purple');
    tickAccum = 0;
    phase = 'ready';
    roundWinner = null;
    paused = false;
    crashFlash = 0;
    stopSound();
    resetTrailCanvases();
    const pc = playerTrailCanvas.getContext('2d');
    const ac = aiTrailCanvas.getContext('2d');
    paintTrailCell(pc, player.head[0], player.head[1], 'yellow');
    paintTrailCell(ac, ai.head[0], ai.head[1], 'purple');
  }

  function resetMatch() {
    score = { player: 0, ai: 0 };
    resetRound();
  }

  const inBounds = ([x, y]) => x >= 0 && x < GRID_W && y >= 0 && y < GRID_H;
  const step = ([x, y], [dx, dy]) => [x + dx, y + dy];
  const ckey = (x, y) => `${x},${y}`;

  function floodFill(start, blocked, limit = 600) {
    if (!inBounds(start)) return 0;
    const sk = ckey(start[0], start[1]);
    if (blocked.has(sk)) return 0;
    const seen = new Set([sk]);
    const queue = [start];
    let head = 0;
    while (head < queue.length && seen.size < limit) {
      const c = queue[head++];
      for (const d of [UP, DOWN, LEFT, RIGHT]) {
        const n = step(c, d);
        if (!inBounds(n)) continue;
        const nk = ckey(n[0], n[1]);
        if (seen.has(nk) || blocked.has(nk)) continue;
        seen.add(nk);
        queue.push(n);
      }
    }
    return seen.size;
  }

  function aiChoose() {
    const cur = ai.dir;
    const candidates = [cur];
    if (eq(cur, LEFT) || eq(cur, RIGHT)) candidates.push(UP, DOWN);
    else candidates.push(LEFT, RIGHT);
    const blocked = new Set();
    for (const k of player.trail) blocked.add(k);
    for (const k of ai.trail) blocked.add(k);
    let bestDir = cur, bestScore = -1;
    for (const d of candidates) {
      const n = step(ai.head, d);
      if (!inBounds(n)) continue;
      const nk = ckey(n[0], n[1]);
      if (blocked.has(nk)) continue;
      let val = floodFill(n, blocked);
      if (eq(d, cur)) val += 1;
      if (val > bestScore) { bestScore = val; bestDir = d; }
    }
    ai.nextDir = bestDir;
  }

  function setNextDir(cycle, d) {
    const opp = OPPOSITE.get(dkey(cycle.dir));
    if (!eq(d, opp)) cycle.nextDir = d;
  }

  function tickGame() {
    aiChoose();
    player.dir = player.nextDir;
    ai.dir = ai.nextDir;
    const pNew = step(player.head, player.dir);
    const aNew = step(ai.head, ai.dir);
    const pk = ckey(pNew[0], pNew[1]);
    const ak = ckey(aNew[0], aNew[1]);
    let pCrash = !inBounds(pNew) || player.trail.has(pk) || ai.trail.has(pk);
    let aCrash = !inBounds(aNew) || player.trail.has(ak) || ai.trail.has(ak);
    if (eq(pNew, aNew)) { pCrash = true; aCrash = true; }
    if (!pCrash) {
      player.head = pNew;
      player.trail.add(pk);
      player.trailList.push(pNew);
      paintTrailCell(playerTrailCanvas.getContext('2d'), pNew[0], pNew[1], 'yellow');
    }
    if (!aCrash) {
      ai.head = aNew;
      ai.trail.add(ak);
      ai.trailList.push(aNew);
      paintTrailCell(aiTrailCanvas.getContext('2d'), aNew[0], aNew[1], 'purple');
    }
    return [pCrash, aCrash];
  }

  // --- sound ---
  function startSound() {
    cycleSound.play().catch(() => {});
  }
  function stopSound() {
    cycleSound.pause();
    try { cycleSound.currentTime = 0; } catch (_) {}
  }

  // --- rendering ---
  function drawHead(cycle, pulse) {
    const [hx, hy] = cycle.head;
    const cx = hx * cellPx + cellPx / 2;
    const cy = hy * cellPx + cellPx / 2;
    const rgb = cycle.which === 'yellow' ? COLORS.yellowRGB : COLORS.purpleRGB;
    const r = cellPx * (2.2 + pulse * 0.5);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, `rgba(${rgb}, 0.65)`);
    g.addColorStop(0.45, `rgba(${rgb}, 0.22)`);
    g.addColorStop(1, `rgba(${rgb}, 0)`);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    const img = cycle.which === 'yellow' ? playerImg : aiImg;
    if (img.complete && img.naturalWidth > 0) {
      ctx.drawImage(img, hx * cellPx, hy * cellPx, cellPx, cellPx);
    } else {
      paintTrailCell(ctx, hx, hy, cycle.which);
    }
  }

  function panel(x, y, w, h, radius) {
    const r = radius !== undefined ? radius : Math.min(w, h) / 2;
    roundRect(ctx, x, y, w, h, r);
    ctx.fillStyle = COLORS.panelBg;
    ctx.fill();
    ctx.strokeStyle = COLORS.panelBorder;
    ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, r);
    ctx.stroke();
  }

  function drawHUD() {
    const pad = 10;
    const text = `HUMAN  ${score.player}   :   ${score.ai}  AI`;
    const fontSize = Math.max(18, cellPx);
    ctx.font = `bold ${fontSize}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const m = ctx.measureText(text);
    const w = m.width + cellPx * 2;
    const h = fontSize + pad * 2;
    const x = (WINDOW_W - w) / 2;
    const y = pad;
    panel(x, y, w, h, h / 2);
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 12;
    ctx.fillStyle = COLORS.white;
    ctx.fillText(text, WINDOW_W / 2, y + h / 2);
    ctx.restore();

    ctx.font = `${Math.max(12, cellPx * 0.55)}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = COLORS.dim;
    ctx.fillText('ARROWS or WASD move   ·   P pause   ·   Esc to menu', WINDOW_W / 2, WINDOW_H - pad);
  }

  function drawCenterPiece(title, sub, subsub, glow) {
    const w = Math.min(WINDOW_W - cellPx * 4, cellPx * 32);
    const h = cellPx * 8;
    const x = (WINDOW_W - w) / 2;
    const y = (WINDOW_H - h) / 2;
    panel(x, y, w, h, cellPx);
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = glow || COLORS.accent;
    ctx.shadowBlur = 24;
    ctx.fillStyle = COLORS.white;
    ctx.font = `bold ${Math.max(36, cellPx * 2.2)}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.fillText(title, WINDOW_W / 2, y + h * 0.32);
    ctx.shadowBlur = 0;
    if (sub) {
      ctx.font = `${Math.max(20, cellPx)}px -apple-system, "Helvetica Neue", sans-serif`;
      ctx.fillStyle = COLORS.white;
      ctx.fillText(sub, WINDOW_W / 2, y + h * 0.58);
    }
    if (subsub) {
      ctx.font = `${Math.max(14, cellPx * 0.65)}px -apple-system, "Helvetica Neue", sans-serif`;
      ctx.fillStyle = COLORS.dim;
      ctx.fillText(subsub, WINDOW_W / 2, y + h * 0.78);
    }
    ctx.restore();
  }

  function drawLegend(yCenter) {
    const labelX = WINDOW_W / 2 - cellPx * 5;
    ctx.save();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(14, cellPx * 0.6)}px -apple-system, "Helvetica Neue", sans-serif`;
    ctx.fillStyle = COLORS.white;
    if (playerImg.complete && playerImg.naturalWidth > 0) {
      ctx.drawImage(playerImg, labelX, yCenter - cellPx - 4, cellPx, cellPx);
    }
    ctx.fillText('YELLOW  —  YOU', labelX + cellPx + 10, yCenter - cellPx / 2 - 4);
    if (aiImg.complete && aiImg.naturalWidth > 0) {
      ctx.drawImage(aiImg, labelX, yCenter + 4, cellPx, cellPx);
    }
    ctx.fillText('PURPLE  —  AI', labelX + cellPx + 10, yCenter + 4 + cellPx / 2);
    ctx.restore();
  }

  function drawCrashFlash(intensity) {
    if (intensity <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${intensity * 0.85})`;
    ctx.fillRect(0, 0, WINDOW_W, WINDOW_H);
  }

  // --- input ---
  const KEY_DIR = {
    ArrowUp: UP, ArrowDown: DOWN, ArrowLeft: LEFT, ArrowRight: RIGHT,
    w: UP, a: LEFT, s: DOWN, d: RIGHT,
  };

  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === 'Escape' || key === 'q') {
      if (phase === 'playing' || phase === 'round_over' || phase === 'match_over' || paused) {
        resetMatch();
      }
      return;
    }
    if (phase === 'ready' && (key === 'Enter' || key === ' ')) {
      phase = 'playing';
      startSound();
      e.preventDefault();
      return;
    }
    if (phase === 'round_over' && (key === 'Enter' || key === ' ')) {
      resetRound();
      phase = 'playing';
      startSound();
      e.preventDefault();
      return;
    }
    if (phase === 'match_over' && (key === 'Enter' || key === ' ')) {
      resetMatch();
      phase = 'playing';
      startSound();
      e.preventDefault();
      return;
    }
    if (phase === 'playing') {
      if (key === 'p') {
        paused = !paused;
        if (paused) stopSound(); else startSound();
        return;
      }
      if (paused) return;
      if (KEY_DIR[key]) {
        setNextDir(player, KEY_DIR[key]);
        e.preventDefault();
      }
    }
  });

  // touch swipe input
  let touchStart = null;
  canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) {
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }, { passive: true });
  canvas.addEventListener('touchend', (e) => {
    if (!touchStart) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - touchStart.x;
    const dy = t.clientY - touchStart.y;
    const absX = Math.abs(dx), absY = Math.abs(dy);
    if (Math.max(absX, absY) < 20) {
      if (phase === 'ready') { phase = 'playing'; startSound(); }
      else if (phase === 'round_over') { resetRound(); phase = 'playing'; startSound(); }
      else if (phase === 'match_over') { resetMatch(); phase = 'playing'; startSound(); }
      touchStart = null;
      return;
    }
    if (phase === 'playing' && !paused) {
      if (absX > absY) setNextDir(player, dx > 0 ? RIGHT : LEFT);
      else setNextDir(player, dy > 0 ? DOWN : UP);
    }
    touchStart = null;
  }, { passive: true });

  // --- main loop ---
  let lastFrame = performance.now();
  function frame(now) {
    const dt = Math.min(60, now - lastFrame);
    lastFrame = now;
    timeMs += dt;

    if (phase === 'playing' && !paused) {
      tickAccum += dt;
      while (tickAccum >= MOVE_MS) {
        tickAccum -= MOVE_MS;
        const [pC, aC] = tickGame();
        if (pC || aC) {
          if (pC && aC) roundWinner = 'tie';
          else if (pC) { roundWinner = 'ai'; score.ai++; }
          else { roundWinner = 'player'; score.player++; }
          stopSound();
          crashFlash = 1;
          phase = (score.player >= WIN_SCORE || score.ai >= WIN_SCORE) ? 'match_over' : 'round_over';
          break;
        }
      }
    }
    if (crashFlash > 0) crashFlash = Math.max(0, crashFlash - dt / 500);

    ctx.drawImage(bgCanvas, 0, 0);
    ctx.drawImage(playerTrailCanvas, 0, 0);
    ctx.drawImage(aiTrailCanvas, 0, 0);
    const pulse = 0.5 + 0.5 * Math.sin(timeMs * 0.006);
    if (phase !== 'ready') {
      drawHead(player, pulse);
      drawHead(ai, pulse);
    }
    drawHUD();

    if (phase === 'ready') {
      drawCenterPiece('TRON  CYCLES', `First to ${WIN_SCORE} rounds wins`,
        'Press Enter or Space to start', COLORS.accent);
      drawLegend(WINDOW_H / 2 + cellPx * 5);
    } else if (phase === 'round_over') {
      const msgs = { tie: 'TIE ROUND', ai: 'AI TAKES IT', player: 'ROUND TO YOU' };
      const cols = { tie: COLORS.white, ai: COLORS.purple, player: COLORS.yellow };
      drawCenterPiece(msgs[roundWinner], `${score.player}   –   ${score.ai}`,
        'Press Enter for next round', cols[roundWinner]);
    } else if (phase === 'match_over') {
      const won = score.player > score.ai;
      drawCenterPiece(won ? 'VICTORY' : 'DEFEAT',
        `Final  ${score.player}  –  ${score.ai}`,
        'Press Enter to play again', won ? COLORS.yellow : COLORS.purple);
    } else if (paused) {
      drawCenterPiece('PAUSED', null, 'Press P to resume', COLORS.accent);
    }

    drawCrashFlash(crashFlash);
    requestAnimationFrame(frame);
  }

  assetsReady.then(() => {
    resize();
    resetMatch();
    requestAnimationFrame(frame);
  });

  window.addEventListener('resize', () => {
    resize();
    if (phase === 'ready') resetRound();
  });
})();
