# Design Record — Phase 1

## Project
**Chaotic Art — Double Pendulum Visualizer**  
A high-performance, minimalist HTML5 Canvas web application focused on the aesthetic flow and chaotic divergence of a double pendulum.

## Architecture

### Files
| File | Purpose |
|---|---|
| `index.html` | Minimal HTML shell with HiDPI viewport meta |
| `style.css` | Full-viewport dark theme (`#0a0a0f`), no scrollbars |
| `script.js` | Physics engine, canvas setup, rendering, animation loop |
| `Plan.md` | Original project plan with all 5 phases |

### Physics (RK4 Integrator)
- **Consistent units**: Simulation uses `L = 1.5 m`, `g = 9.81 m/s²`, `m = 10 kg`. A `pxPerUnit` scale factor converts to canvas pixels, computed on resize.
- **RK4 with 4 sub-steps** (`h = 1/240 s`) prevents energy drift — critical for chaotic systems where Euler integration would explode.
- **Fixed timestep** (`dt = 1/60`) keeps physics speed independent of frame rate.

The double pendulum equations follow the standard formulation (derivatives in `derivatives()`), with the RK4 step implemented in `rk4Step()`.

### Canvas & HiDPI
- `canvas.width/height = CSS dimensions × devicePixelRatio`
- `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)` keeps all drawing in CSS-pixel coordinates
- Resize listener recomputes scale, pivot position, and bob positions

### Pendulum state
Stored in a single `state` object:
- Angular positions + velocities (physics)
- Pixel positions (computed from angles × scale)
- Two trail arrays (one per bob, capped at 1200 points each)

## Phase 1 Refinements (retrospective)
- Moved from semi-transparent overlay fade (which caused afterimages of pendulum structure) to batched-line trails with gradient opacity
- Added bob 1 trail matching its own color

---

# Design Record — Phase 2

## Approach
The original plan suggested "accumulative fading" via a semi-transparent overlay on the trail canvas. During Phase 1 development, the user preferred **line segments that gradually go vague** rather than a blurry afterimage glow. Phase 2 adapts this preference into the dual-layer architecture.

## Dual-Layer Canvas Architecture

### Layer A (bottom) — Trail Canvas (`#canvas-a`)
- **Purpose**: Displays fading trajectory trails for both bobs.
- **Render strategy**: Each frame, `clearRect` the entire layer, then redraw all stored trail points as connected line segments grouped into 80 opacity batches. Oldest segments at `α ≈ 0.02`, newest at `α ≈ 0.90`.
- **Why clear + full redraw instead of accumulative overlay**: Prevents any ghosting/blur. Each frame is a clean render of the known trail data.
- **Canvas element visibility**: Transparent background — the body's `#0a0a0f` shows through unpainted areas.

### Layer B (top) — Pendulum Canvas (`#canvas-b`)
- **Purpose**: Displays the pendulum rods, bobs, and pivot.
- **Render strategy**: `clearRect` every frame, then draw all pendulum elements at full opacity.
- **Stacking**: `z-index: 1` puts this above Layer A.

### Why dual-layer?
1. **Separation of concerns**: Trail rendering (expensive, data-driven) is isolated from pendulum rendering (cheap, geometric).
2. **Future-proofing**: Chaos Mode (Phase 3) will add a second pendulum — its trails stack cleanly on Layer A. Export/Save Artwork (Phase 5) can merge both layers. Controls overlay (Phase 4) can go on a third layer.
3. **Performance**: Trail rendering doesn't interfere with pendulum rendering. Each layer has its own simplified compositing.

## Key Decision: Why Not Accumulative Overlay?
The original Phase 2 plan called for `rgba(0,0,0,0.02)` overlay on the trail layer. The user explicitly rejected this visual (afterimage/blur) in favor of **clear line segments with gradient opacity**. The batched-opacity approach delivers:
- **Sharp lines**: Each segment is a crisp 1.5px stroke.
- **Controlled fade**: Opacity is deterministic — exactly linear from tail to tip.
- **No ghosting**: Because the trail canvas is fully cleared and redrawn, there's zero accumulation of stale pixels.

## Acceptance Criteria Status
- ✅ **Smooth fading tail**: Lines transition from near-invisible to bright over ~1200 points.
- ✅ **Crisp pendulum**: On its own cleared layer — no afterimages.
- ✅ **60fps stable**: Two layers of canvas with simple compositing — no performance concern even after extended runs.

---

# Design Record — Phase 3

