/* ============================================================
   Chaotic Art — Double Pendulum Visualizer
   Phase 3 — Chaos Mode & State Architecture
   ============================================================ */

// --- Constants --------------------------------------------------
const G = 9.81;                  // gravitational acceleration (m/s²)
const PHYS_L1 = 1.5;             // rod 1 length in simulation units (meters)
const PHYS_L2 = 1.5;             // rod 2 length in simulation units (meters)
const SUB_STEPS = 4;             // RK4 sub-steps per frame for energy stability
const M1 = 10, M2 = 10;         // pendulum masses (kg, only matters for inertia)
const TRAIL_LENGTH = 1200;       // max trail points per bob (~20 s at 60 fps)
const TRAIL_BATCHES = 80;        // opacity gradation levels for the fading line
const CHAOS_OFFSET = 0.01 * Math.PI / 180;  // 0.01° in radians — butterfly wing flap

// --- Pendulum state ---------------------------------------------
// Pivot point shared by all pendulums (px, set on resize).
const PIVOT = { x: 0, y: 0 };

/** Create a new pendulum with the given initial angles and colors. */
function createPendulum(theta1, theta2, color1, color2, copyTrailsFrom) {
    const p = {
        theta1, theta2,
        omega1: 0, omega2: 0,
        bob1X: 0, bob1Y: 0,
        bob2X: 0, bob2Y: 0,
        color1, color2,
        trail1: [],
        trail2: [],
        visible: true,
        selected: false,
        _paletteIdx: 0,
    };
    if (copyTrailsFrom) {
        p.trail1 = copyTrailsFrom.trail1.map(pt => ({ ...pt }));
        p.trail2 = copyTrailsFrom.trail2.map(pt => ({ ...pt }));
    }
    return p;
}

const pendulums = [];
let chaosMode = false;
let paused = false;
let slowMo = false;
let selectedPendulum = null;
let paletteIdx = 0;

// Drag-to-set state (only active when paused)
let dragTarget = null;   // 'bob1' | 'bob2' | null
let dragActive = false;
const HIT_RADIUS = 22;   // px — how close a click must be to grab a bob

// Color palette — each entry: { c1: bob1, c2: bob2 }
const PALETTE = [
    { c1: '#6080c0', c2: '#00d4ff' },  //  0 — blue / cyan       (Pendulum A)
    { c1: '#c060a0', c2: '#ff60c0' },  //  1 — magenta / pink    (Pendulum B)
    { c1: '#60c080', c2: '#30ff88' },  //  2 — mint / green
    { c1: '#c0a050', c2: '#ffcc00' },  //  3 — gold / yellow
    { c1: '#8060c0', c2: '#bb66ff' },  //  4 — purple / violet
    { c1: '#c06060', c2: '#ff6060' },  //  5 — coral / red
    { c1: '#60a0c0', c2: '#60ddff' },  //  6 — sky / light blue
    { c1: '#c08060', c2: '#ff9966' },  //  7 — orange
];
// Convenience aliases for the first two palette entries
const C_A = PALETTE[0];
const C_B = PALETTE[1];

// Scale factor: pixels per simulation-unit-length, set on resize
let pxPerUnit = 0;

// --- Canvas (HiDPI) — dual layer ---------------------------------
const canvasA = document.getElementById('canvas-a');
const canvasB = document.getElementById('canvas-b');
const ctxA = canvasA.getContext('2d');
const ctxB = canvasB.getContext('2d');
let cw = 0, ch = 0;            // logical (CSS) width/height

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cw = window.innerWidth;
    ch = window.innerHeight;

    [canvasA, canvasB].forEach(c => {
        c.width = cw * dpr;
        c.height = ch * dpr;
        c.style.width = cw + 'px';
        c.style.height = ch + 'px';
    });
    ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);

    const minDim = Math.min(cw, ch);
    pxPerUnit = minDim * 0.18 / PHYS_L1;

    PIVOT.x = cw / 2;
    PIVOT.y = ch * 0.3;

    pendulums.forEach(p => computeBobPositions(p));
}

window.addEventListener('resize', resizeCanvas);

// --- Physics (RK4 integrator) -----------------------------------

