# Optimized Project Plan: Chaotic Art - Double Pendulum Visualizer

## Project Objective
Build a high-performance, minimalist HTML5 Canvas web application focusing on the **aesthetic flow and chaotic divergence** of a double pendulum. 

### Core Tech Stack
*   Vanilla HTML5, CSS3, JavaScript (ES6+).
*   No external libraries, no frameworks.
*   **Dual-Layer Canvas Architecture** (One for rendering persistent fading trajectories, one for real-time pendulum rendering).

---

## Phase 1 — Physics & High-DPI Foundation

### Tasks
1.  **High-DPI Canvas Setup**: Implement proper canvas resizing that respects `window.devicePixelRatio` to ensure razor-sharp rendering on all screens.
2.  **RK4 Integrator**: Implement the Runge-Kutta 4th Order (RK4) method for double pendulum physics equations. Avoid Euler integration to prevent artificial energy gain and simulation explosion.
3.  **Basic Animation Loop**: Create a `requestAnimationFrame` loop, separating physics updates (fixed delta time) from rendering.

### Acceptance Criteria
*   The double pendulum swings naturally without losing or gaining energy unrealistically over 2 minutes.
*   Lines and circles are sharp on Retina displays.

---

## Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics

### Tasks
1.  **Dual-Canvas System**: Create two overlapping `<canvas>` elements:
    *   *Layer A (Bottom)*: Trajectory canvas. Redrawn every frame with batched line segments.
    *   *Layer B (Top)*: Pendulum canvas. Cleared and redrawn completely every frame.
2.  **Trajectory Rendering (Fading Line Segments)**:
    *   Store a capped coordinate buffer (`TRAIL_LENGTH = 1200` points per bob).
    *   Each frame, redraw the full trail on Layer A as connected line segments grouped into `TRAIL_BATCHES = 80` opacity levels. Older batches are more transparent (`α ≈ 0.02`), newer batches are bright (`α ≈ 0.90`).
    *   Both bobs leave trails in their respective bob colors.
    *   Layer A is `clearRect`'d before each redraw so old trail pixels don't accumulate — no blurry afterimage.
3.  **Visual Styling**: Use a sleek dark theme (e.g., deep charcoal background `#0a0a0f`, glowing neon blue/cyan `#00d4ff` for the tip trajectory, muted blue `#6080c0` for the upper bob trajectory).

### Acceptance Criteria
*   The trajectory leaves a beautiful, smooth, fading tail.
*   The pendulum itself remains crisp and solid (not faded) as it moves over the trajectory.
*   FPS remains at a stable 60fps even after 5 minutes of continuous running.

---

## Phase 3 — Chaos Mode & State Architecture

*Optimization Note: Building Chaos Mode early is easier than refactoring a single-pendulum state into a dual-pendulum state later.*

### Tasks
1.  **Dual-Pendulum Physics Engine**: Refactor state manager from a single `state` object into a `pendulums[]` array. Each pendulum carries its own angles, velocities, pixel positions, and trail arrays. A `createPendulum()` factory initialises new copies.
2.  **Chaos Mode Toggle** (keyboard: `C`):
    *   **Single Mode** (default): Only Pendulum A is simulated (blue/cyan).
    *   **Chaos Mode**: Pendulum B is spawned at Pendulum A's **current** angles + 0.01° (≈ 0.000175 rad), inheriting A's existing trail arrays so both trajectories appear to start from the same origin and visibly split at the toggle point.
3.  **Trajectory Interaction**:
    *   Pendulum A: bob1 `#6080c0`, bob2 `#00d4ff` (blue/cyan).
    *   Pendulum B: bob1 `#c060a0`, bob2 `#ff60c0` (magenta/pink).
    *   Rods subtly differentiated (`#404060` for A, `#604060` for B).
    *   Both pendulums share the same pivot point. Pendulum B is drawn on top when active.

### Acceptance Criteria
*   Two pendulums can run simultaneously without performance degradation.
*   The exact divergence point is clearly visible and aesthetically pleasing.

---

## Phase 4 — Minimalist Controls & Direct Manipulation

### Tasks
1.  **Direct Drag-to-Set (No Sliders)**:
    *   When paused, click and drag either bob on Pendulum A to freely set θ₁ and θ₂. Angles snap to the cursor via `atan2`; velocities are zeroed on release.
    *   Hover cursor changes to `grab` when near a bob; `grabbing` while dragging.
    *   Touch support for mobile via touchstart/touchmove/touchend.
2.  **Minimal Overlay Controls**: Semi-transparent pill bar centered at the bottom with four clickable text buttons:
    *   **⏸ Pause / ▶ Play** (Spacebar shortcut)
    *   **↺ Reset** (R key shortcut)
    *   **⚡ Chaos / ⚡ Single** (C key shortcut)
    *   **✕ Clear Trail** (clears all trail arrays without affecting pendulum state)
    *   Buttons are styled as bare text (`rgba(255,255,255,0.35)`) with hover brightening. The bar has `backdrop-filter: blur(4px)` for a frosted-glass effect.

### Acceptance Criteria
*   Users can intuitively set the starting state by dragging the bobs on the canvas.
*   The UI occupies less than 10% of the screen space, keeping the visual focus on the canvas.

---

## Phase 5 — Visual Polish & Export

### Tasks
1.  **Dynamic Velocity-Based Line Width**: bob2 trail line width varies continuously with speed — fast = thin (0.8 px), slow = thick (3.0 px). Speed is stored per trail point as `{x, y, s}` where `s` = pixel-distance from previous frame. `drawTrail()` averages speed per batch and maps to `lineWidth`.
2.  **Slow-Motion Mode**: Toggle button `⏱ ½× Slow` / `⏱ 1× Speed`. Halves the physics dt from `1/60` to `1/120` when active, effectively running the simulation at 0.5× speed. The animation loop and rendering remain at 60 fps.
3.  **Export Artwork**: `⬇ Save` button merges Layer A (trails) + Layer B (pendulum) onto a temporary canvas at native HiDPI resolution and triggers a download via `<a download>` + `toDataURL('image/png')`.

