<!--
SPDX-FileComment: This project is AI-assisted.
AI-Usage: Human-directed code generation and debugging via Anthropic Claude and Claude Code.
AI-Tools: Claude (Anthropic), Claude Code
Human-Role: Requirements, testing, QA, deployment, code review
Primary-Language: English
Translation: 中文版本见 AI_DISCLOSURE_ZH.md
-->

# AI Disclosure — Double Pendulum Visualizer

> **Language**: English · [中文](AI_DISCLOSURE_ZH.md)

## Project Overview

**Chaotic Art — Double Pendulum Visualizer** is an HTML5 Canvas web application that simulates N-pendulum chaotic systems with real-time phase-space analysis, built collaboratively between a human developer and AI coding assistants over multiple development stages.

## AI Tools Used

| Tool | Role | Scope |
|------|------|-------|
| **Claude (Anthropic)** | Primary AI coding assistant | All development phases — architecture, implementation, debugging, documentation |
| **Claude Code** | AI-powered CLI/IDE coding agent | Code generation, refactoring, bug analysis, file editing, git operations |

No other AI tools (ChatGPT, Copilot, Gemini, etc.) were used in this project.

## How AI Contributed

### Code Generation

The AI assistant generated the majority of the source code across all three files (`index.html`, `style.css`, `script.js`), including:

- **HTML structure**: Minimal shell with controls, parameter sliders, metrics panel, contextual menu, and dual-canvas setup.
- **CSS styling**: Full dark theme (`#0a0a0f`), frosted-glass UI elements, responsive media queries, touch hardening (`touch-action: none`, `overscroll-behavior: none`).
- **JavaScript physics engine**: Lagrangian mechanics with RK4 integration, N×N mass matrix solver via Gaussian elimination, energy computation, Verlet integration (previously used, later replaced).
- **Rendering system**: Dual-layer HiDPI canvas architecture, batched fading trails, velocity-based line width, neon glow halos.
- **Analysis plots**: Phase space portraits and energy time-series using native Canvas 2D (no external libraries).
- **UI interactions**: Drag-to-set, snap-to-angle, multi-pendulum selection, contextual menu, parameter sliders, click-to-zoom, keyboard shortcuts.

### Architecture Decisions

The AI proposed and implemented significant architectural shifts based on user feedback:

| Phase | Decision | AI Role |
|-------|----------|---------|
| Stage 1–2 | Dual-layer canvas with batched fading trails | Architecture proposal and implementation |
| Stage 3 | Array-of-pendulums state model for chaos mode | Architecture proposal |
| Stage 7 | Verlet integration for N-link chains | Implemented, later found to have numerical damping |
| Stage 8 | Lagrangian RK4 to replace Verlet (exact physics) | Root-cause analysis of damping, proposed and implemented the N×N mass matrix solver |
| Stage 8 | Per-pendulum metrics buffers with `globalMetricsStep` | Debugged stale X-axis issue in energy plots |
| Stage 9 | Touch hardening, responsive CSS, collapsible settings | Implementation |

### Debugging & Bug Fixes

The AI analyzed and resolved multiple bugs, documented in `THOUGHTS.md`:

1. **Phase portrait wrap line** — Detected angle-wrapping causing cross-graph lines; fixed with wrap threshold in `drawFadingLine`.
2. **Energy plot static X-axis** — Diagnosed ring-buffer index reuse; fixed with `globalMetricsStep` counter.
3. **Total energy drift** — Identified sign error in PE formula (y-up vs y-down convention); fixed to achieve 0.0000% drift.
4. **Blank canvas at startup** — Found missing synchronous initial paint and unsafe `matchMedia` call; fixed both.
5. **GitHub Pages null crash** — Diagnosed `defer`-less script timing and missing DOM elements; fixed with `$()`/`on()` helpers and 18 null-safe event bindings.
6. **Emoji rendering as tofu** — Replaced system emoji with inline SVGs for cross-platform compatibility.
7. **Angle-display click not reaching handler** — Identified `stopPropagation` blocking; switched to `pointerdown` event delegation.
8. **Right-click hiding context menu** — Added `e.button !== 0` guard.