function derivatives(theta1, theta2, omega1, omega2) {
    const delta = theta1 - theta2;
    const cosDelta = Math.cos(delta);
    const sinDelta = Math.sin(delta);
    const denom = 2 * M1 + M2 - M2 * Math.cos(2 * delta);

    const dOmega1 = (
        -G * (2 * M1 + M2) * Math.sin(theta1)
        - M2 * G * Math.sin(theta1 - 2 * theta2)
        - 2 * sinDelta * M2 * (omega2 * omega2 * PHYS_L2 + omega1 * omega1 * PHYS_L1 * cosDelta)
    ) / (PHYS_L1 * denom);

    const dOmega2 = (
        2 * sinDelta * (
            omega1 * omega1 * PHYS_L1 * (M1 + M2)
            + G * (M1 + M2) * Math.cos(theta1)
            + omega2 * omega2 * PHYS_L2 * M2 * cosDelta
        )
    ) / (PHYS_L2 * denom);

    return { dTheta1: omega1, dTheta2: omega2, dOmega1, dOmega2 };
}

function rk4Step(theta1, theta2, omega1, omega2, dt) {
    const f = (t1, t2, w1, w2) => derivatives(t1, t2, w1, w2);

    const k1 = f(theta1, theta2, omega1, omega2);

    const k2 = f(
        theta1 + 0.5 * dt * k1.dTheta1,
        theta2 + 0.5 * dt * k1.dTheta2,
        omega1 + 0.5 * dt * k1.dOmega1,
        omega2 + 0.5 * dt * k1.dOmega2,
    );

    const k3 = f(
        theta1 + 0.5 * dt * k2.dTheta1,
        theta2 + 0.5 * dt * k2.dTheta2,
        omega1 + 0.5 * dt * k2.dOmega1,
        omega2 + 0.5 * dt * k2.dOmega2,
    );

    const k4 = f(
        theta1 + dt * k3.dTheta1,
        theta2 + dt * k3.dTheta2,
        omega1 + dt * k3.dOmega1,
        omega2 + dt * k3.dOmega2,
    );

    const sixth = dt / 6;
    return {
        theta1: theta1 + sixth * (k1.dTheta1 + 2 * k2.dTheta1 + 2 * k3.dTheta1 + k4.dTheta1),
        theta2: theta2 + sixth * (k1.dTheta2 + 2 * k2.dTheta2 + 2 * k3.dTheta2 + k4.dTheta2),
        omega1: omega1 + sixth * (k1.dOmega1 + 2 * k2.dOmega1 + 2 * k3.dOmega1 + k4.dOmega1),
        omega2: omega2 + sixth * (k1.dOmega2 + 2 * k2.dOmega2 + 2 * k3.dOmega2 + k4.dOmega2),
    };
}

/** Convert physics angles → pixel positions for one pendulum. */
function computeBobPositions(p) {
    const r1 = PHYS_L1 * pxPerUnit;
    const r2 = PHYS_L2 * pxPerUnit;
    p.bob1X = PIVOT.x + r1 * Math.sin(p.theta1);
    p.bob1Y = PIVOT.y + r1 * Math.cos(p.theta1);
    p.bob2X = p.bob1X + r2 * Math.sin(p.theta2);
    p.bob2Y = p.bob1Y + r2 * Math.cos(p.theta2);
}

/** Advance all active pendulums by one frame. */
function stepPhysics() {
    const dt = slowMo ? 1 / 120 : 1 / 60;
    const h = dt / SUB_STEPS;

    for (const p of pendulums) {
        if (!p.visible) continue;
        for (let i = 0; i < SUB_STEPS; i++) {
            const s = rk4Step(p.theta1, p.theta2, p.omega1, p.omega2, h);
            p.theta1 = s.theta1;
            p.theta2 = s.theta2;
            p.omega1 = s.omega1;
            p.omega2 = s.omega2;
        }
        computeBobPositions(p);

        p.trail1.push({ x: p.bob1X, y: p.bob1Y });
        if (p.trail1.length > TRAIL_LENGTH) p.trail1.shift();

        // Store speed with trail2 for velocity-based line width
        const prev = p.trail2.length > 0 ? p.trail2[p.trail2.length - 1] : null;
        const speed = prev ? Math.hypot(p.bob2X - prev.x, p.bob2Y - prev.y) : 0;
        p.trail2.push({ x: p.bob2X, y: p.bob2Y, s: speed });
        if (p.trail2.length > TRAIL_LENGTH) p.trail2.shift();
    }
}

