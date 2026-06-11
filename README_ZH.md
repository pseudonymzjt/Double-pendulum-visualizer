# 混沌艺术 — 双摆可视化器

> **语言**：中文 · [English](README.md)

[![MIT 许可证](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](https://github.com/pseudonymzjt/Double-Pendulum-Visualizer/blob/master/LICENSE)
[![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white)](index.html)
[![CSS3](https://img.shields.io/badge/CSS3-1572B6?style=flat-square&logo=css3&logoColor=white)](style.css)
[![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](script.js)
[![AI辅助开发](https://img.shields.io/badge/AI-%E8%BE%85%E5%8A%A9%E5%BC%80%E5%8F%91-blue?style=flat-square)](AI_DISCLOSURE_ZH.md)

一款高性能、极简主义的 HTML5 Canvas 网页应用，用于可视化双摆的优美混沌运动。无外部库、无框架——纯原生 HTML、CSS 和 JavaScript。

## 功能特性

- **精确拉格朗日 RK4 物理引擎**：采用完整拉格朗日运动方程的 N 节摆链模拟，RK4 积分每帧 8 个子步长。N×N 质量矩阵含完整三角耦合项——无小角度近似。
- **N 节摆链**：从 2 节开始，可增删关节以创建三节、四节或更长的摆链。
- **混沌模式**：按下 `C` 键以微小的 0.01° 偏移生成第二个摆——观察蝴蝶效应如何使青色和品红色轨迹分道扬镳。
- **多摆沙盒**：点击 `+` 添加独立摆，每个摆拥有 8 色调色板中的独立颜色。可选择、拖拽、定制或删除任意摆。
- **渐隐轨迹**：每个摆锤留下渐隐轨迹，以梯度不透明度的批处理线段渲染。末端轨迹使用速度自适应线宽（快速时细，慢速时粗）。
- **拖拽设置**：暂停后拖拽任意摆锤自由设置角度。磁吸吸附功能可对齐至 15° 增量。
- **稳定性保障**：NaN/Infinity 检测与自动重置防止数值爆炸。每摆最多 8 个关节，总计最多 8 个摆，达到上限时 UI 提供反馈。
- **导出作品**：将完整画布（轨迹 + 摆）保存为高清 PNG 图片。
- **HiDPI / Retina**：通过 `devicePixelRatio` 缩放实现像素级完美渲染。
- **触控支持**：完整的触控拖拽设置与选择功能，适配移动设备。

## 操作说明

| 按钮 | 键盘 | 动作 |
|------|------|------|
| `+` | — | 添加新摆 |
| `⏸ 暂停` / `▶ 播放` | `Space` | 冻结 / 恢复模拟 |
| `↺ 重置` | `R` | 重置到初始状态 |
| `⚡ 混沌` / `⚡ 单摆` | `C` | 切换混沌模式 |
| `✕ 清除轨迹` | — | 擦除所有轨迹 |
| `📖 指南` | — | 显示操作说明 |
| `⬇ 保存` | — | 导出 PNG 图片 |

### 语言切换

点击底部控制栏中的 `中` / `EN` 按钮可在英文和简体中文界面之间切换。按钮文字、控制标签、图表标题和帮助弹窗都会实时更新。

### 上下文菜单（选中摆时显示）

| 按钮 | 动作 |
|------|------|
| 调色板图标 | 切换至下一个调色板颜色 |
| 眼睛图标 | 显示 / 隐藏此摆 |
| `➕` | 添加关节（延长摆链） |
| `➖` | 移除最后一个关节 |
| 删除图标 | 删除此摆 |

## 架构

```
Double-Pendulum-Visualizer/
├── index.html        # HTML 外壳，含 HiDPI 视口元标签
├── style.css         # 全屏暗色主题、控制栏与菜单样式
├── script.js         # 全部逻辑：物理引擎、渲染、控制、UI
├── Plan.md           # 项目计划（各阶段）
├── THOUGHTS.md       # 设计记录与决策
├── AI_DISCLOSURE.md  # AI 公开声明（英文）
├── AI_DISCLOSURE_ZH.md # AI 公开声明（中文）
└── README.md
```

**双层画布架构**：
- **层 A**（`#canvas-a`）：轨迹层——每帧清除后根据存储的点数组重新绘制。
- **层 B**（`#canvas-b`）：摆体层——包含摆杆、摆锤和固定点，每帧清除后重新绘制。

**物理引擎**：基于精确拉格朗日力学的 RK4 积分，每帧 8 个子步长。N×N 质量矩阵通过高斯消元法（含部分主元选取）求解，包含完整的三角耦合项（无小角度近似）。NaN/Infinity 安全网及自动重置。每摆最多 8 个关节，总计最多 8 个摆。动能、势能和总能实时计算并可视化，总能守恒精度达小数点后四位。

## 快速开始

只需在任意现代浏览器中打开 `index.html`。无需构建步骤，无需服务器。

## 许可协议

MIT © pseudonymzjt
