'use strict';
/* ============================================================
   Chaotic Art — Double Pendulum Visualizer
   Stage 8 — Exact Lagrangian RK4 Physics Engine
   ============================================================ */

// --- Constants --------------------------------------------------
let G = 11.0;                    // gravitational acceleration (m/s²)
let DAMPING = 0.0003;            // per-frame velocity damping (fraction)
let speedMultiplier = 1.0;       // physics speed multiplier (0.2–3.0)
const PHYS_L = 1.5;              // base rod length in simulation units (meters)
const SUB_STEPS = 8;             // RK4 sub-steps per frame (increased for stability)
let TRAIL_LENGTH = 1200;         // current (adaptive) max trail points
let MAX_TRAIL_LENGTH = 1200;     // user-defined target (set in resizeCanvas)
const TRAIL_BATCHES = 80;        // opacity gradation levels for the fading line

// FPS Guardian — rolling-window frame rate monitor for adaptive trail length
const FPS_SAMPLE_SIZE = 30;      // number of frames in the rolling window
const fpsTimestamps = [];        // circular buffer of rAF timestamps
let currentFPS = 60;             // most recent reading
let fpsAdaptCounter = 0;         // throttle: act every N frames
const CHAOS_OFFSET = 0.01 * Math.PI / 180;  // 0.01° in radians
const SNAP_DEG = 15;
const SNAP_THRESHOLD = 5;
const LINK_SCALE = 0.85;         // length multiplier when adding joints
const MIN_LINKS = 2;             // minimum links per pendulum
const MAX_LINKS = 8;             // maximum joints per pendulum for RK4 stability
const MAX_PENDULUMS = 8;         // maximum number of independent pendulums
const HIT_RADIUS = 22;           // px — bob grab radius
const PENDULUM_VIEWPORT_FRACTION = 0.18;  // fraction of min viewport dimension

/**
 * Pre-allocate all working buffers as Float64Array (zero GC in hot loop).
 * Pendulums own one scratch object each; reused every frame across all
 * RK4 sub-steps. All arrays sized for MAX_LINKS (only first N used).
 */
function createScratch() {
    const N = MAX_LINKS;
    return {
        // Solver: flat row-major N×N matrices, N-vectors
        M:     new Float64Array(N * N),
        L:     new Float64Array(N * N),   // Cholesky factor
        b:     new Float64Array(N),       // RHS
        y:     new Float64Array(N),       // forward-sub scratch
        alpha: new Float64Array(N),       // result accelerations
        // RK4 sub-step initial-state save
        t0:    new Float64Array(N),
        o0:    new Float64Array(N),
        // RK4 slope vectors (k1–k4 for θ and ω)
        k1_t:  new Float64Array(N),
        k1_o:  new Float64Array(N),
        k2_t:  new Float64Array(N),
        k2_o:  new Float64Array(N),
        k3_t:  new Float64Array(N),
        k3_o:  new Float64Array(N),
        k4_t:  new Float64Array(N),
        k4_o:  new Float64Array(N),
        // Intermediate evaluation state (reused for k2/k3/k4 inputs)
        tw:    new Float64Array(N),       // θ_work
        ow:    new Float64Array(N),       // ω_work
    };
}
const METRICS_CAPACITY = 300;    // rolling buffer for analysis plots
let globalMetricsStep = 0;       // monotonically increasing step counter for X-axis

// --- I18N / Locale ------------------------------------------------

let currentLang = 'en';

const I18N = {
    en: {
        playPaused:  '⏸ Pause [Space]',
        playPlaying: '▶ Play [Space]',
        chaosChaos:  '⚡ Chaos [C]',
        chaosSingle: '⚡ Single [C]',
        reset:  '↺ Reset [R]',
        metrics:'📊 Metrics [M]',
        clear:  '✕ Clear Trail',
        save:   '⬇ Save',
        share:  '🔗 Share',
        shareCopied: '✓ Link Copied!',
        guide:  '📖 Guide',
        langBtn:'中',
        langTip:'切换到中文',
        paramGravity: 'Gravity',
        paramDamping: 'Damping',
        paramSpeed: 'Speed',
        phaseTitle: (pid) => `Phase Space — Pendulum ${pid}  θ vs ω     cycle`,
        energyTitle: 'Energy — KE / PE / E_total',
        settingsTitle: 'Settings',
        addTitle: 'Add pendulum',
        addTitleMax: 'Maximum pendulum limit reached',
        addJointTitle: 'Add joint',
        addJointTitleMax: 'Maximum bob limit reached for physical stability',
        copyright: 'MIT © pseudonymzjt',
        sourceLink: 'Source on GitHub',
        help: {
            title: 'Controls',
            th: ['Button', 'Keyboard', 'Action'],
            rows: [
                ['<code>+</code>', '—', 'Add a new pendulum'],
                ['<code>⏸ Pause</code> / <code>▶ Play</code>', '<kbd>Space</kbd>', 'Freeze / resume simulation'],
                ['<code>↺ Reset</code>', '<kbd>R</kbd>', 'Reset to initial state'],
                ['<code>⚡ Chaos</code> / <code>⚡ Single</code>', '<kbd>C</kbd>', 'Toggle chaos mode'],
                ['<code>📊 Metrics</code>', '<kbd>M</kbd>', 'Toggle energy &amp; phase plots'],
                ['<code>✕ Clear Trail</code>', '—', 'Erase all trails'],
                ['<code>⬇ Save</code>', '—', 'Export PNG artwork'],
            ],
            ctxTitle: 'Context Menu',
            ctxSub: '(when a pendulum is selected)',
            ctxTH: ['Button', 'Action'],
            ctxRows: [
                ['<span class="icon-cell">🎨</span>', 'Cycle to next palette colour'],
                ['<span class="icon-cell">👁</span> / <span class="icon-cell">👁‍🗨</span>', 'Show / hide this pendulum'],
                ['<span class="icon-cell">➕</span>', 'Add a joint (extend chain)'],
                ['<span class="icon-cell">➖</span>', 'Remove last joint'],
                ['<span class="icon-cell">🗑</span>', 'Delete this pendulum'],
            ],
            tipsTitle: 'Tips',
            tips: [
                '<strong>Pause</strong> then <strong>drag</strong> any bob to set angles freely — snap aligns to 15° increments.',
                'Press <kbd>[</kbd> / <kbd>]</kbd> while the <strong>Metrics</strong> panel is open to cycle through pendulums.',
                'Click a <strong>plot</strong> to zoom it full-screen; click again to shrink back.',
                'Use the <strong>Gravity</strong>, <strong>Damping</strong>, and <strong>Speed</strong> sliders (top-right) to tweak the simulation.',
            ],
            footer: 'View Full Guide →',
            backBtn: '← Back to Controls',
            guideIndex: '← Back to Guide Index',
            loading: 'Loading README…',
            error: 'Failed to load document.',
            errorHint: 'Please check if the file exists on the server and matches case-sensitivity.',
        },
    },
    zh: {
        playPaused:  '⏸ 暂停 [Space]',
        playPlaying: '▶ 播放 [Space]',
        chaosChaos:  '⚡ 混沌 [C]',
        chaosSingle: '⚡ 单摆 [C]',
        reset:  '↺ 重置 [R]',
        metrics:'📊 图表 [M]',
        clear:  '✕ 清除轨迹',
        save:   '⬇ 保存',
        share:  '🔗 分享',
        shareCopied: '✓ 已复制!',
        guide:  '📖 指南',
        langBtn:'EN',
        langTip:'Switch to English',
        paramGravity: '重力',
        paramDamping: '阻尼',
        paramSpeed: '速度',
        phaseTitle: (pid) => `相空间 — 摆 ${pid}  θ vs ω     周期`,
        energyTitle: '能量 — 动能 / 势能 / 总能',
        settingsTitle: '设置',
        addTitle: '添加摆',
        addTitleMax: '已达到最大摆数量限制',
        addJointTitle: '添加关节',
        addJointTitleMax: '已达到最大关节数量限制，以保证物理稳定性',
        copyright: 'MIT © pseudonymzjt',
        sourceLink: 'GitHub 源代码',
        help: {
            title: '操作说明',
            th: ['按钮', '键盘', '动作'],
            rows: [
                ['<code>+</code>', '—', '添加新摆'],
                ['<code>⏸ 暂停</code> / <code>▶ 播放</code>', '<kbd>Space</kbd>', '冻结 / 恢复模拟'],
                ['<code>↺ 重置</code>', '<kbd>R</kbd>', '重置到初始状态'],
                ['<code>⚡ 混沌</code> / <code>⚡ 单摆</code>', '<kbd>C</kbd>', '切换混沌模式'],
                ['<code>📊 图表</code>', '<kbd>M</kbd>', '切换能量与相图面板'],
                ['<code>✕ 清除轨迹</code>', '—', '擦除所有轨迹'],
                ['<code>⬇ 保存</code>', '—', '导出 PNG 图片'],
            ],
            ctxTitle: '上下文菜单',
            ctxSub: '（选中摆时显示）',
            ctxTH: ['按钮', '动作'],
            ctxRows: [
                ['<span class="icon-cell">🎨</span>', '切换至下一个调色板颜色'],
                ['<span class="icon-cell">👁</span> / <span class="icon-cell">👁‍🗨</span>', '显示 / 隐藏此摆'],
                ['<span class="icon-cell">➕</span>', '添加关节（延长摆链）'],
                ['<span class="icon-cell">➖</span>', '移除最后一个关节'],
                ['<span class="icon-cell">🗑</span>', '删除此摆'],
            ],
            tipsTitle: '提示',
            tips: [
                '<strong>暂停</strong>后<strong>拖拽</strong>任意摆锤可自由设置角度——磁吸吸附至 15° 增量。',
                '在<strong>图表</strong>面板打开时按 <kbd>[</kbd> / <kbd>]</kbd> 切换追踪的摆。',
                '点击<strong>图表</strong>可全屏显示；再次点击恢复。',
                '使用右上角的<strong>重力</strong>、<strong>阻尼</strong>和<strong>速度</strong>滑块调节模拟参数。',
            ],
            footer: '查看完整指南 →',
            backBtn: '← 返回操作说明',
            guideIndex: '← 返回指南',
            loading: '正在加载 README…',
            error: '文档加载失败。',
            errorHint: '请检查文件是否存在于服务器上，以及文件名大小写是否匹配。',
        },
    },
};

/** Track the currently loaded doc path for wiki-like in-app navigation. */
let currentDocPath = null;

/** Build help modal HTML for the current language. */
function buildHelpHTML() {
    const H = I18N[currentLang].help;
    const rows = H.rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('');
    const ctxRows = H.ctxRows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join('');
    const tips = H.tips.map(t => `<li>${t}</li>`).join('');
    return `<h2>${H.title}</h2>
<table><thead><tr>${H.th.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>
<h3>${H.ctxTitle} <span class="subtitle">${H.ctxSub}</span></h3>
<table><thead><tr>${H.ctxTH.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${ctxRows}</tbody></table>
<h3>${H.tipsTitle}</h3><ul>${tips}</ul>
<p class="help-footer"><span class="help-guide-link">${H.footer}</span></p>`;
}