// --- Controls ---------------------------------------------------

function toggleChaos() {
    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    } else {
        const a = pendulums[0];
        const b = createPendulum(
            a.theta1 + CHAOS_OFFSET,
            a.theta2 + CHAOS_OFFSET,
            C_B.c1, C_B.c2,
            a,
        );
        pendulums.push(b);
        computeBobPositions(b);
        chaosMode = true;
    }
    updateControls();
}

function resetSimulation() {
    const a = pendulums[0];
    a.theta1 = Math.PI * 0.75;
    a.theta2 = Math.PI * 0.75;
    a.omega1 = 0;
    a.omega2 = 0;
    a.trail1 = [];
    a.trail2 = [];
    computeBobPositions(a);

    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    }
    updateControls();
}

function clearTrails() {
    for (const p of pendulums) {
        p.trail1 = [];
        p.trail2 = [];
    }
}

function saveArtwork() {
    const dpr = window.devicePixelRatio || 1;
    const tmp = document.createElement('canvas');
    tmp.width = cw * dpr;
    tmp.height = ch * dpr;
    const tc = tmp.getContext('2d');
    tc.drawImage(canvasA, 0, 0);
    tc.drawImage(canvasB, 0, 0);
    const link = document.createElement('a');
    link.download = 'double-pendulum-art.png';
    link.href = tmp.toDataURL('image/png');
    link.click();
}

function updateControls() {
    document.getElementById('btn-play').textContent = paused ? '▶ Play [Space]' : '⏸ Pause [Space]';
    document.getElementById('btn-chaos').textContent = chaosMode ? '⚡ Single [C]' : '⚡ Chaos [C]';
    document.getElementById('btn-slow').textContent = slowMo ? '⏱ 1× Speed' : '⏱ ½× Slow';

    const hasSel = selectedPendulum !== null && pendulums[selectedPendulum];
    document.getElementById('ctx-menu').classList.toggle('show', !!hasSel);
    if (hasSel) {
        const p = pendulums[selectedPendulum];
        document.getElementById('ctx-color').textContent = p.visible ? '🎨' : '🎨';
        document.getElementById('ctx-visibility').textContent = p.visible ? '👁' : '👁‍🗨';
    }
}

// --- Button handlers --------------------------------------------

document.getElementById('btn-play').addEventListener('click', () => {
    paused = !paused;
    updateControls();
});

document.getElementById('btn-reset').addEventListener('click', resetSimulation);

document.getElementById('btn-chaos').addEventListener('click', toggleChaos);

document.getElementById('btn-clear').addEventListener('click', clearTrails);

document.getElementById('btn-slow').addEventListener('click', () => {
    slowMo = !slowMo;
    updateControls();
});

document.getElementById('btn-save').addEventListener('click', saveArtwork);

document.getElementById('btn-add').addEventListener('click', addPendulum);

document.getElementById('ctx-color').addEventListener('click', cycleColor);
document.getElementById('ctx-visibility').addEventListener('click', toggleVisibility);
document.getElementById('ctx-delete').addEventListener('click', deleteSelected);

document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        paused = !paused;
        updateControls();
    } else if (e.key === 'r' || e.key === 'R') {
        resetSimulation();
    } else if (e.key === 'c' || e.key === 'C') {
        toggleChaos();
    }
});

// --- Multi-pendulum selection & drag-to-set ---------------------

/** Pick the next palette color and assign it to the pendulum. */
function assignPaletteColor(p) {
    const c = PALETTE[paletteIdx % PALETTE.length];
    p.color1 = c.c1;
    p.color2 = c.c2;
    p._paletteIdx = paletteIdx % PALETTE.length;
    paletteIdx++;
}