## Approach
Refactored from a single `state` object to a `pendulums[]` array so Pendulum B can be spawned on demand with a microscopic angular offset, demonstrating chaotic divergence.

## Architecture Changes

### From single state → array of pendulums
```
Before:  const state = { theta1, theta2, omega1, omega2, bob1X, …, trail1, trail2 }
After:   const pendulums = [ { theta1, …, trail1, trail2, color1, color2 }, … ]
```
- Shared quantities (pivot point `PIVOT`, `pxPerUnit`) live outside the array.
- `createPendulum(theta1, theta2, color1, color2, copyTrailsFrom?)` is the factory.
- The `copyTrailsFrom` parameter lets Pendulum B inherit Pendulum A's trail history so both trajectories appear to branch from the same origin.

### How chaos mode works
1. **Toggle (`C` key)**: `toggleChaos()` adds or removes the second pendulum.
2. **Spawning**: Pendulum B reads Pendulum A's current angles, adds `CHAOS_OFFSET` (0.01° ≈ 0.000175 rad), and copies A's trail arrays.
3. **Physics loop**: `stepPhysics` iterates `pendulums` with the same RK4 sub-steps — no divergence in numerical treatment, only in initial conditions.
4. **Rendering loop**: `draw()` iterates `pendulums` for both trails (Layer A) and pendulum bodies (Layer B). Pendulum B is drawn on top of A on Layer B.

### Color scheme
| Element | Pendulum A | Pendulum B |
|---|---|---|
| Bob 1 (upper) | `#6080c0` blue | `#c060a0` magenta |
| Bob 2 (lower / artist) | `#00d4ff` cyan | `#ff60c0` pink |
| Rods | `#404060` | `#604060` |