// --- Markdown Parser & README Viewer ------------------------------

function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Convert bare Markdown text to safe HTML for in-app display. */
function parseSimpleMarkdown(md) {
    if (!md) return '';

    // 1. Extract fenced code blocks (protect from inline parsing)
    const codeBlocks = [];
    md = md.replace(/```(\w*)\r?\n([\s\S]*?)```/g, (_, lang, code) => {
        const id = `\x00CB${codeBlocks.length}\x00`;
        codeBlocks.push(escapeHtml(code));
        return id;
    });

    // 2. Block-level processing
    const lines = md.split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        const t = line.trim();

        // Empty line
        if (!t) { i++; continue; }

        // Fenced code placeholder
        if (/^\x00CB\d+\x00$/.test(t)) {
            out.push(t);
            i++;
            continue;
        }

        // ATX heading
        const hd = t.match(/^(#{1,6})\s+(.+)$/);
        if (hd) {
            out.push(`<h${hd[1].length}>${processInline(hd[2])}</h${hd[1].length}>`);
            i++;
            continue;
        }

        // Horizontal rule (three or more dashes)
        if (/^-{3,}\s*$/.test(t)) {
            out.push('<hr>');
            i++;
            continue;
        }

        // Unordered list
        if (/^[-*+]\s/.test(t)) {
            const items = [];
            while (i < lines.length && /^[-*+]\s/.test(lines[i].trim())) {
                items.push(processInline(lines[i].trim().replace(/^[-*+]\s+/, '')));
                i++;
            }
            out.push('<ul>' + items.map(it => `<li>${it}</li>`).join('') + '</ul>');
            continue;
        }

        // Table
        if (t.startsWith('|')) {
            const rows = [];
            while (i < lines.length && lines[i].trim().startsWith('|')) {
                rows.push(lines[i].trim());
                i++;
            }
            out.push(parseTable(rows));
            continue;
        }

        // Blockquote
        if (/^>/.test(t)) {
            const quotes = [];
            while (i < lines.length && /^>/.test(lines[i].trim())) {
                quotes.push(processInline(lines[i].trim().replace(/^>\s?/, '')));
                i++;
            }
            out.push(`<blockquote>${quotes.join('<br>')}</blockquote>`);
            continue;
        }

        // Indented pre block (4+ spaces)
        if (/^ {4,}/.test(line)) {
            const pre = [];
            while (i < lines.length && /^ {4,}/.test(lines[i])) {
                pre.push(lines[i].replace(/^ {4}/, ''));
                i++;
            }
            out.push(`<pre><code>${escapeHtml(pre.join('\n'))}</code></pre>`);
            continue;
        }

        // Paragraph (collect consecutive non-empty lines that aren't block-level)
        const para = [];
        while (i < lines.length) {
            const l = lines[i];
            const tr = l.trim();
            if (!tr) break;
            if (tr.match(/^(#{1,6})\s/) || /^-{3,}\s*$/.test(tr)
                || /^[-*+]\s/.test(tr) || tr.startsWith('|')
                || /^>/.test(tr) || /^ {4,}/.test(l)
                || /^\x00CB\d+\x00$/.test(tr)) break;
            para.push(processInline(l));
            i++;
        }
        if (para.length) {
            out.push(`<p>${para.join('<br>')}</p>`);
        }
    }

    // 3. Restore code-block placeholders
    return out.join('\n').replace(/\x00CB(\d+)\x00/g, (_, id) => {
        return `<pre><code>${codeBlocks[parseInt(id)]}</code></pre>`;
    });
}

/** Parse inline markdown entities (bold, code, links, images). */
function processInline(text) {
    let t = text
        // Inline code first (protect from other parsing)
        .replace(/`([^`]+)`/g, (_, c) => `<code>${escapeHtml(c)}</code>`)
        // Images → use alt text
        .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
        // Bold
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        // Links — internal .md links open in-app, external links get target=_blank
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, href) => {
            if (/\.(md|txt)$/i.test(href)) return `<a href="${href}">${text}</a>`;
            return `<a href="${href}" target="_blank">${text}</a>`;
        });
    return t;
}

/** Parse a markdown table into HTML. */
function parseTable(rows) {
    let header = null;
    const body = [];
    let isHeader = true;

    for (const row of rows) {
        const cells = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        // Separator row (| --- | --- |)
        if (cells.every(c => /^[\s:-]+$/.test(c))) {
            isHeader = false;
            continue;
        }
        const processed = cells.map(c => processInline(c));
        if (isHeader) {
            header = processed;
        } else {
            body.push(processed);
        }
    }

    let html = '<table>';
    if (header) {
        html += '<thead><tr>' + header.map(h => `<th>${h}</th>`).join('') + '</tr></thead>';
    }
    if (body.length) {
        html += '<tbody>';
        for (const row of body) {
            html += '<tr>' + row.map(c => `<td>${c}</td>`).join('') + '</tr>';
        }
        html += '</tbody>';
    }
    html += '</table>';
    return html;
}

/** Apply the current language to all UI text. */
function applyLanguage() {
    const L = I18N[currentLang];
    document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh';
    // Language toggle button
    const langBtn = on('btn-lang');
    if (langBtn) {
        langBtn.textContent = L.langBtn;
        langBtn.title = L.langTip;
    }
    // Plot titles
    document.querySelector('#metrics-panel .plot-box:nth-child(1) .plot-title')
        .textContent = L.phaseTitle(0);
    document.querySelector('#metrics-panel .plot-box:nth-child(2) .plot-title')
        .textContent = L.energyTitle;
    // Help modal content
    const helpBody = document.getElementById('help-body');
    if (helpBody) helpBody.innerHTML = buildHelpHTML();
    // Footer — copyright & source link
    const footer = document.getElementById('app-footer');
    if (footer) {
        footer.innerHTML = `${L.copyright} · <a href="https://github.com/pseudonymzjt/Double-Pendulum-Visualizer" target="_blank">${L.sourceLink}</a>`;
    }
    updateControls();
}

/** Toggle UI language between English and Simplified Chinese. */
function toggleLanguage() {
    currentLang = currentLang === 'en' ? 'zh' : 'en';
    applyLanguage();
}

// --- README in-app viewer -----------------------------------------

/** Show the controls overview in the help modal. */
function showHelpOverview() {
    currentDocPath = null;
    const body = document.getElementById('help-body');
    if (body) body.innerHTML = buildHelpHTML();
}

/**
 * Fetch any .md / .txt file, parse it, render it in the modal body, and bind
 * internal wiki links so they load in-app instead of navigating away.
 *
 * The fetch URL MUST be strictly relative (e.g. ./README.txt) and the
 * filename casing MUST match the repository exactly.  On failure a
 * detailed user-facing error is shown so "undefined" never reaches
 * the rendering pipeline.
 */
function loadAndRenderMD(path) {
    currentDocPath = path;
    const body = document.getElementById('help-body');
    if (!body) return;

    // Show loading state immediately
    body.innerHTML = `<div class="help-loading">${I18N[currentLang].loading}</div>`;

    fetch(path)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Failed to load ${path} (Status: ${response.status})`);
            }
            return response.text();
        })
        .then(markdownText => {
            // Guard against empty content — don't pass undefined to the parser
            if (!markdownText) {
                throw new Error(`Empty document content: ${path}`);
            }

            // Parse & render
            const html = parseSimpleMarkdown(markdownText);
            const isRoot = path === './README.txt' || path === './README_ZH.txt';
            const L = I18N[currentLang];
            const topBar = isRoot
                ? `<div class="help-back-bar"><span class="help-back-btn">${L.backBtn}</span></div>`
                : `<div class="help-back-bar"><span class="help-back-guide">${L.guideIndex}</span></div>`;
            body.innerHTML = topBar + `<div class="help-readme-body">${html}</div>`;
            bindMarkdownLinks(body);
        })
        .catch(error => {
            console.error(error);
            body.innerHTML = `
                <div class="help-back-bar"><span class="help-back-guide">${I18N[currentLang].guideIndex}</span></div>
                <div class="error-container" style="text-align: center; padding: 40px 20px; color: #ff4a4a;">
                    <h2 style="font-size: 1.5em; margin-bottom: 10px;">⚠️ Guide Load Failed</h2>
                    <p style="font-size: 0.95em; opacity: 0.85; margin-bottom: 20px;">${error.message}</p>
                    <div style="font-size: 0.85em; opacity: 0.6; line-height: 1.6; text-align: left; max-width: 420px; margin: 0 auto; border-top: 1px solid rgba(255,255,255,0.1); padding-top: 15px;">
                        <p><strong>Common Fixes for UCAS Assignment Platform:</strong></p>
                        <ul>
                            <li>Ensure you renamed <code>README.md</code> to <code>README.txt</code> in your root folder.</li>
                            <li>Ensure <code>AI_ENCLOSURE.txt</code> is also placed in the root folder.</li>
                        </ul>
                    </div>
                </div>`;
        });
}

/**
 * Scan the rendered README body for all anchor tags pointing to .md / .txt files
 * and intercept their clicks to load in-app instead of browser navigation.
 */
function bindMarkdownLinks(container) {
    const readmeBody = container.querySelector('.help-readme-body');
    if (!readmeBody) return;
    readmeBody.querySelectorAll('a').forEach(a => {
        const href = a.getAttribute('href');
        if (href && /\.(md|txt)$/i.test(href)) {
            a.addEventListener('click', (e) => {
                e.preventDefault();
                // Rewrite .md -> .txt so internal links survive the rename
                const target = href.replace(/\.md$/i, '.txt');
                loadAndRenderMD(target);
            });
        }
    });
}

/** Fetch the README file for the current language and render it. */
function fetchAndShowReadme() {
    const filename = currentLang === 'en' ? './README.txt' : './README_ZH.txt';
    loadAndRenderMD(filename);
}

/**
 * Dual-purpose helper:
 *   on('id')              — returns the element (like getElementById)
 *   on('id', 'evt', fn)   — safely binds event listener, skips if element missing
 */
function on(id, event, handler) {
    const el = document.getElementById(id);
    if (arguments.length === 1) return el;
    if (el) {
        el.addEventListener(event, handler);
    } else {
        console.warn(`on: element "#${id}" not found, cannot bind "${event}"`);
    }
}

function snapAngle(rad) {
    const deg = rad * 180 / Math.PI;
    const snapped = Math.round(deg / SNAP_DEG) * SNAP_DEG;
    return Math.abs(deg - snapped) <= SNAP_THRESHOLD
        ? snapped * Math.PI / 180 : rad;
}

// --- Shared pivot & scale ---------------------------------------
const PIVOT = { x: 0, y: 0 };
let pxPerUnit = 0;               // pixels per simulation-unit-length

