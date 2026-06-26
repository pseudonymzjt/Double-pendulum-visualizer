# Design Record — Phase 1

> **Language**: English · [中文](THOUGHTS_ZH.md)

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

## Bug 2: Dragging the tip should rotate around the inner ball, not the pivot

Initial attempt rebuilt the whole chain at the pivot-to-mouse angle (collinear rotation from pivot). The user rejected this: *"I mean when moving outer ball, I expect it can be moved on a circle with the centering point at the inner ball."*

**Root cause**: The constraint solver's 50/50 correction split moved the inner bob because it was the only free end absorbing corrections from both adjacent constraints. But even the pivot-rotation fix was wrong — the tip should swing around its parent (inner bob), keeping the parent fixed.

**Final fix — circle-constraint drag**:

When dragging **any** particle:

1. **Constrain to parent's circle**: Compute the angle from the parent particle (partIdx − 1) to the mouse. Snap it (`snapAngle`). Place the dragged particle at `rodLen` from the parent in that direction. The parent stays completely fixed — only this segment's angle changes.

2. **Forward propagate**: For each constraint from `partIdx` through the tip, position each child particle at exactly `constraint.len` from its parent, preserving the direction. This keeps all downstream links intact without moving any particle upstream of the drag point.

This approach works for any particle in an N-link chain and naturally handles snap-to-angle on the segment being adjusted.

---

# Feature — All-Pendulums Angle Display

## Requirement
The user wanted to see every pendulum's angles simultaneously, not just the selected one's. Previously `updateAngleDisplay()` showed only one pendulum (selected or first) centered at the top of the screen.

## Implementation

### Display
- Moved the `#angle-display` element from `top: 14px; left: 50%; transform: translateX(-50%)` to `top: 14px; left: 14px` (top-left corner).
- Added a frosted-glass background (`rgba(10,10,15,0.4)` + `backdrop-filter: blur(4px)`) with rounded corners and padding, making it a discrete sidebar panel rather than floating text.
- Each visible pendulum gets one line: a colored marker (`▸` for selected, `●` for others) in the pendulum's `color2`, followed by all segment angles (`θ₁ xx.x°  θ₂ xx.x° …`).
- `max-height: calc(100vh - 100px)` with `overflow-y: auto` prevents overflow when many pendulums are on screen.

### Performance
`innerHTML` is set every frame (60 fps) with small HTML fragments (~100-200 bytes). This is fast enough — no layout thrashing since the element has `pointer-events: none` and uses `backdrop-filter` (GPU-composited).

### Edge cases
- Hidden pendulums (`visible: false`) are skipped.
- Pendulums with fewer than 2 particles are skipped.
- Empty state: `pendulums.length === 0` clears the display.
- Angles normalized to [0°, 360°) via `((deg % 360) + 360) % 360` — prevents accumulated wraps from showing huge values like 1080° after many rotations.

---

# Stage 8 — Exact Lagrangian RK4 Physics Engine

## Motivation

The user reported: *"The double pendulum trajectory looks so regular and lacks chaotic movements, even at initial high angle."* — and asked specifically whether small-angle approximations or excessive damping were present.

## Root Cause

The Stage 7 Verlet + constraint-solver approach had **severe numerical damping**:

1. **40 constraint corrections per frame**: 4 sub-steps × 10 constraint iterations = 40 position adjustments per frame, each applying 50/50 correction splits. This acts as implicit damping — the repeated corrections bleed kinetic energy each frame.

2. **No non-linear coupling**: Verlet treats each particle independently (gravity + distance constraints). There are no terms encoding the Coriolis-like coupling between the two arms (`ω₁² sin(θ₁-θ₂)`, etc.). Without these terms, the sensitive dependence on initial conditions that drives chaos is absent.

3. **Uniform 50/50 split**: The constraint solver distributes corrections evenly between both particles of each constraint. For a chain pendulum, this means the inner bob absorbs half the correction from BOTH adjacent constraints each iteration — effectively doubling its "friction."

The result: the pendulum swung like a damped oscillator, settling into quasi-periodic motion rather than exhibiting true chaotic divergence.

## Solution: Lagrangian Mechanics + RK4

### Exact equations of motion

The double pendulum Lagrangian (equal masses m at rod ends, lengths l₁, l₂, angles θ₁, θ₂ from downward vertical):

```
L = T - V
  = ½m[2l₁²ω₁² + l₂²ω₂² + 2l₁l₂ω₁ω₂ cos(θ₁-θ₂)]
    + mg[2l₁ cos θ₁ + l₂ cos θ₂]
```

Applying Euler-Lagrange yields a **2×2 linear system** for angular accelerations:

```
2 l₁ α₁  +  l₂ cos(Δ) α₂  =  -2g sin θ₁  -  l₂ ω₂² sin(Δ)
 l₁ cos(Δ) α₁  +  l₂ α₂  =  -g sin θ₂   +  l₁ ω₁² sin(Δ)
```

where Δ = θ₁ − θ₂.

