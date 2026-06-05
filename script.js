/* ============================================================
   Chaotic Art — Double Pendulum Visualizer
   Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics
   ============================================================ */

// --- Constants --------------------------------------------------
const G = 9.81;                  // gravitational acceleration (m/s²)
const PHYS_L1 = 1.5;             // rod 1 length in simulation units (meters)
const PHYS_L2 = 1.5;             // rod 2 length in simulation units (meters)
const SUB_STEPS = 4;             // RK4 sub-steps per frame for energy stability
const M1 = 10, M2 = 10;         // pendulum masses (kg, only matters for inertia)
const TRAIL_LENGTH = 1200;       // max trail points per bob (~20 s at 60 fps)
const TRAIL_BATCHES = 80;        // opacity gradation levels for the fading line

// --- Pendulum state ---------------------------------------------
const state = {
    theta1: Math.PI * 0.75,    // angle of rod 1 from vertical (rad)
    theta2: Math.PI * 0.75,    // angle of rod 2 from vertical (rad)
    omega1: 0,                 // angular velocity of rod 1 (rad/s)
    omega2: 0,                 // angular velocity of rod 2 (rad/s)
    originX: 0,                // pivot x (px)
    originY: 0,                // pivot y (px)
    bob1X: 0, bob1Y: 0,       // bob 1 position (px)
    bob2X: 0, bob2Y: 0,       // bob 2 position (px)
    trail1: [],                // bob 1 trajectory [{x, y}]
    trail2: [],                // bob 2 trajectory [{x, y}]
};

// Scale factor: pixels per simulation-unit-length, set on resize
let pxPerUnit = 0;

// --- Canvas (HiDPI) — dual layer ---------------------------------
// Layer A (bottom) – trajectory lines, accumulates each frame.
// Layer B (top)    – pendulum, cleared and redrawn every frame.
const canvasA = document.getElementById('canvas-a');
const canvasB = document.getElementById('canvas-b');
const ctxA = canvasA.getContext('2d');
const ctxB = canvasB.getContext('2d');
let cw = 0, ch = 0;            // logical (CSS) width/height

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cw = window.innerWidth;
    ch = window.innerHeight;

    // Both canvases get identical HiDPI treatment
    [canvasA, canvasB].forEach(c => {
        c.width = cw * dpr;
        c.height = ch * dpr;
        c.style.width = cw + 'px';
        c.style.height = ch + 'px';
    });
    ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Compute pixel scale so the full span (~2 × PHYS_L) fits nicely
    const minDim = Math.min(cw, ch);
    pxPerUnit = minDim * 0.18 / PHYS_L1;

    state.originX = cw / 2;
    state.originY = ch * 0.3;

    computeBobPositions();
}

window.addEventListener('resize', resizeCanvas);

// --- Physics (RK4 integrator) -----------------------------------

/**
 * Derivatives of the double-pendulum state vector.
 * Standard formulation — see e.g. the equations on scholarpedia.
 */
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

    return {
        dTheta1: omega1,
        dTheta2: omega2,
        dOmega1,
        dOmega2,
    };
}

/**
 * Single RK4 step for the 4-element state vector.
 */
