/* ============================================================
   Chaotic Art — Double Pendulum Visualizer
   Stage 8 — Exact Lagrangian RK4 Physics Engine
   ============================================================ */

// --- Constants --------------------------------------------------
const G = 9.81;                  // gravitational acceleration (m/s²)
const PHYS_L = 1.5;              // base rod length in simulation units (meters)
const SUB_STEPS = 4;             // RK4 sub-steps per frame
const TRAIL_LENGTH = 1200;       // max trail points (~20 s at 60 fps)
const TRAIL_BATCHES = 80;        // opacity gradation levels for the fading line
const CHAOS_OFFSET = 0.01 * Math.PI / 180;  // 0.01° in radians
const SNAP_DEG = 15;
const SNAP_THRESHOLD = 5;
const LINK_SCALE = 0.85;         // length multiplier when adding joints
const MIN_LINKS = 2;             // minimum links per pendulum
const HIT_RADIUS = 22;           // px — bob grab radius

function snapAngle(rad) {
    const deg = rad * 180 / Math.PI;
    const snapped = Math.round(deg / SNAP_DEG) * SNAP_DEG;
    return Math.abs(deg - snapped) <= SNAP_THRESHOLD
        ? snapped * Math.PI / 180 : rad;
}

// --- Shared pivot & scale ---------------------------------------
const PIVOT = { x: 0, y: 0 };
let pxPerUnit = 0;               // pixels per simulation-unit-length

/** Build initial particles + link-lengths for an N-link pendulum. */
function buildChain(nLinks, thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    const baseLen = PHYS_L * pxPerUnit;
    const particles = [{ x: PIVOT.x, y: PIVOT.y }];
    const constraints = [];   // kept for length storage only
    let cx = PIVOT.x, cy = PIVOT.y;
    for (let i = 0; i < nLinks; i++) {
        const len = baseLen * Math.pow(LINK_SCALE, i);
        const nx = cx + len * Math.sin(th);
        const ny = cy + len * Math.cos(th);
        particles.push({ x: nx, y: ny });
        constraints.push({ a: i, b: i + 1, len });
        cx = nx; cy = ny;
    }
    return { particles, constraints };
}

// --- Pendulum state ---------------------------------------------

function createPendulum(nLinks, theta1Deg, theta2Deg, color1, color2, copyFrom) {
    const chain = buildChain(nLinks, theta1Deg);
    const np = chain.particles.length;
    const N = chain.constraints.length;
    const ls = chain.constraints.map(c => c.len);
    const rad = theta1Deg * Math.PI / 180;
    const thetas = new Array(N).fill(rad);
    const omegas = new Array(N).fill(0);
    const p = {
        thetas, omegas, ls, N,
        theta1: rad, theta2: rad,  // compat shims for old code
        omega1: 0, omega2: 0,
        l1: ls[0] || 0,
        l2: N > 1 ? ls.slice(1).reduce((a, b) => a + b, 0) : 0,
        particles: chain.particles,
        constraints: chain.constraints,
        bob1X: 0, bob1Y: 0,
        bob2X: 0, bob2Y: 0,
        color1, color2,
        trails: Array.from({ length: np }, () => []),
        visible: true,
        selected: false,
        _paletteIdx: 0,
    };
    computeParticlePositions(p);
    syncBobPositions(p);
    if (copyFrom) {
        for (let i = 1; i < np && i < copyFrom.trails.length; i++) {
            p.trails[i] = copyFrom.trails[i].map(pt => ({ ...pt }));
        }
    }
    return p;
}

/** Sync theta1/theta2/l1/l2 compat shims from arrays. */
function syncCompatShims(p) {
    p.theta1 = p.thetas[0];
    p.omega1 = p.omegas[0];
    p.l1 = p.ls[0] || 0;
    if (p.N >= 2) {
        p.theta2 = p.thetas[1];
        p.omega2 = p.omegas[1];
    }
    p.l2 = p.N > 1 ? p.ls.slice(1).reduce((a, b) => a + b, 0) : 0;
}