/** Build initial particles + link-lengths for an N-link pendulum. */
function buildChain(nLinks, thetaDeg) {
    const th = thetaDeg * Math.PI / 180;
    const baseLen = PHYS_L * pxPerUnit;
    const particles = [{ x: PIVOT.x, y: PIVOT.y }];
    const constraints = [];   // kept for length storage only
    let cx = PIVOT.x, cy = PIVOT.y;
    for (let i = 0; i < nLinks; i++) {
        const len = baseLen * Math.pow(LINK_SCALE, i);
        const nx = cx + len * Math.sin(th);
        const ny = cy + len * Math.cos(th);
        particles.push({ x: nx, y: ny });
        constraints.push({ a: i, b: i + 1, len });
        cx = nx; cy = ny;
    }
    return { particles, constraints };
}

// --- Pendulum state ---------------------------------------------

function createPendulum(nLinks, theta1Deg, color1, color2, copyFrom) {
    const chain = buildChain(nLinks, theta1Deg);
    const np = chain.particles.length;
    const N = chain.constraints.length;
    const ls = chain.constraints.map(c => c.len);
    const rad = theta1Deg * Math.PI / 180;
    const thetas = new Array(N).fill(rad);
    const omegas = new Array(N).fill(0);
    // JIT-friendly flat arrays (Float64Array) for the hot physics loop
    const scratch = createScratch();
    const ls_f64 = new Float64Array(MAX_LINKS);
    for (let i = 0; i < N; i++) ls_f64[i] = ls[i];
    const p = {
        thetas, omegas, ls, N, scratch, ls_f64,
        particles: chain.particles,
        constraints: chain.constraints,
        bob1X: 0, bob1Y: 0,
        bob2X: 0, bob2Y: 0,
        color1, color2,
        trails: Array.from({ length: np }, () => []),
        metrics: [],          // rolling buffer of physics snapshots for this pendulum
        visible: true,
        selected: false,
        _paletteIdx: 0,
    };
    computeParticlePositions(p);
    syncBobPositions(p);
    if (copyFrom) {
        for (let i = 1; i < np && i < copyFrom.trails.length; i++) {
            p.trails[i] = copyFrom.trails[i].map(pt => ({ ...pt }));
        }
    }
    return p;
}

/** Convert angles → pixel positions for all particles. */
function computeParticlePositions(p) {
    let cx = PIVOT.x, cy = PIVOT.y;
    const N = p.N;
    for (let i = 0; i < N; i++) {
        cx += p.ls[i] * Math.sin(p.thetas[i]);
        cy += p.ls[i] * Math.cos(p.thetas[i]);
        p.particles[i + 1].x = cx;
        p.particles[i + 1].y = cy;
    }
    p.particles[0].x = PIVOT.x;
    p.particles[0].y = PIVOT.y;
}

/** Sync backward‑compat bob positions from particles. */
function syncBobPositions(p) {
    p.bob1X = p.particles.length > 1 ? p.particles[1].x : PIVOT.x;
    p.bob1Y = p.particles.length > 1 ? p.particles[1].y : PIVOT.y;
    const last = p.particles[p.particles.length - 1];
    p.bob2X = last.x;
    p.bob2Y = last.y;
}

/** Check whether any physics variable has exploded to NaN or Infinity. */
function isPendulumInvalid(p) {
    for (let i = 0; i < p.N; i++) {
        if (isNaN(p.thetas[i]) || !isFinite(p.thetas[i])) return true;
        if (isNaN(p.omegas[i]) || !isFinite(p.omegas[i])) return true;
    }
    for (let i = 0; i < p.particles.length; i++) {
        if (isNaN(p.particles[i].x) || !isFinite(p.particles[i].x)) return true;
        if (isNaN(p.particles[i].y) || !isFinite(p.particles[i].y)) return true;
    }
    return false;
}

/** Reset a pendulum to a safe resting state after a numerical explosion. */
function safeResetPendulum(p) {
    console.warn('Physics exploded! Resetting to safe state.');
    p.omegas.fill(0);
    const safeRad = DEFAULT_ANGLE_DEG * Math.PI / 180;
    p.thetas.fill(safeRad);
    rebuildChain(p, p.constraints.length, DEFAULT_ANGLE_DEG);
    computeParticlePositions(p);
    syncBobPositions(p);
    for (const t of p.trails) t.length = 0;
}

/** Rebuild particles + constraints at a new pxPerUnit scale. */
function rebuildChain(p, nLinks, thetaDeg) {
    const chain = buildChain(nLinks, thetaDeg);
    p.particles = chain.particles;
    p.constraints = chain.constraints;
    p.ls = chain.constraints.map(c => c.len);
    p.N = p.ls.length;
    if (p.ls_f64) p.ls_f64.set(p.ls);  // sync Float64Array hot-path copy
    // Ensure trails array matches particle count
    while (p.trails.length < chain.particles.length) p.trails.push([]);
    while (p.trails.length > chain.particles.length) p.trails.pop();
}

const pendulums = [];
let chaosMode = false;
let paused = false;
let selectedPendulum = null;
let paletteIdx = 0;

// Phase 8 — Metrics & Analysis state
let metricsVisible = false;
let lastAngleHTML = '';          // cache to avoid redundant DOM writes

// Drag-to-set state
let dragTarget = null;   // particle index being dragged
let dragActive = false;

// Drag HUD — polar grid overlay showing snap increments during bob dragging
let dragHudOpacity = 0;
const dragHudPivot = { x: 0, y: 0 };
let dragHudRadius = 0;

// Color palette
const PALETTE = [
    { c1: '#6080c0', c2: '#00d4ff' },
    { c1: '#c060a0', c2: '#ff60c0' },
    { c1: '#60c080', c2: '#30ff88' },
    { c1: '#c0a050', c2: '#ffcc00' },
    { c1: '#8060c0', c2: '#bb66ff' },
    { c1: '#c06060', c2: '#ff6060' },
    { c1: '#60a0c0', c2: '#60ddff' },
    { c1: '#c08060', c2: '#ff9966' },
];
const C_A = PALETTE[0];
const C_B = PALETTE[1];
const EYE_ON_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
const EYE_OFF_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/><line x1="4" y1="4" x2="20" y2="20"/></svg>';

// --- Canvas (HiDPI) — dual layer ---------------------------------
const canvasA = on('canvas-a');
const canvasB = on('canvas-b');
const ctxA = canvasA.getContext('2d');
const ctxB = canvasB.getContext('2d');
let cw = 0, ch = 0;

function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    cw = window.innerWidth;
    ch = window.innerHeight;

    [canvasA, canvasB].forEach(c => {
        c.width = cw * dpr;
        c.height = ch * dpr;
        c.style.width = cw + 'px';
        c.style.height = ch + 'px';
    });
    ctxA.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctxB.setTransform(dpr, 0, 0, dpr, 0, 0);

    const minDim = Math.min(cw, ch);
    const mobile = window.matchMedia("(max-width: 768px)").matches;
    MAX_TRAIL_LENGTH = mobile ? 600 : 1200;
    TRAIL_LENGTH = Math.min(TRAIL_LENGTH, MAX_TRAIL_LENGTH);
    pxPerUnit = minDim * PENDULUM_VIEWPORT_FRACTION / PHYS_L;

    PIVOT.x = cw / 2;
    PIVOT.y = ch * 0.3;

    // Rebuild chains at the same angles, scaled to the new pxPerUnit
    for (const p of pendulums) {
        const n = p.constraints.length;
        if (n < 1) continue;
        // Preserve current angles, just rescale lengths
        const chain = buildChain(n, p.thetas[0] * 180 / Math.PI);
        p.particles = chain.particles;
        p.constraints = chain.constraints;
        p.ls = chain.constraints.map(c => c.len);
        p.N = p.ls.length;
        p.ls_f64.set(p.ls);
        computeParticlePositions(p);
        syncBobPositions(p);
    }
    clearTrails();
}

window.addEventListener('resize', resizeCanvas);

// --- General N-Pendulum Lagrangian Physics ----------------------

/**
 * For N links (0-indexed i,j = 0…N-1):
 *
 *   Aᵢⱼ = lᵢ lⱼ (N − max(i,j))          (equal masses)
 *   Mᵢⱼ = Aᵢⱼ cos(θᵢ − θⱼ)               → symmetric positive-definite
 *
 *   bᵢ  = − Σⱼ≠ᵢ Aᵢⱼ sin(θᵢ−θⱼ) ωⱼ²
 *         − g × lᵢ × (N−i) × sin(θᵢ)
 *
 * M is SPD → solved via Cholesky decomposition (M = L·Lᵀ) which
 * requires ~N³/3 flops vs ~2N³/3 for Gaussian elimination and
 * needs no pivoting.
 * ─────────────────────────────────────────────────────────── */

/**
 * Cholesky factorisation: M = L·Lᵀ.
 * L is lower-triangular, stored flat row-major in scratch.L.
 * M is read from scratch.M (not modified).  O(N³/3).
 */
function choleskyFactor(N, L, M) {
    L.fill(0);
    for (let j = 0; j < N; j++) {
        const jN = j * N;
        let diagSum = 0;
        for (let k = 0; k < j; k++) { const v = L[jN + k]; diagSum += v * v; }
        L[jN + j] = Math.sqrt(M[jN + j] - diagSum);
        const L_jj = L[jN + j];
        for (let i = j + 1; i < N; i++) {
            const iN = i * N;
            let offSum = 0;
            for (let k = 0; k < j; k++) offSum += L[iN + k] * L[jN + k];
            L[iN + j] = (M[iN + j] - offSum) / L_jj;
        }
    }
}

/** Forward (L·y = b) then backward (Lᵀ·α = y) substitution. */
function choleskySolve(N, L, b, y, alpha) {
    for (let i = 0; i < N; i++) {
        const iN = i * N;
        let sum = b[i];
        for (let j = 0; j < i; j++) sum -= L[iN + j] * y[j];
        y[i] = sum / L[iN + i];
    }
    for (let i = N - 1; i >= 0; i--) {
        let sum = y[i];
        for (let j = i + 1; j < N; j++) sum -= L[j * N + i] * alpha[j];
        alpha[i] = sum / L[i * N + i];
    }
    return alpha;
}

/**
 * Build M and b into pre-allocated scratch buffers, then solve M·α = b
 * via Cholesky.  Zero allocations — all buffers live on p.scratch.
 */
function computeAccel(thetas, omegas, ls, N, s) {
    const M = s.M, b = s.b;
    const gPx = G * pxPerUnit;

    for (let i = 0; i < N; i++) {
        const iN = i * N;
        const li = ls[i];
        const Ni = N - i;
        const sinTh_i = Math.sin(thetas[i]);
        let bi = 0;
        for (let j = 0; j < N; j++) {
            const Aij = li * ls[j] * (N - (i > j ? i : j));      // N−max(i,j)
            const dTheta = thetas[i] - thetas[j];
            M[iN + j] = Aij * Math.cos(dTheta);
            if (j !== i) bi -= Aij * Math.sin(dTheta) * omegas[j] * omegas[j];
        }
        b[i] = bi - gPx * li * Ni * sinTh_i;
    }

    choleskyFactor(N, s.L, M);
    return choleskySolve(N, s.L, b, s.y, s.alpha);
}

