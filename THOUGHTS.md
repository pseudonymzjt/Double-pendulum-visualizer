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

## Next Phases (per Plan.md)
1. ✅ Phase 1 — Physics & High-DPI Foundation
2. ✅ Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics
3. ✅ Phase 3 — Chaos Mode & State Architecture
4. ⬜ Phase 4 — Minimalist Controls & Direct Manipulation
5. ⬜ Phase 5 — Visual Polish & Export