function rk4Step(theta1, theta2, omega1, omega2, dt) {
    const evaluate = (t1, t2, w1, w2) => derivatives(t1, t2, w1, w2);

    // k₁
    const k1 = evaluate(theta1, theta2, omega1, omega2);

    // k₂
    const k2 = evaluate(
        theta1 + 0.5 * dt * k1.dTheta1,
        theta2 + 0.5 * dt * k1.dTheta2,
        omega1 + 0.5 * dt * k1.dOmega1,
        omega2 + 0.5 * dt * k1.dOmega2,
    );

    // k₃
    const k3 = evaluate(
        theta1 + 0.5 * dt * k2.dTheta1,
        theta2 + 0.5 * dt * k2.dTheta2,
        omega1 + 0.5 * dt * k2.dOmega1,
        omega2 + 0.5 * dt * k2.dOmega2,
    );

    // k₄
    const k4 = evaluate(
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

/** Convert physics angles to pixel positions on canvas. */
function computeBobPositions() {
    const { originX, originY } = state;
    const r1 = PHYS_L1 * pxPerUnit;
    const r2 = PHYS_L2 * pxPerUnit;

    state.bob1X = originX + r1 * Math.sin(state.theta1);
    state.bob1Y = originY + r1 * Math.cos(state.theta1);
    state.bob2X = state.bob1X + r2 * Math.sin(state.theta2);
    state.bob2Y = state.bob1Y + r2 * Math.cos(state.theta2);
}

/** Advance one frame of physics (fixed dt with sub-stepping). */
function stepPhysics() {
    const dt = 1 / 60;          // one frame at 60 fps
    const h = dt / SUB_STEPS;   // sub-step size

    for (let i = 0; i < SUB_STEPS; i++) {
        const s = rk4Step(state.theta1, state.theta2, state.omega1, state.omega2, h);
        state.theta1 = s.theta1;
        state.theta2 = s.theta2;
        state.omega1 = s.omega1;
        state.omega2 = s.omega2;
    }

    computeBobPositions();

    // Record trajectories
    state.trail1.push({ x: state.bob1X, y: state.bob1Y });
    if (state.trail1.length > TRAIL_LENGTH) state.trail1.shift();
    state.trail2.push({ x: state.bob2X, y: state.bob2Y });
    if (state.trail2.length > TRAIL_LENGTH) state.trail2.shift();
}

// --- Rendering --------------------------------------------------
// Layer A — trail.  Not cleared between frames; we redraw the whole trail
// on top of whatever was there, so old pixels are overwritten correctly.
// Layer B — pendulum.  Cleared and redrawn fresh every frame.

/**
 * Draw a fading trail of connected line segments on Layer A.
 * Older segments are more transparent; newer segments are brighter.
 */
function drawTrail(trail, hexColor) {
    const len = trail.length;
    if (len < 2) return;

    // Parse hex into RGB components for rgba() interpolation
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    const totalSegments = len - 1;
    const batchSize = Math.ceil(totalSegments / TRAIL_BATCHES);

    for (let batch = 0; batch < TRAIL_BATCHES; batch++) {
        const segStart = batch * batchSize;
        const segEnd = Math.min(segStart + batchSize, totalSegments);
        if (segStart >= segEnd) break;

        // Opacity ramps from barely visible → bright
        const t = (batch + 1) / TRAIL_BATCHES;
        const alpha = 0.02 + t * 0.88;

        ctxA.beginPath();
        ctxA.moveTo(trail[segStart].x, trail[segStart].y);
        for (let i = segStart + 1; i <= segEnd; i++) {
            ctxA.lineTo(trail[i].x, trail[i].y);
        }
        ctxA.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`;
        ctxA.lineWidth = 1.5;
        ctxA.stroke();
    }
}

/** Draw the pendulum rods, bobs, and pivot on Layer B (fully opaque). */
function drawPendulum() {
    const { originX, originY, bob1X, bob1Y, bob2X, bob2Y } = state;

    // Rod 1
    ctxB.beginPath();
    ctxB.moveTo(originX, originY);
    ctxB.lineTo(bob1X, bob1Y);
    ctxB.strokeStyle = '#404060';
    ctxB.lineWidth = 2;
    ctxB.stroke();

    // Rod 2
    ctxB.beginPath();
    ctxB.moveTo(bob1X, bob1Y);
    ctxB.lineTo(bob2X, bob2Y);
    ctxB.strokeStyle = '#404060';
    ctxB.lineWidth = 2;
    ctxB.stroke();

    // Bob 1
    ctxB.beginPath();
    ctxB.arc(bob1X, bob1Y, 6, 0, Math.PI * 2);
    ctxB.fillStyle = '#6080c0';
    ctxB.fill();

    // Bob 2 (the "artist")
    ctxB.beginPath();
    ctxB.arc(bob2X, bob2Y, 8, 0, Math.PI * 2);
    ctxB.fillStyle = '#00d4ff';
    ctxB.fill();

    // Pivot
    ctxB.beginPath();
    ctxB.arc(originX, originY, 4, 0, Math.PI * 2);
    ctxB.fillStyle = '#ffffff';
    ctxB.fill();
}

function draw() {
    // Layer A: redraw the full trail (old trail points are overwritten)
    ctxA.clearRect(0, 0, cw, ch);
    drawTrail(state.trail1, '#6080c0');
    drawTrail(state.trail2, '#00d4ff');

    // Layer B: fresh pendulum every frame
    ctxB.clearRect(0, 0, cw, ch);
    drawPendulum();
}

// --- Animation loop ---------------------------------------------

function animate() {
    stepPhysics();
    draw();
    requestAnimationFrame(animate);
}

// --- Bootstrap --------------------------------------------------

resizeCanvas();
animate();