/** Convert angles → pixel positions for all particles. */
function computeParticlePositions(p) {
    let cx = PIVOT.x, cy = PIVOT.y;
    const N = p.N;
    for (let i = 0; i < N; i++) {
        cx += p.ls[i] * Math.sin(p.thetas[i]);
        cy += p.ls[i] * Math.cos(p.thetas[i]);
        p.particles[i + 1].x = cx;
        p.particles[i + 1].y = cy;
    }
    p.particles[0].x = PIVOT.x;
    p.particles[0].y = PIVOT.y;
}

/** Sync backward‑compat bob positions from particles. */
function syncBobPositions(p) {
    p.bob1X = p.particles.length > 1 ? p.particles[1].x : PIVOT.x;
    p.bob1Y = p.particles.length > 1 ? p.particles[1].y : PIVOT.y;
    const last = p.particles[p.particles.length - 1];
    p.bob2X = last.x;
    p.bob2Y = last.y;
}

/** Rebuild particles + constraints at a new pxPerUnit scale. */
function rebuildChain(p, nLinks, thetaDeg) {
    const chain = buildChain(nLinks, thetaDeg);
    p.particles = chain.particles;
    p.constraints = chain.constraints;
    p.ls = chain.constraints.map(c => c.len);
    p.N = p.ls.length;
    syncCompatShims(p);
}

const pendulums = [];
let chaosMode = false;
let paused = false;
let slowMo = false;
let selectedPendulum = null;
let paletteIdx = 0;

// Drag-to-set state
let dragTarget = null;   // particle index being dragged
let dragActive = false;

// Color palette
const PALETTE = [
    { c1: '#6080c0', c2: '#00d4ff' },
    { c1: '#c060a0', c2: '#ff60c0' },
    { c1: '#60c080', c2: '#30ff88' },
    { c1: '#c0a050', c2: '#ffcc00' },
    { c1: '#8060c0', c2: '#bb66ff' },
    { c1: '#c06060', c2: '#ff6060' },
    { c1: '#60a0c0', c2: '#60ddff' },
    { c1: '#c08060', c2: '#ff9966' },
];
const C_A = PALETTE[0];
const C_B = PALETTE[1];

// --- Canvas (HiDPI) — dual layer ---------------------------------
const canvasA = document.getElementById('canvas-a');
const canvasB = document.getElementById('canvas-b');
const ctxA = canvasA.getContext('2d');
const ctxB = canvasB.getContext('2d');
let cw = 0, ch = 0;

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
    pxPerUnit = minDim * 0.18 / PHYS_L;

    PIVOT.x = cw / 2;
    PIVOT.y = ch * 0.3;

    // Rebuild chains at the same angles, scaled to the new pxPerUnit
    for (const p of pendulums) {
        const n = p.constraints.length;
        if (n < 1) continue;
        // Preserve current angles, just rescale lengths
        const chain = buildChain(n, p.thetas[0] * 180 / Math.PI);
        p.particles = chain.particles;
        p.constraints = chain.constraints;
        p.ls = chain.constraints.map(c => c.len);
        p.N = p.ls.length;
        syncCompatShims(p);
        computeParticlePositions(p);
        syncBobPositions(p);
    }
    clearTrails();
}

window.addEventListener('resize', resizeCanvas);

// --- General N-Pendulum Lagrangian Physics ----------------------

/**
 * Build the N×N mass matrix M and RHS vector b, then solve M·α = b
 * using Gaussian elimination (full trigonometric coupling, no
 * small-angle approximations).
 *
 * For N links (0-indexed i,j = 0…N-1):
 *
 *   Aᵢⱼ = lᵢ lⱼ (N − max(i,j))          (equal masses)
 *   Mᵢⱼ = Aᵢⱼ cos(θᵢ − θⱼ)
 *
 *   bᵢ  = − Σⱼ≠ᵢ Aᵢⱼ sin(θᵢ−θⱼ) ωⱼ²
 *         − g × lᵢ × (N−i) × sin(θᵢ)
 *
 * M is symmetric positive-definite → Gaussian elimination without
 * pivoting is safe, but we still use partial pivoting for robustness.
 */