/**
 * RK4 integration using pre-allocated Float64Array scratch buffers.
 * Zero allocations inside the hot loop — every working vector is a
 * named view into p.scratch.
 */
function rk4Step(p, dt) {
    const h = dt / SUB_STEPS;
    const N = p.N;
    const s = p.scratch;
    const th = p.thetas;
    const om = p.omegas;
    const ls = p.ls_f64;

    for (let sub = 0; sub < SUB_STEPS; sub++) {
        // ── save sub-step initial state ──
        for (let i = 0; i < N; i++) { s.t0[i] = th[i]; s.o0[i] = om[i]; }

        // ── k1 ──
        const a1 = computeAccel(s.t0, s.o0, ls, N, s);
        for (let i = 0; i < N; i++) {
            s.k1_t[i] = h * s.o0[i];
            s.k1_o[i] = h * a1[i];
        }

        // ── k2 (half-step) ──
        for (let i = 0; i < N; i++) {
            s.tw[i] = s.t0[i] + s.k1_t[i] / 2;
            s.ow[i] = s.o0[i] + s.k1_o[i] / 2;
        }
        const a2 = computeAccel(s.tw, s.ow, ls, N, s);
        for (let i = 0; i < N; i++) {
            s.k2_t[i] = h * s.ow[i];
            s.k2_o[i] = h * a2[i];
        }

        // ── k3 (half-step) ──
        for (let i = 0; i < N; i++) {
            s.tw[i] = s.t0[i] + s.k2_t[i] / 2;
            s.ow[i] = s.o0[i] + s.k2_o[i] / 2;
        }
        const a3 = computeAccel(s.tw, s.ow, ls, N, s);
        for (let i = 0; i < N; i++) {
            s.k3_t[i] = h * s.ow[i];
            s.k3_o[i] = h * a3[i];
        }

        // ── k4 (full step) ──
        for (let i = 0; i < N; i++) {
            s.tw[i] = s.t0[i] + s.k3_t[i];
            s.ow[i] = s.o0[i] + s.k3_o[i];
        }
        const a4 = computeAccel(s.tw, s.ow, ls, N, s);
        for (let i = 0; i < N; i++) {
            s.k4_t[i] = h * s.ow[i];
            s.k4_o[i] = h * a4[i];
        }

        // ── weighted RK4 sum into state ──
        for (let i = 0; i < N; i++) {
            th[i] += (s.k1_t[i] + 2 * s.k2_t[i] + 2 * s.k3_t[i] + s.k4_t[i]) / 6;
            om[i] += (s.k1_o[i] + 2 * s.k2_o[i] + 2 * s.k3_o[i] + s.k4_o[i]) / 6;
        }
    }
}

function stepPhysics() {
    const dt = (1 / 60) * speedMultiplier;

    for (const p of pendulums) {
        if (!p.visible) continue;

        // Exact Lagrangian RK4 integration
        rk4Step(p, dt);

        // Slight velocity damping — tiny fraction removed each frame
        for (let i = 0; i < p.N; i++) {
            p.omegas[i] *= (1 - DAMPING);
        }

        // Convert angles → pixel positions
        computeParticlePositions(p);
        syncBobPositions(p);

        // NaN / Infinity safety net — detect numerical explosion and recover
        if (isPendulumInvalid(p)) {
            safeResetPendulum(p);
            continue;  // skip trail recording for this frame
        }

        // Record trails for all particles (inner = shorter limit, tip = full)
        const total = p.particles.length;
        for (let i = 1; i < total; i++) {
            const pt = p.particles[i];
            const trail = p.trails[i];
            const prev = trail.length > 0 ? trail[trail.length - 1] : null;
            const speed = prev ? Math.hypot(pt.x - prev.x, pt.y - prev.y) : 0;
            trail.push({ x: pt.x, y: pt.y, s: speed });
            const ratio = i / (total - 1);
            const limit = Math.round(TRAIL_LENGTH * (0.15 + 0.85 * ratio));
            if (trail.length > limit) trail.shift();
        }
    }

    // Collect metrics for analysis (each pendulum stores its own buffer)
    if (metricsVisible) collectMetrics();
}

// --- Phase 8 — Mathematical Analysis & Phase Plots ---------------

/** Physical link lengths in meters (not pixels). */
function physLengths(p) {
    const pl = [];
    for (let i = 0; i < p.N; i++) pl.push(PHYS_L * Math.pow(LINK_SCALE, i));
    return pl;
}

/**
 * Compute kinetic energy, potential energy, and total energy
 * for an N-link pendulum (unit-mass bobs).
 *
 *   KE = ½ Σᵢⱼ lᵢ lⱼ (N − max(i,j)) cos(θᵢ−θⱼ) ωᵢ ωⱼ
 *   PE = −g Σᵢ (N−i) lᵢ cos(θᵢ)
 *
 * The negative sign in PE is because the physics engine uses a
 * y-up convention for the Lagrangian (so the EOM term has −g sin θ),
 * consistent with the standard derivation.
 */
function computeEnergy(p) {
    const N = p.N;
    const pl = physLengths(p);
    const th = p.thetas;
    const om = p.omegas;

    let KE = 0;
    for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
            const dTheta = th[i] - th[j];
            const Aij = pl[i] * pl[j] * (N - Math.max(i, j));
            KE += Aij * Math.cos(dTheta) * om[i] * om[j];
        }
    }
    KE *= 0.5;

    let PE = 0;
    for (let i = 0; i < N; i++) {
        PE += (N - i) * pl[i] * Math.cos(th[i]);
    }
    PE *= -G;

    return { KE, PE, totalE: KE + PE };
}

/** Collect metrics snapshot from every visible pendulum. */
function collectMetrics() {
    for (const p of pendulums) {
        if (!p.visible) continue;
        const e = computeEnergy(p);
        p.metrics.push({
            thetas: p.thetas.slice(),
            omegas: p.omegas.slice(),
            KE: e.KE,
            PE: e.PE,
            totalE: e.totalE,
            step: globalMetricsStep,
        });
        while (p.metrics.length > METRICS_CAPACITY) p.metrics.shift();
    }
    globalMetricsStep++;
}

/** Return the pendulum whose data should be displayed in the plots. */
function getTrackedPendulum() {
    if (selectedPendulum !== null && pendulums[selectedPendulum]) {
        return pendulums[selectedPendulum];
    }
    return pendulums[0];
}

/** Clear all collected metrics across every pendulum. */
function clearMetrics() {
    for (const p of pendulums) {
        p.metrics.length = 0;
    }
    globalMetricsStep = 0;
}

// --- Plot rendering utilities ------------------------------------

let PLOT_W = 290;
let PLOT_H = 180;
let zoomedPlotId = null;    // null, 'phase', or 'energy'
let plotPhaseCtx = null;    // cached 2d context for phase plot
let plotEnergyCtx = null;   // cached 2d context for energy plot

const PLOT_MARGIN = { left: 58, right: 58, top: 38, bottom: 40 };

function innerW() { return PLOT_W - PLOT_MARGIN.left - PLOT_MARGIN.right; }
function innerH() { return PLOT_H - PLOT_MARGIN.top - PLOT_MARGIN.bottom; }

/** Compute data range with ±10% padding, ensuring a minimum span. */
function dataRange(values) {
    let lo = Infinity, hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const span = hi - lo || 1;
    const pad = span * 0.1;
    return { min: lo - pad, max: hi + pad };
}

/** Round a tick value to a nicer number. */
function niceNum(val) {
    const exp = Math.pow(10, Math.floor(Math.log10(Math.abs(val))));
    return Math.round(val / exp) * exp;
}

/** Map data → canvas pixel (inner plot area with margins). */
function pxX(dataVal, dataMin, dataMax) {
    if (dataMax === dataMin) return PLOT_MARGIN.left + innerW() / 2;
    return PLOT_MARGIN.left + innerW() * (dataVal - dataMin) / (dataMax - dataMin);
}
function pxY(dataVal, dataMin, dataMax) {
    if (dataMax === dataMin) return PLOT_MARGIN.top + innerH() / 2;
    return PLOT_MARGIN.top + innerH() * (1 - (dataVal - dataMin) / (dataMax - dataMin));
}

/** Setup HiDPI canvas context for a plot. Reads CSS dimensions. */
function setupPlotCanvas(canvas, ctx) {
    const w = canvas.clientWidth || PLOT_W;
    const h = canvas.clientHeight || PLOT_H;
    PLOT_W = w;
    PLOT_H = h;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
}

/** Draw dashed grid lines (horizontal + vertical) within margins. */
function drawPlotGrid(ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = 0.8;
    const left = PLOT_MARGIN.left, right = PLOT_W - PLOT_MARGIN.right;
    const top = PLOT_MARGIN.top, bot = PLOT_H - PLOT_MARGIN.bottom;
    const nx = 6, ny = 5;
    for (let i = 0; i <= nx; i++) {
        const x = left + innerW() * i / nx;
        ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bot); ctx.stroke();
    }
    for (let i = 0; i <= ny; i++) {
        const y = top + innerH() * i / ny;
        ctx.beginPath(); ctx.moveTo(left, y); ctx.lineTo(right, y); ctx.stroke();
    }
}

/** Draw axis zero-lines for phase portraits, clipped to margin area. */
function drawZeroAxes(ctx, xMin, xMax, yMin, yMax) {
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1.2;
    const top = PLOT_MARGIN.top, bot = PLOT_H - PLOT_MARGIN.bottom;
    const left = PLOT_MARGIN.left, right = PLOT_W - PLOT_MARGIN.right;
    if (xMin < 0 && xMax > 0) {
        const x0 = pxX(0, xMin, xMax);
        ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0, bot); ctx.stroke();
    }
    if (yMin < 0 && yMax > 0) {
        const y0 = pxY(0, yMin, yMax);
        ctx.beginPath(); ctx.moveTo(left, y0); ctx.lineTo(right, y0); ctx.stroke();
    }
}

/** Draw numeric tick labels in the margins. */
function drawTickLabels(ctx, xMin, xMax, yMin, yMax, xLabel, yLabel, xFmt, yFmt) {
    const fmtX = xFmt || (v => v.toFixed(1));
    const fmtY = yFmt || (v => v.toFixed(1));
    const bot = PLOT_H - PLOT_MARGIN.bottom;
    const left = PLOT_MARGIN.left;

    // --- X-axis ticks (bottom margin, 5 ticks) ---
    ctx.font = '9px "SF Mono","Fira Code",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const txCount = 5;
    for (let i = 0; i <= txCount; i++) {
        const val = xMin + (xMax - xMin) * i / txCount;
        const px = pxX(val, xMin, xMax);
        const label = fmtX(val);
        // Tick mark
        ctx.beginPath(); ctx.moveTo(px, bot); ctx.lineTo(px, bot + 5); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
        ctx.fillText(label, px, bot + 7);
    }

    // X-axis name (in bottom margin, centered)
    ctx.font = 'bold 10px "SF Mono","Fira Code",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(xLabel, PLOT_W - PLOT_MARGIN.right + 12, bot - 4);

    // --- Y-axis ticks (right margin, 5 ticks) ---
    ctx.font = '9px "SF Mono","Fira Code",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    const right = PLOT_W - PLOT_MARGIN.right;
    const tyCount = 4;
    for (let i = 0; i <= tyCount; i++) {
        const val = yMin + (yMax - yMin) * i / tyCount;
        const py = pxY(val, yMin, yMax);
        const label = fmtY(val);
        // Tick mark
        ctx.beginPath(); ctx.moveTo(right, py); ctx.lineTo(right + 5, py); ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.stroke();
        ctx.fillText(label, right + 9, py);
    }

    // Y-axis name (top-left of inner area)
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 10px "SF Mono","Fira Code",monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(yLabel, left - 2, PLOT_MARGIN.top - 16);
}

