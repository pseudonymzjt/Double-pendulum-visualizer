/* ============================================================
   Chaotic Art — Double Pendulum Visualizer
   Stage 7 — N-Link Pendulum with Verlet Integration
   ============================================================ */

// --- Constants --------------------------------------------------
const G = 9.81;                  // gravitational acceleration (m/s²)
const PHYS_L = 1.5;              // base rod length in simulation units (meters)
const SUB_STEPS = 4;             // Verlet sub-steps per frame
const CONSTRAINT_ITERS = 10;     // constraint solver iterations per sub-step
const TRAIL_LENGTH = 1200;       // max trail points (~20 s at 60 fps)
const TRAIL_BATCHES = 80;        // opacity gradation levels for the fading line
const CHAOS_OFFSET = 0.01 * Math.PI / 180;  // 0.01° in radians
const SNAP_DEG = 15;
const SNAP_THRESHOLD = 5;
const LINK_SCALE = 0.85;         // length multiplier when adding joints
const MIN_LINKS = 2;             // minimum links per pendulum
const HIT_RADIUS = 22;           // px — bob grab radius
const VERLET_G_SCALE = 8;        // gravity multiplier for Verlet (RK4-equivalent feel)

function snapAngle(rad) {
    const deg = rad * 180 / Math.PI;
    const snapped = Math.round(deg / SNAP_DEG) * SNAP_DEG;
    return Math.abs(deg - snapped) <= SNAP_THRESHOLD
        ? snapped * Math.PI / 180 : rad;
}

// --- Shared pivot & scale ---------------------------------------
const PIVOT = { x: 0, y: 0 };
let pxPerUnit = 0;               // pixels per simulation-unit-length

/** Build initial particles + constraints for an N-link pendulum. */
function buildChain(nLinks, thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    const baseLen = PHYS_L * pxPerUnit;
    const particles = [{ x: PIVOT.x, y: PIVOT.y, px: PIVOT.x, py: PIVOT.y }];
    const constraints = [];
    let cx = PIVOT.x, cy = PIVOT.y;
    for (let i = 0; i < nLinks; i++) {
        const len = baseLen * Math.pow(LINK_SCALE, i);
        const nx = cx + len * Math.sin(th);
        const ny = cy + len * Math.cos(th);
        particles.push({ x: nx, y: ny, px: cx, py: cy });
        constraints.push({ a: i, b: i + 1, len });
        cx = nx; cy = ny;
    }
    return { particles, constraints };
}

// --- Pendulum state ---------------------------------------------
function createPendulum(nLinks, theta1Deg, theta2Deg, color1, color2, copyFrom) {
    const chain = buildChain(nLinks, theta1Deg);
    // For theta2 we build a second chain that shares the first particle
    // (the pivot) — not needed for our angle-based model. Instead each
    // pendulum has one chain whose first joint-angle is θ₁; sub-sequent
    // links are all at θ₂ (or the same angle) for the classic double‑pendulum
    // starting shape.  The Verlet solver handles the rest.
    const np = chain.particles.length;
    const p = {
        particles: chain.particles,
        constraints: chain.constraints,
        bob1X: 0, bob1Y: 0,        // recomputed every frame
        bob2X: 0, bob2Y: 0,
        color1, color2,
        trails: Array.from({ length: np }, () => []),
        visible: true,
        selected: false,
        _paletteIdx: 0,
    };
    if (copyFrom) {
        // Inherit all trails so divergence point is visible
        for (let i = 1; i < np && i < copyFrom.trails.length; i++) {
            p.trails[i] = copyFrom.trails[i].map(pt => ({ ...pt }));
        }
    }
    return p;
}

/** Rebuild particles from current pivot + angles (used on drag/reset). */
function rebuildChain(p, nLinks, thetaDeg) {
    const chain = buildChain(nLinks, thetaDeg);
    p.particles = chain.particles;
    p.constraints = chain.constraints;
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
        // Extract current angle from first segment
        const dx = p.particles[1].x - p.particles[0].x;
        const dy = p.particles[1].y - p.particles[0].y;
        const angleDeg = Math.atan2(dx, dy) * 180 / Math.PI;
        const chain = buildChain(n, angleDeg);
        p.particles = chain.particles;
        p.constraints = chain.constraints;
        syncBobPositions(p);
    }
    clearTrails();
}

window.addEventListener('resize', resizeCanvas);

// --- Verlet Physics ---------------------------------------------

