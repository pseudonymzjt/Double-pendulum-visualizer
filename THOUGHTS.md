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

### Rendering
- **Clean slate**: `clearRect` every frame — no ghosting/afterimages
- **Fading trails**: Both bobs leave trajectory trails, rendered as connected line segments batched into 80 opacity levels (barely visible at the tail → bright near the ball)
- **Trail colors**: Bob 1 trail in `#6080c0` (matching its fill), Bob 2 trail in `#00d4ff` (matching its fill)
- **Pendulum drawn last**: rods, bobs, and pivot at full opacity on top of trails

### Pendulum state
Stored in a single `state` object:
- Angular positions + velocities (physics)
- Pixel positions (computed from angles × scale)
- Two trail arrays (one per bob)

## Recent Refinements
- Moved from semi-transparent overlay fade (which caused afterimages of pendulum structure) to batched-line trails with gradient opacity
- Added bob 1 trail matching its own color

## Next Phases (per Plan.md)
1. ✅ Phase 1 — Physics & High-DPI Foundation
2. ⬜ Phase 2 — Dual-Layer Canvas & Trajectory Aesthetics
3. ⬜ Phase 3 — Chaos Mode & State Architecture
4. ⬜ Phase 4 — Minimalist Controls & Direct Manipulation
5. ⬜ Phase 5 — Visual Polish & Export