/** Draw a single fading line through a data series with wrap detection. */
function drawFadingLine(ctx, data, xMin, xMax, yMin, yMax, getX, getY, color) {
    const len = data.length;
    if (len < 2) return;

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    const segments = len - 1;
    const batches = 48;
    const batchSize = Math.max(1, Math.ceil(segments / batches));

    const left = PLOT_MARGIN.left;
    const right = PLOT_W - PLOT_MARGIN.right;
    const top = PLOT_MARGIN.top;
    const bot = PLOT_H - PLOT_MARGIN.bottom;

    // If a consecutive pair of X values jumps by more than half the data
    // range, break the line — avoids spurious cross-graph segments from
    // angle wrapping (359° → 1°).
    const xRange = xMax - xMin;
    const wrapThreshold = xRange * 0.5;

    for (let bIdx = 0; bIdx < batches; bIdx++) {
        const start = bIdx * batchSize;
        const end = Math.min(start + batchSize, segments);
        if (start >= end) break;

        const t = (bIdx + 1) / batches;
        const alpha = 0.12 + t * 0.83;
        const haloAlpha = alpha * 0.35;

        // --- Draw one batch: halo pass + core pass ---
        for (let pass = 0; pass < 2; pass++) {
            const isHalo = pass === 0;
            ctx.strokeStyle = isHalo
                ? `rgba(${r},${g},${b},${haloAlpha.toFixed(3)})`
                : `rgba(${r},${g},${b},${alpha.toFixed(3)})`;
            ctx.lineWidth = isHalo ? 3.2 : 1.5;
            ctx.beginPath();

            for (let i = start; i <= end; i++) {
                const xv = getX(data[i], i);
                const px = pxX(xv, xMin, xMax);
                const py = pxY(getY(data[i], i), yMin, yMax);
                const inBounds = px >= left - 2 && px <= right + 2 && py >= top - 2 && py <= bot + 2;
                if (!inBounds) { ctx.stroke(); ctx.beginPath(); continue; }

                if (i === start) {
                    ctx.moveTo(px, py);
                } else {
                    // Detect angular/cyclic wrap — break the line so we don't
                    // connect two points that are adjacent in time but far
                    // apart in the cyclic coordinate (e.g. 358° → 2°).
                    const prevX = getX(data[i - 1], i - 1);
                    if (Math.abs(xv - prevX) > wrapThreshold) {
                        ctx.stroke();
                        ctx.beginPath();
                        ctx.moveTo(px, py);
                    } else {
                        ctx.lineTo(px, py);
                    }
                }
            }
            ctx.stroke();
        }
    }
}

/** Draw a solid multi-series line chart (for energy), clipped to margins. */
function drawSolidLine(ctx, data, xMin, xMax, yMin, yMax, getX, getY, color) {
    if (data.length < 2) return;

    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);

    const left = PLOT_MARGIN.left;
    const right = PLOT_W - PLOT_MARGIN.right;
    const top = PLOT_MARGIN.top;
    const bot = PLOT_H - PLOT_MARGIN.bottom;

    // Faint glow halo
    ctx.strokeStyle = `rgba(${r},${g},${b},0.25)`;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const px = pxX(getX(data[i], i), xMin, xMax);
        const py = pxY(getY(data[i], i), yMin, yMax);
        if (px < left - 5 || px > right + 5 || py < top - 5 || py > bot + 5) {
            ctx.stroke(); ctx.beginPath(); continue;
        }
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();

    // Core bright line
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    for (let i = 0; i < data.length; i++) {
        const px = pxX(getX(data[i], i), xMin, xMax);
        const py = pxY(getY(data[i], i), yMin, yMax);
        if (px < left - 5 || px > right + 5 || py < top - 5 || py > bot + 5) {
            ctx.stroke(); ctx.beginPath(); continue;
        }
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
    }
    ctx.stroke();
}

// --- Main plot renderers -----------------------------------------

function renderPhasePortrait() {
    const p = getTrackedPendulum();

    // Update title immediately (even if no data yet)
    const idx = pendulums.indexOf(p || pendulums[0]);
    const pid = idx >= 0 ? idx : 0;
    document.querySelector('#metrics-panel .plot-box:nth-child(1) .plot-title')
        .textContent = I18N[currentLang].phaseTitle(pid);

    if (!p || p.metrics.length < 2) return;
    const data = p.metrics;
    const N = p.N;

    const canvas = on('plot-phase');
    if (!plotPhaseCtx) plotPhaseCtx = canvas.getContext('2d');
    const ctx = plotPhaseCtx;
    setupPlotCanvas(canvas, ctx);

    // Normalise θ₁ to [-π, π) for consistent -180°–180° view
    const twoPi = 2 * Math.PI;
    const norm = v => {
        const w = ((v % twoPi) + twoPi) % twoPi;
        return w > Math.PI ? w - twoPi : w;
    };
    const X = data.map(d => norm(d.thetas[0]));
    const Y = data.map(d => d.omegas[0]);
    const pi = Math.PI;
    const xRange = { min: -pi, max: pi };  // fixed range -π → π
    const yRange = dataRange(Y);

    drawPlotGrid(ctx);
    const top = PLOT_MARGIN.top, bot = PLOT_H - PLOT_MARGIN.bottom;
    const left = PLOT_MARGIN.left, right = PLOT_W - PLOT_MARGIN.right;
    drawZeroAxes(ctx, xRange.min, xRange.max, yRange.min, yRange.max);

    // Tick labels in degrees, fixed -180–180 range
    drawTickLabels(ctx, -180, 180, yRange.min, yRange.max,
        'θ(°)', 'ω', v => v.toFixed(0) + '°', v => v.toFixed(1));
    drawFadingLine(ctx, data, xRange.min, xRange.max, yRange.min, yRange.max,
        d => norm(d.thetas[0]), d => d.omegas[0], p.color2);

    // Plot border around inner area (left/right/top/bot already declared above)
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, right - left + 1, bot - top + 1);
}