function derivativesArray(thetas, omegas, ls) {
    const N = thetas.length;
    const gPx = G * pxPerUnit;

    // Build M and b
    const M = [];
    const b = new Array(N);
    for (let i = 0; i < N; i++) {
        M[i] = new Array(N);
        let bi = 0;
        for (let j = 0; j < N; j++) {
            const Aij = ls[i] * ls[j] * (N - Math.max(i, j));
            const dTheta = thetas[i] - thetas[j];
            M[i][j] = Aij * Math.cos(dTheta);
            if (j !== i) {
                bi -= Aij * Math.sin(dTheta) * omegas[j] * omegas[j];
            }
        }
        bi -= gPx * ls[i] * (N - i) * Math.sin(thetas[i]);
        b[i] = bi;
    }

    // Gaussian elimination with partial pivoting
    const A = M.map(row => [...row]);
    const x = [...b];

    for (let col = 0; col < N; col++) {
        // Partial pivoting
        let maxVal = Math.abs(A[col][col]), maxRow = col;
        for (let row = col + 1; row < N; row++) {
            if (Math.abs(A[row][col]) > maxVal) { maxVal = Math.abs(A[row][col]); maxRow = row; }
        }
        if (maxRow !== col) {
            [A[col], A[maxRow]] = [A[maxRow], A[col]];
            [x[col], x[maxRow]] = [x[maxRow], x[col]];
        }

        const pivot = A[col][col];
        if (Math.abs(pivot) < 1e-14) continue;

        for (let row = col + 1; row < N; row++) {
            const factor = A[row][col] / pivot;
            for (let j = col; j < N; j++) A[row][j] -= factor * A[col][j];
            x[row] -= factor * x[col];
        }
    }

    // Back substitution
    const alpha = new Array(N);
    for (let i = N - 1; i >= 0; i--) {
        let sum = x[i];
        for (let j = i + 1; j < N; j++) sum -= A[i][j] * alpha[j];
        alpha[i] = sum / A[i][i];
    }
    return alpha;
}

/** RK4 integration for an N-pendulum state (thetas, omegas). */
function rk4Step(p, dt) {
    const h = dt / SUB_STEPS;
    const N = p.N;

    for (let s = 0; s < SUB_STEPS; s++) {
        const t0 = p.thetas.slice();
        const o0 = p.omegas.slice();
        const ls = p.ls;

        // k1
        const a1 = derivativesArray(t0, o0, ls);
        const k1_t = a1.map((_, i) => h * o0[i]);
        const k1_o = a1.map(a => h * a);

        // k2 (half-step)
        const t2 = t0.map((t, i) => t + k1_t[i] / 2);
        const o2 = o0.map((o, i) => o + k1_o[i] / 2);
        const a2 = derivativesArray(t2, o2, ls);
        const k2_t = a2.map((_, i) => h * (o0[i] + k1_o[i] / 2));
        const k2_o = a2.map(a => h * a);

        // k3
        const t3 = t0.map((t, i) => t + k2_t[i] / 2);
        const o3 = o0.map((o, i) => o + k2_o[i] / 2);
        const a3 = derivativesArray(t3, o3, ls);
        const k3_t = a3.map((_, i) => h * (o0[i] + k2_o[i] / 2));
        const k3_o = a3.map(a => h * a);

        // k4 (full step)
        const t4 = t0.map((t, i) => t + k3_t[i]);
        const o4 = o0.map((o, i) => o + k3_o[i]);
        const a4 = derivativesArray(t4, o4, ls);
        const k4_t = a4.map((_, i) => h * (o0[i] + k3_o[i]));
        const k4_o = a4.map(a => h * a);

        for (let i = 0; i < N; i++) {
            p.thetas[i] += (k1_t[i] + 2 * k2_t[i] + 2 * k3_t[i] + k4_t[i]) / 6;
            p.omegas[i] += (k1_o[i] + 2 * k2_o[i] + 2 * k3_o[i] + k4_o[i]) / 6;
        }
    }
}

function stepPhysics() {
    const dt = slowMo ? 1 / 120 : 1 / 60;

    for (const p of pendulums) {
        if (!p.visible) continue;

        // Exact Lagrangian RK4 integration
        rk4Step(p, dt);

        // Convert angles → pixel positions
        computeParticlePositions(p);
        syncBobPositions(p);

        // Record trails for all particles (inner = shorter limit, tip = full)
        const total = p.particles.length;
        for (let i = 1; i < total; i++) {
            const pt = p.particles[i];
            const trail = p.trails[i];
            const prev = trail.length > 0 ? trail[trail.length - 1] : null;
            const speed = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y) : 0;
            trail.push({ x: pt.x, y: pt.y, s: speed });
            const ratio = i / (total - 1);
            const limit = Math.round(TRAIL_LENGTH * (0.15 + 0.85 * ratio));
            if (trail.length > limit) trail.shift();
        }
    }
}