### Documentation

- **Plan.md** (9 stages) — AI-authored, reviewed by human
- **THOUGHTS.md** — AI-authored design record of all architectural decisions, trade-offs, and bug fixes
- This **AI_DISCLOSURE.md** — AI-authored, reviewed by human
- Inline code comments — AI-generated

## How the Human Directed the Work

The human developer (Zhou Jintian) acted as the project owner, product manager, and quality assurance engineer:

### Requirements & Direction

Every feature was driven by the human's explicit request:

> *"Change the graphs and the displayed angles range to -180 ~ 180 instead of 0 ~ 360"*
>
> *"Constrain the range of angles in 0~360 degreees in the graph"*
>
> *"Slightly increase the gravity coefficient and damping rate. Slightly!"*
>
> *"Expose several main parameters to users on right-top of the screen. I suggest several slide bars with number indicators."*

### Quality Control

The human rejected unsatisfactory outputs and demanded rework:

| Rejection | What Happened |
|-----------|---------------|
| *"The double pendulum trajectory looks so regular and lacks chaotic movements"* | Led to replacing Verlet integration with Lagrangian RK4 |
| *"All graphs look the same as the animation"* | Led to adding proper phase portraits with different viewing angles |
| *"The values and the axes of graphs are too dark"* | Brightness overhaul (grid from 0.06→0.14, axes 0.12→0.35) |
| *"The last two bobs are completely locked together"* | Generalized 2×2 solver to N×N mass matrix |
| *"You overdo the alphabets of the second graph, making it less clear"* | Replaced oversized bold legend with compact colored-dot legend |
| *"remove the 0.5 speed option, as it's integrated into the slide bar"* | Removed redundant slow-motion button |
| *"I don't need subscripts on the graph axis alphabets"* | Simplified axis labels |

### Deployment & Configuration

- Chose GitHub Pages for deployment
- Managed git workflow: reviewed diffs, approved commits, pushed changes
- Configured the hosting environment
- Tested across devices (laptop and phone)

## Collaborative Workflow

```
1. Human:  States a requirement or describes a desired feature
2. AI:     Proposes implementation approach (may include code, architecture options)
3. Human:  Reviews approach, either approves or redirects
4. AI:     Writes/edits code, updates documentation
5. Human:  Tests the result in browser on laptop and/or phone
6. Human:  Reports bugs or requests refinement
7. AI:     Debugs, proposes fix, implements
8. Human:  Reviews fix, approves commit
   → Loop back to step 1 for next feature
```

All commits were initiated and approved by the human. The AI did not push code without explicit human authorization.

## Limitations & Transparency

### Known Constraints

- **AI did not run the application**: All testing was performed by the human. The AI analyzed code statically and from error reports.
- **AI physics knowledge was secondary**: The Lagrangian mechanics implementation was validated by the human's observation of energy conservation (flat totalE line), not by formal proof.
- **The Verlet integration detour**: The AI initially implemented Verlet integration (Stage 7) as requested by the plan. The human identified it produced overly regular motion. The AI diagnosed the root cause as numerical damping and proposed the Lagrangian RK4 replacement — a correction made possible by the human's domain observation.

### Attribution

- Code style, comment conventions, and project structure reflect the AI's default patterns, modified by the human's specific preferences over time (e.g., "fewer comments, more self-documenting code").
- The physics formulas (Lagrangian, mass matrix, Gaussian elimination) are standard textbook material — the AI transcribed them into working code based on mathematical descriptions.
- All inline SVG icons were generated by the AI when the human reported emoji rendering failures.

## Conclusion

This project is a genuine human-AI collaboration: the human provided domain knowledge, direction, testing, and quality control; the AI provided code generation, implementation speed, debugging analysis, and documentation. Every design decision flowed from a human requirement, and every line of output was reviewed and accepted by the human before inclusion.


