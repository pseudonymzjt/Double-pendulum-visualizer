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
1.  **Dynamic Velocity-Based Color**: Adjust the trajectory line width or color intensity based on the speed of the second bob (e.g., brighter and thinner when fast, deeper and thicker when slow).
2.  **Slow-Motion Mode**: Add a subtle toggle for a 0.5x speed simulation to allow users to appreciate the high-velocity chaotic transitions.
3.  **Export Artwork**: Add a "Save Artwork" button that merges both canvas layers and downloads a high-resolution PNG image of the generated chaotic trajectory.

### Acceptance Criteria
*   The generated trajectory has artistic depth (variation in line weight and glow).
*   Users can download their unique chaotic patterns with a single click.