### Acceptance Criteria
*   The generated trajectory has artistic depth (variation in line weight and glow).
*   Users can download their unique chaotic patterns with a single click.

---

## Stage 6 — Multi-Pendulum Sandbox & Customization

### Objective
Empower users to spawn, select, and customize multiple independent double pendulums on the same canvas.

### Tasks
1. **Interactive Spawner**: `+` button in the controls bar spawns a new pendulum at default angles with the next color from an 8-color palette (mint, gold, purple, coral, sky, orange, plus reused blue/cyan and magenta/pink).
2. **Direct Selection & Focus**: Click any pendulum's bob while paused to select it. A faint white ring highlights the selected bobs. Drag adjusts that pendulum's angles while others stay locked. Click empty space to deselect.
3. **Color & Customization**: A contextual menu floating above the controls bar appears when a pendulum is selected, with three buttons: 🎨 cycle to next palette color, 👁 toggle visibility, 🗑 delete (last pendulum cannot be deleted).
4. **N Trajectory Rendering**: The render loop already iterates over all pendulums — no changes were needed. Hidden pendulums skip both physics and rendering.

### Implementation Notes
- `selectedPendulum` index replaces the old hardcoded `pendulums[0]` in drag handlers.
- `hitTestBob()` checks all pendulums (reverse order for topmost priority) to find which bob was clicked.
- Palette index is stored as `_paletteIdx` on each pendulum; rod color is derived from it (index 0 → blue-grey, others → warm grey).

### Acceptance Criteria
* ✅ Users can spawn ≥5 pendulums (palette has 8 colors, no limit enforced).
* ✅ Clicking a bob selects that pendulum; dragging adjusts its angles.
* ✅ Contextual menu allows color cycling, visibility toggle, and deletion.

---

## Interface Refinement — Angle Display & Snap-to-Angle

### Angle Display
A live readout `θ₁ xx.x°  θ₂ xx.x°` is shown at the top-center of the screen. It tracks the **selected** pendulum's current angles (or Pendulum A if nothing is selected). Updates every frame.

### Snap-to-Angle (Absorbing Effect)
When dragging a bob while paused, the angle snaps to the nearest multiple of 15° if within 5° of one. This mimics the magnetic alignment found in GeoGebra and 3D modeling tools, helping users set precise angles without effort.

- `SNAP_DEG = 15` — snap grid spacing
- `SNAP_THRESHOLD = 5` — degrees within which snap activates
- Applied to both bob1 and bob2, both mouse and touch drag

---

## Stage 7 — N-Link Pendulum Extension (Multi-Bob Chains)

### Objective
Replace RK4 angle-based physics with Verlet integration + distance constraints, allowing any pendulum to have N links (rods + bobs) through dynamic joint add/remove.

### Tasks
1. **Verlet Physics Engine**: Each pendulum stores an array of `particles` (with current and previous position for implicit velocity) and `constraints` (pairwise distance constraints). Each frame:
   * Apply gravity to all particles (except the fixed pivot).
   * Run the constraint solver (`CONSTRAINT_ITERS = 10` iterations) to enforce rod lengths.
   * Pin the pivot particle to `PIVOT`.
2. **Dynamic Joint Modifier**: Selected pendulums get `➕` and `➖` buttons in the contextual menu. `➕` extends the chain by one link (direction = last segment direction, length = last link length × `LINK_SCALE = 0.85`). `➖` removes the outermost link (minimum 2 links).
3. **Multi-Joint Drag**: `hitTestBob()` checks all particles in the chain (reverse order, tip first). Dragging a particle pins it to the cursor while the constraint solver adjusts the rest of the chain in real-time.
4. **Aesthetic Scaling**: Each new link is `LINK_SCALE = 0.85` times the previous link's length. Bob radii scale similarly (`r * LINK_SCALE^(i-1)`), so deeper bobs are smaller. The outermost bob retains `color2`; inner bobs use `color1`.

### Implementation Notes
- `buildChain(nLinks, thetaDeg)` constructs particles and constraints from scratch for a given angle. Used on reset, resize, and initial creation.
- `syncBobPositions(p)` copies the first and last particle positions into `bob1X/Y` and `bob2X/Y` for backward compatibility with selection rings and angle display.
- Per-particle `trails[i]` arrays track every bob's path. Trail length scales with depth: `limit = TRAIL_LENGTH × (0.15 + 0.85 × i/(N-1))`. The tip gets the full length, inner bobs get progressively shorter trails.
- `VERLET_G_SCALE = 8` compensates for Verlet's inherently small per-step displacements, matching RK4-era swing speed.
- The `rebuildChain` function is used by `resetSimulation` to restore the default shape at `DEFAULT_ANGLE_DEG = 135°`.

### Backward Compatibility
- Existing Stage 6 features (multi-pendulum array, selection, visibility, color cycling, deletion) carry over unchanged.
- Chaos mode still spawns Pendulum B at a microscopic 0.3 px perpendicular offset from Pendulum A.
- Slow-motion, save artwork, clear trails all work as before.
- The angle display now shows N entries (`θ₁`, `θ₂`, … `θₙ`) for N-link pendulums.

### Acceptance Criteria
* ✅ Users can add links up to N=5 without visible jitter or explosion.
* ✅ Verlet constraints remain stable — 4 sub-steps × 10 iterations = 40 constraint solves/frame.
* ✅ All particles leave trails; inner trails are shorter and dimmer than the tip's trail.