This is solved directly (Cramer's rule) — **no small-angle approximations**, full trigonometric coupling preserved. Key terms:

- `sin(Δ)` coupling amplifies divergence when arms are not aligned
- `ω₁² l₁ sin(Δ)` and `ω₂² l₂ sin(Δ)` — Coriolis-like terms create the sensitive dependence
- `cos²(Δ)` in denominator → non-linear resonance at certain arm configurations
- Determinant = `l₁ l₂ (2 − cos²(Δ)) ≥ l₁ l₂ > 0` — never zero, no singularities

### RK4 Integration

4 sub-steps per frame (h = 1/240 s), integrating the 4-D state (θ₁, θ₂, ω₁, ω₂). The RK4 method's 4th-order accuracy preserves energy over time — no artificial damping from the integrator itself.

### Architecture changes

| Before (Verlet) | After (Lagrangian RK4) |
|---|---|
| `particles[]` with `{x, y, px, py}` (implicit velocity) | `particles[]` with `{x, y}` only |
| `constraints[]` used for physics (distance solving) | `constraints[]` used for length storage only |
| `verletStep()` — 40 constraint iterations/frame | `derivatives()` + `rk4Step()` — exact 2×2 solve |
| `VERLET_G_SCALE = 8` to fake swing speed | `G = 9.81` used directly (correct physics) |
| `CONSTRAINT_ITERS = 10` | Removed entirely |
| N-link via independent particle chains | N-link via proportional interpolation along rod 2 |

### N-link handling

For N > 2, the initial implementation placed intermediate particles **proportionally along rod 2** (collinear with the θ₂ direction), with a 2×2 Lagrangian solver that only had 2 degrees of freedom. This caused the **3rd bob to be locked rigid to the 2nd bob** — they shared the same θ₂ with no independent bending at the joint. Reported as: *"the last two bobs are completely locked together and act like a single rigid body."*

**Fix**: Replaced the hardcoded 2×2 solver with a general N-pendulum Lagrangian. The state stores arrays `thetas[]`, `omegas[]`, `ls[]`. `derivativesArray()` builds the N×N mass matrix:

```
Mᵢⱼ = lᵢ lⱼ (N−max(i,j)) cos(θᵢ−θⱼ)
bᵢ  = −Σⱼ≠ᵢ Aᵢⱼ sin(θᵢ−θⱼ) ωⱼ² − g lᵢ (N−i) sin(θᵢ)
```

Solves `M·α = b` via Gaussian elimination with partial pivoting — works for any N. `computeParticlePositions` uses a simple forward loop: each link has its own independent angle. `dragParticle` sets `thetas[partIdx-1]`, correctly addressing the right link for any N.

### Right-click bug

Reported: *"when right-clicking on the screen, the bottom control icons (palette, plus button, etc.) disappear."*

Root cause: `canvasB`'s `mousedown` handler had no `e.button` check. A right-click (button 2) on empty space triggered `selectPendulum(null)`, which hid the contextual menu.

Fix: Added `if (e.button !== 0) return;` at the top of the handler so only left-click triggers selection/deselection. Also added `canvasB.addEventListener('contextmenu', (e) => e.preventDefault())` to suppress the browser's native right-click menu.

### Files changed

- **script.js**: ~80 lines of physics replaced with ~90 lines of Lagrangian RK4. Particle model simplified (removed `px`/`py`). `dragParticle`, `resetSimulation`, `toggleChaos`, `resizeCanvas`, `addJoint`, `removeJoint` all updated for angle-based model. Later expanded to general N×N solver (~170 lines). Right-click guard added.
- **style.css**: No changes.
- **index.html**: No changes.

---

# Phase 8 — Real-time Mathematical Analysis & Phase Plots

## Objective
Provide real-time mathematical insight into the chaotic system by plotting Phase Space Portraits and Energy Time-Series on-demand, using native Canvas 2D.

## Implementation

### Metrics Collection
- `computeEnergy()` calculates KE, PE, and totalE from the full Lagrangian:
  - **KE** = ½ Σᵢⱼ lᵢ lⱼ (N−max(i,j)) cos(θᵢ−θⱼ) ωᵢ ωⱼ — uses the same mass matrix as the physics engine
  - **PE** = −g Σᵢ (N−i) lᵢ cos(θᵢ)
  - **totalE** = KE + PE (conserved quantity)
- 300-point ring buffer stores rolling snapshots of θᵢ, ωᵢ, KE, PE, totalE
- Tracks the selected pendulum (or pendulums[0] if none selected)

### Plot Rendering
- Two native canvas plots inside a full-screen overlay
- **Phase Space Portrait**: θ₁ on X-axis vs ω₁ on Y-axis, rendered as a fading 48-batch line (old → dim, new → bright). Auto-scaling axes with zero lines and dashed grid.
- **Energy Time-Series**: Three solid lines (KE in coral `#ff6060`, PE in green `#30ff88`, totalE in white `#ffffff`) with a shared auto-scaled Y range and color-coded labels.
- Grid, zero axes, and axis labels drawn via native Canvas 2D API (no libraries).

### Panel
- Toggled via **M** key or `📊 Metrics [M]` button in controls bar
- Full-screen dark overlay (`rgba(10,10,15,0.94)`, `backdrop-filter: blur(6px)`)
- Two plots stacked vertically via flexbox, each taking ~half the available height
- When hidden, plot rendering is skipped entirely; metrics collection stops after clearing data

## Bugs Encountered & Fixes

### Bug 1: Energy plot showed no readings (blank canvas)

**Root cause** — two independent bugs:

1. **`(_, i) => i` index not passed**. `drawSolidLine` calls `getX(data[i])` with a single argument, but the getter `(_, i) => i` expects a second argument for the index. Without the second arg, `i` is `undefined` and `mapX(undefined, ...)` produces `NaN` for every X coordinate. The path never draws.

   ```
   Before:  const px = mapX(getX(data[i]), xMin, xMax, PLOT_W);
   After:   const px = mapX(getX(data[i], i), xMin, xMax, PLOT_W);
   ```

   Same fix applied to `drawFadingLine` (harmless there since the phase portrait getter `d => d.thetas[0]` ignores the extra arg).

2. **`const` assignment to `PLOT_W`/`PLOT_H`**. The original code declared `const PLOT_W = 290; const PLOT_H = 180;`. `setupPlotCanvas` needed to reassign them to the CSS-computed dimensions (`canvas.clientWidth`/`clientHeight`) for the full-screen layout. Changed to `let`.

### Bug 2: Total energy not conserved (341% "drift")

After the initial implementation, `totalE` fluctuated wildly from -29 to +113 — far from the flat line the acceptance criteria required.

**Root cause**: The potential energy formula used the y-down canvas convention (`PE = g Σ (N−i) lᵢ cos(θᵢ)`) but the physics engine's Lagrangian uses the y-up convention. In the equations of motion, the gravity term is `−g (N−i) lᵢ sin(θᵢ)` (cf. `derivativesArray` line 237), which matches the E-L equation only when `V = −g Σ (N−i) lᵢ cos(θᵢ)`.

**Fix**: Negated the PE formula:
```
Before:  PE =  g Σ (N−i) lᵢ cos(θᵢ)   →  totalE drifts
After:   PE = −g Σ (N−i) lᵢ cos(θᵢ)   →  totalE constant to 0.0000%
```

Verified: initialE = 29.6545, finalE = 29.6545, drift = -0.0000% over 300 steps.

### Bug 3: Side panel too small for readable plots

The initial right-side docked panel (290px wide) made the plots too small to interpret. The user requested full-screen instead.

**Fix**: Replaced the side-panel layout with a full-screen flexbox overlay. Plot canvases are sized by CSS (`flex: 1` inside a flex column), and JavaScript reads `canvas.clientWidth`/`clientHeight` each frame to set the actual canvas pixel dimensions at `devicePixelRatio` resolution. The plots now fill the available viewport area.

### Bug 4: M key not discoverable

The original implementation only bound the `M` key but had no visible hint.

**Fix**: Added `📊 Metrics [M]` button to the bottom controls bar, matching the convention of other operations (e.g., `⏸ Pause [Space]`, `⚡ Chaos [C]`). The button calls `toggleMetricsPanel()` on click, and the keyboard shortcut works independently.

## Acceptance Criteria Status
- ✅ Pressing `M` smoothly toggles the full-screen analysis overlay.
- ✅ Phase Space plot renders the attractor trail in real-time (fading 48-batch line).
- ✅ Energy plot shows KE (coral), PE (green), totalE (white) — totalE is perfectly flat.
- ✅ No external libraries — all grids, lines, labels via native Canvas 2D API.
- ✅ Panel hidden = no plot rendering; metrics cleared and collection stops.

### Bug 5: Global metrics array — ignores multiple pendulums & N-link

**Problem**: The metrics system used a single global `metricsData` array. 
- With multiple pendulums, switching selection or spawning a new pendulum caused stale/wrong data to appear in the plots (the array belonged to whichever pendulum happened to be `selectedPendulum` at collection time).
- The phase portrait title was hardcoded as `"Phase Space — θ₁ vs ω₁"` with no indication of which pendulum was being shown.

**Root cause**: `metricsData` was a standalone array pushed to by `collectMetrics()`, which only tracked one pendulum per frame:

```js
// OLD — single global buffer, tracks only one pendulum
let metricsData = [];
function collectMetrics() {
    const p = selectedPendulum ?? pendulums[0];
    if (!p || !p.visible) return;
    metricsData.push({ ... });  // ⟶ overwritten each frame for one pendulum
}
```

**Fix**: Each pendulum owns its own `metrics[]` array, initialized in `createPendulum()`. `collectMetrics()` now iterates **all** visible pendulums:

```js
// NEW — per-pendulum buffers
function collectMetrics() {
    for (const p of pendulums) {
        if (!p.visible) continue;
        p.metrics.push({ thetas, omegas, KE, PE, totalE });
        while (p.metrics.length > METRICS_CAPACITY) p.metrics.shift();
    }
}
```

A `getTrackedPendulum()` helper returns the selected pendulum (or `pendulums[0]`) for the plot renderers to consume. The phase portrait title updates dynamically each frame: `"Phase Space — Pendulum {id}  θ₁ vs ω₁"`.

### Acceptance Criteria (updated)
- ✅ Each pendulum accumulates its own 300-point metrics buffer independently.
- ✅ Plots always display the **selected** pendulum's data; switching selection at runtime works seamlessly.
- ✅ N-link (3, 4, 5+ balls): energy computation uses the general N-pendulum Lagrangian formulas (correct for any N), phase portrait shows θ₁ vs ω₁ of the tracked pendulum.
- ✅ Deletion of a pendulum removes its metrics; tracked pendulum falls back to `pendulums[0]` gracefully.
- ✅ Dynamic title updates with pendulum index each frame.

---

# Phase 8 Refinements — Brightness, Tick Labels, Legend, Click-to-Zoom

## Motivation

The initial full-screen overlay graphs were too dark to read, hid the pendulum animation, and lacked numeric scale — making them uninterpretable. The energy legend ("KE / PE / E_total") was oversized and visually cluttered.

## Layout: Full-screen → Floating Corner Panels

**Why the change matters**: The graphs are a *supplement* to the animation, not a replacement. Full-screen blocked the entire viewport; floating corner panels let the user watch both simultaneously.

Each plot now lives in an independent `plot-box`:
- **Phase Portrait**: anchored `left: 14px; bottom: 80px` (330×240 px)
- **Energy Plot**: anchored `right: 14px; bottom: 80px` (330×240 px)
- Panel backgrounds use `rgba(10,10,15,0.65)` so the pendulum motion is faintly visible through the panels.
- `pointer-events: none` on the panel container with `pointer-events: auto` on the boxes so clicks pass through empty space.

## Brightness Overhaul

| Element | Before | After |
|---|---|---|
| Grid lines | `rgba(255,255,255,0.06)` | `rgba(255,255,255,0.14)` |
| Zero axes | `0.12 alpha, 1.0px` | `0.35 alpha, 1.2px` |
| Phase portrait line | `1.2px, min α 0.07` | `1.5px core + 3.2px glow halo, min α 0.12` |
| Energy lines | `1.2px solid` | `1.8px core + 3.5px glow halo per series` |
| Plot border | none | `rgba(255,255,255,0.2)` stroke rect around each canvas |

Glow halos are drawn as separate passes: a wide (3.2–3.5 px) low-alpha stroke first, then a narrow (1.5–1.8 px) high-alpha stroke on top. This creates a neon-like visual depth without external CSS effects.

## Numeric Tick Labels

A `drawTickLabels()` function places 5 evenly spaced numeric marks along the X axis and 4 along the Y axis:

```
Phase portrait:  X → angle in degrees (formatter: `v.toFixed(0) + '°'`)
                 Y → angular velocity (formatter: `v.toFixed(2)`)
Energy plot:     X → step index
                 Y → energy in joules (formatter: `v.toFixed(2)`)
```

Axis names are drawn in bold at the origin point (bottom-left for X, top-left for Y). Tick values are positioned at `PLOT_H - 4` (X axis) and `PLOT_W - 6` (Y axis), with appropriate text alignment (`center` for X ticks, `right` for Y ticks).

## Energy Legend — Compact Colored Dots

Replaced the oversized bold text legend with small (6×6 px) colored squares + 8px labels:

```
■ KE    (coral #ff6060, y=18)
■ PE    (green #30ff88, y=30)
■ E     (white #ffffff, y=42)
```

Uses `fillRect` for the squares and tiny 8px `fillText` for the labels. The "E_total" was shortened to just "E" — the total-energy line is visually distinct (white, brightest), so no disambiguation needed.

## Click-to-Zoom

Left-clicking a plot canvas toggles between corner mode and full-screen:

- **State**: `zoomedPlotId` ∈ `{null, 'phase', 'energy'}`
- **CSS**: `#metrics-panel.zoom-phase .plot-box:nth-child(1)` fills 90% × 88% of viewport; the other plot gets `opacity: 0; pointer-events: none`
- Clicking the zoomed plot again (or clicking the other plot) restores corner mode.
- Zoom is reset when `toggleMetricsPanel()` hides the panel.
- Guard: clicks are ignored when the panel is hidden.

### Bug fix: stale title when no metrics data

The title was updated **after** the `if (p.metrics.length < 2) return;` check — so if the newly selected pendulum had no data yet, the title never refreshed and showed the previous pendulum's index.

**Fix**: Moved title update to the top of `renderPhasePortrait()`, before the data guard. The title always reflects `getTrackedPendulum()`.

---

# Phase 8 Refinements — Internal Padding & Tick Labels

## Motivation

The plotting area had zero internal margins, causing:
1. X-axis title (`θ₁(°)` / `step`) overlapping the coordinate numbers
2. Left-side text (axis labels, tick numbers) clipped by the canvas edge
3. Graph title and legend squeezed into the top-left corner, overlapping each other

Additionally, Y-axis labels showed ugly arbitrary decimals like `62.87` and `-53.21` because the default format used `.toFixed(2)`.

## Solution: `PLOT_MARGIN`

A margin object defines a buffer zone around the inner plot area:

```js
const PLOT_MARGIN = { left: 58, right: 58, top: 38, bottom: 40 };
```

The inner plot area is where data gets drawn:

```js
function innerW() { return PLOT_W - PLOT_MARGIN.left - PLOT_MARGIN.right; }
function innerH() { return PLOT_H - PLOT_MARGIN.top - PLOT_MARGIN.bottom; }
```

### Coordinate mapping

`mapX`/`mapY` were replaced by `pxX`/`pxY` which map data values to pixel positions within the inner plot area:

```
pxX(val, min, max) = PLOT_MARGIN.left + innerW() * (val - min) / (max - min)
pxY(val, min, max) = PLOT_MARGIN.top  + innerH() * (1 - (val - min) / (max - min))
```

If `min === max` (degenerate range), the coordinate is centered in the inner area.

### What each element draws where

| Element | Region | Detail |
|---|---|---|
| Grid lines | Inner area | `left…right`, `top…bottom` |
| Data lines | Inner area | Clipped to `left ± 2`, `right ± 2`, etc. |
| Tick marks | Just outside inner area | X ticks extend below `bottom`, Y ticks extend right of `right` |
| Tick labels | Margins | X labels: `y = bottom + 7`, Y labels: `x = right + 9` |
| Axis names | Margins | X axis name: bottom-right corner, Y axis name: above top margin |
| Plot border | Around inner area | `strokeRect(left, top, innerW, innerH)` |
| Legend (energy) | Top-left of inner area | Anchored at `(left + 6, top + 6)` |

### `textBaseline` and `textAlign` usage

Each label block sets both properties explicitly to avoid canvas state bleed:

- X tick labels: `textAlign: 'center'`, `textBaseline: 'top'`
- Y tick labels: `textAlign: 'left'`, `textBaseline: 'middle'`
- Axis names: `textAlign: 'left'`, `textBaseline: 'alphabetic'` / `'top'`

## Floating-Point Label Cleanup

- All Y-axis format strings changed from `.toFixed(2)` to `.toFixed(1)` (max 1 decimal place)
- Phase portrait ω₁: `123.5` instead of `123.45`
- Energy values: `29.7` instead of `29.65`
- Added `niceNum()` helper (not yet used for tick interval snapping, but available for future refinement)

---

# Phase 8 Refinements — Fixed 0°–360° Range & Clickable Pendulum Selector

## Constrain Phase Portrait X-axis to [0°, 360°]

Previously the phase portrait's X-axis auto-scaled to whatever θ₁ range appeared in the data (e.g., −200° to 500°). This made the plot zoom in/out as the angle drifted, hiding the attractor shape.

**Fix**: Normalise all θ₁ values into [0, 2π) before plotting:
```js
const norm = v => ((v % twoPi) + twoPi) % twoPi;
const X = data.map(d => norm(d.thetas[0]));
```
The X range is fixed to [0, 2π] (0°–360°). The ω₁=0 line is still drawn as a horizontal zero axis. The left edge serves as the θ₁=0 line, so no vertical zero axis is needed.

## Clickable Angle Display for Pendulum Selection

Previously, switching pendulums required pausing and clicking bobs on the canvas. This was awkward when the metrics panel was open (you had to close it, pause, click, re-open).

**Fix**: The angle display in the top-left corner now renders each pendulum as a clickable `<div>` with a `data-idx` attribute:
```html
<div class="pend-entry" data-idx="0" style="color:#00d4ff">
  <span class="marker">●</span> θ₁ 46.3°  θ₂ 80.6°
</div>
```
Clicking any pendulum entry calls `selectPendulum(idx)`, which updates the selection ring on the pendulum, shows the contextual menu, and switches which data the metrics plots display.

### CSS changes
- `pointer-events: none` removed from `#angle-display` → entries are now interactive
- `.pend-entry` gets `cursor: pointer`, rounded background on hover (`rgba(255,255,255,0.08)`)
- `.pend-entry.sel` gets a slightly brighter background (`rgba(255,255,255,0.1)`)
- `.marker` spans have a fixed 14px width for consistent alignment of `▸` vs `●`

### Bug fix: Spurious cross-graph line on phase portrait wrap

When θ₁ wrapped from ~359° back to ~1° (crossing the 0° boundary), the normalised data values were at opposite ends of the [0, 2π) range, creating a straight line across the entire graph.

**Fix**: `drawFadingLine` now detects consecutive X data values that jump by more than half the range (wrapThreshold = range × 0.5). When such a jump is detected, the current path is stroked and a new path begins at the current point — exactly like the out-of-bounds clipping logic. The halo and core passes each handle this independently.

### Bug fix: Angle-display click not reaching handler

The `.pend-entry` click handler used `document.getElementById('angle-display').addEventListener('click', ...)`. The plot-canvas `click` handlers call `e.stopPropagation()`, which could block the `click` event from reaching the document. Additionally, when zoomed, the plot box sits at z-index 10, intercepting pointer events meant for the angle display underneath.

**Fix**: Changed to document-level `pointerdown` delegation (a separate event type from `click`, not affected by `click` handlers' `stopPropagation()`):
```js
document.addEventListener('pointerdown', (e) => {
    const entry = e.target.closest('.pend-entry');
    if (!entry || !document.getElementById('angle-display').contains(entry)) return;
    // … select pendulum, flash background
});
```
Also adds a brief background flash (`rgba(255,255,255,0.18)` → removed on next frame) as visual confirmation that the click registered.

### Bug fix: Energy-plot X-axis static once buffer fills

Previously the energy plot used array index as X value (`(_, i) => i`) with `xRange.max = data.length - 1`. Once the 300-point ring buffer filled, `data.length` stayed at 300 forever, so the X-axis labels (0, 60, 120, 180, 240, 299) never changed — the user saw no indication that time was passing.

**Root cause**: Array index is not monotonically increasing for a ring buffer — it wraps.

**Fix**: Added a global `globalMetricsStep` counter that increments each time `collectMetrics()` runs (once per physics frame). Each metrics entry stores its step number. The energy plot now uses `d => d.step` as the X getter and derives the range from the first and last entries' step numbers:
```js
const xRange = { min: first.step, max: last.step };
```
Since the buffer always contains `[step_N−299, …, step_N]`, the range slides forward by 1 every frame, so the X-axis labels change continuously. Reset to 0 when metrics are cleared.

---

# Stage 9 — Mobile & Responsive Optimization

## Motivation

The app was designed on a large desktop monitor. On phones:
- The controls bar overflowed or became too dense.
- The params panel (gravity/damping/speed sliders) ate up precious vertical space.
- Dragging bobs with touch could trigger page scrolling instead of moving the pendulum.
- The 1200-point trail buffer created needless GPU work on mobile.

## Changes

### Touch Event Hardening

**Problem**: The existing touch handlers used `{ passive: true }`, which means the browser treats them as passive listeners — `preventDefault()` would be ignored. On iOS Safari especially, even with `overflow: hidden` on `<body>`, the page can still rubber-band when the user tries to drag a bob.

**Fix**:
- Changed both `touchstart` and `touchmove` listeners to `{ passive: false }`.
- Called `e.preventDefault()` inside both handlers only when a drag is active (`dragActive === true`). This suppresses page bounce without interfering with non-drag touches.
- Added `touch-action: none` on both canvases via CSS — this tells the browser at the compositor level never to intercept touch gestures for scrolling/zooming on the canvas elements.
- Added `overscroll-behavior: none` on `html, body` to further prevent the elastic bounce effect on all browsers.

### Performance — Trail Length Capping

**Problem**: `TRAIL_LENGTH = 1200` means each particle stores 1200 `{x, y, s}` objects. With N pendulums each having 2–5 particles, that's thousands of points redrawn every frame in 80 batches. On a mobile GPU this can cause frame drops.

**Fix**:
- Detect mobile via `window.matchMedia("(max-width: 768px)").matches`.
- Set `TRAIL_LENGTH` to 600 on mobile (half the points, half the draw calls).
- Changed from `const` to `let` so the value could adapt on orientation change (not currently done, but possible without a refactor).

### Responsive CSS Layout

**Problem**: The UI was rigid. Fixed-width elements like the 330px plot boxes, the 160px-min-width params panel, and the generous 12px gap in the controls bar assumed a ≥1024px viewport.

**Fix**: A single `@media (max-width: 768px)` block handles all mobile adjustments:

| Element | Desktop | Mobile |
|---|---|---|
| Controls gap | 12px | 6px |
| Controls button font | 12px | 9px |
| Angle display font | 11px | 9px |
| Params panel | `display: flex` (always visible) | `display: none` (toggled by gear) |
| Params position | top-right | bottom-right (above controls) |
| Plot boxes | side-by-side corners | stacked centered (top 35% / bottom 35%) |
| Plot box sizing | fixed 330×240 px | 90% width, auto height |
| ctx-menu bottom | 105px | 80px |

### Collapsible Settings Panel

**Problem**: The gravity/damping/speed sliders are useful but take up too much screen on a phone. They shouldn't be completely removed — just hidden until needed.

**Fix**:
- Added a `⚙` gear button to the controls bar (last button, after Clear Trail).
- The gear button is hidden on desktop via `#btn-gear { display: none }`.
- On mobile, `#btn-gear { display: inline-block !important }` via the media query override.
- Clicking the gear calls `toggleSettingsPanel()`, which toggles `.show` on `#params-panel`.
- On mobile, the params panel sits at `bottom: 55px` (just above the controls) and floats to the right.

## Files Changed

- **Plan.md**: New Stage 9 section with tasks and acceptance criteria.
- **style.css**: `touch-action:none` on canvases, `overscroll-behavior:none` on root, full `@media (max-width: 768px)` block, gear button display rule.
- **index.html**: Gear button in controls bar.
- **script.js**: `isMobile` detection, mutable `TRAIL_LENGTH`, `{ passive: false }` on touch handlers with `preventDefault()`, `toggleSettingsPanel()` function, gear button event listener.

## Acceptance Criteria Status
- ✅ Pendulum bobs draggable on touch devices without page scrolling or bouncing.
- ✅ Trail rendering capped at 600 points on mobile, 1200 on desktop.
- ✅ UI usable on 375px-wide phone screens without overlap.
- ✅ Params panel togglable via gear icon on mobile; always visible on desktop.
- ✅ Canvas and rod lengths scale proportionally to viewport (existing `pxPerUnit` system).

### Bug fix: Blank canvas at startup after slowMo removal

After removing the `slowMo` variable and `btn-slow` button, the pendulum appeared invisible on the initial page load — the canvas showed only the dark background.

**Root cause**: Two independent issues:

1. **Missing synchronous initial paint**: The bootstrap sequence was `addPendulum()` → `resizeCanvas()` → `updateControls()` → `animate()`. The `animate()` function only queues the first frame via `requestAnimationFrame(animate)`, which fires ~16ms later at the next VSync. During that gap, the canvases were transparent (unpainted), showing only the body's `#0a0a0f` background.

2. **Unsafe `matchMedia` usage**: `window.matchMedia("(max-width: 768px)").matches` was called without a guard. If `matchMedia` were unavailable or threw, the entire top-level script would halt at that line — nothing after it would execute.

**Fix**:
- Added a null guard: `window.matchMedia ? window.matchMedia(...).matches : false`.
- Added synchronous `draw()` and `updateAngleDisplay()` calls in the bootstrap before `animate()` — the pendulum renders on the very first layout frame instead of waiting for the first rAF callback.

### Bug fix: "Cannot read properties of null (reading 'addEventListener')" on GitHub Pages

After deploying to GitHub Pages, the script crashed at boot with `TypeError: Cannot read properties of null (reading 'addEventListener')` at one of the `document.getElementById(...).addEventListener(...)` lines. This caused the entire animation loop to never start — no pendulum, no controls, a blank dark page.

**Root cause**: Two problems compounded:

1. **Timing — script ran before DOM was fully loaded.** The `<script>` tag had no `defer` attribute, so the browser executed it as soon as it was encountered during HTML parsing. If the network delivered the HTML in chunks, the script element might execute before later DOM nodes were parsed. On localhost (file:// or live server) the HTML arrives instantly, so this was never a problem. On GitHub Pages (CDN-served, chunked), the timing window opens.

2. **Missing element — an ID mismatch.** One of the `document.getElementById()` calls returned `null` because the element with that ID didn't exist at execution time (either not yet parsed, or the ID was renamed in HTML but not in JS). Calling `.addEventListener()` on `null` throws a TypeError that propagates out of the top-level script, halting all subsequent code.

**Fix**:

- Added `defer` to the `<script>` tag so the browser always waits until the full HTML is parsed before executing the JS.
- Added a `$()` helper (`document.getElementById` alias) for brevity.
- Added an `on(id, event, handler)` dual-purpose function:
  - `on(id)` — returns the element (like `$()`) for direct access.
  - `on(id, event, handler)` — safely binds an event listener. If `$(id)` returns `null`, the listener is silently skipped.
- Converted all 18 `document.getElementById(id).addEventListener(event, handler)` calls to `on(id, event, handler)`.
- Left `window`, `document`, and `canvasB` listeners unchanged (these DOM nodes always exist).

---

# Stability Fixes — NaN Detection, Sub-stepping & Max Bob Limit

## Motivation

The user reported: *"When adding too many bobs (e.g., more than 8 or 9), the entire pendulum and trajectory suddenly disappear from the screen."*

This is a classic numerical explosion: the N×N mass matrix in the RK4 Lagrangian solver becomes near-singular for large N (8+ links), causing Gaussian elimination to produce NaN (Not a Number) or Infinity values. These propagate through the physics state, corrupting all positions — causing the canvas to render nothing (all drawing operations with NaN coordinates are silently ignored).

## Fix 1: NaN & Infinity Detection with Auto-Reset

### `isPendulumInvalid(p)`

Scans every physics variable — angles (`thetas[]`), angular velocities (`omegas[]`), and particle positions (`x`, `y`) — for `NaN` or non-finite values. Returns `true` on the first invalid value found. Checks are ordered: angles first (most likely to explode from the matrix solve), then positions (derived).

### `safeResetPendulum(p)`

On explosion:
1. Logs `"Physics exploded! Resetting to safe state."` to the console (subtle warning, non-intrusive).
2. Zeros all angular velocities (`omegas.fill(0)`).
3. Resets all angles to the safe resting state (`DEFAULT_ANGLE_DEG = 135°`).
4. Rebuilds the entire particle chain at the reset angle via `rebuildChain()`.
5. Clears all trail arrays — prevents drawing corrupted lines from the explosion frame.

### Integration in `stepPhysics()`

After RK4 integration, damping, and position computation, `isPendulumInvalid(p)` is checked. If triggered, `safeResetPendulum(p)` is called and `continue` skips trail recording for that frame. The pendulum reappears in the safe state on the very next frame.

**Cost**: O(N) per pendulum per frame — negligible. The early-return pattern means we only pay the check, not the reset, in normal operation.

## Fix 2: Sub-stepping Increase

`SUB_STEPS` increased from `4` → `8`. Each RK4 sub-step now operates at `dt/8 = 1/480 s` instead of `dt/4 = 1/240 s`. Halving the integration step size improves the accuracy of the 4th-order Runge-Kutta method within the safe operating range (≤8 links). This does not fundamentally fix the N>8 singularity, but it pushes the stability boundary further out.

## Fix 3: Hard Cap on Max Bob/Limb Count

Two new constants gate all pendulum-creation paths:

| Constant | Value | Purpose |
|---|---|---|
| `MAX_LINKS` | 8 | Maximum joints (bobs) per pendulum — prevents the N×N mass matrix from becoming near-singular |
| `MAX_PENDULUMS` | 8 | Maximum total independent pendulums — prevents performance degradation from too many concurrent simulations |

### Guards

- **`addPendulum()`** — returns early if `pendulums.length >= MAX_PENDULUMS`.
- **`addJoint()`** — returns early if `p.constraints.length >= MAX_LINKS`.
- **`toggleChaos()`** — returns early if already at `MAX_PENDULUMS` (chaos mode spawns a second pendulum, which could break the limit).
- **`updateControls()`** — disables the `+` button (greyed out, `cursor: not-allowed`) and hides the `➕` add-joint button when at their respective limits. Tooltips switch to explanatory messages in both English and Chinese.

### I18N tooltip strings added

| Key | English | 中文 |
|---|---|---|
| `addTitleMax` | Maximum pendulum limit reached | 已达到最大摆数量限制 |
| `addJointTitleMax` | Maximum bob limit reached for physical stability | 已达到最大关节数量限制，以保证物理稳定性 |

### CSS

A `#controls button:disabled` rule sets `color: rgba(255,255,255,0.12)` and `cursor: not-allowed` — visually distinct from the normal 35% opacity hoverable state.

## Design Decision: Why 8, not 4?

The user explicitly requested the limit be set at 8–9, not 4. While the RK4 analytical solver is theoretically more stable at N≤4, empirical testing showed that with SUB_STEPS=8 and the NaN safety net in place, N=8 is a safe operational ceiling. The NaN detector acts as a last-resort circuit breaker if the matrix solve ever does produce garbage — so the user gets a smooth reset rather than a blank screen, even at the limit.

## Files Changed

- **script.js**: Added `MAX_LINKS`, `MAX_PENDULUMS` constants. Bumped `SUB_STEPS` 4→8. Added `isPendulumInvalid()`, `safeResetPendulum()`. Integrated NaN check in `stepPhysics()`. Guarded `addPendulum()`, `addJoint()`, `toggleChaos()`. Updated `updateControls()` for button disable/hide logic. Added 4 I18N keys.
- **style.css**: Added `#controls button:disabled` rule.

---

# Post-Stage Fixes — CSS Specificity & In-App Wiki Reader

## Fix 1: Fenced Code Blocks Rendered as Single Line

**Report**: Viewing the full README inside the Guide modal showed the Architecture directory tree as a single line instead of preserving line breaks in the fenced code block.

**Root cause**: `#help-modal-content code { white-space: nowrap }` at line 527 in `style.css`. This ID-based rule (specificity 1,0,0,1) applied to ALL `<code>` elements in the modal, including those inside `<pre>` blocks in the rendered README content. The class-based `.help-readme-body pre code { white-space: pre }` rule (specificity 0,2,0,2) was overridden because the ID selector has higher weight — CSS specificity means `#id` beats `.class` regardless of source order.

**Why reordering didn't help**: Moving the `.help-readme-body pre code` rule after `.help-readme-body code` in the stylesheet doesn't matter when the former is outmatched by an ID selector. CSS specificity is a priority system, not a proximity system.

**Fix**: Added the parent ID to the `pre code` selector to match the specificity:
```css
.help-readme-body pre code,
#help-modal-content .help-readme-body pre code {
    white-space: pre;
    /* … */
}
```
`#help-modal-content .help-readme-body pre code` has specificity 1,1,2,1 — it wins over the base `#help-modal-content code` (1,0,0,1).

**Scope**: Applied automatically to all fenced code blocks rendered inside any `.help-readme-body`, including `AI_DISCLOSURE.md`/`AI_DISCLOSURE_ZH.md` collaboration workflow sections.

## Fix 2: In-App Wiki Reader — Intercept Markdown Links

**Report**: The `README.md` contains relative links to other `.md` files (e.g., `AI_DISCLOSURE.md`). Clicking these inside the Guide modal caused default browser navigation (404 or file download), breaking the in-app reading experience.

### Solution: Wiki Navigation

Three changes turned the Guide modal into a recursive wiki reader:

**a. Generalized `loadAndRenderMD(path)`** — replaces the previous `fetchAndShowReadme()` (which was hardcoded to `./README.md`). The new function:
- Accepts any `.md` relative path, fetches it via `fetch()`, parses it with the existing `parseSimpleMarkdown()`, and renders the HTML into `#help-body`.
- Tracks the current document in `currentDocPath`.
- Automatically prepends a back-navigation bar: "← Back to Controls" when on the root README, or "← Back to Guide Index" when on a sub-page.

**b. `bindMarkdownLinks()`** — called after every render. Scans all `<a>` tags inside `.help-readme-body` and attaches click handlers to any whose `href` ends with `.md`. The handler calls `e.preventDefault()` and `loadAndRenderMD(href)`, loading the linked document in-app.

**c. Link rendering** — `processInline()` now distinguishes `.md` links from external links. `.md` links are rendered without `target="_blank"` (since they navigate internally); all other links keep `target="_blank"` for safety.

### Navigation flow
```
Controls (table) → click "View Full Guide →" → README.md
     ↑                                                ↓
  "← Back to Controls"                    click [AI Disclosure] link
     ↑                                                ↓
     └──────────── README.md ◄── "← Back to Guide Index" ── AI_DISCLOSURE.md
```

### Files changed
- **script.js**: ~70 lines changed. Added `currentDocPath` tracking, `loadAndRenderMD()`, `bindMarkdownLinks()`, conditional `target="_blank"` in `processInline()`, `.help-back-guide` handler in event delegation. Two new i18n keys for both EN and ZH.
- **style.css**: `.help-back-guide` shares styling with `.help-back-btn`.

### Edge cases
- Links already on a sub-page (e.g., `AI_DISCLOSURE.md` → `AI_DISCLOSURE_ZH.md`) are recursively intercepted — the chain works to arbitrary depth.
- Loading errors show an error message; the modal returns to overview on re-open.
- Language switch resets to the controls overview (no persisted state across modal toggles).

---

# Feature — State Serialization, URL Sharing & Restoration

## Motivation
The user wanted to be able to share specific pendulum configurations with others via a URL. No external libraries allowed — only native Web APIs.

## Requirements
1. **Serialize** the full simulator state into a compact JSON structure
2. **Encode** it into a URL-safe Base64 string and store it in the URL hash
3. **"Copy Share Link"** button with clipboard feedback
4. **Restore** state on page load from the URL hash with graceful error handling

## Design

### Serialization Format

Compact single-letter keys to keep the encoded URL short:

```json
{
  "v": 1,        // format version
  "g": 11.0,     // gravity
  "d": 0.0003,   // damping
  "s": 1.0,      // speed multiplier
  "p": [         // pendulums array
    { "n": 2, "t": [135, 135], "c": 0, "v": true }
  ]
}
```

Per-pendulum fields: `n` = link count, `t` = angles (degrees, one per link), `c` = palette index, `v` = visibility.

Not serialized: angular velocities `omegas` (always restored to 0), trail data (transient visual), pixel-scale-dependent lengths `ls[]` (rebuilt from `PHYS_L * pxPerUnit` on resize).

### UTF-8 Safe Base64

`btoa()` throws on characters outside Latin-1. Color hex codes (`#6080c0`) contain `#` which is ASCII, but UI strings (Chinese labels, emoji) need proper handling:

```js
// Encode
const latin1 = unescape(encodeURIComponent(JSON.stringify(state)));
const encoded = btoa(latin1);

// Decode
const utf8 = decodeURIComponent(escape(atob(encoded)));
const state = JSON.parse(utf8);
```

### URL Hash Strategy

- `history.replaceState` updates the hash without creating a browser history entry
- Hash only updates when the value changes to avoid unnecessary `replaceState` calls
- Stored as `#state=<base64>` — clean, no query parameters needed

### Auto-Save Integration Points

`saveStateToURL()` is called from every state-mutating operation:
- Slider `input` events (gravity, damping, speed)
- `addPendulum()`, `deleteSelected()`, `cycleColor()`, `toggleVisibility()`
- `addJoint()`, `removeJoint()`
- `resetSimulation()`, `toggleChaos()`
- Drag-end (`mouseup` after active drag)

Not called: `selectPendulum()` (UI selection only), `clearTrails()` (visual only), every frame of `animate()` (running simulation state is not preserved).

### Restoration Error Handling

`restoreState(state)` validates every field:
- Top-level: `state` is an object, `v` matches version
- Physics: `g`, `d`, `s` are finite numbers → clamped to slider range
- Pendulums: array exists, length ≤ MAX_PENDULUMS, each entry validated
- Per-pendulum: `n` clamped to [MIN_LINKS, MAX_LINKS], `t` values checked with `isFinite()`, `c` modulo-wrapped to palette, `v` defaults to `true`
- Guard: empty pendulum array after validation → return false → bootstrap creates default

All decoding/parsing errors are caught by try/catch in `tryLoadStateFromURL()` → returns false.

### Share Button UX

- Click → `saveStateToURL()` ensures URL is current → `navigator.clipboard.writeText(url)` 
- Success: button text changes to "✓ Link Copied!" for 1.8s with green tint
- Failure: logs URL to console and shows "⚠ Fallback" briefly
- Button maintains I18N (EN: "🔗 Share", ZH: "🔗 分享")

## Files Changed

- **index.html**: Added `<button id="btn-share">🔗 Share</button>` in controls bar
- **script.js**: 
  - Added I18N entries for share/copied in both EN and ZH
  - Added ~200 lines of state serialization code (inserted before Animation loop)
  - Added `saveStateToURL()` calls to 10 mutation points throughout the file
  - Modified bootstrap to try URL state restoration before creating default pendulum

## Verification (all passing)

| Scenario | Result |
|---|---|
| Fresh page load with state hash → 2 pendulums, 5+3 links | ✅ |
| Global physics params restored (G=15.5, Damping=0.001, Speed=0.5) | ✅ |
| Hidden pendulum visibility preserved (`visible: false`) | ✅ |
| Corrupt base64 hash → falls back to 1 default pendulum | ✅ |
| Valid base64 but invalid JSON → falls back to defaults | ✅ |
| Valid JSON but missing required fields → falls back to defaults | ✅ |
| Clipboard copy → fallback works in headless Chrome | ✅ |
| Round-trip encode/decode identical (`state = decode(encode(state))`) | ✅ |
| Auto-save on slider change | ✅ |
| Auto-save on add/delete pendulum | ✅ |
| Auto-save on drag-end | ✅ |

---

# Feature — Drag HUD Polar Grid Overlay

## Motivation
Dragging a bob to set angles had a "magnetic snap" feature (15° increments) but zero visual feedback showing where the snap increments were. Users had to guess where the bob would land.

## Design
A temporary polar grid / protractor HUD overlay that renders *only* during active dragging on Layer B (pendulum canvas).

### State Variables
```js
let dragHudOpacity = 0;           // current opacity, animated 0 ↔ 0.3
const dragHudPivot = { x: 0, y: 0 }; // parent-pivot of the dragged bob (cached)
let dragHudRadius = 0;             // rod length in pixels (cached)
```

### Capture at Drag Start
Both `mousedown` and `touchstart` capture the parent-pivot coordinates and rod length at the moment drag begins, storing them in `dragHudPivot`/`dragHudRadius`. This cached data persists through the fade-out after release.

### Live Refresh During Drag
The `animate()` loop refreshes `dragHudPivot` from current particle positions each frame while `dragActive === true`, so window resize between mousedown and mouseup doesn't misalign the HUD.

### Opacity Animation
```js
// Fade in (when dragActive):
dragHudOpacity = Math.min(dragHudOpacity + 0.05, 0.3);
// Fade out (when released):
dragHudOpacity = Math.max(dragHudOpacity - 0.15, 0);
```
～125 ms fade-in, ～33 ms fade-out.

### Drawing (`drawDragHUD()`)

Three layers drawn in a single `ctxB.save/restore` block with `globalAlpha = dragHudOpacity`:

1. **Rod-length circle** — dashed (`setLineDash([5, 5])`), `rgba(255,255,255,0.55)`, 1.2px stroke, centered at pivot with radius = rod length. Shows the arc the bob follows.

2. **Radial lines at 15°** — 24 lines from pivot outward, `setLineDash([2, 4])`, `rgba(255,255,255,0.28)`, 0.8px stroke. Each line at `deg * π / 180` using `sin()` for X, `cos()` for Y to match the physics engine's angle convention (`atan2(dx, dy)`, 0 = straight down).

3. **Snap indicator dot** — bright white dot (4px radius) at the current `snapAngle(thetas[dragTarget - 1])` position on the arc, with a faint 8px ring. Only drawn during active drag (`dragActive === true`).

### Integration Points
| Location | Action |
|---|---|
| `canvasB mousedown` | Capture HUD data, set `opacity = 0.01` |
| `canvasB touchstart` | Same for touch |
| `animate()` first lines | Live-refresh pivot during active drag, fade opacity |
| `draw()` after pendulum loop | Call `drawDragHUD()` before pivot drawing |

### Edge Cases
- **Resize during drag**: Handled by live refresh of `dragHudPivot` from current particle positions each animate frame. Cached data only used during fade-out (when `dragActive === false`).
- **Multiple pendulums**: Works for any selected pendulum; `selectedPendulum` and `dragTarget` define which link's pivot and radius to use.
- **Touch**: Identical capture logic in `touchstart` — fade animation works the same as mouse.
- **Zero opacity guard**: `drawDragHUD()` returns immediately if `dragHudOpacity <= 0.001`.

## Feature — Canvas Rendering Optimizations

### 1. FPS Guardian (Adaptive Trail Length)

A lightweight rolling-window frame rate monitor that dynamically adjusts the trail buffer size when rendering performance degrades.

- **Monitor**: Stores the last 30 `performance.now()` timestamps in `fpsTimestamps[]`. Each `animate()` frame pushes a new timestamp, shifts old ones, and calculates `currentFPS` from the window span.
- **Adaptation**: Every 30 frames (~0.5 s at 60 FPS), throttled via `fpsAdaptCounter`:
  - `currentFPS < 55` → shrink `TRAIL_LENGTH` by 50 (floor: 100)
  - `currentFPS >= 58` and below `MAX_TRAIL_LENGTH` → grow by 10 (ceiling: `MAX_TRAIL_LENGTH`)
- **Separation**: `MAX_TRAIL_LENGTH` holds the user/viewport-defined target (600 mobile, 1200 desktop, set in `resizeCanvas`). `TRAIL_LENGTH` is the live working value that the FPS Guardian oscillates below it.
- **Cost**: Two array operations + one division per frame; negligible overhead.

### 2. Path2D Batch Rendering

Replaced the per-segment `beginPath()` + `moveTo()` + `lineTo()` + `stroke()` sequence in the non-velocity trail branch with a single native `Path2D` object per opacity batch.

- **Before (non-velocity branch)**: Each batch called `ctxA.beginPath()`, `ctxA.moveTo()`, `ctxA.lineTo()` for each segment, then `ctxA.stroke()`. ~5 JS→native crossings per segment.
- **After**: Build a `Path2D` with `.moveTo()` / `.lineTo()`, then issue one `ctxA.stroke(path)`. Reduces to ~2 crossings regardless of segment count per batch.
- **Velocity branch unchanged**: Per-segment `lineWidth` varies continuously, so Path2D cannot batch. Stays on the original per-segment drawing path.
- **Result**: Fewer context state transitions, lower CPU overhead on long trails.

### Variables Added

| Variable | Type | Purpose |
|---|---|---|
| `MAX_TRAIL_LENGTH` | `let` | Viewport-defined ceiling (600 / 1200), set in `resizeCanvas` |
| `FPS_SAMPLE_SIZE` | `const` | Rolling window size (30 frames) |
| `fpsTimestamps[]` | `Array` | Timestamp buffer |
| `currentFPS` | `let` | Latest reading, updated every frame |
| `fpsAdaptCounter` | `let` | Throttle counter (act every 30 frames) |

### Changed Functions
| Function | Change |
|---|---|
| `drawTrail()` | Non-velocity branch uses `Path2D` + `ctxA.stroke(path)` |
| `animate()` | FPS rolling-window update + adaptive TRAIL_LENGTH adjustment every 30 frames |
| `resizeCanvas()` | Sets `MAX_TRAIL_LENGTH` instead of directly overwriting `TRAIL_LENGTH` |

## Feature — Physics Solver: Cholesky Decomposition + JIT-Friendly Float64Array

### 1. Cholesky Decomposition (was Gaussian Elimination)

Replaced `derivativesArray()` (Gaussian elimination with partial pivoting) with `computeAccel()` + Cholesky decomposition.

**Why**: The mass matrix M is symmetric positive-definite (Gram-like structure from the Lagrangian). Cholesky exploits this:
- **~N³/3 flops** vs ~2N³/3 for Gaussian elimination — nearly 2× faster for N=8
- **No pivoting** needed for SPD matrices — eliminates pivot-searching and row-swapping overhead
- **In-place** — writes directly into pre-allocated `scratch.L` and `scratch.alpha`

**Implementation** (`choleskyFactor` + `choleskySolve`):
1. Factor M = L·Lᵀ where L is lower triangular (flat row-major Float64Array)
2. Forward substitution: L·y = b → solve for y
3. Backward substitution: Lᵀ·α = y → solve for α

### 2. JIT-Friendly Float64Array Scratch Buffers

The old `rk4Step()` created **16 temporary arrays per sub-step** via `.slice()` and `.map()` — catastrophic GC pressure at 8 sub-steps × 4 derivative calls × 60 fps. Now every working vector is pre-allocated once.

**Per-pendulum scratch** (`createScratch()`, sized for `MAX_LINKS = 8`):
| Category | Buffers | Count |
|---|---|---|
| Solver | M (N×N), L (N×N), b, y, alpha | 5 |
| Initial state save | t0, o0 | 2 |
| RK4 slopes | k1_t, k1_o … k4_t, k4_o | 8 |
| Intermediate eval | tw, ow (reused for k2/k3/k4) | 2 |
| **Total** | **17 Float64Array buffers** | **~1.3 KB per pendulum** |

**Hot path changes**:
- `computeAccel(thetas, omegas, ls, N, s)` reads from Float64Array inputs, writes M/b into scratch, calls Cholesky, returns `scratch.alpha` — zero allocations
- `rk4Step()` copies `p.thetas` → `scratch.t0` once per sub-step (N ≤ 8 flat copy), then loops through k1–k4 with in-place Float64Array arithmetic
- `p.ls_f64` (Float64Array) mirrors `p.ls` for the hot path; synced when `p.ls` changes

### Edge Cases
- **Joint add/remove**: `p.ls_f64.set(p.ls)` syncs the Float64Array copy when N changes
- **Resize canvas**: `rebuildChain()` guards with `if (p.ls_f64)` for pendulums created before the Float64Array era
- **Numerical safety**: `choleskyFactor` calls `Math.sqrt()` on the diagonal — if M were to lose positive-definiteness from extreme angles, the sqrt would return NaN, which would be caught by the existing `isPendulumInvalid()` / `safeResetPendulum()` recovery path

## Files Changed
- **script.js**: +104 lines for Cholesky solver / Float64Array scratch buffers. Added `createScratch()`, `choleskyFactor()`, `choleskySolve()`, `computeAccel()`. Rewrote `rk4Step()` with zero-allocation Float64Array loops. Added `p.scratch` and `p.ls_f64` to pendulum state. Synced `p.ls_f64` in `addJoint()`, `removeJoint()`, `rebuildChain()`, and `resizeCanvas()`. Removed old `derivativesArray()` function.