function renderEnergyPlot() {
    const p = getTrackedPendulum();
    if (!p || p.metrics.length < 2) return;
    const data = p.metrics;
    const first = data[0];
    const last = data[data.length - 1];

    const canvas = on('plot-energy');
    if (!plotEnergyCtx) plotEnergyCtx = canvas.getContext('2d');
    const ctx = plotEnergyCtx;
    setupPlotCanvas(canvas, ctx);

    // Use monotonically increasing step numbers — as the buffer slides
    // the range always grows, so the X-axis labels change every frame.
    const xRange = { min: first.step, max: last.step };
    if (xRange.max - xRange.min < 1) xRange.max = xRange.min + 1;

    // Collect all three series to find a shared Y range
    const allVals = [];
    data.forEach(d => { allVals.push(d.KE, d.PE, d.totalE); });
    const yRange = dataRange(allVals);

    drawPlotGrid(ctx);

    // Draw each energy component
    drawSolidLine(ctx, data, xRange.min, xRange.max, yRange.min, yRange.max,
        d => d.step, d => d.KE, '#ff6060');
    drawSolidLine(ctx, data, xRange.min, xRange.max, yRange.min, yRange.max,
        d => d.step, d => d.PE, '#30ff88');
    drawSolidLine(ctx, data, xRange.min, xRange.max, yRange.min, yRange.max,
        d => d.step, d => d.totalE, '#ffffff');

    // Numeric ticks — format X as frame count
    drawTickLabels(ctx, xRange.min, xRange.max, yRange.min, yRange.max,
        'frame', 'E', v => v.toFixed(0), v => v.toFixed(1));

    // Plot border around inner area
    const left = PLOT_MARGIN.left, right = PLOT_W - PLOT_MARGIN.right;
    const top = PLOT_MARGIN.top, bot = PLOT_H - PLOT_MARGIN.bottom;
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    ctx.strokeRect(left - 0.5, top - 0.5, right - left + 1, bot - top + 1);

    // Compact colored-dot legend (anchored to top-left of inner plot area)
    const lx = left + 6, ly = top + 6, gap = 12;
    ctx.font = '8px "SF Mono","Fira Code",monospace';
    // KE — coral square
    ctx.fillStyle = '#ff6060';
    ctx.fillRect(lx, ly - 5, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('KE', lx + 9, ly);
    // PE — green square
    ctx.fillStyle = '#30ff88';
    ctx.fillRect(lx, ly + gap - 5, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('PE', lx + 9, ly + gap);
    // Total — white square
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(lx, ly + 2 * gap - 5, 6, 6);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('E', lx + 9, ly + 2 * gap);
}

function toggleMetricsPanel() {
    metricsVisible = !metricsVisible;
    on('metrics-panel').classList.toggle('show', metricsVisible);
    zoomedPlotId = null;  // reset zoom on toggle
    if (!metricsVisible) {
        clearMetrics();
    }
}

/** Toggle the settings (params) panel — used on mobile where it starts hidden. */
function toggleSettingsPanel() {
    on('params-panel').classList.toggle('show');
}

/** Show / hide the help modal with README controls. */
function toggleHelpModal() {
    const modal = on('help-modal');
    // Show overview whenever the modal opens
    if (!modal.classList.contains('show')) {
        showHelpOverview();
    }
    modal.classList.toggle('show');
}

/** Click a plot to zoom it full-screen; click again to shrink back. */
function togglePlotZoom(plotId) {
    if (zoomedPlotId === plotId) {
        zoomedPlotId = null;
    } else {
        zoomedPlotId = plotId;
    }
    const panel = on('metrics-panel');
    panel.classList.toggle('zoom-phase', zoomedPlotId === 'phase');
    panel.classList.toggle('zoom-energy', zoomedPlotId === 'energy');
}

// --- Controls ---------------------------------------------------

const DEFAULT_ANGLE_DEG = 135;  // ≈ 0.75π rad

function toggleChaos() {
    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    } else {
        if (pendulums.length >= MAX_PENDULUMS) return;
        const a = pendulums[0];
        const n = a.constraints.length;
        // Copy A's angles + tiny offset for butterfly-effect divergence
        const b = createPendulum(n, DEFAULT_ANGLE_DEG, C_B.c1, C_B.c2, a);
        for (let i = 0; i < n; i++) {
            b.thetas[i] = a.thetas[i];
            b.omegas[i] = a.omegas[i];
        }
        b.thetas[0] += CHAOS_OFFSET;   // 0.01° offset on θ₁ for divergence
        computeParticlePositions(b);
        syncBobPositions(b);
        pendulums.push(b);
        chaosMode = true;
    }
    updateControls();
    saveStateToURL();
}

function resetSimulation() {
    const rad = DEFAULT_ANGLE_DEG * Math.PI / 180;
    for (const p of pendulums) {
        const n = p.constraints.length;
        p.thetas.fill(rad);
        p.omegas.fill(0);
        rebuildChain(p, n, DEFAULT_ANGLE_DEG);
        computeParticlePositions(p);
        syncBobPositions(p);
        for (const t of p.trails) t.length = 0;
    }

    if (chaosMode) {
        if (pendulums.length > 1) pendulums.pop();
        chaosMode = false;
    }
    clearMetrics();
    updateControls();
    saveStateToURL();
}

function clearTrails() {
    for (const p of pendulums) {
        for (const t of p.trails) t.length = 0;
    }
}

function saveArtwork() {
    const dpr = window.devicePixelRatio || 1;
    const tmp = document.createElement('canvas');
    tmp.width = cw * dpr;
    tmp.height = ch * dpr;
    const tc = tmp.getContext('2d');
    tc.drawImage(canvasA, 0, 0);
    tc.drawImage(canvasB, 0, 0);
    const link = document.createElement('a');
    link.download = 'double-pendulum-art.png';
    link.href = tmp.toDataURL('image/png');
    link.click();
}

function updateAngleDisplay() {
    const el = on('angle-display');
    if (pendulums.length === 0) {
        if (lastAngleHTML !== '') { el.innerHTML = ''; lastAngleHTML = ''; }
        return;
    }

    let html = '';
    for (let idx = 0; idx < pendulums.length; idx++) {
        const p = pendulums[idx];
        if (!p.visible) continue;

        const parts = [];
        for (let i = 0; i < p.N; i++) {
            const raw = (p.thetas[i] * 180 / Math.PI) % 360;
            const deg = raw > 180 ? raw - 360 : raw < -180 ? raw + 360 : raw;
            parts.push(`θ${String.fromCharCode(0x2080 + i + 1)} ${deg.toFixed(1)}°`);
        }
        const marker = idx === selectedPendulum ? '▸' : '●';
        const selClass = idx === selectedPendulum ? ' sel' : '';
        html += `<div class="pend-entry${selClass}" data-idx="${idx}" style="color:${p.color2}">`
            + `<span class="marker">${marker}</span> ${parts.join('  ')}</div>`;
    }
    if (html !== lastAngleHTML) {
        el.innerHTML = html;
        lastAngleHTML = html;
    }
}

// Pick pendulums by clicking their angle-display entry.
// Uses pointerdown (fires before click, separate event type) so
// plot-canvas click handlers with stopPropagation never block it.
document.addEventListener('pointerdown', (e) => {
    const entry = e.target.closest('.pend-entry');
    if (!entry) return;
    if (!on('angle-display').contains(entry)) return;
    const idx = parseInt(entry.dataset.idx, 10);
    if (isNaN(idx) || !pendulums[idx]) return;
    selectPendulum(idx);
    // Brief visual flash to confirm the click
    entry.style.transition = 'background 0s';
    entry.style.background = 'rgba(255,255,255,0.18)';
    requestAnimationFrame(() => {
        entry.style.transition = '';
        entry.style.background = '';
    });
});

function updateControls() {
    const L = I18N[currentLang];
    on('btn-play').textContent = paused ? L.playPlaying : L.playPaused;
    on('btn-chaos').textContent = chaosMode ? L.chaosSingle : L.chaosChaos;
    on('btn-reset').textContent = L.reset;
    on('btn-metrics').textContent = L.metrics;
    on('btn-clear').textContent = L.clear;
    on('btn-save').textContent = L.save;
    on('btn-share').textContent = L.share;
    on('btn-help').textContent = L.guide;
    on('label-gravity').textContent = L.paramGravity;
    on('label-damping').textContent = L.paramDamping;
    on('label-speed').textContent = L.paramSpeed;
    on('btn-add').title = pendulums.length >= MAX_PENDULUMS ? L.addTitleMax : L.addTitle;
    on('btn-add').disabled = pendulums.length >= MAX_PENDULUMS;
    on('btn-gear').title = L.settingsTitle;
    const hasSel = selectedPendulum !== null && pendulums[selectedPendulum];
    on('ctx-menu').classList.toggle('show', !!hasSel);
    updateAngleDisplay();
    if (hasSel) {
        const p = pendulums[selectedPendulum];
        // ctx-color SVG is in the HTML — no dynamic change needed
        // ctx-visibility swaps between eye-open and eye-off SVGs
        on('ctx-visibility').innerHTML = p.visible ? EYE_ON_SVG : EYE_OFF_SVG;
        const n = p.constraints.length;
        const atMaxLinks = n >= MAX_LINKS;
        on('ctx-add-joint').style.display = atMaxLinks ? 'none' : '';
        on('ctx-add-joint').title = atMaxLinks ? L.addJointTitleMax : L.addJointTitle;
        on('ctx-rm-joint').style.display = n > MIN_LINKS ? '' : 'none';
    } else {
        on('ctx-add-joint').style.display = 'none';
        on('ctx-rm-joint').style.display = 'none';
    }
}

// --- Button handlers --------------------------------------------

on('btn-play', 'click', () => {
    paused = !paused;
    updateControls();
});

on('btn-reset', 'click', resetSimulation);
on('btn-chaos', 'click', toggleChaos);
on('btn-clear', 'click', clearTrails);

on('btn-save', 'click', saveArtwork);

// --- Parameter sliders ---

on('param-gravity', 'input', (e) => {
    G = parseFloat(e.target.value);
    on('grav-value').textContent = G.toFixed(1);
    saveStateToURL();
});

on('param-damping', 'input', (e) => {
    DAMPING = parseFloat(e.target.value);
    on('damp-value').textContent = DAMPING.toFixed(4);
    saveStateToURL();
});

on('param-speed', 'input', (e) => {
    speedMultiplier = parseFloat(e.target.value);
    on('speed-value').textContent = speedMultiplier.toFixed(1) + '×';
    saveStateToURL();
});
on('btn-add', 'click', addPendulum);
on('btn-metrics', 'click', toggleMetricsPanel);
on('btn-gear', 'click', toggleSettingsPanel);
on('btn-lang', 'click', toggleLanguage);
on('btn-help', 'click', toggleHelpModal);
on('help-close', 'click', toggleHelpModal);

// Event delegation for interactive links inside the help modal body
on('help-body', 'click', (e) => {
    const guideLink = e.target.closest('.help-guide-link');
    if (guideLink) { e.preventDefault(); fetchAndShowReadme(); return; }
    const backBtn = e.target.closest('.help-back-btn');
    if (backBtn) { e.preventDefault(); showHelpOverview(); return; }
    const backGuide = e.target.closest('.help-back-guide');
    if (backGuide) {
        e.preventDefault();
        const rootPath = currentLang === 'en' ? './README.txt' : './README_ZH.txt';
        loadAndRenderMD(rootPath);
        return;
    }
});

// Apply language on load (so all button texts are set)
applyLanguage();

// Close help modal on Escape key or click outside content
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && on('help-modal').classList.contains('show')) {
        toggleHelpModal();
    }
});
on('help-modal', 'click', (e) => {
    if (e.target === on('help-modal')) {
        toggleHelpModal();
    }
});

// Click-to-zoom on plot canvases (only when panel is visible)
on('plot-phase', 'click', (e) => {
    if (!metricsVisible) return;
    e.stopPropagation();
    togglePlotZoom('phase');
});
on('plot-energy', 'click', (e) => {
    if (!metricsVisible) return;
    e.stopPropagation();
    togglePlotZoom('energy');
});

on('ctx-color', 'click', cycleColor);
on('ctx-visibility', 'click', toggleVisibility);
on('ctx-delete', 'click', deleteSelected);
on('ctx-add-joint', 'click', addJoint);
on('ctx-rm-joint', 'click', removeJoint);

document.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        paused = !paused;
        updateControls();
    } else if (e.key === 'r' || e.key === 'R') {
        resetSimulation();
    } else if (e.key === 'c' || e.key === 'C') {
        toggleChaos();
    } else if (e.key === 'm' || e.key === 'M') {
        toggleMetricsPanel();
    } else if ((e.key === '[' || e.key === ']') && metricsVisible) {
        // Cycle through visible pendulums while metrics panel is open
        const visible = pendulums.filter(p => p.visible);
        if (visible.length < 2) return;
        const cur = getTrackedPendulum();
        const curIdx = visible.indexOf(cur);
        const next = e.key === ']'
            ? visible[(curIdx + 1) % visible.length]
            : visible[(curIdx - 1 + visible.length) % visible.length];
        const nextGlobalIdx = pendulums.indexOf(next);
        selectPendulum(nextGlobalIdx);
    }
});

// --- Multi-pendulum management ----------------------------------

function assignPaletteColor(p) {
    const c = PALETTE[paletteIdx % PALETTE.length];
    p.color1 = c.c1;
    p.color2 = c.c2;
    p._paletteIdx = paletteIdx % PALETTE.length;
    paletteIdx++;
}

function addPendulum() {
    if (pendulums.length >= MAX_PENDULUMS) return;
    const p = createPendulum(MIN_LINKS, DEFAULT_ANGLE_DEG, '#888', '#888');
    assignPaletteColor(p);
    pendulums.push(p);
    selectPendulum(pendulums.length - 1);
    updateControls();
    saveStateToURL();
}

function selectPendulum(idx) {
    if (selectedPendulum !== null && pendulums[selectedPendulum]) {
        pendulums[selectedPendulum].selected = false;
    }
    selectedPendulum = idx;
    if (idx !== null && pendulums[idx]) pendulums[idx].selected = true;
    updateControls();
}

function deleteSelected() {
    if (selectedPendulum === null) return;
    if (pendulums.length <= 1) return;
    pendulums.splice(selectedPendulum, 1);
    selectPendulum(null);
    if (chaosMode && pendulums.length < 2) chaosMode = false;
    updateControls();
    saveStateToURL();
}

function cycleColor() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    paletteIdx = p._paletteIdx + 1;
    assignPaletteColor(p);
    updateControls();
    saveStateToURL();
}

function toggleVisibility() {
    if (selectedPendulum === null) return;
    pendulums[selectedPendulum].visible = !pendulums[selectedPendulum].visible;
    updateControls();
    saveStateToURL();
}

// --- Joint modifiers (N-link) -----------------------------------

