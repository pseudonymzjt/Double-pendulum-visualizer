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

## Next Phases (per Plan.md)
1. ✅ Phase 1 — Physics & High-DPI Foundation
2. ✅ Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics
3. ⬜ Phase 3 — Chaos Mode & State Architecture
4. ⬜ Phase 4 — Minimalist Controls & Direct Manipulation
5. ⬜ Phase 5 — Visual Polish & Export
