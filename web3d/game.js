import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

// --- CONFIG ---
const GRID = 80;
const CELL = 4;
const HALF = (GRID * CELL) / 2;
const WALL_H = 0.35;
const WALL_W = CELL * 0.08;
const MOVE_MS = 110;
const WIN_SCORE = 3;

const COLORS = {
  player: 0xffde2e,
  ai: 0xff3a3a,
  floor: 0x06102a,
  gridBright: 0x6fdcff,
  sky: 0x07102e,
  boundary: 0x8ce4ff,
  skyline: 0x6fa0ff,
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);

// --- RENDERER / SCENE / CAMERA ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(COLORS.sky);
scene.fog = new THREE.FogExp2(COLORS.sky, 0.0036);

const camera = new THREE.PerspectiveCamera(
  72, window.innerWidth / window.innerHeight, 0.1, 2400
);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.1;
document.body.appendChild(renderer.domElement);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.32, 0.4, 0.7
);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// --- LIGHTS ---
scene.add(new THREE.AmbientLight(0x3a4577, 0.9));
const keyLight = new THREE.DirectionalLight(0xaabbff, 0.4);
keyLight.position.set(80, 200, 120);
scene.add(keyLight);

// --- FLOOR (shader grid) ---
const floorMat = new THREE.ShaderMaterial({
  uniforms: {
    uCell:     { value: CELL },
    uMajor:    { value: CELL * 5 },
    uColorA:   { value: new THREE.Color(COLORS.floor) },
    uColorB:   { value: new THREE.Color(COLORS.gridBright) },
    uMajorCol: { value: new THREE.Color(0xa8ecff) },
    uFade:     { value: HALF * 2.2 },
  },
  vertexShader: /* glsl */`
    varying vec3 vWorldPos;
    void main() {
      vec4 wp = modelMatrix * vec4(position, 1.0);
      vWorldPos = wp.xyz;
      gl_Position = projectionMatrix * viewMatrix * wp;
    }
  `,
  fragmentShader: /* glsl */`
    uniform float uCell;
    uniform float uMajor;
    uniform vec3 uColorA;
    uniform vec3 uColorB;
    uniform vec3 uMajorCol;
    uniform float uFade;
    varying vec3 vWorldPos;

    // Anti-aliased grid line intensity in [0,1]; higher thickness = wider glow.
    float gridLine(vec2 p, float thickness) {
      vec2 g = abs(fract(p - 0.5) - 0.5) / fwidth(p);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      return smoothstep(0.0, thickness, line);
    }

    void main() {
      vec2 minorP = vWorldPos.xz / uCell;
      vec2 majorP = vWorldPos.xz / uMajor;
      float minor = gridLine(minorP, 0.35);
      float major = gridLine(majorP, 0.55);

      float dist = length(vWorldPos.xz);
      float vignette = 1.0 - smoothstep(uFade * 0.4, uFade, dist);

      vec3 col = uColorA;
      col = mix(col, uColorB, minor * 0.75 * vignette);
      col = mix(col, uMajorCol, major * 0.9 * vignette);
      // subtle emissive boost so bloom catches the lines
      col += uColorB * minor * 0.08 * vignette;
      col += uMajorCol * major * 0.15 * vignette;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
});
const floor = new THREE.Mesh(new THREE.PlaneGeometry(GRID * CELL * 3, GRID * CELL * 3), floorMat);
floor.rotation.x = -Math.PI / 2;
floor.position.y = 0;
scene.add(floor);

// --- BOUNDARY (neon box frame) ---
const boundaryGroup = new THREE.Group();
{
  const positions = [];
  const addLine = (a, b) => positions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
  // bottom square
  addLine([-HALF, 0.02, -HALF], [ HALF, 0.02, -HALF]);
  addLine([ HALF, 0.02, -HALF], [ HALF, 0.02,  HALF]);
  addLine([ HALF, 0.02,  HALF], [-HALF, 0.02,  HALF]);
  addLine([-HALF, 0.02,  HALF], [-HALF, 0.02, -HALF]);
  // top square
  addLine([-HALF, WALL_H, -HALF], [ HALF, WALL_H, -HALF]);
  addLine([ HALF, WALL_H, -HALF], [ HALF, WALL_H,  HALF]);
  addLine([ HALF, WALL_H,  HALF], [-HALF, WALL_H,  HALF]);
  addLine([-HALF, WALL_H,  HALF], [-HALF, WALL_H, -HALF]);
  // vertical corners
  addLine([-HALF, 0.02, -HALF], [-HALF, WALL_H, -HALF]);
  addLine([ HALF, 0.02, -HALF], [ HALF, WALL_H, -HALF]);
  addLine([ HALF, 0.02,  HALF], [ HALF, WALL_H,  HALF]);
  addLine([-HALF, 0.02,  HALF], [-HALF, WALL_H,  HALF]);

  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  const mat = new THREE.LineBasicMaterial({ color: COLORS.boundary, transparent: true, opacity: 0.9 });
  boundaryGroup.add(new THREE.LineSegments(geom, mat));
}
scene.add(boundaryGroup);

// --- CYCLE ---
// Classic 1982 Tron light cycle: solid coloured bulbous shell, rounded
// wheels, dark tinted canopy dome — not the dark-with-neon-edge Legacy look.
function makeCycle(color) {
  const g = new THREE.Group();
  const yellow = new THREE.MeshStandardMaterial({
    color, emissive: color, emissiveIntensity: 0.18,
    metalness: 0.15, roughness: 0.45,
  });
  const gray = new THREE.MeshStandardMaterial({
    color: 0x7a818c, metalness: 0.3, roughness: 0.5,
  });
  const grayDark = new THREE.MeshStandardMaterial({
    color: 0x4a4f58, metalness: 0.4, roughness: 0.45,
  });
  const grayLight = new THREE.MeshStandardMaterial({
    color: 0xaab0b8, metalness: 0.3, roughness: 0.4,
  });
  const darkTop = new THREE.MeshStandardMaterial({
    color: 0x0a0a10, metalness: 0.35, roughness: 0.55,
  });
  const tire = new THREE.MeshStandardMaterial({
    color: 0x16161c, metalness: 0.2, roughness: 0.7,
  });

  const wheelR = 1.35;
  const wheelZ = 1.85;
  const wheelY = wheelR;
  const bodyWidth = 0.75;

  // === WHEELS (dark tire, darker-gray hub disk, small light cap) ===
  const wheelGeo = new THREE.TorusGeometry(wheelR, 0.22, 18, 48);
  const hubGeo = new THREE.CylinderGeometry(1.05, 1.05, 0.26, 36);
  const capGeo = new THREE.SphereGeometry(0.3, 20, 16);
  for (const z of [-wheelZ, wheelZ]) {
    const t = new THREE.Mesh(wheelGeo, tire);
    t.rotation.y = Math.PI / 2;
    t.position.set(0, wheelY, z);
    g.add(t);
    const h = new THREE.Mesh(hubGeo, grayDark);
    h.rotation.z = Math.PI / 2;
    h.position.set(0, wheelY, z);
    g.add(h);
    const c = new THREE.Mesh(capGeo, grayLight);
    c.position.set(0, wheelY, z);
    g.add(c);
  }

  // === YELLOW FENDER ARCHES around each wheel (upper half torus) ===
  // Partial torus covers the top half of the wheel. scale.x widens the tube
  // in the cycle's width direction so it reads as a flat fender, not a round tube.
  const fenderR = wheelR + 0.3;
  const fenderTube = 0.3;
  const fenderGeo = new THREE.TorusGeometry(fenderR, fenderTube, 16, 40, Math.PI);
  const fenderWidenScale = bodyWidth / (fenderTube * 2);
  for (const z of [-wheelZ, wheelZ]) {
    const f = new THREE.Mesh(fenderGeo, yellow);
    f.rotation.y = Math.PI / 2;
    f.scale.x = fenderWidenScale;
    f.position.set(0, wheelY, z);
    g.add(f);
  }

  // === YELLOW ROOF SPINE connecting the two fender tops ===
  const spineLen = 2 * wheelZ + fenderTube * 1.6;
  const spine = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth, 0.45, spineLen),
    yellow
  );
  spine.position.set(0, wheelY + fenderR - 0.22, 0);
  g.add(spine);

  // A slight mid-roof dip: a thin dark wedge on the roof centre that reads
  // like the cockpit-lid depression in the reference image.
  const roofDip = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.96, 0.18, 2.1),
    darkTop
  );
  roofDip.position.set(0, wheelY + fenderR + 0.01, 0);
  g.add(roofDip);

  // === DARK TOP STRIPE running the full length of the roof ===
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.7, 0.08, spineLen + fenderR * 1.4),
    darkTop
  );
  stripe.position.set(0, wheelY + fenderR + 0.08, 0);
  g.add(stripe);

  // === GRAY INNER CHASSIS (visible through the cockpit opening) ===
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.55, 1.35, 2 * wheelZ - 0.2),
    gray
  );
  chassis.position.set(0, 1.15, 0);
  g.add(chassis);

  // Angular cockpit slope on the front of the chassis (that sharp diagonal
  // seen under the canopy in the reference). A rotated thin box.
  const cockpit = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.56, 0.95, 1.15),
    gray
  );
  cockpit.position.set(0, 1.6, -0.55);
  cockpit.rotation.x = 0.35;
  g.add(cockpit);

  // === GRAY REAR TAIL FIN extending past the rear wheel ===
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(1.35, 0.35);
  finShape.lineTo(1.15, 1.05);
  finShape.lineTo(0, 0.85);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.16, bevelEnabled: false });
  finGeo.translate(0, 0, -0.08);
  finGeo.rotateY(Math.PI / 2);
  const fin = new THREE.Mesh(finGeo, gray);
  fin.position.set(0, 1.65, wheelZ + 0.15);
  g.add(fin);
  // small yellow fin tip accent
  const finTip = new THREE.Mesh(
    new THREE.BoxGeometry(bodyWidth * 0.5, 0.28, 0.35),
    yellow
  );
  finTip.position.set(0, 2.45, wheelZ + 0.7);
  finTip.rotation.x = -0.35;
  g.add(finTip);

  g.scale.setScalar(0.56);
  return g;
}

const playerCycle = makeCycle(COLORS.player);
const aiCycle = makeCycle(COLORS.ai);
scene.add(playerCycle, aiCycle);

// --- RECOGNIZER (the flying red gantry from the film) ---
function makeRecognizer() {
  const g = new THREE.Group();
  const red = new THREE.MeshStandardMaterial({
    color: 0xb21414, emissive: 0x5a0000, emissiveIntensity: 0.6,
    metalness: 0.55, roughness: 0.35,
  });
  const hot = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  const dark = new THREE.MeshStandardMaterial({
    color: 0x180202, metalness: 0.6, roughness: 0.7,
  });

  const legW = 5, legH = 17, legD = 6;
  const legGap = 14;

  // Two vertical legs
  for (const sx of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.BoxGeometry(legW, legH, legD), red);
    leg.position.set(sx * (legGap / 2 + legW / 2), 0, 0);
    g.add(leg);

    // dark band around middle of leg
    const band = new THREE.Mesh(new THREE.BoxGeometry(legW * 1.04, legH * 0.22, legD * 1.04), dark);
    band.position.set(leg.position.x, -legH * 0.1, 0);
    g.add(band);

    // hot accent strip down outer face
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.35, legH * 0.82, 0.6), hot);
    strip.position.set(sx * (legGap / 2 + legW + 0.1), 0, 0);
    g.add(strip);

    // foot glow pad
    const foot = new THREE.Mesh(new THREE.BoxGeometry(legW * 1.1, 0.6, legD * 1.1), hot);
    foot.position.set(leg.position.x, -legH / 2 - 0.2, 0);
    g.add(foot);
  }

  // Crossbeam on top
  const beamW = legGap + legW * 2 + 2;
  const beamH = 4.5;
  const beamD = 7;
  const beam = new THREE.Mesh(new THREE.BoxGeometry(beamW, beamH, beamD), red);
  beam.position.y = legH / 2 + beamH / 2;
  g.add(beam);

  // Dark beam recess + hot underside
  const recess = new THREE.Mesh(new THREE.BoxGeometry(beamW * 0.88, 1.2, beamD * 1.02), dark);
  recess.position.y = legH / 2 + beamH - 0.6;
  g.add(recess);
  const underGlow = new THREE.Mesh(new THREE.BoxGeometry(beamW * 0.7, 0.35, beamD * 0.35), hot);
  underGlow.position.y = legH / 2 - 0.05;
  g.add(underGlow);

  // "Head" module floating between the legs
  const head = new THREE.Mesh(new THREE.BoxGeometry(8, 3.2, 5), dark);
  head.position.y = legH / 2 - 4.5;
  g.add(head);
  const eye = new THREE.Mesh(new THREE.BoxGeometry(5.4, 0.7, 0.4), hot);
  eye.position.set(0, legH / 2 - 4.2, 2.6);
  g.add(eye);

  // Point light for local illumination
  const pl = new THREE.PointLight(0xff4030, 2.4, 90);
  pl.position.y = legH / 2 - 3;
  g.add(pl);

  // Blinking aerial beacon on top (own material so pulse doesn't affect other parts)
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff5a3a });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 12), beaconMat);
  beacon.position.y = legH / 2 + beamH + 0.7;
  g.add(beacon);
  g.userData.beacon = beacon;

  return g;
}

const recognizer = makeRecognizer();
scene.add(recognizer);

// --- WIREFRAME SKYLINE (distant megastructures beyond the arena) ---
const skyline = new THREE.Group();
function addSkylineBox(sx, sy, sz, px, py, pz, color = COLORS.skyline, opacity = 0.55) {
  const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(sx, sy, sz));
  const line = new THREE.LineSegments(edges,
    new THREE.LineBasicMaterial({ color, transparent: true, opacity, fog: true }));
  line.position.set(px, py, pz);
  skyline.add(line);
}
// ring of structures set well beyond HALF so fog haze shrouds them
(function buildSkyline() {
  const D = HALF * 2.6;
  const cfg = [
    [ 70, 110,  70, -D * 0.7,  55, -D * 0.9 ],
    [120,  70,  60,  D * 0.9,  35, -D * 0.8 ],
    [ 50, 160,  50,  D * 0.2,  80, -D * 1.1 ],
    [ 90,  50,  80, -D * 1.1,  25,  D * 0.7 ],
    [ 60, 130,  60,  D * 1.0,  65,  D * 0.5 ],
    [100,  80,  70, -D * 0.4,  40,  D * 1.1 ],
    [ 40, 200,  40,  D * 0.55, 100, -D * 1.3 ],
    [ 80,  60,  80, -D * 0.9,  30, -D * 0.2 ],
  ];
  for (const [sx, sy, sz, px, py, pz] of cfg) {
    addSkylineBox(sx, sy, sz, px, py, pz);
    // cross-brace a second slightly smaller wireframe for more visual interest
    addSkylineBox(sx * 0.6, sy * 0.9, sz * 0.6, px, py, pz, COLORS.skyline, 0.35);
  }
})();
scene.add(skyline);

// --- STARFIELD (faint points in the upper hemisphere) ---
(function buildStars() {
  const N = 900;
  const pos = new Float32Array(N * 3);
  const R = HALF * 3.2;
  for (let i = 0; i < N; i++) {
    const u = Math.random();
    const v = Math.random() * 0.55 + 0.12; // upper band
    const theta = u * Math.PI * 2;
    const phi = Math.acos(1 - 2 * v);
    pos[i * 3]     = R * Math.sin(phi) * Math.cos(theta);
    pos[i * 3 + 1] = R * Math.cos(phi) * 0.65 + 80;
    pos[i * 3 + 2] = R * Math.sin(phi) * Math.sin(theta);
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({
    color: 0xc9dcff, size: 1.6, sizeAttenuation: true,
    transparent: true, opacity: 0.75, fog: false,
  });
  scene.add(new THREE.Points(geom, mat));
})();

const recState = { x: 0, y: 42, z: 0, dir: 1, speed: 14, seed: Math.random() * 1000 };
function respawnRecognizer() {
  recState.dir = Math.random() < 0.5 ? 1 : -1;
  recState.x = -recState.dir * HALF * 1.8;
  recState.z = (Math.random() - 0.5) * HALF * 1.5;
  recState.y = 38 + Math.random() * 10;
  recState.speed = 10 + Math.random() * 8;
  recognizer.rotation.y = recState.dir > 0 ? 0 : Math.PI;
}
respawnRecognizer();

// --- LIGHT WALLS (continuous ribbon segments) ---
// Standard material with a moderate emissive reads as a glowing stripe
// without dumping every pixel above the bloom threshold — the trail then
// looks like a thin painted light on the ground instead of a neon pylon.
function makeTrailMaterial(color) {
  return new THREE.MeshStandardMaterial({
    color: 0x080808, emissive: color, emissiveIntensity: 0.75,
    metalness: 0.2, roughness: 0.55,
    transparent: true, opacity: 0.95,
  });
}
const playerTrailMat = makeTrailMaterial(COLORS.player);
const aiTrailMat = makeTrailMaterial(COLORS.ai);

// --- GAME STATE ---
function cellToWorld(cx, cz) {
  return new THREE.Vector3(
    (cx - GRID / 2 + 0.5) * CELL,
    0,
    (cz - GRID / 2 + 0.5) * CELL
  );
}

function addTrailAt(cyc, cx, cz) {
  const key = cx * 10000 + cz;
  cyc.trail.add(key);
}

function startSegment(cyc, pivotCell) {
  const mesh = new THREE.Mesh(UNIT_BOX, cyc.trailMat);
  mesh.scale.set(WALL_W, WALL_H, 0.001);
  mesh.rotation.y = Math.atan2(cyc.dir[0], cyc.dir[1]);
  const w = cellToWorld(pivotCell[0], pivotCell[1]);
  mesh.position.set(w.x, WALL_H / 2, w.z);
  scene.add(mesh);
  const seg = { mesh, startCell: [...pivotCell], dir: [...cyc.dir] };
  cyc.segments.push(seg);
  cyc.currentSeg = seg;
}

function updateCurrentSegment(cyc, headWorld) {
  const seg = cyc.currentSeg;
  if (!seg) return;
  const startW = cellToWorld(seg.startCell[0], seg.startCell[1]);
  const projected = (headWorld.x - startW.x) * seg.dir[0] +
                    (headWorld.z - startW.z) * seg.dir[1];
  // extend half a cell back so the wall blends into the previous segment's corner
  const backOverlap = CELL * 0.5;
  const len = Math.max(0.001, projected + backOverlap);
  seg.mesh.scale.z = len;
  const midX = startW.x + seg.dir[0] * (len / 2 - backOverlap);
  const midZ = startW.z + seg.dir[1] * (len / 2 - backOverlap);
  seg.mesh.position.set(midX, WALL_H / 2, midZ);
}

function finalizeSegment(cyc, endCell) {
  const seg = cyc.currentSeg;
  if (!seg) return;
  const startW = cellToWorld(seg.startCell[0], seg.startCell[1]);
  const endW = cellToWorld(endCell[0], endCell[1]);
  const rawLen = Math.hypot(endW.x - startW.x, endW.z - startW.z);
  // overlap half a cell each end for seamless corners
  const backOverlap = CELL * 0.5;
  const frontOverlap = CELL * 0.5;
  const len = rawLen + backOverlap + frontOverlap;
  seg.mesh.scale.z = len;
  const midX = (startW.x + endW.x) / 2 + seg.dir[0] * (frontOverlap - backOverlap) / 2;
  const midZ = (startW.z + endW.z) / 2 + seg.dir[1] * (frontOverlap - backOverlap) / 2;
  seg.mesh.position.set(midX, WALL_H / 2, midZ);
}

function clearSegments(cyc) {
  for (const seg of cyc.segments) scene.remove(seg.mesh);
  cyc.segments = [];
  cyc.currentSeg = null;
}

let state;
let score = { player: 0, ai: 0 };

function newCycleState(cell, dir, mesh, trailMat, color) {
  return {
    cell: [...cell],
    prevCell: [...cell],
    dir: [...dir],
    nextDir: [...dir],
    mesh,
    trailMat,
    trail: new Set(),
    segments: [],
    currentSeg: null,
    alive: true,
    color,
  };
}

function resetRound() {
  const playerStart = [Math.floor(GRID * 3 / 4), Math.floor(GRID / 2)];
  const aiStart = [Math.floor(GRID / 4), Math.floor(GRID / 2)];
  if (state && state.player) clearSegments(state.player);
  if (state && state.ai) clearSegments(state.ai);
  state = {
    phase: 'ready',
    paused: false,
    tickAccum: 0,
    crashFlash: 0,
    roundWinner: null,
    player: newCycleState(playerStart, [-1, 0], playerCycle, playerTrailMat, COLORS.player),
    ai: newCycleState(aiStart, [1, 0], aiCycle, aiTrailMat, COLORS.ai),
  };
  addTrailAt(state.player, playerStart[0], playerStart[1]);
  addTrailAt(state.ai, aiStart[0], aiStart[1]);

  // start initial ribbon segments for each cycle
  startSegment(state.player, playerStart);
  startSegment(state.ai, aiStart);

  // pre-place meshes so first frame is correct
  const pw = cellToWorld(state.player.cell[0], state.player.cell[1]);
  const aw = cellToWorld(state.ai.cell[0], state.ai.cell[1]);
  playerCycle.position.copy(pw); playerCycle.rotation.y = dirAngle(state.player.dir);
  aiCycle.position.copy(aw);     aiCycle.rotation.y = dirAngle(state.ai.dir);

  // snap camera behind player
  snapCameraBehind(state.player);
}
function resetMatch() {
  score = { player: 0, ai: 0 };
  resetRound();
  updateHUD();
}

// --- LOGIC ---
const inBounds = ([cx, cz]) => cx >= 0 && cx < GRID && cz >= 0 && cz < GRID;
const stepCell = ([cx, cz], [dx, dz]) => [cx + dx, cz + dz];
const eqDir = (a, b) => a[0] === b[0] && a[1] === b[1];
const oppDir = (d) => [-d[0], -d[1]];

function floodFill(start, blocked, limit = 600) {
  if (!inBounds(start)) return 0;
  const sk = start[0] * 10000 + start[1];
  if (blocked.has(sk)) return 0;
  const seen = new Set([sk]);
  const q = [start];
  let h = 0;
  const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
  while (h < q.length && seen.size < limit) {
    const c = q[h++];
    for (const d of dirs) {
      const n = stepCell(c, d);
      if (!inBounds(n)) continue;
      const nk = n[0] * 10000 + n[1];
      if (seen.has(nk) || blocked.has(nk)) continue;
      seen.add(nk);
      q.push(n);
    }
  }
  return seen.size;
}

// Weakened AI: picks the best move deterministically, but with a short
// planning horizon so it can't see long-range traps. Feels deliberate but
// can still be outplanned by a human.
const AI_HORIZON = 25;       // flood-fill cap; short enough to miss long traps
const AI_STRAIGHT_BIAS = 4;  // small straight bias for deliberate feel

function aiChoose() {
  const cur = state.ai.dir;
  const candidates = [cur];
  if (cur[0] !== 0) candidates.push([0, 1], [0, -1]);
  else candidates.push([1, 0], [-1, 0]);
  const blocked = new Set();
  for (const k of state.player.trail) blocked.add(k);
  for (const k of state.ai.trail) blocked.add(k);

  let bestDir = cur, bestScore = -1;
  for (const d of candidates) {
    const n = stepCell(state.ai.cell, d);
    if (!inBounds(n)) continue;
    const nk = n[0] * 10000 + n[1];
    if (blocked.has(nk)) continue;
    let s = floodFill(n, blocked, AI_HORIZON);
    if (eqDir(d, cur)) s += AI_STRAIGHT_BIAS;
    if (s > bestScore) { bestScore = s; bestDir = d; }
  }
  state.ai.nextDir = bestDir;
}

function setNextDir(cyc, d) {
  // block 180° reversal against the most recent queued direction, so two
  // quick presses in opposite directions don't leave the cycle flipping back
  if (!eqDir(d, oppDir(cyc.nextDir))) cyc.nextDir = d;
}

function applyTurn(cyc, oldDir) {
  // cyc.prevCell is where the cycle currently sits (pivot). Close the old
  // segment against the pivot and start a new ribbon at the same pivot in the
  // new direction.
  finalizeSegment(cyc, cyc.prevCell);
  startSegment(cyc, cyc.prevCell);
}

function tick() {
  aiChoose();

  const oldPlayerDir = [...state.player.dir];
  const oldAiDir = [...state.ai.dir];
  state.player.dir = state.player.nextDir;
  state.ai.dir = state.ai.nextDir;

  state.player.prevCell = [...state.player.cell];
  state.ai.prevCell = [...state.ai.cell];

  if (!eqDir(oldPlayerDir, state.player.dir)) applyTurn(state.player, oldPlayerDir);
  if (!eqDir(oldAiDir, state.ai.dir)) applyTurn(state.ai, oldAiDir);

  const pNew = stepCell(state.player.cell, state.player.dir);
  const aNew = stepCell(state.ai.cell, state.ai.dir);
  const pk = pNew[0] * 10000 + pNew[1];
  const ak = aNew[0] * 10000 + aNew[1];
  let pCrash = !inBounds(pNew) || state.player.trail.has(pk) || state.ai.trail.has(pk);
  let aCrash = !inBounds(aNew) || state.player.trail.has(ak) || state.ai.trail.has(ak);
  if (pNew[0] === aNew[0] && pNew[1] === aNew[1]) { pCrash = true; aCrash = true; }
  if (!pCrash) {
    state.player.cell = pNew;
    addTrailAt(state.player, pNew[0], pNew[1]);
  }
  if (!aCrash) {
    state.ai.cell = aNew;
    addTrailAt(state.ai, aNew[0], aNew[1]);
  }
  return [pCrash, aCrash];
}

// --- VISUAL HELPERS ---
function dirAngle([dx, dz]) {
  // cycle forward is -Z when angle=0; face dir
  return Math.atan2(dx, -dz);
}

function snapCameraBehind(cyc) {
  const p = cellToWorld(cyc.cell[0], cyc.cell[1]);
  const dv = new THREE.Vector3(cyc.dir[0], 0, cyc.dir[1]).normalize();
  const cam = p.clone().add(dv.clone().multiplyScalar(-6)).add(new THREE.Vector3(0, 2.4, 0));
  camera.position.copy(cam);
  camera.lookAt(p.clone().add(dv.clone().multiplyScalar(10)).add(new THREE.Vector3(0, 0.9, 0)));
}

// --- SOUND ---
const cycleSound = document.getElementById('cycleSound');
cycleSound.volume = 0.35;
function startSound() { cycleSound.play().catch(() => {}); }
function stopSound() { cycleSound.pause(); try { cycleSound.currentTime = 0; } catch (_) {} }

// --- HUD ---
const elScoreP = document.getElementById('score-p');
const elScoreA = document.getElementById('score-a');
const elMessage = document.getElementById('message');
const elTitle = document.getElementById('msg-title');
const elSub = document.getElementById('msg-sub');
const elSmall = document.getElementById('msg-small');

function updateHUD() {
  elScoreP.textContent = score.player;
  elScoreA.textContent = score.ai;
}
function showMessage(title, sub, small, titleClass = '') {
  if (title) { elTitle.textContent = title; elTitle.className = titleClass; elTitle.style.display = ''; }
  else { elTitle.textContent = ''; elTitle.className = ''; elTitle.style.display = 'none'; }
  if (sub) { elSub.textContent = sub; elSub.style.display = ''; } else elSub.style.display = 'none';
  if (small) { elSmall.textContent = small; elSmall.style.display = ''; } else elSmall.style.display = 'none';
  elMessage.classList.remove('hidden');
}
function hideMessage() { elMessage.classList.add('hidden'); }

// --- INPUT ---
// Relative steering: left/right arrow rotates the cycle 90° relative to its
// current heading. This way the controls feel consistent regardless of which
// way the cycle is facing in world coords.
// turnLeft: [dx, dz] -> [dz, -dx]   turnRight: [dx, dz] -> [-dz, dx]
const TURNS = {
  ArrowLeft:  ([dx, dz]) => [dz, -dx],
  ArrowRight: ([dx, dz]) => [-dz, dx],
};

function handleArrow(fn) {
  // if the game hasn't started yet, pressing an arrow should start it too
  if (state.phase === 'ready' || state.phase === 'round_over' || state.phase === 'match_over') {
    if (state.phase === 'match_over') resetMatch();
    else if (state.phase === 'round_over') resetRound();
    state.phase = 'playing';
    hideMessage();
    startSound();
  }
  if (state.phase === 'playing' && !state.paused) {
    setNextDir(state.player, fn(state.player.nextDir));
  }
}

window.addEventListener('keydown', (e) => {
  const turn = TURNS[e.key] || TURNS[e.code];
  if (turn) {
    handleArrow(turn);
    e.preventDefault();
    return;
  }
  // swallow up/down so they don't scroll the page
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault();
    return;
  }
  const k = (e.key || '').toLowerCase();
  if (k === 'escape') {
    resetMatch();
    state.phase = 'ready';
    hideMessage();
    stopSound();
    return;
  }
  // Space is the one action key: start round, pause/resume, start next round,
  // start new match after match over.
  if (k === ' ') {
    e.preventDefault();
    if (state.phase === 'ready') {
      state.phase = 'playing';
      hideMessage(); startSound();
    } else if (state.phase === 'round_over') {
      resetRound();
      state.phase = 'playing';
      hideMessage(); startSound();
    } else if (state.phase === 'match_over') {
      resetMatch();
      state.phase = 'playing';
      hideMessage(); startSound();
    } else if (state.phase === 'playing') {
      state.paused = !state.paused;
      if (state.paused) { stopSound(); showMessage('PAUSED', null, 'Press Space to resume'); }
      else { hideMessage(); startSound(); }
    }
  }
});

// touch swipe
let touchStart = null;
window.addEventListener('touchstart', (e) => {
  if (e.touches.length === 1) touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
window.addEventListener('touchend', (e) => {
  if (!touchStart) return;
  const t = e.changedTouches[0];
  const dx = t.clientX - touchStart.x, dy = t.clientY - touchStart.y;
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < 20) {
    if (state.phase === 'ready' || state.phase === 'round_over' || state.phase === 'match_over') {
      if (state.phase === 'match_over') resetMatch();
      else if (state.phase === 'round_over') resetRound();
      state.phase = 'playing'; hideMessage(); startSound();
    }
    touchStart = null; return;
  }
  if (state.phase === 'playing' && !state.paused) {
    // swipe horizontal -> relative left/right turn
    if (ax > ay) {
      const fn = dx > 0 ? TURNS.ArrowRight : TURNS.ArrowLeft;
      setNextDir(state.player, fn(state.player.nextDir));
    }
  }
  touchStart = null;
}, { passive: true });

// --- MAIN LOOP ---
resetMatch();
hideMessage();

let lastTime = performance.now();
const _dirV = new THREE.Vector3();
const _camGoal = new THREE.Vector3();
const _lookGoal = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();

function animate(now) {
  const dt = Math.min(64, now - lastTime);
  lastTime = now;

  if (state.phase === 'playing' && !state.paused) {
    state.tickAccum += dt;
    while (state.tickAccum >= MOVE_MS) {
      state.tickAccum -= MOVE_MS;
      const [pC, aC] = tick();
      if (pC || aC) {
        if (pC && aC) state.roundWinner = 'tie';
        else if (pC) { state.roundWinner = 'ai'; score.ai++; }
        else { state.roundWinner = 'player'; score.player++; }
        updateHUD();
        stopSound();
        state.crashFlash = 1;
        if (score.player >= WIN_SCORE || score.ai >= WIN_SCORE) {
          state.phase = 'match_over';
          const won = score.player > score.ai;
          showMessage(won ? 'VICTORY' : 'DEFEAT', `Final  ${score.player}  –  ${score.ai}`,
            'Press Space to play again', won ? 'yellow' : 'red');
        } else {
          state.phase = 'round_over';
          const titles = { tie: 'TIE ROUND', ai: 'AI TAKES IT', player: 'ROUND TO YOU' };
          const cls = { tie: '', ai: 'red', player: 'yellow' };
          showMessage(titles[state.roundWinner], `${score.player}  –  ${score.ai}`,
            'Press Space for next round', cls[state.roundWinner]);
        }
        break;
      }
    }
  }

  // interpolate visual cycle positions
  const lerpT = (state.phase === 'playing' && !state.paused)
    ? Math.min(1, state.tickAccum / MOVE_MS) : 0;

  for (const cyc of [state.player, state.ai]) {
    _from.copy(cellToWorld(cyc.prevCell[0], cyc.prevCell[1]));
    _to.copy(cellToWorld(cyc.cell[0], cyc.cell[1]));
    cyc.mesh.position.lerpVectors(_from, _to, lerpT);

    const target = dirAngle(cyc.dir);
    let cur = cyc.mesh.rotation.y;
    let diff = target - cur;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    cyc.mesh.rotation.y = cur + diff * Math.min(1, dt / 70);

    // extend the ribbon behind this cycle to match the interpolated head
    updateCurrentSegment(cyc, cyc.mesh.position);
  }

  // chase camera: low and cinematic
  const p = state.player;
  _dirV.set(p.dir[0], 0, p.dir[1]).normalize();
  _camGoal.copy(p.mesh.position).addScaledVector(_dirV, -6).add(new THREE.Vector3(0, 2.4, 0));
  _lookGoal.copy(p.mesh.position).addScaledVector(_dirV, 10).add(new THREE.Vector3(0, 0.9, 0));
  camera.position.lerp(_camGoal, Math.min(1, dt / 170));
  if (!animate._lookAt) animate._lookAt = _lookGoal.clone();
  animate._lookAt.lerp(_lookGoal, Math.min(1, dt / 110));
  camera.lookAt(animate._lookAt);

  // recognizer drift
  recState.x += recState.dir * recState.speed * (dt / 1000);
  recognizer.position.set(
    recState.x,
    recState.y + Math.sin(now / 1400 + recState.seed) * 1.8,
    recState.z
  );
  const beacon = recognizer.userData.beacon;
  if (beacon) {
    const blink = (Math.sin(now / 220) + 1) * 0.5;
    beacon.material.color.setRGB(1.0, 0.2 + blink * 0.6, 0.15 + blink * 0.4);
  }
  if ((recState.dir > 0 && recState.x > HALF * 1.9) ||
      (recState.dir < 0 && recState.x < -HALF * 1.9)) {
    respawnRecognizer();
  }

  // crash flash
  if (state.crashFlash > 0) {
    renderer.toneMappingExposure = 1.1 + state.crashFlash * 2.2;
    state.crashFlash = Math.max(0, state.crashFlash - dt / 400);
  } else {
    renderer.toneMappingExposure = 1.1;
  }

  composer.render();
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloom.resolution.set(window.innerWidth, window.innerHeight);
});