function addJoint() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    if (p.constraints.length >= MAX_LINKS) return;
    const last = p.constraints.length;
    const tip = p.particles[last];
    const prev = p.particles[last - 1];
    const dirX = tip.x - prev.x;
    const dirY = tip.y - prev.y;
    const dist = Math.hypot(dirX, dirY);
    let ux, uy;
    if (dist > 1e-9) {
        ux = dirX / dist;
        uy = dirY / dist;
    } else {
        // Degenerate: tip and previous particle coincide — use last known angle
        const lastAngle = p.thetas[p.thetas.length - 1];
        ux = Math.sin(lastAngle);
        uy = Math.cos(lastAngle);
    }
    const newLen = p.constraints[p.constraints.length - 1].len * LINK_SCALE;
    p.particles.push({
        x: tip.x + ux * newLen,
        y: tip.y + uy * newLen,
    });
    p.constraints.push({ a: last, b: last + 1, len: newLen });
    p.trails.push([]);
    // New link inherits last segment's angle
    p.thetas.push(p.thetas[p.thetas.length - 1]);
    p.omegas.push(0);
    p.ls = p.constraints.map(c => c.len);
    p.N = p.ls.length;
    p.ls_f64.set(p.ls);           // sync Float64Array hot-path copy
    computeParticlePositions(p);
    syncBobPositions(p);
    updateControls();
    saveStateToURL();
}

function removeJoint() {
    if (selectedPendulum === null) return;
    const p = pendulums[selectedPendulum];
    if (p.constraints.length <= MIN_LINKS) return;
    p.particles.pop();
    p.constraints.pop();
    p.trails.pop();
    p.thetas.pop();
    p.omegas.pop();
    p.ls = p.constraints.map(c => c.len);
    p.N = p.ls.length;
    p.ls_f64.set(p.ls);           // sync Float64Array hot-path copy
    computeParticlePositions(p);
    syncBobPositions(p);
    updateControls();
    saveStateToURL();
}

// --- Selection & drag -------------------------------------------

function hitTestBob(mx, my) {
    for (let i = pendulums.length - 1; i >= 0; i--) {
        const p = pendulums[i];
        if (!p.visible) continue;
        // Check tip first (outermost particle)
        const tip = p.particles.length - 1;
        if (Math.hypot(mx - p.particles[tip].x, my - p.particles[tip].y) < HIT_RADIUS)
            return { idx: i, particle: tip };
        for (let j = p.particles.length - 2; j >= 1; j--) {
            if (Math.hypot(mx - p.particles[j].x, my - p.particles[j].y) < HIT_RADIUS)
                return { idx: i, particle: j };
        }
    }
    return null;
}

function dragParticle(p, partIdx, mx, my) {
    if (partIdx === 0) return;

    // Compute the angle from parent particle to mouse.
    const parent = p.particles[partIdx - 1];
    const dx = mx - parent.x;
    const dy = my - parent.y;
    const rawAngle = Math.atan2(dx, dy);
    const newAngle = snapAngle(rawAngle);

    // Set the angle of the link at (partIdx-1). For partIdx=1 that's θ₁,
    // for the tip of a 3-link that's θ₃, etc.
    p.thetas[partIdx - 1] = newAngle;

    // Zero all velocities during drag
    p.omegas.fill(0);

    computeParticlePositions(p);
    syncBobPositions(p);
}

// Suppress the browser context menu on the canvas
canvasB.addEventListener('contextmenu', (e) => e.preventDefault());

canvasB.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (!paused) return;
    const rect = canvasB.getBoundingClientRect();
    const hit = hitTestBob(e.clientX - rect.left, e.clientY - rect.top);
    if (hit) {
        selectPendulum(hit.idx);
        dragTarget = hit.particle;
        dragActive = true;
        canvasB.style.cursor = 'grabbing';
        // Capture HUD data for polar grid overlay
        const _p = pendulums[hit.idx];
        dragHudPivot.x = _p.particles[hit.particle - 1].x;
        dragHudPivot.y = _p.particles[hit.particle - 1].y;
        dragHudRadius = _p.ls[hit.particle - 1];
        dragHudOpacity = 0.01;
    } else {
        selectPendulum(null);
    }
});

document.addEventListener('mousemove', (e) => {
    if (!paused) return;
    const rect = canvasB.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (dragActive && dragTarget !== null && selectedPendulum !== null) {
        dragParticle(pendulums[selectedPendulum], dragTarget, mx, my);
    } else {
        canvasB.style.cursor = hitTestBob(mx, my) ? 'grab' : 'default';
    }
});

document.addEventListener('mouseup', () => {
    if (dragActive) {
        dragActive = false;
        dragTarget = null;
        canvasB.style.cursor = 'default';
        saveStateToURL();  // save state after drag-set angles
    }
});

canvasB.addEventListener('mouseleave', () => {
    if (dragActive) {
        dragActive = false;
        dragTarget = null;
        canvasB.style.cursor = 'default';
    }
});

// Touch support — passive:false so preventDefault() suppresses page bounce
canvasB.addEventListener('touchstart', (e) => {
    if (!paused) return;
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    const hit = hitTestBob(touch.clientX - rect.left, touch.clientY - rect.top);
    if (hit) {
        e.preventDefault();
        selectPendulum(hit.idx);
        dragTarget = hit.particle;
        dragActive = true;
        // Capture HUD data for polar grid overlay
        const _p = pendulums[hit.idx];
        dragHudPivot.x = _p.particles[hit.particle - 1].x;
        dragHudPivot.y = _p.particles[hit.particle - 1].y;
        dragHudRadius = _p.ls[hit.particle - 1];
        dragHudOpacity = 0.01;
    } else {
        selectPendulum(null);
    }
}, { passive: false });

canvasB.addEventListener('touchmove', (e) => {
    if (!dragActive || !paused || selectedPendulum === null) return;
    e.preventDefault();
    const touch = e.touches[0];
    const rect = canvasB.getBoundingClientRect();
    dragParticle(pendulums[selectedPendulum], dragTarget,
        touch.clientX - rect.left, touch.clientY - rect.top);
}, { passive: false });

canvasB.addEventListener('touchend', () => {
    dragActive = false;
    dragTarget = null;
});

// --- Rendering --------------------------------------------------

function drawTrail(trail, hexColor, velocityStyle) {
    const len = trail.length;
    if (len < 2) return;

    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);

    const totalSegments = len - 1;
    const effectiveBatches = Math.min(TRAIL_BATCHES, totalSegments);
    const batchSize = Math.ceil(totalSegments / effectiveBatches);

    for (let batch = 0; batch < effectiveBatches; batch++) {
        const segStart = batch * batchSize;
        const segEnd = Math.min(segStart + batchSize, totalSegments);
        if (segStart >= segEnd) break;

        const t = (batch + 1) / effectiveBatches;
        const alpha = 0.02 + t * 0.88;
        const rgba = `rgba(${r}, ${g}, ${b}, ${alpha.toFixed(4)})`;

        if (velocityStyle) {
            // Per-segment line width based on instantaneous speed
            for (let i = segStart + 1; i <= segEnd; i++) {
                const speed = trail[i].s || 0;
                const lineW = 3.0 - Math.min(speed / 150, 1) * 2.2;
                ctxA.beginPath();
                ctxA.moveTo(trail[i - 1].x, trail[i - 1].y);
                ctxA.lineTo(trail[i].x, trail[i].y);
                ctxA.strokeStyle = rgba;
                ctxA.lineWidth = lineW;
                ctxA.stroke();
            }
        } else {
            // Uniform line width → batch into a single Path2D
            const path = new Path2D();
            path.moveTo(trail[segStart].x, trail[segStart].y);
            for (let i = segStart + 1; i <= segEnd; i++) {
                path.lineTo(trail[i].x, trail[i].y);
            }
            ctxA.strokeStyle = rgba;
            ctxA.lineWidth = 1.5;
            ctxA.stroke(path);
        }
    }
}

function drawPendulum(p) {
    if (!p.visible) return;
    const n = p.particles.length;

    // Selection rings around first and last particle
    if (p.selected && n > 1) {
        ctxB.beginPath();
        ctxB.arc(p.particles[1].x, p.particles[1].y, 10, 0, Math.PI * 2);
        ctxB.strokeStyle = 'rgba(255,255,255,0.2)';
        ctxB.lineWidth = 1.5;
        ctxB.stroke();
        ctxB.beginPath();
        ctxB.arc(p.particles[n - 1].x, p.particles[n - 1].y, 12, 0, Math.PI * 2);
        ctxB.stroke();
    }

    const rods = p._paletteIdx === 0 ? '#404060' : '#604060';

    // Rods
    for (let i = 1; i < n; i++) {
        ctxB.beginPath();
        ctxB.moveTo(p.particles[i - 1].x, p.particles[i - 1].y);
        ctxB.lineTo(p.particles[i].x, p.particles[i].y);
        ctxB.strokeStyle = rods;
        ctxB.lineWidth = 2;
        ctxB.stroke();
    }

    // Bobs (inner)
    for (let i = 1; i < n - 1; i++) {
        const r = Math.max(4, 8 * Math.pow(LINK_SCALE, i - 1));
        ctxB.beginPath();
        ctxB.arc(p.particles[i].x, p.particles[i].y, r, 0, Math.PI * 2);
        ctxB.fillStyle = p.color1;
        ctxB.fill();
    }

    // Tip bob (distinct color2)
    if (n > 1) {
        const tip = n - 1;
        const rTip = Math.max(4, 8 * Math.pow(LINK_SCALE, tip - 1));
        ctxB.beginPath();
        ctxB.arc(p.particles[tip].x, p.particles[tip].y, rTip, 0, Math.PI * 2);
        ctxB.fillStyle = p.color2;
        ctxB.fill();
    }
}

/* ── Drag HUD (polar grid overlay) ──────────────────────────────── */

function drawDragHUD() {
    if (dragHudOpacity <= 0.001) return;
    ctxB.save();
    ctxB.globalAlpha = dragHudOpacity;

    // 1. Dashed circle at rod-length radius from pivot
    ctxB.beginPath();
    ctxB.arc(dragHudPivot.x, dragHudPivot.y, dragHudRadius, 0, Math.PI * 2);
    ctxB.strokeStyle = 'rgba(255,255,255,0.55)';
    ctxB.lineWidth = 1.2;
    ctxB.setLineDash([5, 5]);
    ctxB.stroke();

    // 2. Faint dashed radial lines at 15° increments
    ctxB.setLineDash([2, 4]);
    ctxB.lineWidth = 0.8;
    ctxB.strokeStyle = 'rgba(255,255,255,0.28)';
    for (let deg = 0; deg < 360; deg += 15) {
        const rad = deg * Math.PI / 180;
        const ex = dragHudPivot.x + dragHudRadius * Math.sin(rad);
        const ey = dragHudPivot.y + dragHudRadius * Math.cos(rad);
        ctxB.beginPath();
        ctxB.moveTo(dragHudPivot.x, dragHudPivot.y);
        ctxB.lineTo(ex, ey);
        ctxB.stroke();
    }

    // 3. Snap indicator — bright dot at current snapped angle on the arc
    ctxB.setLineDash([]);
    if (dragActive && selectedPendulum !== null) {
        const p = pendulums[selectedPendulum];
        if (p && dragTarget !== null && dragTarget - 1 < p.thetas.length) {
            const snapped = snapAngle(p.thetas[dragTarget - 1]);
            const sx = dragHudPivot.x + dragHudRadius * Math.sin(snapped);
            const sy = dragHudPivot.y + dragHudRadius * Math.cos(snapped);
            ctxB.beginPath();
            ctxB.arc(sx, sy, 4, 0, Math.PI * 2);
            ctxB.fillStyle = 'rgba(255,255,255,0.85)';
            ctxB.fill();
            ctxB.beginPath();
            ctxB.arc(sx, sy, 8, 0, Math.PI * 2);
            ctxB.strokeStyle = 'rgba(255,255,255,0.35)';
            ctxB.lineWidth = 1.5;
            ctxB.stroke();
        }
    }

    ctxB.restore();
}