// --- Controls ---------------------------------------------------

const DEFAULT_ANGLE_DEG = 135;  // ≈ 0.75π rad

function toggleChaos() {
    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    } else {
        const a = pendulums[0];
        const n = a.constraints.length;
        // Copy A's angles + tiny offset for butterfly-effect divergence
        const b = createPendulum(n, DEFAULT_ANGLE_DEG, DEFAULT_ANGLE_DEG, C_B.c1, C_B.c2, a);
        for (let i = 0; i < n; i++) {
            b.thetas[i] = a.thetas[i];
            b.omegas[i] = a.omegas[i];
        }
        b.thetas[0] += CHAOS_OFFSET;   // 0.01° offset on θ₁ for divergence
        syncCompatShims(b);
        computeParticlePositions(b);
        syncBobPositions(b);
        pendulums.push(b);
        chaosMode = true;
    }
    updateControls();
}

function resetSimulation() {
    const rad = DEFAULT_ANGLE_DEG * Math.PI / 180;
    for (const p of pendulums) {
        const n = p.constraints.length;
        p.thetas.fill(rad);
        p.omegas.fill(0);
        rebuildChain(p, n, DEFAULT_ANGLE_DEG);
        computeParticlePositions(p);
        syncBobPositions(p);
        for (const t of p.trails) t.length = 0;
    }

    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    }
    updateControls();
}

