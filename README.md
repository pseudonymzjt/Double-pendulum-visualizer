# Chaotic Art — Double Pendulum Visualizer

> **Language**: English · [中文](README_ZH.md)

[![MIT License](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://github.com/pseudonymzjt/Double-Pendulum-Visualizer/blob/master/LICENSE)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](index.html)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](style.css)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](script.js)
[![AI-Assisted](https://img.shields.io/badge/AI-Assisted-blue?style=flat-square)](AI_DISCLOSURE.md)

A high-performance, minimalist HTML5 Canvas web application that visualises the beautiful and chaotic motion of double pendulums. No libraries, no frameworks — just vanilla HTML, CSS, and JavaScript.

## Features

- **RK4 → Verlet Physics**: Stable N-link pendulum simulation using Verlet integration with distance constraints.
- **N-Link Chains**: Start with 2 links, add or remove joints to create triple, quadruple, or longer pendulum chains.
- **Chaos Mode**: Press `C` to spawn a second pendulum at a microscopic 0.01° offset — watch the butterfly effect unfold as cyan and magenta trajectories visibly split.
- **Multi-Pendulum Sandbox**: Click `+` to add independent pendulums, each with its own color from an 8-colour palette. Select, drag, customise, or delete any pendulum.
- **Fading Trajectory Trails**: Every bob leaves a fading trail rendered as batched line segments with gradient opacity. The tip trail uses velocity-based line width (thin when fast, thick when slow).
- **Drag-to-Set**: Pause and drag any bob to freely set angles. Magnetic snap aligns to 15° increments.
- **Slow-Motion**: Toggle 0.5× speed to appreciate high-velocity chaotic motion.
- **Export Artwork**: Save the full canvas (trails + pendulums) as a high-resolution PNG.
- **HiDPI / Retina**: Pixel-perfect rendering via `devicePixelRatio` scaling.
- **Touch Support**: Full drag-to-set and selection via touch events for mobile.

## Controls

| Button | Keyboard | Action |
|---|---|---|
| `+` | — | Add a new pendulum |
| `⏸ Pause` / `▶ Play` | `Space` | Freeze / resume simulation |
| `↺ Reset` | `R` | Reset to initial state |
| `⚡ Chaos` / `⚡ Single` | `C` | Toggle chaos mode |
| `✕ Clear Trail` | — | Erase all trails |
| `⏱ ½× Slow` / `⏱ 1× Speed` | — | Toggle slow-motion |
| `⬇ Save` | — | Export PNG |

### Language Toggle

Click `中` / `EN` in the bottom control bar to switch between English and Simplified Chinese UI. The button text, control labels, plot titles, and help modal all update in real time.

### Contextual Menu (when a pendulum is selected)

| Button | Action |
|---|---|
| `🎨` | Cycle to next palette colour |
| `👁` / `👁‍🗨` | Show / hide this pendulum |
| `➕` | Add a joint (extend chain) |
| `➖` | Remove last joint |
| `🗑` | Delete this pendulum |

## Architecture

```
Double-Pendulum-Visualizer/
├── index.html        # HTML shell with HiDPI meta viewport
├── style.css         # Full-viewport dark theme, controls & menus
├── script.js         # Everything: physics, rendering, controls, UI
├── Plan.md           # Project plan (all stages)
├── THOUGHTS.md       # Design record and decisions
└── README.md
```

**Dual-Layer Canvas**:
- **Layer A** (`#canvas-a`): Trajectory trails — cleared and fully redrawn each frame from stored point arrays.
- **Layer B** (`#canvas-b`): Pendulum rods, bobs, and pivot — cleared and redrawn fresh each frame.

**Physics**: Verlet integration with distance constraints. 4 sub-steps per frame, 10 constraint-solver iterations per sub-step. `G × pxPerUnit × 8` gravity for visual swing speed.

## Getting Started

Just open `index.html` in any modern browser. No build step, no server required.

## License

MIT © pseudonymzjt