/** Add a new pendulum at the default angle with the next palette color. */
function addPendulum() {
    const p = createPendulum(Math.PI * 0.75, Math.PI * 0.75, '#888', '#888');
    assignPaletteColor(p);
    pendulums.push(p);
    computeBobPositions(p);
    selectPendulum(pendulums.length - 1);
    updateControls();
}

/** Select a pendulum by index (or null to deselect). */
function selectPendulum(idx) {
    if (selectedPendulum !== null && pendulums[selectedPendulum]) {
        pendulums[selectedPendulum].selected = false;
    }
    selectedPendulum = idx;
    if (idx !== null && pendulums[idx]) {
        pendulums[idx].selected = true;
    }
    updateControls();
}

function deleteSelected() {
    if (selectedPendulum === null) return;
    const idx = selectedPendulum;
    // Don't allow deleting the last pendulum
    if (pendulums.length <= 1) return;
    pendulums.splice(idx, 1);
    selectPendulum(null);
    // Adjust chaos mode if Pendulum B was deleted
    if (chaosMode && pendulums.length < 2) chaosMode = false;
    updateControls();
}

function cycleColor() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    paletteIdx = p._paletteIdx + 1;  // advance global index past this color
    assignPaletteColor(p);
    updateControls();
}

function toggleVisibility() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    p.visible = !p.visible;
    updateControls();
}

function hitTestBob(mx, my) {
    for (let i = pendulums.length - 1; i >= 0; i--) {
        const p = pendulums[i];
        if (!p.visible) continue;
        if (Math.hypot(mx - p.bob2X, my - p.bob2Y) < HIT_RADIUS) return { idx: i, bob: 'bob2' };
        if (Math.hypot(mx - p.bob1X, my - p.bob1Y) < HIT_RADIUS) return { idx: i, bob: 'bob1' };
    }
    return null;
}

canvasB.addEventListener('mousedown', (e) => {
    if (!paused) return;
    const rect = canvasB.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const hit = hitTestBob(mx, my);
    if (hit) {
        selectPendulum(hit.idx);
        dragTarget = hit.bob;
        dragActive = true;
        canvasB.style.cursor = 'grabbing';
    } else {
        selectPendulum(null);
    }
});

document.addEventListener('mousemove', (e) => {
    if (!paused) return;
    const rect = canvasB.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragActive && dragTarget && selectedPendulum !== null) {
        const a = pendulums[selectedPendulum];
        if (dragTarget === 'bob1') {
            a.theta1 = Math.atan2(mx - PIVOT.x, my - PIVOT.y);
        } else {
            a.theta2 = Math.atan2(mx - a.bob1X, my - a.bob1Y);
        }
        a.omega1 = 0;
        a.omega2 = 0;
        computeBobPositions(a);
    } else {
        canvasB.style.cursor = hitTestBob(mx, my) ? 'grab' : 'default';
    }
});

document.addEventListener('mouseup', () => {
    if (dragActive) {
        dragActive = false;
        dragTarget = null;
        canvasB.style.cursor = 'default';
    }
});

canvasB.addEventListener('mouseleave', () => {
    if (dragActive) {
        dragActive = false;
        dragTarget = null;
        canvasB.style.cursor = 'default';
    }
});

// Touch support for mobile
canvasB.addEventListener('touchstart', (e) => {
    if (!paused) return;
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    const hit = hitTestBob(mx, my);
    if (hit) {
        selectPendulum(hit.idx);
        dragTarget = hit.bob;
        dragActive = true;
    } else {
        selectPendulum(null);
    }
}, { passive: true });

canvasB.addEventListener('touchmove', (e) => {
    if (!dragActive || !paused || selectedPendulum === null) return;
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    const mx = touch.clientX - rect.left;
    const my = touch.clientY - rect.top;
    const a = pendulums[selectedPendulum];
    if (dragTarget === 'bob1') {
        a.theta1 = Math.atan2(mx - PIVOT.x, my - PIVOT.y);
    } else {
        a.theta2 = Math.atan2(mx - a.bob1X, my - a.bob1Y);
    }
    a.omega1 = 0;
    a.omega2 = 0;
    computeBobPositions(a);
}, { passive: true });