function draw() {
    // Layer A — trails (one per particle; tip = full, inner = shorter)
    ctxA.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        if (!p.visible) continue;
        const total = p.particles.length;
        for (let i = total - 1; i >= 1; i--) {
            const isTip = i === total - 1;
            drawTrail(p.trails[i], isTip ? p.color2 : p.color1, isTip);
        }
    }

    // Layer B — pendulums
    ctxB.clearRect(0, 0, cw, ch);
    for (const p of pendulums) {
        drawPendulum(p);
    }

    // Drag HUD overlay — polar grid showing snap increments (before pivot)
    drawDragHUD();

    // Pivot
    ctxB.beginPath();
    ctxB.arc(PIVOT.x, PIVOT.y, 4, 0, Math.PI * 2);
    ctxB.fillStyle = '#ffffff';
    ctxB.fill();
}

// --- State Serialization & URL Sharing -----------------------------

const STORAGE_VERSION = 1;

/**
 * Compact property names keep the encoded string short:
 *   v — version (for future format migration)
 *   g — gravity
 *   d — damping
 *   s — speed multiplier
 *   p — pendulums array
 *     n — number of links
 *     t — thetas (degrees, one per link)
 *     c — palette index
 *     v — visibility flag
 */
function serializeState() {
    const pendulumsData = pendulums.map(p => ({
        n: p.N,
        t: p.thetas.map(th => +(th * 180 / Math.PI).toFixed(2)),
        c: p._paletteIdx,
        v: p.visible,
    }));
    return {
        v: STORAGE_VERSION,
        g: +G.toFixed(2),
        d: +DAMPING.toFixed(6),
        s: +speedMultiplier.toFixed(2),
        p: pendulumsData,
    };
}

/**
 * URL-safe Base64 encoding with proper UTF-8 handling.
 * btoa() throws on characters outside the Latin-1 range, so we first
 * encode the JSON string as UTF-8 via encodeURIComponent, then unescape
 * the percent-encoded bytes into a Latin-1 string that btoa can handle.
 */
function encodeState(state) {
    const json = JSON.stringify(state);
    const latin1 = unescape(encodeURIComponent(json));
    return btoa(latin1);
}

/**
 * Reverse of encodeState — decode URL-safe Base64 back to a state object.
 * Handles potential Unicode decoding errors gracefully.
 */
function decodeState(encoded) {
    const latin1 = atob(encoded);
    const utf8 = decodeURIComponent(escape(latin1));
    return JSON.parse(utf8);
}

/**
 * Serialize the current simulator state and write it to the URL hash
 * using history.replaceState (no extra browser history entry).
 * Silently catches encoding failures so they never crash the app.
 */
function saveStateToURL() {
    try {
        const state = serializeState();
        const encoded = encodeState(state);
        const newHash = '#state=' + encoded;
        if (window.location.hash !== newHash) {
            history.replaceState(null, '', newHash);
        }
    } catch (e) {
        console.warn('saveStateToURL: failed to encode state:', e);
    }
}

/**
 * Attempt to load and restore state from window.location.hash.
 * Returns true if a state was found and successfully restored,
 * false otherwise (no hash, corrupt data, or validation failure).
 */
function tryLoadStateFromURL() {
    const hash = window.location.hash;
    if (!hash || !hash.startsWith('#state=')) return false;

    const encoded = hash.slice(7); // strip '#state='
    if (!encoded) return false;

    let state;
    try {
        state = decodeState(encoded);
    } catch (e) {
        console.warn('tryLoadStateFromURL: corrupt encoding, falling back to defaults:', e);
        return false;
    }

    return restoreState(state);
}

/**
 * Validate and apply a deserialized state object to the simulator.
 * Every numeric field is clamped to a safe range; NaN/Infinity fields
 * are rejected.  Returns true on success, false if validation fails.
 */
function restoreState(state) {
    // --- Top-level validation ---
    if (!state || typeof state !== 'object') return false;
    if (state.v !== STORAGE_VERSION) return false;

    // --- Global physics parameters (clamped to slider ranges) ---
    if (typeof state.g !== 'number' || !isFinite(state.g)) return false;
    if (typeof state.d !== 'number' || !isFinite(state.d)) return false;
    if (typeof state.s !== 'number' || !isFinite(state.s)) return false;

    if (!Array.isArray(state.p) || state.p.length === 0 || state.p.length > MAX_PENDULUMS) {
        return false;
    }

    // --- Tear down existing state ---
    pendulums.length = 0;
    paletteIdx = 0;
    chaosMode = false;
    paused = false;
    selectedPendulum = null;

    // --- Apply global physics ---
    G = Math.max(0, Math.min(25, state.g));
    DAMPING = Math.max(0, Math.min(0.01, state.d));
    speedMultiplier = Math.max(0.2, Math.min(3.0, state.s));

    // Sync slider UI elements
    on('param-gravity').value = G;
    on('grav-value').textContent = G.toFixed(1);
    on('param-damping').value = DAMPING;
    on('damp-value').textContent = DAMPING.toFixed(4);
    on('param-speed').value = speedMultiplier;
    on('speed-value').textContent = speedMultiplier.toFixed(1) + '×';

    // --- Recreate each pendulum ---
    for (const pd of state.p) {
        // Validate pendulum descriptor
        if (!pd || typeof pd !== 'object') continue;
        const nLinks = Math.max(MIN_LINKS, Math.min(MAX_LINKS,
            (typeof pd.n === 'number' && isFinite(pd.n)) ? pd.n : MIN_LINKS));

        // First angle is used for buildChain — default to 135° if missing
        const defaultDeg = (Array.isArray(pd.t) && pd.t.length > 0 && typeof pd.t[0] === 'number' && isFinite(pd.t[0]))
            ? pd.t[0] : DEFAULT_ANGLE_DEG;
        const clampedDefault = Math.max(0, Math.min(360, defaultDeg));

        const p = createPendulum(nLinks, clampedDefault, '#888', '#888');

        // Restore individual per-joint angles
        if (Array.isArray(pd.t)) {
            for (let i = 0; i < Math.min(p.N, pd.t.length); i++) {
                if (typeof pd.t[i] === 'number' && isFinite(pd.t[i])) {
                    p.thetas[i] = (pd.t[i] % 360) * Math.PI / 180;
                }
            }
        }

        // Restore palette colour
        const cRaw = (typeof pd.c === 'number' && isFinite(pd.c)) ? Math.floor(pd.c) : paletteIdx;
        const cIdx = ((cRaw % PALETTE.length) + PALETTE.length) % PALETTE.length;
        const pal = PALETTE[cIdx];
        p.color1 = pal.c1;
        p.color2 = pal.c2;
        p._paletteIdx = cIdx;
        // Advance global paletteIdx so new pendulums don't reuse this colour
        if (cRaw >= paletteIdx) paletteIdx = cRaw + 1;

        // Restore visibility
        p.visible = pd.v !== false;

        computeParticlePositions(p);
        syncBobPositions(p);

        pendulums.push(p);
    }

    // Guard: if no pendulums survived validation, trigger default
    if (pendulums.length === 0) return false;

    // Update UI
    resizeCanvas();
    updateControls();
    clearTrails();
    clearMetrics();

    return true;
}

/**
 * Copy the current shareable URL (with encoded state) to the clipboard.
 * Shows brief "Copied!" feedback on the button before reverting.
 */
function copyShareLink() {
    // Ensure the URL hash is current
    saveStateToURL();

    const url = window.location.href;
    const btn = on('btn-share');
    const origText = btn.textContent;

    navigator.clipboard.writeText(url).then(() => {
        // Show confirmation
        btn.textContent = I18N[currentLang].shareCopied;
        btn.style.color = 'rgba(100, 255, 180, 0.9)';
        setTimeout(() => {
            btn.textContent = origText;
            btn.style.color = '';
        }, 1800);
    }).catch(() => {
        // Clipboard API unavailable — fall back to a console message
        console.warn('Clipboard API unavailable. Share URL:\n' + url);
        btn.textContent = '⚠ Fallback';
        setTimeout(() => {
            btn.textContent = origText;
        }, 1200);
    });
}

// --- Animation loop ---------------------------------------------

function animate() {
    // --- FPS Guardian: rolling-window frame-rate monitor ---
    fpsTimestamps.push(performance.now());
    while (fpsTimestamps.length > FPS_SAMPLE_SIZE) fpsTimestamps.shift();
    if (fpsTimestamps.length >= 2) {
        const elapsed = fpsTimestamps[fpsTimestamps.length - 1] - fpsTimestamps[0];
        currentFPS = Math.round((fpsTimestamps.length - 1) / elapsed * 1000);
    }

    // Throttle adaptive adjustment to every 30 frames (~0.5 s at 60 fps)
    fpsAdaptCounter++;
    if (fpsAdaptCounter % 30 === 0) {
        if (currentFPS < 55 && TRAIL_LENGTH > 100) {
            TRAIL_LENGTH = Math.max(TRAIL_LENGTH - 50, 100);
        } else if (currentFPS >= 58 && TRAIL_LENGTH < MAX_TRAIL_LENGTH) {
            TRAIL_LENGTH = Math.min(TRAIL_LENGTH + 10, MAX_TRAIL_LENGTH);
        }
    }

    // Refresh HUD pivot position during active drag (handles window resize)
    if (dragActive && selectedPendulum !== null && dragTarget !== null) {
        const p = pendulums[selectedPendulum];
        if (p) {
            dragHudPivot.x = p.particles[dragTarget - 1].x;
            dragHudPivot.y = p.particles[dragTarget - 1].y;
            dragHudRadius = p.ls[dragTarget - 1];
        }
    }
    // Fade drag HUD opacity — smooth transition
    if (dragActive && dragHudOpacity < 0.3) {
        dragHudOpacity = Math.min(dragHudOpacity + 0.05, 0.3);
    } else if (!dragActive && dragHudOpacity > 0) {
        dragHudOpacity = Math.max(dragHudOpacity - 0.15, 0);
    }

    if (!paused) stepPhysics();
    draw();
    updateAngleDisplay();
    if (metricsVisible) {
        renderPhasePortrait();
        renderEnergyPlot();
    }
    requestAnimationFrame(animate);
}

// --- Bootstrap --------------------------------------------------

// Try restoring a shared state from URL hash first; fall back to defaults
if (!tryLoadStateFromURL()) {
    addPendulum();
}
resizeCanvas();
updateControls();
// Paint an initial frame synchronously so the pendulum is visible
// immediately — don't wait for the first rAF callback.
draw();
updateAngleDisplay();
animate();

// Bind the share-link button after the DOM / i18n are ready.
on('btn-share', 'click', copyShareLink);
