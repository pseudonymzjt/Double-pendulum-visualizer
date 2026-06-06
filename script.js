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

/** Compute l₁ and l₂ (px) from constraints array. */
function computeRodLengths(constraints) {
    const l1 = constraints.length > 0 ? constraints[0].len : 0;
    let l2 = 0;
    for (let i = 1; i < constraints.length; i++) l2 += constraints[i].len;
    return [l1, l2];
}

function createPendulum(nLinks, theta1Deg, theta2Deg, color1, color2, copyFrom) {
    const chain = buildChain(nLinks, theta1Deg);
    const np = chain.particles.length;
    const [l1, l2] = computeRodLengths(chain.constraints);
    const th1 = theta1Deg * Math.PI / 180;
    const th2 = theta2Deg * Math.PI / 180;
    const p = {
        theta1: th1, theta2: th2,  // angles (rad, 0 = straight down)
        omega1: 0, omega2: 0,      // angular velocities (rad/s)
        l1, l2,                     // rod lengths in px
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

/** Rebuild particles + constraints for a given angle on resize/reset. */
function rebuildChain(p, nLinks, thetaDeg) {
    const chain = buildChain(nLinks, thetaDeg);
    p.particles = chain.particles;
    p.constraints = chain.constraints;
    const [l1, l2] = computeRodLengths(chain.constraints);
    p.l1 = l1;
    p.l2 = l2;
    p.theta2 = p.theta1;  // collinear initially
}

/** Convert angles → pixel positions for all particles. */
function computeParticlePositions(p) {
    p.particles[0].x = PIVOT.x;
    p.particles[0].y = PIVOT.y;

    // First bob: at end of rod 1
    const x1 = PIVOT.x + p.l1 * Math.sin(p.theta1);
    const y1 = PIVOT.y + p.l1 * Math.cos(p.theta1);
    p.particles[1].x = x1;
    p.particles[1].y = y1;

    // For N=2: tip is at end of rod 2
    // For N>2: intermediate particles placed proportionally along rod 2
    if (p.constraints.length <= 2) {
        // Simple 2-link case
        const xTip = x1 + p.l2 * Math.sin(p.theta2);
        const yTip = y1 + p.l2 * Math.cos(p.theta2);
        if (p.particles.length > 2) {
            p.particles[2].x = xTip;
            p.particles[2].y = yTip;
        }
    } else {
        // N-link: intermediate particles placed proportionally along rod 2
        let cumLen = 0;
        for (let i = 2; i <= p.constraints.length && i < p.particles.length; i++) {
            cumLen += p.constraints[i - 1].len;
            const t = cumLen / p.l2;
            p.particles[i].x = x1 + p.l2 * Math.sin(p.theta2) * t;
            p.particles[i].y = y1 + p.l2 * Math.cos(p.theta2) * t;
        }
        // Tip at full rod 2 extent
        const last = p.particles.length - 1;
        p.particles[last].x = x1 + p.l2 * Math.sin(p.theta2);
        p.particles[last].y = y1 + p.l2 * Math.cos(p.theta2);
    }
}

/** Sync backward‑compat bob positions from particles. */
function syncBobPositions(p) {
    p.bob1X = p.particles.length > 1 ? p.particles[1].x : PIVOT.x;
    p.bob1Y = p.particles.length > 1 ? p.particles[1].y : PIVOT.y;
    const last = p.particles[p.particles.length - 1];
    p.bob2X = last.x;
    p.bob2Y = last.y;
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
        const chain = buildChain(n, p.theta1 * 180 / Math.PI);
        p.particles = chain.particles;
        p.constraints = chain.constraints;
        const [l1, l2] = computeRodLengths(chain.constraints);
        p.l1 = l1;
        p.l2 = l2;
        computeParticlePositions(p);
        syncBobPositions(p);
    }
    clearTrails();
}

window.addEventListener('resize', resizeCanvas);

// --- Lagrangian Physics ------------------------------------------

/**
 * Compute angular accelerations α₁, α₂ using exact non-linear
 * Lagrangian-derived equations of motion for a double pendulum.
 *
 * m₁ = m₂ = m (equal masses at rod ends).
 * The 2×2 linear system solved directly — no small-angle approximation.
 */
function derivatives(theta1, theta2, omega1, omega2, l1, l2) {
    const dTheta = theta1 - theta2;
    const cosD = Math.cos(dTheta);
    const sinD = Math.sin(dTheta);

    // System:  2·l₁·α₁ + l₂·cos(Δ)·α₂ = -2g·sin θ₁ - l₂·ω₂²·sin(Δ)
    //           l₁·cos(Δ)·α₁ + l₂·α₂ = -g·sin θ₂ + l₁·ω₁²·sin(Δ)
    // All lengths are in px, g is in px/s².
    const gPx = G * pxPerUnit;
    const a11 = 2 * l1;
    const a12 = l2 * cosD;
    const a21 = l1 * cosD;
    const a22 = l2;

    const b1 = -2 * gPx * Math.sin(theta1) - l2 * omega2 * omega2 * sinD;
    const b2 = l1 * omega1 * omega1 * sinD - gPx * Math.sin(theta2);

    const det = a11 * a22 - a12 * a21;
    // det = 2·l₁·l₂ − l₁·l₂·cos²(Δ) = l₁·l₂·(2 − cos²(Δ)) ≥ l₁·l₂ > 0

    const alpha1 = (b1 * a22 - a12 * b2) / det;
    const alpha2 = (a11 * b2 - b1 * a21) / det;

    return [alpha1, alpha2];
}

/** RK4 integration of the 4-D state (θ₁, θ₂, ω₁, ω₂). */
function rk4Step(p, dt) {
    const h = dt / SUB_STEPS;

    for (let s = 0; s < SUB_STEPS; s++) {
        const t1 = p.theta1, t2 = p.theta2;
        const o1 = p.omega1, o2 = p.omega2;

        // k1
        const [a1_1, a2_1] = derivatives(t1, t2, o1, o2, p.l1, p.l2);
        const k1_t1 = h * o1,  k1_t2 = h * o2;
        const k1_o1 = h * a1_1, k1_o2 = h * a2_1;

        // k2 (half-step)
        const [a1_2, a2_2] = derivatives(
            t1 + k1_t1 / 2, t2 + k1_t2 / 2,
            o1 + k1_o1 / 2, o2 + k1_o2 / 2,
            p.l1, p.l2);
        const k2_t1 = h * (o1 + k1_o1 / 2), k2_t2 = h * (o2 + k1_o2 / 2);
        const k2_o1 = h * a1_2, k2_o2 = h * a2_2;

        // k3
        const [a1_3, a2_3] = derivatives(
            t1 + k2_t1 / 2, t2 + k2_t2 / 2,
            o1 + k2_o1 / 2, o2 + k2_o2 / 2,
            p.l1, p.l2);
        const k3_t1 = h * (o1 + k2_o1 / 2), k3_t2 = h * (o2 + k2_o2 / 2);
        const k3_o1 = h * a1_3, k3_o2 = h * a2_3;

        // k4 (full step)
        const [a1_4, a2_4] = derivatives(
            t1 + k3_t1, t2 + k3_t2,
            o1 + k3_o1, o2 + k3_o2,
            p.l1, p.l2);
        const k4_t1 = h * (o1 + k3_o1), k4_t2 = h * (o2 + k3_o2);
        const k4_o1 = h * a1_4, k4_o2 = h * a2_4;

        p.theta1 += (k1_t1 + 2 * k2_t1 + 2 * k3_t1 + k4_t1) / 6;
        p.theta2 += (k1_t2 + 2 * k2_t2 + 2 * k3_t2 + k4_t2) / 6;
        p.omega1 += (k1_o1 + 2 * k2_o1 + 2 * k3_o1 + k4_o1) / 6;
        p.omega2 += (k1_o2 + 2 * k2_o2 + 2 * k3_o2 + k4_o2) / 6;
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
        b.theta1 = a.theta1;
        b.theta2 = a.theta2;
        b.omega1 = a.omega1;
        b.omega2 = a.omega2;
        // Apply CHAOS_OFFSET to θ₁ for divergence
        b.theta1 += CHAOS_OFFSET;
        computeParticlePositions(b);
        syncBobPositions(b);
        pendulums.push(b);
        chaosMode = true;
    }
    updateControls();
}

function resetSimulation() {
    for (const p of pendulums) {
        const n = p.constraints.length;
        const rad = DEFAULT_ANGLE_DEG * Math.PI / 180;
        p.theta1 = rad;
        p.theta2 = rad;
        p.omega1 = 0;
        p.omega2 = 0;
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

        const deg1 = p.theta1 * 180 / Math.PI;
        const deg2 = p.theta2 * 180 / Math.PI;
        const parts = [`θ₁ ${deg1.toFixed(1)}°`, `θ₂ ${deg2.toFixed(1)}°`];
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
    const last = p.constraints.length;  // = old particle count - 1
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
    // Recalculate l₁, l₂
    const [l1, l2] = computeRodLengths(p.constraints);
    p.l1 = l1; p.l2 = l2;
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
    const [l1, l2] = computeRodLengths(p.constraints);
    p.l1 = l1; p.l2 = l2;
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

    if (partIdx === 1) {
        // Dragging bob1 → set θ₁. Inner fixed point is pivot.
        p.theta1 = newAngle;
    } else {
        // Dragging tip or intermediate particle → set θ₂ (rod-2 angle).
        p.theta2 = newAngle;
    }

    // Zero velocities during drag
    p.omega1 = 0;
    p.omega2 = 0;

    // Convert angles → pixel positions
    computeParticlePositions(p);
    syncBobPositions(p);
}

canvasB.addEventListener('mousedown', (e) => {
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