function verletStep(p, dt) {
    const h = dt / SUB_STEPS;
    const gravPx = G * pxPerUnit * VERLET_G_SCALE;  // px/s²

    for (let s = 0; s < SUB_STEPS; s++) {
        // 1. Integrate all free particles (skip index 0 = pivot)
        for (let i = 1; i < p.particles.length; i++) {
            const pt = p.particles[i];
            const vx = pt.x - pt.px;
            const vy = pt.y - pt.py;
            pt.px = pt.x;
            pt.py = pt.y;
            pt.x += vx;
            pt.y += vy + gravPx * h * h;
        }

        // 2. Satisfy constraints (multiple iterations for chain stability)
        const iters = Math.max(CONSTRAINT_ITERS, p.constraints.length * 2);
        for (let iter = 0; iter < iters; iter++) {
            for (const c of p.constraints) {
                const a = p.particles[c.a];
                const b = p.particles[c.b];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const diff = (c.len - dist) / dist;
                const cx = dx * 0.5 * diff;
                const cy = dy * 0.5 * diff;
                if (c.a !== 0) { a.x -= cx; a.y -= cy; }
                b.x += cx; b.y += cy;
            }
        }

        // 3. Pin pivot
        p.particles[0].x = PIVOT.x;
        p.particles[0].y = PIVOT.y;
        p.particles[0].px = PIVOT.x;
        p.particles[0].py = PIVOT.y;
    }
}

// --- Physics step -----------------------------------------------

function stepPhysics() {
    const dt = slowMo ? 1 / 120 : 1 / 60;

    for (const p of pendulums) {
        if (!p.visible) continue;
        verletStep(p, dt);
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
        const b = createPendulum(n, DEFAULT_ANGLE_DEG, DEFAULT_ANGLE_DEG, C_B.c1, C_B.c2, a);
        // Tiny perpendicular offset on the tip for chaos divergence
        const tip = b.particles.length - 1;
        b.particles[tip].x += 0.3;
        b.particles[tip].px += 0.3;
        pendulums.push(b);
        syncBobPositions(b);
        chaosMode = true;
    }
    updateControls();
}

function resetSimulation() {
    for (const p of pendulums) {
        const n = p.constraints.length;
        rebuildChain(p, n, DEFAULT_ANGLE_DEG);
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
    const p = (selectedPendulum !== null && pendulums[selectedPendulum])
        ? pendulums[selectedPendulum] : pendulums[0];
    if (!p || p.particles.length < 2) { el.textContent = ''; return; }
    const parts = [];
    for (let i = 1; i < p.particles.length; i++) {
        const dx = p.particles[i].x - p.particles[i - 1].x;
        const dy = p.particles[i].y - p.particles[i - 1].y;
        const deg = Math.atan2(dx, dy) * 180 / Math.PI;
        parts.push(`θ${String.fromCharCode(0x2080 + i)} ${deg.toFixed(1)}°`);
    }
    el.textContent = parts.join('  ');
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
    const last = p.particles.length - 1;
    const tip = p.particles[last];
    const dirX = tip.x - p.particles[last - 1].x;
    const dirY = tip.y - p.particles[last - 1].y;
    const dist = Math.hypot(dirX, dirY) || 1;
    const newLen = p.constraints[p.constraints.length - 1].len * LINK_SCALE;
    p.particles.push({
        x: tip.x + (dirX / dist) * newLen,
        y: tip.y + (dirY / dist) * newLen,
        px: tip.x,
        py: tip.y,
    });
    p.constraints.push({ a: last, b: last + 1, len: newLen });
    p.trails.push([]);   // new trail for the new particle
    syncBobPositions(p);
    updateControls();
}

function removeJoint() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    if (p.constraints.length <= MIN_LINKS) return;
    p.particles.pop();
    p.constraints.pop();
    p.trails.pop();      // remove the removed particle's trail
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
    if (partIdx === 0) return;     // never drag pivot

    if (partIdx === p.particles.length - 1) {
        // Dragging the tip → rotate the entire chain from the pivot
        // so inner bobs stay in place relative to the pivot.
        const rawAngle = Math.atan2(mx - PIVOT.x, my - PIVOT.y) * 180 / Math.PI;
        const angleDeg = snapAngle(rawAngle);
        rebuildChain(p, p.constraints.length, angleDeg);
    } else {
        // Dragging an inner particle → pin it and solve constraints
        p.particles[partIdx].x = mx;
        p.particles[partIdx].y = my;
        p.particles[partIdx].px = mx;
        p.particles[partIdx].py = my;
        for (let iter = 0; iter < CONSTRAINT_ITERS; iter++) {
            for (const c of p.constraints) {
                const a = p.particles[c.a];
                const b = p.particles[c.b];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.hypot(dx, dy);
                if (dist < 0.001) continue;
                const diff = (c.len - dist) / dist;
                const cx = dx * 0.5 * diff;
                const cy = dy * 0.5 * diff;
                if (c.a !== 0 && c.a !== partIdx) { a.x -= cx; a.y -= cy; }
                if (c.b !== partIdx) { b.x += cx; b.y += cy; }
            }
            // Re-pin the dragged particle so it doesn't drift
            p.particles[partIdx].x = mx;
            p.particles[partIdx].y = my;
        }
    }
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