### Why spawn at current angles instead of initial angles
The plan originally said "Pendulum B is spawned at 120° + 0.01° relative to Pendulum A's **initial** angles." Spawning at the **current** angles gives a better demo:
1. The user can toggle chaos at any point and see immediate divergence.
2. The trails visibly split at the toggle point (Pendulum B inherits A's trails, then they diverge).
3. Demonstrates that chaos is omnipresent — any initial difference, at any time, explodes.

## Acceptance Criteria Status
- ✅ **Two pendulums without performance degradation**: 4 trails × 1200 points = 4800 points, 160 batch draw calls, 2 pendulum draw calls — well within 60fps budget.
- ✅ **Divergence point visible**: Pendulum B inherits A's trails → both start at the same origin, then drawTrail separately → the cyan and magenta lines visibly split.

---

# Design Record — Controls (Play/Pause & Reset)

These were added ad-hoc between Phase 3 and Phase 4 as the user identified the need for simulation control before the full UI overlay.

## Play / Pause (Space)
- **Pause** freezes the simulation completely: all angles, angular velocities, and trail buffers are preserved in place.
- The animation loop continues running but `stepPhysics()` is skipped when `paused = true`.
- Rendering continues, showing the frozen pendulum and all accumulated trails.
- Unpause resumes physics from the exact saved state — no momentum loss, no jump.

## Reset (R)
- Resets Pendulum A to its initial angles (θ₁ = θ₂ = 0.75π, ω₁ = ω₂ = 0).
- Clears Pendulum A's trail arrays → trail canvas redraws empty next frame.
- If chaos mode is active, Pendulum B is removed and `chaosMode` set to `false`.
- Pause state is **not** changed by reset — user can reset while paused to set up a drag.

## Unified Caption
A single `updateCaption()` function drives the on-screen text, keeping it DRY:

```
[Space] Pause  ·  [R] Reset  ·  [C] Chaos
```

Labels update dynamically when toggled: Pause ↔ Play, Chaos ↔ Single.

---

# Design Record — Phase 4

## Approach
Phase 4 adds two major pieces: **clickable overlay buttons** (replacing the plain-text caption) and **drag-to-set** for intuitive initial-condition manipulation.

## Overlay Controls

### Design
- A semi-transparent pill bar centered at the bottom: `background: rgba(10,10,15,0.6)`, `border-radius: 20px`, `backdrop-filter: blur(4px)`.
- Four `<button>` elements laid out in a flex row with `gap: 12px`.
- Text buttons start at `rgba(255,255,255,0.35)` and brighten to `0.7` on hover.
- The buttons are interactive HTML elements (not canvas-drawn), so they're accessible and follow platform conventions.

### Why replace the plain-text caption with buttons?
The user wanted "just a line of words" initially. For Phase 4, the plan explicitly calls for clickable controls. Buttons are more discoverable than keyboard shortcuts — a new user sees "⏸ Pause" and knows what to click. Keyboard shortcuts (Space, R, C) continue to work for power users.

### Clear Trail
`clearTrails()` empties the trail arrays of all active pendulums. Since the trail canvas is `clearRect`'d and fully redrawn from scratch each frame, emptying the arrays is sufficient — the next frame naturally shows empty trails. This is separate from Reset: the pendulum keeps its current position and velocity.

## Drag-to-Set

### How it works
1. User presses Space (or clicks ⏸ Pause) to freeze the simulation.
2. User hovers over a bob → cursor changes to `grab`.
3. User clicks on a bob → cursor changes to `grabbing`, drag begins.
4. User moves the mouse → the bob follows the cursor, constrained to its rod length.
   - **Dragging bob1**: `θ₁ = atan2(mouseX - PIVOT.x, mouseY - PIVOT.y)`
   - **Dragging bob2**: `θ₂ = atan2(mouseX - bob1X, mouseY - bob1Y)`
5. Both angular velocities are set to 0 during drag (static initial condition).
6. User releases → bob stays at new angle.

### Why `atan2(dx, dy)`?
In canvas coordinates, `y` increases downward and the pendulum's rest position (θ=0) is straight down. `atan2(dx, dy)` returns 0 when the cursor is directly below the reference point, positive when to the right, and negative when to the left — matching the pendulum's angle convention exactly.

### Touch support
`touchstart`/`touchmove`/`touchend` handlers mirror the mouse logic exactly, with `passive: true` since full-viewport canvas has no scroll interference.

### Chaos mode interaction
Dragging only affects **Pendulum A**. Pendulum B keeps its own state. If the user toggles chaos mode off and on after dragging, Pendulum B is re-spawned at A's new angles + offset — giving a fresh divergence from the drag point.

## Acceptance Criteria Status
- ✅ **Set state by dragging**: Works when paused. Bobs snap to cursor. Velocities zeroed.
- ✅ **UI < 10% screen**: A slim pill bar at the bottom. Controls are ~35px tall, far less than 10% of viewport.

---

# Design Record — Phase 5

## Approach
Implemented all three Phase 5 features with minimal code changes, reusing existing infrastructure wherever possible.

## Velocity-Based Line Width

### How it works
- Each `trail2` point now stores `{x, y, s}` where `s` = pixel-distance moved since the previous frame (a proxy for instantaneous speed).
- In `drawTrail`, when `velocityStyle = true`, each batch's average `s` is computed and mapped to `lineWidth`:
  - `avg = 0` (stationary) → `lineW = 3.0` (thick, deep)
  - `avg ≥ 150` (fast) → `lineW = 0.8` (thin, bright)
  - Linear interpolation between these extremes.
- bob1's trail (`trail1`) does **not** get velocity styling — the plan specifically mentions "the speed of the second bob."

### Why pixel-distance instead of angular velocity?
`Math.hypot(Δx, Δy)` is already available from the position computation, adds zero overhead, and directly measures visual speed on screen. Using angular velocity would require an additional formula and wouldn't account for the geometry-dependent lever-arm amplification.

## Slow-Motion Mode

### Implementation
- A single boolean `slowMo` toggles the physics dt between `1/60` and `1/120`.
- The rendering loop remains at 60 fps via `requestAnimationFrame`.
- When toggled on, the pendulum appears to move at half speed, letting the viewer track intricate chaotic motion.
- No sub-step parameter changes — `SUB_STEPS = 4` stays constant, so each sub-step is `dt / 4 / 4 = dt/16` in slow-mo vs `dt/4 = 1/240` in normal. The smaller sub-step in slow-mo actually improves energy conservation.

## Export Artwork

### Implementation
A 10-line function that:
1. Creates an off-screen `<canvas>` at the same HiDPI resolution as the display.
2. Draws `canvasA` (trails) then `canvasB` (pendulum) onto it — the order matches visual stacking.
3. Triggers a browser download via a temporary `<a>` element with `download="double-pendulum-art.png"` and `href` set to `canvas.toDataURL('image/png')`.

The exported image includes the full accumulated trajectory and the pendulum at the exact moment of export — a true snapshot of the artwork.

## Controls Bar Update
The pill bar now holds 6 buttons. `gap: 12px` and `font-size: 12px` kept the bar compact enough for desktop and tablet viewports.

## Acceptance Criteria Status
- ✅ **Artistic depth**: Trail thickness varies organically with pendulum speed.
- ✅ **Download**: Single-click saves a merged HiDPI PNG of both layers.

## All Phases Complete 🎉
1. ✅ Phase 1 — Physics & High-DPI Foundation
2. ✅ Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics
3. ✅ Phase 3 — Chaos Mode & State Architecture
4. ✅ Phase 4 — Minimalist Controls & Direct Manipulation
5. ✅ Phase 5 — Visual Polish & Export

---

# Stage 6 — Multi-Pendulum Sandbox & Customization

## Objective
Allow users to spawn, select, and customize multiple independent double pendulums, turning the visualizer into a collaborative canvas of chaotic paths.

## Design for Stage 7 Compatibility
Stage 7 switches from RK4 (2-link) to Verlet integration (N-link). Stage 6 must not assume 2-link rigidity:
- **Selection system**: Tracks `selectedPendulum` index — works for any pendulum shape.
- **Pendulum visibility**: `visible` flag is physics-agnostic.
- **Trail rendering**: Already iterates over all pendulums — extendable to N per pendulum.
- **Color palette**: Defined as an array — Stage 7 reuses it.

## Implementation Plan

### Data model additions
Each pendulum gains:
- `visible: true` — toggleable
- Internal index for palette color lookup

A new `selectedPendulum` variable tracks which pendulum is currently focused.

### Controls
- **`+` button** in the pill bar spawns a new pendulum with the next unused palette color.
- **Contextual menu** appears when a pendulum is selected (minimal icons).
- **Click-on-bob** selects a pendulum while paused.

### Expected Changes
- `script.js`: color palette array, selection state, add/delete/visibility functions, selection ring rendering, click detection.
- `index.html`: `+` button and contextual menu panel.
- `style.css`: contextual menu and selection ring styles.

## Acceptance Criteria
- ✅ Users can spawn ≥5 pendulums (palette has 8 colors, no limit enforced).
- ✅ Clicking a bob selects that pendulum; dragging adjusts its angles.
- ✅ Contextual menu allows color cycling, visibility toggle, and deletion.

---

# Interface Refinement — Angle Display & Snap-to-Angle

Added between Stage 6 and Stage 7 as a standalone improvement.

## Angle Display
A live readout at the top-center of the screen: `θ₁ xx.x°  θ₂ xx.x°`. Follows the selected pendulum (or Pendulum A if none selected). Updated every frame in `animate()`.

For N-link pendulums (Stage 7), the display dynamically shows N entries using subscript characters.

## Snap-to-Angle
When dragging a bob while paused, the angle snaps to the nearest multiple of 15° if within 5° of one. This mimics the magnetic alignment found in GeoGebra and 3D modeling tools.

- `SNAP_DEG = 15` — snap grid spacing
- `SNAP_THRESHOLD = 5` — activation window in degrees
- Applied to both bob1 and bob2, both mouse and touch drag — via the `snapAngle(rad)` wrapper

---

# Stage 7 — N-Link Pendulum with Verlet Integration

## Objective
Replace RK4 angle-based physics with Verlet integration + distance constraints, enabling dynamic N-link chains.

## Implementation

### Verlet Physics Engine
Each pendulum stores:
- `particles: [{x, y, px, py}, ...]` — positions and previous positions (implicit velocity via `v = x - px`)
- `constraints: [{a, b, len}, ...]` — pairwise distance constraints

Each frame:
1. Apply gravity to all particles except the fixed pivot (index 0): `y += vy + G * pxPerUnit * VERLET_G_SCALE * h²`
2. Run `max(10, constraints * 2)` iterations of the constraint solver to enforce rod lengths.
3. Pin the pivot to `PIVOT`.
4. Record trail points for every particle (one trail array per particle).

### What was removed
- `derivatives()` and `rk4Step()` — replaced by `verletStep()`.
- `computeBobPositions()` — replaced by `syncBobPositions()`.
- `theta1`, `theta2`, `omega1`, `omega2` — replaced by particle positions.
- Dual trail system (`trail1`/`trail2`) — replaced by per-particle `trails[]` array.

### What stayed
- `bob1X/Y` and `bob2X/Y` as backward-compat computed fields.
- All Stage 6 features (selection, visibility, color cycling, contextual menu, deletion).
- Chaos mode, slow-motion, save artwork, clear trails, angle display, snap-to-angle.
- Keyboard shortcuts, drag-to-set, touch support.

### Per-Particle Trails
Each particle has its own `trails[i]` array. Trail lengths scale with depth:
- **Particle 1** (first bob): ~180 points (3 s), drawn at fixed 1.5 px width using `color1`.
- **Middle particles**: progressively longer trails up to the tip.
- **Tip particle**: full 1200 points (20 s), velocity-based line width (0.8–3.0 px), drawn using `color2`.

Trail limit formula: `limit = TRAIL_LENGTH × (0.15 + 0.85 × i / (N-1))`

### Joint Modifiers
- `➕` extends the chain in the direction of the last segment, length = last link × 0.85. Adds one particle and one constraint. Pushes an empty trail array.
- `➖` removes the outermost link (minimum 2). Pops particle, constraint, and trail array.
- Buttons shown in the contextual menu when a pendulum is selected; `➖` hidden at MIN_LINKS.

### Aesthetic Scaling
Each new link is 85% of the previous link's length. Bob radii scale similarly: `r × LINK_SCALE^(i-1)`. Inner bobs use `color1`; the tip bob uses `color2`.

### Angle Display Update
For N-link pendulums, the display shows N entries: `θ₁ xx° θ₂ xx° … θₙ xx°`, computed from each segment's `atan2(dx, dy)`.

## Challenges & Fixes

1. **Gravity too weak**: Verlet gravity `G × pxPerUnit` gave ~0.022 px/substep displacement — pendulum appeared frozen. Fix: `VERLET_G_SCALE = 8` multiplies gravity to match RK4-era swing speed.

2. **Single trail lost inner bobs**: Only the tip left a trail; adding a joint made all inner bobs invisible in the trail. Fix: per-particle `trails[]` with length scaling by depth.

3. **Verlet ↔ angle model conversion**: Resize, reset need to reconstruct the chain given a target angle. `buildChain(nLinks, thetaDeg)` creates particles at the specified angle. `rebuildChain()` is used by `resetSimulation`.

4. **Chaos offset with Verlet**: The 0.01° angular offset is applied as a 0.3 px perpendicular displacement on the tip particle — tiny enough for butterfly-effect divergence.

5. **Backward compatibility**: `bob1X/Y` and `bob2X/Y` are synced from particles each frame via `syncBobPositions()`, keeping selection rings, hit testing, and angle display working without changes.

6. **Stale trails on joint change**: `addJoint` and `removeJoint` now push/pop the trails array, keeping trail count in sync with particle count. Trails are cleared on window resize.

## Acceptance Criteria
- ✅ Users can add links up to N=5 without visible jitter or explosion.
- ✅ Verlet constraints remain stable — 4 sub-steps × 10 iterations = 40 solves/frame.
- ✅ All particles leave trails; inner trails are shorter and dimmer than the tip's trail.

---

# Bugfix Round — Reset All Pendulums & Drag Stability

## Bug 1: Reset only touched pendulums[0]

`resetSimulation()` iterated only over `pendulums[0]`, leaving any extra pendulums (added via `+`) at their current angles with trails untouched.

**Fix**: Changed `resetSimulation()` to loop over every pendulum in the array, rebuilding each chain at `DEFAULT_ANGLE_DEG (135°)`, syncing bob positions, and clearing all trail arrays. Chaos mode still removes Pendulum B and resets chaosMode to false.

## Bug 2: Dragging the tip moved the inner bob unpredictably

When dragging the tip particle, the Verlet constraint solver's 50/50 correction split pushed the inner bob around: constraint 0→1 moved particle 1 (only free end), then constraint 1→2 also moved particle 1 (only free end), causing it to drift from its pivot-aligned position. The user reported: *"when trying to adjust the position of the second ball, the first ball moves accordingly. It should not. If the first is moved, the second should be moved and that's correct."*

**Root cause**: The constraint solver treats all non-pinned particles equally, but during tip drag the inner bob becomes the sole degree of freedom absorbing corrections from both adjacent constraints — giving it double the displacement.

**Fix**: Two-pronged approach:

1. **Tip drag** (`partIdx === particles.length - 1`): Instead of running the constraint solver, rebuild the entire chain at the pivot-to-mouse angle via `rebuildChain()`. All segments are collinear — the whole chain rotates rigidly from the pivot. This completely prevents the inner bob from moving independently.

2. **Inner particle drag** (any other index): Pin the dragged particle to mouse and run the constraint solver, but **re-pin after every iteration**. This prevents the dragged particle from drifting during iteration while still allowing the rest of the chain to adjust naturally.

The snap-to-angle (`SNAP_DEG = 15`, `SNAP_THRESHOLD = 5`) is applied to the pivot-to-mouse angle during tip drag, preserving the magnetic-alignment feel.