canvasB.addEventListener('touchend', () => {
    dragActive = false;
    dragTarget = null;
});

// --- Rendering --------------------------------------------------

function drawTrail(trail, hexColor, velocityStyle) {
    const len = trail.length;
    if (len < 2) return;

    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    const totalSegments = len - 1;
    const batchSize = Math.ceil(totalSegments / TRAIL_BATCHES);

    for (let batch = 0; batch < TRAIL_BATCHES; batch++) {
        const segStart = batch * batchSize;
        const segEnd = Math.min(segStart + batchSize, totalSegments);
        if (segStart >= segEnd) break;

        const t = (batch + 1) / TRAIL_BATCHES;
        const alpha = 0.02 + t * 0.88;

        // Velocity-based line width: fast → thin (0.8), slow → thick (3.0)
        let lineW = 1.5;
        if (velocityStyle) {
            let sum = 0, count = 0;
            for (let i = segStart; i <= segEnd; i++) {
                if (trail[i].s !== undefined) { sum += trail[i].s; count++; }
            }
            if (count > 0) {
                const avg = sum / count;
                const norm = Math.min(avg / 150, 1);
                lineW = 3.0 - norm * 2.2;
            }
        }

        ctxA.beginPath();
        ctxA.moveTo(trail[segStart].x, trail[segStart].y);
        for (let i = segStart + 1; i <= segEnd; i++) {
            ctxA.lineTo(trail[i].x, trail[i].y);
        }
        ctxA.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`;
        ctxA.lineWidth = lineW;
        ctxA.stroke();
    }
}

function drawPendulum(p) {
    if (!p.visible) return;

    // Selection ring (drawn underneath everything)
    if (p.selected) {
        ctxB.beginPath();
        ctxB.arc(p.bob1X, p.bob1Y, 10, 0, Math.PI * 2);
        ctxB.strokeStyle = 'rgba(255,255,255,0.2)';
        ctxB.lineWidth = 1.5;
        ctxB.stroke();
        ctxB.beginPath();
        ctxB.arc(p.bob2X, p.bob2Y, 12, 0, Math.PI * 2);
        ctxB.stroke();
    }

    const rods = p._paletteIdx === 0 ? '#404060' : '#604060';

    // Rod 1
    ctxB.beginPath();
    ctxB.moveTo(PIVOT.x, PIVOT.y);
    ctxB.lineTo(p.bob1X, p.bob1Y);
    ctxB.strokeStyle = rods;
    ctxB.lineWidth = 2;
    ctxB.stroke();

    // Rod 2
    ctxB.beginPath();
    ctxB.moveTo(p.bob1X, p.bob1Y);
    ctxB.lineTo(p.bob2X, p.bob2Y);
    ctxB.strokeStyle = rods;
    ctxB.lineWidth = 2;
    ctxB.stroke();

    // Bob 1
    ctxB.beginPath();
    ctxB.arc(p.bob1X, p.bob1Y, 6, 0, Math.PI * 2);
    ctxB.fillStyle = p.color1;
    ctxB.fill();

    // Bob 2
    ctxB.beginPath();
    ctxB.arc(p.bob2X, p.bob2Y, 8, 0, Math.PI * 2);
    ctxB.fillStyle = p.color2;
    ctxB.fill();
}

function draw() {
    // Layer A — trails (bob2 gets velocity-based line width)
    ctxA.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        if (!p.visible) continue;
        drawTrail(p.trail1, p.color1, false);
        drawTrail(p.trail2, p.color2, true);
    }

    // Layer B — pendulums
    ctxB.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        drawPendulum(p);
    }

    // Pivot (shared, drawn once)
    ctxB.beginPath();
    ctxB.arc(PIVOT.x, PIVOT.y, 4, 0, Math.PI * 2);
    ctxB.fillStyle = '#ffffff';
    ctxB.fill();
}

// --- Animation loop ---------------------------------------------

function animate() {
    if (!paused) stepPhysics();
    draw();
    requestAnimationFrame(animate);
}

// --- Bootstrap --------------------------------------------------

addPendulum();
resizeCanvas();
updateControls();
animate();