function clearTrails() {
    for (const p of pendulums) {
        for (const t of p.trails) t.length = 0;
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

function updateAngleDisplay() {
    const el = document.getElementById('angle-display');
    if (pendulums.length === 0) { el.innerHTML = ''; return; }

    const lines = [];
    for (let idx = 0; idx < pendulums.length; idx++) {
        const p = pendulums[idx];
        if (!p.visible) continue;

        const parts = [];
        for (let i = 0; i < p.N; i++) {
            const deg = ((p.thetas[i] * 180 / Math.PI) % 360 + 360) % 360;
            parts.push(`θ${String.fromCharCode(0x2080 + i + 1)} ${deg.toFixed(1)}°`);
        }
        const marker = idx === selectedPendulum ? '▸' : '●';
        lines.push(`<span style="color:${p.color2}">${marker}</span> ${parts.join('  ')}`);
    }
    el.innerHTML = lines.join('<br>');
}

function updateControls() {
    document.getElementById('btn-play').textContent = paused ? '▶ Play [Space]' : '⏸ Pause [Space]';
    document.getElementById('btn-chaos').textContent = chaosMode ? '⚡ Single [C]' : '⚡ Chaos [C]';
    document.getElementById('btn-slow').textContent = slowMo ? '⏱ 1× Speed' : '⏱ ½× Slow';

    const hasSel = selectedPendulum !== null && pendulums[selectedPendulum];
    document.getElementById('ctx-menu').classList.toggle('show', !!hasSel);
    updateAngleDisplay();
    if (hasSel) {
        const p = pendulums[selectedPendulum];
        document.getElementById('ctx-color').textContent = '🎨';
        document.getElementById('ctx-visibility').textContent = p.visible ? '👁' : '👁‍🗨';
        const n = p.constraints.length;
        document.getElementById('ctx-add-joint').style.display = '';
        document.getElementById('ctx-rm-joint').style.display = n > MIN_LINKS ? '' : 'none';
    } else {
        document.getElementById('ctx-add-joint').style.display = 'none';
        document.getElementById('ctx-rm-joint').style.display = 'none';
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
document.getElementById('ctx-add-joint').addEventListener('click', addJoint);
document.getElementById('ctx-rm-joint').addEventListener('click', removeJoint);

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

// --- Multi-pendulum management ----------------------------------

function assignPaletteColor(p) {
    const c = PALETTE[paletteIdx % PALETTE.length];
    p.color1 = c.c1;
    p.color2 = c.c2;
    p._paletteIdx = paletteIdx % PALETTE.length;
    paletteIdx++;
}

function addPendulum() {
    const p = createPendulum(MIN_LINKS, DEFAULT_ANGLE_DEG, DEFAULT_ANGLE_DEG, '#888', '#888');
    assignPaletteColor(p);
    pendulums.push(p);
    selectPendulum(pendulums.length - 1);
    updateControls();
}

function selectPendulum(idx) {
    if (selectedPendulum !== null && pendulums[selectedPendulum]) {
        pendulums[selectedPendulum].selected = false;
    }
    selectedPendulum = idx;
    if (idx !== null && pendulums[idx]) pendulums[idx].selected = true;
    updateControls();
}

function deleteSelected() {
    if (selectedPendulum === null) return;
    if (pendulums.length <= 1) return;
    pendulums.splice(selectedPendulum, 1);
    selectPendulum(null);
    if (chaosMode && pendulums.length < 2) chaosMode = false;
    updateControls();
}

function cycleColor() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    paletteIdx = p._paletteIdx + 1;
    assignPaletteColor(p);
    updateControls();
}

function toggleVisibility() {
    if (selectedPendulum === null) return;
    pendulums[selectedPendulum].visible = !pendulums[selectedPendulum].visible;
    updateControls();
}

// --- Joint modifiers (N-link) -----------------------------------

function addJoint() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    const last = p.constraints.length;
    const tip = p.particles[last];
    const prev = p.particles[last - 1];
    const dirX = tip.x - prev.x;
    const dirY = tip.y - prev.y;
    const dist = Math.hypot(dirX, dirY) || 1;
    const newLen = p.constraints[p.constraints.length - 1].len * LINK_SCALE;
    p.particles.push({
        x: tip.x + (dirX / dist) * newLen,
        y: tip.y + (dirY / dist) * newLen,
    });
    p.constraints.push({ a: last, b: last + 1, len: newLen });
    p.trails.push([]);
    // New link inherits last segment's angle
    p.thetas.push(p.thetas[p.thetas.length - 1]);
    p.omegas.push(0);
    p.ls = p.constraints.map(c => c.len);
    p.N = p.ls.length;
    syncCompatShims(p);
    computeParticlePositions(p);
    syncBobPositions(p);
    updateControls();
}

function removeJoint() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    if (p.constraints.length <= MIN_LINKS) return;
    p.particles.pop();
    p.constraints.pop();
    p.trails.pop();
    p.thetas.pop();
    p.omegas.pop();
    p.ls = p.constraints.map(c => c.len);
    p.N = p.ls.length;
    syncCompatShims(p);
    computeParticlePositions(p);
    syncBobPositions(p);
    updateControls();
}

// --- Selection & drag -------------------------------------------

function hitTestBob(mx, my) {
    for (let i = pendulums.length - 1; i >= 0; i--) {
        const p = pendulums[i];
        if (!p.visible) continue;
        // Check tip first (outermost particle)
        const tip = p.particles.length - 1;
        if (Math.hypot(mx - p.particles[tip].x, my - p.particles[tip].y) < HIT_RADIUS)
            return { idx: i, particle: tip };
        for (let j = p.particles.length - 2; j >= 1; j--) {
            if (Math.hypot(mx - p.particles[j].x, my - p.particles[j].y) < HIT_RADIUS)
                return { idx: i, particle: j };
        }
    }
    return null;
}

function dragParticle(p, partIdx, mx, my) {
    if (partIdx === 0) return;

    // Compute the angle from parent particle to mouse.
    const parent = p.particles[partIdx - 1];
    const dx = mx - parent.x;
    const dy = my - parent.y;
    const rawAngle = Math.atan2(dx, dy);
    const newAngle = snapAngle(rawAngle);

    // Set the angle of the link at (partIdx-1). For partIdx=1 that's θ₁,
    // for the tip of a 3-link that's θ₃, etc.
    p.thetas[partIdx - 1] = newAngle;

    // Zero all velocities during drag
    p.omegas.fill(0);

    syncCompatShims(p);
    computeParticlePositions(p);
    syncBobPositions(p);
}

// Suppress the browser context menu on the canvas
canvasB.addEventListener('contextmenu', (e) => e.preventDefault());

canvasB.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!paused) return;
    const rect = canvasB.getBoundingClientRect();
    const hit = hitTestBob(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
        selectPendulum(hit.idx);
        dragTarget = hit.particle;
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

    if (dragActive && dragTarget !== null && selectedPendulum !== null) {
        dragParticle(pendulums[selectedPendulum], dragTarget, mx, my);
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

// Touch support
canvasB.addEventListener('touchstart', (e) => {
    if (!paused) return;
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    const hit = hitTestBob(touch.clientX - rect.left, touch.clientY - rect.top);
    if (hit) {
        selectPendulum(hit.idx);
        dragTarget = hit.particle;
        dragActive = true;
    } else {
        selectPendulum(null);
    }
}, { passive: true });

canvasB.addEventListener('touchmove', (e) => {
    if (!dragActive || !paused || selectedPendulum === null) return;
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    dragParticle(pendulums[selectedPendulum], dragTarget,
        touch.clientX - rect.left, touch.clientY - rect.top);
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

        let lineW = 1.5;
        if (velocityStyle) {
            let sum = 0, count = 0;
            for (let i = segStart; i <= segEnd; i++) {
                if (trail[i].s !== undefined) { sum += trail[i].s; count++; }
            }
            if (count > 0) {
                const avg = sum / count;
                lineW = 3.0 - Math.min(avg / 150, 1) * 2.2;
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
    const n = p.particles.length;

    // Selection rings around first and last particle
    if (p.selected && n > 1) {
        ctxB.beginPath();
        ctxB.arc(p.particles[1].x, p.particles[1].y, 10, 0, Math.PI * 2);
        ctxB.strokeStyle = 'rgba(255,255,255,0.2)';
        ctxB.lineWidth = 1.5;
        ctxB.stroke();
        ctxB.beginPath();
        ctxB.arc(p.particles[n - 1].x, p.particles[n - 1].y, 12, 0, Math.PI * 2);
        ctxB.stroke();
    }

    const rods = p._paletteIdx === 0 ? '#404060' : '#604060';

    // Rods
    for (let i = 1; i < n; i++) {
        ctxB.beginPath();
        ctxB.moveTo(p.particles[i - 1].x, p.particles[i - 1].y);
        ctxB.lineTo(p.particles[i].x, p.particles[i].y);
        ctxB.strokeStyle = rods;
        ctxB.lineWidth = 2;
        ctxB.stroke();
    }

    // Bobs (inner)
    for (let i = 1; i < n - 1; i++) {
        const r = Math.max(4, 8 * Math.pow(LINK_SCALE, i - 1));
        ctxB.beginPath();
        ctxB.arc(p.particles[i].x, p.particles[i].y, r, 0, Math.PI * 2);
        ctxB.fillStyle = p.color1;
        ctxB.fill();
    }

    // Tip bob (distinct color2)
    if (n > 1) {
        const tip = n - 1;
        const rTip = Math.max(4, 8 * Math.pow(LINK_SCALE, tip - 1));
        ctxB.beginPath();
        ctxB.arc(p.particles[tip].x, p.particles[tip].y, rTip, 0, Math.PI * 2);
        ctxB.fillStyle = p.color2;
        ctxB.fill();
    }
}

function draw() {
    // Layer A — trails (one per particle; tip = full, inner = shorter)
    ctxA.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        if (!p.visible) continue;
        const total = p.particles.length;
        for (let i = total - 1; i >= 1; i--) {
            const isTip = i === total - 1;
            drawTrail(p.trails[i], isTip ? p.color2 : p.color1, isTip);
        }
    }

    // Layer B — pendulums
    ctxB.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        drawPendulum(p);
    }

    // Pivot
    ctxB.beginPath();
    ctxB.arc(PIVOT.x, PIVOT.y, 4, 0, Math.PI * 2);
    ctxB.fillStyle = '#ffffff';
    ctxB.fill();
}

// --- Animation loop ---------------------------------------------

function animate() {
    if (!paused) stepPhysics();
    draw();
    updateAngleDisplay();
    requestAnimationFrame(animate);
}

// --- Bootstrap --------------------------------------------------

addPendulum();
resizeCanvas();
updateControls();
animate();
