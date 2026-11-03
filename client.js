/* dsh-notes-board · 面板外壳（源文件，请在 src/panel.js 里改）
 *
 * client.js 是生成物：scripts/build-client.mjs 读取 vendor/board.html（原版看板模板），
 * 把它的 <style> / <body> / <script> 注入本文件的三处占位符后输出。
 * 改造点全部集中在 build-client.mjs 的 PATCHES 列表里，原版逻辑一行没重写。
 */
window.__ModuleLoader__.load({
  id: 'dsh-notes-board',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useRef, useCallback } = React

    const PANEL_ID = 'dsh-notes-board'
    const API = '/api/dsh-notes-board'
    const STORE_KEY = 'dsh-notes-board:workspace'

    /* 由构建脚本注入：原版看板的 CSS / 正文骨架 / 外链字体 */
    const BOARD_CSS = /*__BOARD_CSS__*/ "\n  :host{position:relative;display:block;height:100%;overflow:hidden;\n    --bg-base: #F8FAFC;\n    --bg-surface: #FFFFFF;\n    --bg-surface-raised: #FFFFFF;\n    --bg-surface-subtle: #F1F5F9;\n    --border-subtle: #F1F5F9;\n    --border-normal: #E2E8F0;\n    --border-focus: #1D4ED8;\n\n    --text-pure: #0A0E1A;\n    --text-primary: #0F172A;\n    --text-secondary: #475569;\n    --text-tertiary: #94A3B8;\n    --text-mono-faint: #CBD5E1;\n\n    --brand-blue: #1D4ED8;\n    --brand-blue-hover: #2563EB;\n    --brand-blue-glow: rgba(29, 78, 216, 0.12);\n    --alert-ruby: #DC2626;\n    --alert-ruby-subtle: #FEF2F2;\n    --amber-core: #D97706;\n    --emerald-live: #059669;\n    --purple-meta: #7C3AED;\n    --teal-prune: #0D9488;\n\n    --font-display: \"Space Grotesk\", -apple-system, sans-serif;\n    --font-body: \"Plus Jakarta Sans\", -apple-system, \"PingFang SC\", sans-serif;\n    --font-mono: \"JetBrains Mono\", ui-monospace, \"SF Mono\", monospace;\n\n    --radius-sm: 4px;\n    --radius-md: 8px;\n    --radius-lg: 12px;\n  }\n\n  * { box-sizing: border-box; margin: 0; padding: 0; }\n\n  /* 瑞士工程图纸微网格背景 */\n  body {\n    background-color: var(--bg-base);\n    background-image:\n      linear-gradient(to right, rgba(15, 23, 42, 0.035) 1px, transparent 1px),\n      linear-gradient(to bottom, rgba(15, 23, 42, 0.035) 1px, transparent 1px);\n    background-size: 28px 28px;\n    color: var(--text-primary);\n    font: 14px/1.6 var(--font-body);\n    -webkit-font-smoothing: antialiased;\n    min-height: 100vh;\n    display: flex;\n    flex-direction: column;\n    overflow-x: hidden;\n  }\n\n  /* 顶栏 HUD（磨砂象牙白） */\n  header.hud-topbar {\n    position: sticky; top: 0; z-index: 50;\n    height: 64px; background: rgba(255, 255, 255, 0.88);\n    backdrop-filter: blur(16px); -webkit-backdrop-filter: blur(16px);\n    border-bottom: 1px solid var(--border-normal);\n    padding: 0 32px; display: flex; align-items: center; gap: 24px;\n    box-shadow: 0 1px 4px rgba(15, 23, 42, 0.03);\n  }\n\n  .brand-group { display: flex; align-items: center; gap: 12px; }\n  .brand-logo {\n    width: 32px; height: 32px; border-radius: 6px;\n    background: #0F172A; border: 1px solid #0F172A;\n    display: flex; align-items: center; justify-content: center;\n    position: relative; box-shadow: 0 2px 6px rgba(15,23,42,0.15);\n  }\n  .brand-logo::before {\n    content: ''; position: absolute; width: 8px; height: 8px;\n    background: #60A5FA; border-radius: 50%;\n  }\n  .brand-text {\n    font-family: var(--font-display); font-size: 16px; font-weight: 700;\n    color: #0F172A; letter-spacing: -0.3px; display: flex; align-items: center; gap: 8px;\n  }\n  .telemetry-chip {\n    font-family: var(--font-mono); font-size: 11px; padding: 2px 8px;\n    background: #F1F5F9; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); color: var(--text-secondary); font-weight: 600;\n  }\n\n  /* 导航控制器 Deck Tabs */\n  nav.deck-tabs {\n    display: flex; gap: 4px; background: #F1F5F9;\n    padding: 3px; border-radius: var(--radius-md); border: 1px solid var(--border-normal);\n  }\n  .deck-tab {\n    border: 0; background: transparent; color: var(--text-secondary);\n    font-family: var(--font-display); font-size: 13px; font-weight: 600;\n    padding: 6px 16px; border-radius: var(--radius-sm); cursor: pointer;\n    transition: all .18s cubic-bezier(0.16, 1, 0.3, 1);\n    display: flex; align-items: center; gap: 8px; position: relative;\n  }\n  .deck-tab:hover { color: #0F172A; background: rgba(255,255,255,0.6); }\n  .deck-tab.active {\n    color: #0F172A; background: #FFFFFF;\n    box-shadow: 0 1px 3px rgba(15,23,42,0.08);\n  }\n  .deck-tab.active::after {\n    content: ''; position: absolute; bottom: -1px; left: 20%; right: 20%;\n    height: 2px; background: var(--brand-blue);\n  }\n\n  .hud-grow { flex: 1; }\n\n  /* 战术全局搜索框 */\n  .hud-search { position: relative; width: 260px; }\n  .hud-search input {\n    width: 100%; height: 36px; background: #FFFFFF;\n    border: 1px solid var(--border-normal); border-radius: var(--radius-sm);\n    color: #0F172A; font-family: var(--font-mono); font-size: 12.5px;\n    padding: 0 34px 0 34px; outline: none; transition: all .2s;\n  }\n  .hud-search input:focus {\n    width: 320px; border-color: var(--brand-blue); background: #FFFFFF;\n    box-shadow: 0 0 0 3px var(--brand-blue-glow);\n  }\n  .hud-search .search-ico {\n    position: absolute; left: 11px; top: 50%; transform: translateY(-50%);\n    color: var(--text-tertiary); pointer-events: none;\n  }\n  .hud-search .shortcut-key {\n    position: absolute; right: 9px; top: 50%; transform: translateY(-50%);\n    font-family: var(--font-mono); font-size: 10px; color: var(--text-tertiary);\n    background: #F1F5F9; padding: 1px 5px; border-radius: 3px; border: 1px solid var(--border-normal);\n  }\n\n  /* 即时搜索下拉浮窗 */\n  .search-popover {\n    position: absolute; top: calc(100% + 8px); left: 0; width: 440px;\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-md); box-shadow: 0 12px 36px rgba(15,23,42,0.14);\n    max-height: 420px; overflow-y: auto; z-index: 100; display: none;\n    flex-direction: column; padding: 4px 0;\n  }\n  .search-popover.open { display: flex; animation: viewIn .15s ease-out; }\n  .popover-item {\n    padding: 10px 14px; cursor: pointer; display: flex; align-items: center; justify-content: space-between;\n    gap: 12px; transition: background .12s; border-bottom: 1px solid #F8FAFC;\n  }\n  .popover-item:hover, .popover-item.selected { background: #EFF6FF; }\n  .popover-item-main { flex: 1; min-width: 0; }\n  .popover-title {\n    font-size: 13px; font-weight: 600; color: #0F172A;\n    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; margin-bottom: 2px;\n  }\n  .popover-sub {\n    font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary);\n    display: flex; align-items: center; gap: 8px;\n  }\n  .popover-empty {\n    padding: 24px; text-align: center; color: var(--text-tertiary);\n    font-family: var(--font-mono); font-size: 12px;\n  }\n  .popover-footer {\n    padding: 8px 14px; font-family: var(--font-mono); font-size: 11px;\n    color: var(--text-tertiary); background: #F8FAFC; border-top: 1px solid var(--border-normal);\n    display: flex; justify-content: space-between; align-items: center;\n  }\n\n  /* 本地雷达自动同步指示器 */\n  .sync-beacon {\n    display: flex; align-items: center; gap: 10px;\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 6px 14px; font-size: 12px;\n    font-family: var(--font-mono); color: var(--text-secondary); cursor: pointer;\n    transition: all .2s; user-select: none; box-shadow: 0 1px 2px rgba(15,23,42,0.04);\n  }\n  .sync-beacon:hover { border-color: var(--brand-blue); color: #0F172A; box-shadow: 0 0 0 3px var(--brand-blue-glow); }\n  .radar-dot {\n    width: 8px; height: 8px; border-radius: 50%; background: #94A3B8; position: relative;\n  }\n  .radar-dot.active { background: var(--emerald-live); }\n  .radar-dot.active::after {\n    content: ''; position: absolute; inset: -4px; border-radius: 50%;\n    border: 1px solid var(--emerald-live); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;\n  }\n  .radar-dot.syncing { background: var(--amber-core); }\n  @keyframes ping { 75%, 100% { transform: scale(2.2); opacity: 0; } }\n\n  /* 主视口布局 */\n  main.mission-canvas {\n    max-width: 1440px; width: 100%; margin: 0 auto; padding: 28px 36px 80px;\n    flex: 1; display: flex; flex-direction: column; gap: 28px;\n  }\n\n  .canvas-view { display: none; }\n  .canvas-view.active { display: block; animation: viewIn .25s ease-out; }\n  @keyframes viewIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }\n\n  /* 实体白皮书面板 */\n  .hud-panel {\n    background: var(--bg-surface); border: 1px solid var(--border-normal);\n    border-radius: var(--radius-md); padding: 24px 28px; position: relative;\n    box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 6px 16px rgba(15,23,42,0.03);\n    overflow: hidden;\n  }\n  .panel-masthead {\n    display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 20px;\n  }\n  .panel-headline {\n    font-family: var(--font-display); font-size: 16px; font-weight: 700;\n    color: #0F172A; letter-spacing: -0.2px; display: flex; align-items: center; gap: 10px;\n  }\n  .panel-annotation {\n    font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary);\n  }\n\n  /* KPI 战术度量仪表阵列 */\n  .kpi-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-bottom: 28px; }\n  @media (max-width: 960px) { .kpi-row { grid-template-columns: repeat(2, 1fr); } }\n  .kpi-instrument {\n    background: var(--bg-surface); border: 1px solid var(--border-normal);\n    border-radius: var(--radius-md); padding: 20px 24px; cursor: pointer;\n    transition: all .2s; position: relative; overflow: hidden;\n    box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);\n  }\n  .kpi-instrument:hover {\n    border-color: var(--brand-blue); transform: translateY(-2px);\n    box-shadow: 0 6px 20px rgba(15,23,42,0.08);\n  }\n  .kpi-tag {\n    font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary);\n    display: flex; align-items: center; justify-content: space-between; font-weight: 600;\n  }\n  .kpi-num {\n    font-family: var(--font-display); font-size: 38px; font-weight: 700;\n    color: #0F172A; line-height: 1.1; margin: 10px 0 6px; letter-spacing: -1px;\n  }\n  .kpi-caption { font-size: 12.5px; color: var(--text-tertiary); }\n  .kpi-accent-bar { position: absolute; bottom: 0; left: 0; right: 0; height: 3px; }\n\n  /* 核心承重墙网格（Structural Pillars） */\n  .pillars-vault { display: grid; grid-template-columns: repeat(auto-fill, minmax(330px, 1fr)); gap: 16px; margin-bottom: 28px; }\n  .pillar-specimen {\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 18px; cursor: pointer;\n    transition: all .2s cubic-bezier(0.16, 1, 0.3, 1);\n    display: flex; flex-direction: column; justify-content: space-between; position: relative;\n    box-shadow: 0 1px 2px rgba(15,23,42,0.04);\n  }\n  .pillar-specimen:hover {\n    border-color: var(--brand-blue); transform: translateY(-2px);\n    box-shadow: 0 8px 24px rgba(29, 78, 216, 0.08);\n  }\n  .pillar-specimen::after {\n    content: ''; position: absolute; right: 12px; top: 12px;\n    width: 6px; height: 6px; border-radius: 50%; background: var(--amber-core);\n  }\n  .pillar-meta { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }\n  .pillar-core-title {\n    font-family: var(--font-display); font-size: 15px; font-weight: 700;\n    color: #0F172A; line-height: 1.35; margin-bottom: 10px;\n  }\n  .pillar-abstract {\n    font-size: 13px; color: var(--text-secondary); line-height: 1.6;\n    margin-bottom: 16px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;\n  }\n  .pillar-telemetry {\n    display: flex; align-items: center; justify-content: space-between;\n    font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary);\n    border-top: 1px solid var(--border-subtle); padding-top: 10px; margin-top: auto;\n  }\n  .weight-gauge {\n    color: var(--brand-blue); font-weight: 700; background: #EFF6FF;\n    border: 1px solid #BFDBFE; border-radius: 3px; padding: 2px 7px;\n  }\n\n  /* 领域分类矩阵（Domain Matrix） */\n  .matrix-chambers {\n    display: grid; grid-template-columns: repeat(3, minmax(0, 1fr));\n    gap: 18px; width: 100%;\n  }\n  @media (max-width: 1200px) { .matrix-chambers { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n  @media (max-width: 768px) { .matrix-chambers { grid-template-columns: minmax(0, 1fr); } }\n  .chamber-pod {\n    background: #F8FAFC; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 16px; min-width: 0; overflow: hidden;\n  }\n  .chamber-header {\n    display: flex; align-items: center; justify-content: space-between;\n    padding-bottom: 10px; border-bottom: 1px solid var(--border-normal); margin-bottom: 12px;\n  }\n  .chamber-name {\n    font-family: var(--font-display); font-size: 13.5px; font-weight: 700;\n    color: #0F172A; display: flex; align-items: center; gap: 8px;\n  }\n  .chamber-count { font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); font-weight: 600; }\n  .chamber-stream {\n    display: flex; flex-direction: column; gap: 8px; max-height: 420px;\n    overflow-y: auto; min-width: 0; width: 100%; padding-right: 4px;\n  }\n  .chamber-stream::-webkit-scrollbar { width: 4px; }\n  .chamber-stream::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 4px; }\n  .chamber-stream::-webkit-scrollbar-track { background: transparent; }\n\n  .specimen-row {\n    flex-shrink: 0; /* 绝对禁止压扁 */\n    min-height: 54px; display: flex; flex-direction: column; justify-content: center;\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 10px 12px; cursor: pointer; transition: all .15s;\n    box-shadow: 0 1px 2px rgba(15,23,42,0.02); min-width: 0; width: 100%; box-sizing: border-box;\n  }\n  .specimen-row:hover {\n    border-color: var(--brand-blue); transform: translateX(2px);\n    box-shadow: 0 2px 8px rgba(15,23,42,0.06);\n  }\n  .specimen-title {\n    font-size: 13px; font-weight: 600; color: #0F172A; line-height: 1.4; margin-bottom: 4px;\n    overflow: hidden; text-overflow: ellipsis; white-space: nowrap; width: 100%;\n  }\n  .specimen-info {\n    font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary); line-height: 1.2;\n    display: flex; align-items: center; justify-content: space-between; width: 100%;\n  }\n\n  /* 时间线筛选工具栏 */\n  .timeline-toolbar {\n    display: flex; flex-direction: column; gap: 10px; margin-bottom: 24px;\n    background: #F8FAFC; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 14px 18px;\n  }\n  .filter-row {\n    display: flex; align-items: center; gap: 12px; flex-wrap: wrap; width: 100%;\n  }\n  .filter-group-label {\n    font-family: var(--font-mono); font-size: 11px; color: var(--text-secondary);\n    font-weight: 700; display: flex; align-items: center; gap: 6px; flex-shrink: 0; min-width: 76px;\n  }\n  .month-pills, .class-pills {\n    display: flex; gap: 6px; overflow-x: auto; max-width: calc(100% - 90px); padding-bottom: 2px;\n  }\n  .month-pill, .class-pill {\n    border: 1px solid var(--border-normal); background: #FFFFFF;\n    color: var(--text-secondary); font-family: var(--font-mono); font-size: 11px;\n    font-weight: 600; padding: 3px 9px; border-radius: 4px; cursor: pointer;\n    transition: all .15s; white-space: nowrap;\n  }\n  .month-pill:hover, .class-pill:hover { border-color: var(--brand-blue); color: var(--brand-blue); }\n  .month-pill.active {\n    background: var(--brand-blue); border-color: var(--brand-blue);\n    color: #FFFFFF; box-shadow: 0 1px 4px rgba(29,78,216,0.25);\n  }\n  .class-pill.active {\n    background: #0F172A; border-color: #0F172A;\n    color: #FFFFFF; box-shadow: 0 1px 4px rgba(15,23,42,0.2);\n  }\n  .filter-summary-bar {\n    display: flex; align-items: center; justify-content: space-between;\n    border-top: 1px solid var(--border-subtle); padding-top: 8px; margin-top: 2px;\n    font-family: var(--font-mono); font-size: 11px; color: var(--text-tertiary);\n  }\n\n  /* 时间线 Chrono-Track */\n  .chrono-track { position: relative; padding-left: 36px; }\n  .chrono-track::before {\n    content: ''; position: absolute; left: 11px; top: 12px; bottom: 12px; width: 2px;\n    background: linear-gradient(180deg, var(--brand-blue) 0%, rgba(15, 23, 42, 0.1) 100%);\n  }\n  .chrono-node-epoch { margin-bottom: 36px; position: relative; }\n  .chrono-epoch-badge {\n    font-family: var(--font-mono); font-size: 12px; font-weight: 700;\n    background: #FFFFFF; border: 1px solid var(--border-normal); color: var(--brand-blue);\n    padding: 4px 14px; border-radius: var(--radius-sm); display: inline-flex; align-items: center; gap: 8px;\n    margin-left: -36px; margin-bottom: 16px; box-shadow: 0 2px 6px rgba(15,23,42,0.06);\n  }\n  .chrono-cards { display: flex; flex-direction: column; gap: 14px; }\n  .chrono-card {\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 18px 22px; cursor: pointer;\n    transition: all .2s; position: relative; box-shadow: 0 1px 3px rgba(15,23,42,0.03);\n  }\n  .chrono-card:hover {\n    border-color: var(--brand-blue); transform: translateX(4px);\n    box-shadow: 0 6px 20px rgba(15,23,42,0.06);\n  }\n  .chrono-pulse {\n    position: absolute; left: -31px; top: 24px; width: 10px; height: 10px;\n    border-radius: 50%; background: #FFFFFF; border: 2px solid var(--brand-blue);\n  }\n  .chrono-date-badge {\n    font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;\n    color: #1D4ED8; background: #EFF6FF; border: 1px solid #BFDBFE;\n    padding: 2px 8px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px;\n    flex-shrink: 0;\n  }\n  .chrono-meta-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }\n  .chrono-date { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary); }\n  .chrono-heading { font-family: var(--font-display); font-size: 15px; font-weight: 700; color: #0F172A; }\n  .chrono-body { font-size: 13.5px; color: var(--text-secondary); line-height: 1.6; }\n\n  /* 避坑与反思智库（Pitfalls Vault） */\n  .alt-controls { display: flex; gap: 14px; margin-bottom: 24px; align-items: center; flex-wrap: wrap; }\n  .alt-search-input {\n    flex: 1; min-width: 280px; height: 40px; background: #FFFFFF;\n    border: 1px solid var(--border-normal); border-radius: var(--radius-sm);\n    color: #0F172A; font-family: var(--font-mono); font-size: 13px; padding: 0 16px; outline: none;\n    box-shadow: 0 1px 2px rgba(15,23,42,0.03);\n  }\n  .alt-search-input:focus { border-color: var(--alert-ruby); box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.12); }\n\n  .pitfalls-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 18px; }\n  .pitfall-dossier {\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 22px; display: flex; flex-direction: column;\n    justify-content: space-between; gap: 14px; cursor: pointer; transition: all .2s;\n    box-shadow: 0 1px 3px rgba(15,23,42,0.03);\n  }\n  .pitfall-dossier:hover {\n    border-color: var(--alert-ruby); transform: translateY(-2px);\n    box-shadow: 0 8px 24px rgba(220, 38, 38, 0.08);\n  }\n  .hazard-banner {\n    background: var(--alert-ruby-subtle); border-left: 3px solid var(--alert-ruby);\n    padding: 10px 14px; font-size: 13.5px; font-weight: 600; color: #991B1B;\n  }\n  .crux-evidence { font-size: 13px; color: var(--text-secondary); line-height: 1.65; }\n  .triumphant-verdict {\n    background: #ECFDF5; border: 1px solid #A7F3D0;\n    border-radius: var(--radius-sm); padding: 8px 12px; font-size: 12px; color: #065F46;\n    display: flex; align-items: center; gap: 8px; font-weight: 600;\n  }\n\n  /* 决策档案目录（Directory Matrix） */\n  .matrix-toolbar {\n    display: flex; align-items: center; gap: 12px; background: #FFFFFF;\n    border: 1px solid var(--border-normal); border-radius: var(--radius-sm); padding: 12px 18px; margin-bottom: 16px;\n    box-shadow: 0 1px 2px rgba(15,23,42,0.03);\n  }\n  .matrix-toolbar select {\n    height: 34px; background: #F8FAFC; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); color: #0F172A; font-family: var(--font-mono); font-size: 12px;\n    padding: 0 12px; outline: none; cursor: pointer; font-weight: 500;\n  }\n  .matrix-board {\n    background: #FFFFFF; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-md); overflow: hidden;\n    box-shadow: 0 1px 3px rgba(15,23,42,0.04), 0 4px 12px rgba(15,23,42,0.02);\n  }\n  .matrix-row-head, .matrix-row-cell {\n    display: grid; grid-template-columns: 80px 110px 1fr 110px 120px 70px;\n    gap: 14px; align-items: center; padding: 0 24px;\n  }\n  .matrix-row-head {\n    height: 42px; background: #F8FAFC; font-family: var(--font-mono);\n    font-size: 11.5px; color: var(--text-secondary); border-bottom: 1px solid var(--border-normal);\n    font-weight: 600;\n  }\n  .matrix-row-cell {\n    min-height: 52px; border-bottom: 1px solid #F1F5F9;\n    cursor: pointer; transition: all .15s; font-size: 13.5px;\n  }\n  .matrix-row-cell:hover { background: #F8FAFC; }\n  .cell-index { font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary); font-weight: 500; }\n  .cell-title { font-weight: 600; color: #0F172A; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }\n  .cell-date { font-family: var(--font-mono); font-size: 12px; color: var(--text-secondary); }\n  .cell-cites { font-family: var(--font-mono); font-size: 12px; color: var(--brand-blue); text-align: right; font-weight: 700; }\n\n  /* 状态与分类战术徽章（瑞士精密标贴风格） */\n  .status-badge {\n    display: inline-flex; align-items: center; gap: 6px;\n    font-family: var(--font-mono); font-size: 11px; font-weight: 600;\n    padding: 2px 8px; border-radius: 3px; width: max-content;\n  }\n  .status-badge.st-implemented { background: #ECFDF5; color: #065F46; border: 1px solid #A7F3D0; }\n  .status-badge.st-proposed { background: #FFFBEB; color: #92400E; border: 1px solid #FDE68A; }\n  .status-badge.st-rejected { background: #FEF2F2; color: #991B1B; border: 1px solid #FECACA; }\n  .status-badge.st-archived { background: #F1F5F9; color: #475569; border: 1px solid #E2E8F0; }\n\n  .class-badge {\n    font-family: var(--font-mono); font-size: 10.5px; padding: 2px 7px;\n    border-radius: 3px; font-weight: 600; width: max-content;\n  }\n  .cls-architecture { background: #FFF7ED; color: #C2410C; border: 1px solid #FED7AA; }\n  .cls-feature { background: #EFF6FF; color: #1D4ED8; border: 1px solid #BFDBFE; }\n  .cls-bug-fix { background: #ECFDF5; color: #047857; border: 1px solid #A7F3D0; }\n  .cls-simplification { background: #F0FDFA; color: #0F766E; border: 1px solid #99F6E4; }\n  .cls-process { background: #FAF5FF; color: #7E22CE; border: 1px solid #E9D5FF; }\n  .cls-testing { background: #FDF2F8; color: #BE185D; border: 1px solid #FBCFE8; }\n\n  /* 结构化白皮书控制台抽屉（Dossier Drawer） */\n  #drawer-curtain {\n    position: absolute; inset: 0; background: rgba(15, 23, 42, 0.45);\n    backdrop-filter: blur(4px); z-index: 60; display: none;\n  }\n  #drawer-curtain.open { display: block; }\n  #drawer-console {\n    position: absolute; top: 0; right: 0; bottom: 0; width: 70vw; max-width: 860px; min-width: 520px;\n    background: #FFFFFF; border-left: 1px solid var(--border-normal); z-index: 61;\n    transform: translateX(105%); transition: transform .28s cubic-bezier(0.16, 1, 0.3, 1);\n    display: flex; flex-direction: column; box-shadow: -16px 0 48px rgba(15, 23, 42, 0.15);\n  }\n  #drawer-console.open { transform: none; }\n\n  .console-header {\n    height: 64px; padding: 0 28px; border-bottom: 1px solid var(--border-normal);\n    display: flex; align-items: center; justify-content: space-between; gap: 14px;\n    background: #F8FAFC;\n  }\n  .console-exit {\n    background: #FFFFFF; border: 1px solid var(--border-normal); color: var(--text-secondary);\n    font-size: 16px; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-sm);\n    display: flex; align-items: center; justify-content: center;\n  }\n  .console-exit:hover { color: #0F172A; border-color: #94A3B8; }\n\n  .console-body { flex: 1; overflow-y: auto; padding: 36px 44px 80px; }\n\n  /* 抽屉打开时锁住背景滚动，避免内外双层滚动条 */\n  body:has(#drawer-console.open),\n  html:has(#drawer-console.open) { overflow: hidden; }\n\n  /* 代码反向注释定位板 */\n  .anchor-terminal {\n    background: #F8FAFC; border: 1px dashed #BFDBFE;\n    border-radius: var(--radius-sm); padding: 12px 18px; margin-bottom: 28px;\n    display: flex; align-items: center; justify-content: space-between; gap: 16px;\n  }\n  .anchor-code {\n    font-family: var(--font-mono); font-size: 12.5px; color: #1D4ED8; font-weight: 500;\n    overflow: hidden; text-overflow: ellipsis; white-space: nowrap;\n  }\n  .btn-anchor-copy {\n    background: #EFF6FF; border: 1px solid var(--brand-blue);\n    color: var(--brand-blue); font-family: var(--font-mono); font-size: 11px; padding: 5px 12px;\n    border-radius: var(--radius-sm); cursor: pointer; white-space: nowrap; transition: all .15s;\n    font-weight: 600;\n  }\n  .btn-anchor-copy:hover { background: var(--brand-blue); color: #FFFFFF; box-shadow: 0 2px 6px rgba(29, 78, 216, 0.2); }\n\n  .console-headline {\n    font-family: var(--font-display); font-size: 24px; font-weight: 700;\n    color: #0F172A; line-height: 1.35; margin-bottom: 16px; letter-spacing: -0.3px;\n  }\n  .console-timestamp {\n    font-family: var(--font-mono); font-size: 12px; color: var(--text-tertiary);\n    display: flex; align-items: center; gap: 10px; margin-bottom: 28px;\n  }\n\n  .quad-section { margin-bottom: 32px; }\n  .quad-title {\n    font-family: var(--font-mono); font-size: 12px; font-weight: 700; letter-spacing: 0.8px;\n    color: var(--text-secondary); margin-bottom: 12px; display: flex; align-items: center; gap: 10px;\n    text-transform: uppercase;\n  }\n  .quad-title::after { content: ''; flex: 1; height: 1px; background: var(--border-normal); }\n  .quad-content { font-size: 14.5px; line-height: 1.8; color: #334155; }\n  .quad-content code { font-family: var(--font-mono); font-size: 13px; background: #F1F5F9; padding: 2px 6px; border-radius: 3px; color: #1D4ED8; }\n  .quad-content pre { background: #0F172A; border: 1px solid #1E293B; border-radius: var(--radius-sm); padding: 16px; overflow-x: auto; margin: 14px 0; }\n  .quad-content pre code { background: transparent; padding: 0; color: #F8FAFC; }\n\n  .lineage-nodes { display: flex; flex-direction: column; gap: 12px; }\n  .lineage-group-title { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-secondary); margin-bottom: 6px; font-weight: 600; }\n  .lineage-chips { display: flex; flex-wrap: wrap; gap: 8px; }\n  .lineage-chip {\n    background: #F8FAFC; border: 1px solid var(--border-normal);\n    border-radius: var(--radius-sm); padding: 6px 12px; font-size: 12.5px; color: #0F172A;\n    cursor: pointer; transition: all .15s; display: inline-flex; align-items: center; gap: 6px;\n    font-weight: 500;\n  }\n  .lineage-chip:hover { color: var(--brand-blue); border-color: var(--brand-blue); background: #EFF6FF; }\n\n  /* 引导开场台 */\n  .onboarding-deck {\n    background: #FFFFFF; border: 1px dashed var(--border-normal);\n    border-radius: var(--radius-md); padding: 56px 40px; text-align: center;\n    display: flex; flex-direction: column; align-items: center; gap: 20px;\n    box-shadow: 0 4px 20px rgba(15,23,42,0.05);\n  }\n  .onboarding-deck h2 { font-family: var(--font-display); font-size: 22px; font-weight: 700; color: #0F172A; }\n  .onboarding-deck p { color: var(--text-secondary); max-width: 620px; font-size: 14.5px; line-height: 1.7; }\n  .action-btn-primary {\n    background: var(--brand-blue); color: #FFFFFF; border: 0; border-radius: var(--radius-sm);\n    padding: 12px 24px; font-family: var(--font-display); font-size: 14px; font-weight: 700;\n    cursor: pointer; box-shadow: 0 2px 8px rgba(29, 78, 216, 0.25); transition: all .2s;\n    display: inline-flex; align-items: center; gap: 10px;\n  }\n  .action-btn-primary:hover { background: var(--brand-blue-hover); }\n  .action-btn-secondary {\n    background: #FFFFFF; border: 1px solid var(--border-normal); color: var(--text-secondary);\n    font-family: var(--font-mono); font-size: 13px; padding: 10px 18px; border-radius: var(--radius-sm);\n    cursor: pointer; transition: all .15s; font-weight: 600;\n  }\n  .action-btn-secondary:hover { color: #0F172A; border-color: #94A3B8; }\n\n/* ── 宿主注入 ──────────────────────────────────────────── */\n/* 原版靠浏览器默认白底，面板里没有 body，这里补上 */\n.nbx-stage{height:100%;overflow:auto;background:var(--bg-base);color:var(--text-primary);}\n/* 原版顶栏按整页宽度设计，窄面板里会被压成竖排：改成可换行 + 子项不压缩 */\nheader.hud-topbar{flex-wrap:wrap;height:auto;min-height:56px;padding:8px 16px;gap:12px;row-gap:8px;}\nheader.hud-topbar>*{flex-shrink:0;}\n.brand-text,nav.deck-tabs,.deck-tab,.sync-beacon,.telemetry-chip{white-space:nowrap;}\n.hud-grow{flex:1 1 auto;min-width:0;}\n.hud-search{width:220px;flex:0 0 auto;}\n/* 原版聚焦时把输入框撑到 320px，溢出 260px 容器、盖住右侧同步状态 */\n.hud-search input:focus{width:100%;}\n.onboarding-deck{display:none !important;}\n"
    const BOARD_HTML = /*__BOARD_HTML__*/ "<!-- 顶栏 HUD -->\n<header class=\"hud-topbar\">\n  <div class=\"brand-group\">\n    <div class=\"brand-logo\"></div>\n    <div class=\"brand-text\">\n      <span id=\"brand-project-title\">工程决策看板</span>\n      <span class=\"telemetry-chip\" id=\"chip-total-count\">0 项</span>\n    </div>\n  </div>\n\n  <nav class=\"deck-tabs\">\n    <button class=\"deck-tab active\" data-view=\"baseline\">🏛️ 架构基线</button>\n    <button class=\"deck-tab\" data-view=\"timeline\">⏱️ 演进时间线</button>\n    <button class=\"deck-tab\" data-view=\"alternatives\">🛡️ 避坑智库</button>\n    <button class=\"deck-tab\" data-view=\"directory\">📋 决策清单</button>\n  </nav>\n\n  <div class=\"hud-grow\"></div>\n\n  <div class=\"hud-search\">\n    <svg class=\"search-ico\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"11\" cy=\"11\" r=\"8\"/><line x1=\"21\" y1=\"21\" x2=\"16.65\" y2=\"16.65\"/></svg>\n    <input id=\"global-query\" type=\"text\" placeholder=\"快速搜索决策与避坑...\">\n    <span class=\"shortcut-key\">/</span>\n    <div class=\"search-popover\" id=\"search-popover\"></div>\n  </div>\n\n  <div class=\"sync-beacon\" id=\"beacon-sync\" title=\"点击选择本地 .agents/notes 目录开启纯本地热同步\">\n    <span class=\"radar-dot\" id=\"radar-indicator\"></span>\n    <span id=\"beacon-status\">连接本地目录</span>\n  </div>\n</header>\n\n<main class=\"mission-canvas\">\n\n  <!-- 未装载引导 -->\n  <div class=\"onboarding-deck\" id=\"deck-onboarding\" style=\"display:none;\">\n    <h2>工程决策看板</h2>\n    <p>当前尚未挂载笔记数据。本看板支持浏览器端直接授权读取本地 <code>.agents/notes</code> 目录，无需任何后端服务器与 Git 提交，本地新建或修改笔记切回浏览器即刻自动热更新。</p>\n    <div style=\"display:flex; gap:14px; margin-top:8px;\">\n      <button class=\"action-btn-primary\" id=\"btn-authorize-dir\">\n        <svg width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><path d=\"M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\"/></svg>\n        选择本地 .agents/notes 文件夹\n      </button>\n      <button class=\"action-btn-secondary\" id=\"btn-mount-demo\">载入标准样例演示数据</button>\n    </div>\n  </div>\n\n  <!-- 1. 架构基线视图 -->\n  <section class=\"canvas-view active\" id=\"view-baseline\">\n    <div class=\"kpi-row\" id=\"kpi-row\"></div>\n\n    <div class=\"hud-panel\" style=\"margin-bottom: 28px;\">\n      <div class=\"panel-masthead\">\n        <span class=\"panel-headline\">\n          <span>🏛️</span>\n          <span>系统承重墙</span>\n        </span>\n        <span class=\"panel-annotation\">基于交叉引用入度权重萃取的系统关键协议</span>\n      </div>\n      <div class=\"pillars-vault\" id=\"pillars-vault\"></div>\n    </div>\n\n    <div class=\"hud-panel\">\n      <div class=\"panel-masthead\">\n        <span class=\"panel-headline\">\n          <span>🧩</span>\n          <span>领域架构分类阵列</span>\n        </span>\n        <span class=\"panel-annotation\">现行生效的生产事实全景清单</span>\n      </div>\n      <div class=\"matrix-chambers\" id=\"matrix-chambers\"></div>\n    </div>\n  </section>\n\n  <!-- 2. 演进时间线视图 -->\n  <section class=\"canvas-view\" id=\"view-timeline\">\n    <div class=\"hud-panel\">\n      <div class=\"panel-masthead\">\n        <span class=\"panel-headline\">\n          <span>⏱️</span>\n          <span>技术演进时间线</span>\n        </span>\n        <span class=\"panel-annotation\">记录架构突破与代码裁撤里程碑</span>\n      </div>\n\n      <div class=\"timeline-toolbar\">\n        <div class=\"filter-row\">\n          <span class=\"filter-group-label\">📅 月份切片:</span>\n          <div class=\"month-pills\" id=\"timeline-month-pills\"></div>\n        </div>\n        <div class=\"filter-row\">\n          <span class=\"filter-group-label\">🏷️ 分类切片:</span>\n          <div class=\"class-pills\" id=\"timeline-class-pills\"></div>\n        </div>\n        <div class=\"filter-summary-bar\">\n          <span id=\"timeline-filter-info\"></span>\n          <button id=\"btn-reset-timeline-filter\" style=\"background:none;border:0;color:var(--brand-blue);font-family:var(--font-mono);font-size:11px;cursor:pointer;font-weight:600;\">重置时间线筛选</button>\n        </div>\n      </div>\n\n      <div class=\"chrono-track\" id=\"chrono-track\"></div>\n    </div>\n  </section>\n\n  <!-- 3. 避坑智库视图 -->\n  <section class=\"canvas-view\" id=\"view-alternatives\">\n    <div class=\"hud-panel\">\n      <div class=\"panel-masthead\">\n        <span class=\"panel-headline\">\n          <span>🛡️</span>\n          <span>避坑与反思智库</span>\n        </span>\n        <span class=\"panel-annotation\">记录「为什么放弃了方案 B」与被否决的提案，防止重复踩坑</span>\n      </div>\n      <div class=\"alt-controls\">\n        <input type=\"text\" class=\"alt-search-input\" id=\"alt-query-input\" placeholder=\"检索被否决方案关键字（如：SQLite、多进程、Redis...）\">\n      </div>\n      <div class=\"pitfalls-grid\" id=\"pitfalls-grid\"></div>\n    </div>\n  </section>\n\n  <!-- 4. 决策清单视图 -->\n  <section class=\"canvas-view\" id=\"view-directory\">\n    <div class=\"matrix-toolbar\">\n      <select id=\"select-status\"><option value=\"\">状态：全部</option></select>\n      <select id=\"select-class\"><option value=\"\">分类：全部</option></select>\n      <select id=\"select-sort\">\n        <option value=\"new\">排序：最新优先</option>\n        <option value=\"old\">排序：最早优先</option>\n        <option value=\"cites\">排序：引用最多</option>\n      </select>\n      <button id=\"btn-reset-matrix-filter\" style=\"background:none;border:0;color:var(--brand-blue);font-family:var(--font-mono);font-size:11px;cursor:pointer;font-weight:600;\" title=\"清空全部筛选条件\">重置筛选</button>\n      <span style=\"font-family:var(--font-mono); font-size:11px; color:var(--text-tertiary); margin-left:auto;\" id=\"matrix-matched-count\"></span>\n    </div>\n\n    <div class=\"matrix-board\">\n      <div class=\"matrix-row-head\">\n        <span>编号</span>\n        <span>分类</span>\n        <span>标题</span>\n        <span>状态</span>\n        <span>日期</span>\n        <span style=\"text-align:right;\">引用</span>\n      </div>\n      <div id=\"matrix-rows-stream\"></div>\n    </div>\n  </section>\n\n  <footer style=\"margin-top: 24px; padding: 20px 0; border-top: 1px solid var(--border-normal); display: flex; align-items: center; justify-content: space-between; font-family: var(--font-mono); font-size: 11.5px; color: var(--text-tertiary); flex-wrap: wrap; gap: 12px;\">\n    <div>Agent Notes · 工程决策看板 · 遵循 MIT 协议开源</div>\n    <div style=\"display: flex; gap: 16px; align-items: center;\">\n      <span>友情链接:</span>\n      <a href=\"https://linux.do\" target=\"_blank\" rel=\"noopener noreferrer\" style=\"color: var(--brand-blue); text-decoration: none; font-weight: 600;\">LinuxDo</a>\n    </div>\n  </footer>\n\n</main>\n\n<!-- 结构化控制台抽屉 -->\n<div id=\"drawer-curtain\"></div>\n<aside id=\"drawer-console\">\n  <div class=\"console-header\">\n    <span class=\"status-badge\" id=\"dr-status-badge\"></span>\n    <span class=\"class-badge\" id=\"dr-class-badge\"></span>\n    <div style=\"flex:1;\"></div>\n    <button class=\"console-exit\" id=\"btn-console-close\" title=\"退出 (Esc)\">✕</button>\n  </div>\n  <div class=\"console-body\">\n    <div class=\"anchor-terminal\">\n      <span class=\"anchor-code\" id=\"dr-anchor-code\">// Note: 见 .agents/notes/...</span>\n      <button class=\"btn-anchor-copy\" id=\"btn-anchor-copy\">复制反向代码注释</button>\n    </div>\n\n    <h1 class=\"console-headline\" id=\"dr-headline\"></h1>\n    <div class=\"console-timestamp\" id=\"dr-timestamp-bar\"></div>\n\n    <div class=\"quad-section\" id=\"quad-sec-problem\">\n      <div class=\"quad-title\">🎯 01. 背景与痛点</div>\n      <div class=\"quad-content\" id=\"dr-body-problem\"></div>\n    </div>\n\n    <div class=\"quad-section\" id=\"quad-sec-decision\">\n      <div class=\"quad-title\">⚡ 02. 落地裁定事实</div>\n      <div class=\"quad-content\" id=\"dr-body-decision\"></div>\n    </div>\n\n    <div class=\"quad-section\" id=\"quad-sec-alt\">\n      <div class=\"quad-title\">🚫 03. 审慎考虑并放弃的备选</div>\n      <div class=\"quad-content\" id=\"dr-body-alt\"></div>\n    </div>\n\n    <div class=\"quad-section\" id=\"quad-sec-consequences\">\n      <div class=\"quad-title\">⚖️ 04. 收益与工程代价</div>\n      <div class=\"quad-content\" id=\"dr-body-consequences\"></div>\n    </div>\n\n    <div class=\"quad-section\">\n      <div class=\"quad-title\">🔗 05. 因果与血缘依赖链路</div>\n      <div class=\"lineage-nodes\" id=\"dr-lineage-stream\"></div>\n    </div>\n  </div>\n</aside>\n\n<!-- 内联数据插槽 -->"
    const BOARD_FONT = /*__BOARD_FONT__*/ "<link href=\"https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,400;0,500;0,700;1,400&family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap\" rel=\"stylesheet\">"

    const SHELL_CSS = `
.nbx-shell{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-size:12px}
.nbx-bar{display:flex;align-items:center;gap:10px;padding:8px 14px;border-bottom:1px solid var(--dsw-alias-border-l1);flex:0 0 auto}
.nbx-title{font-size:13px;font-weight:650;letter-spacing:.2px}
.nbx-select{appearance:none;background:var(--dsw-alias-bg-layer-1);color:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:4px 24px 4px 9px;font-size:12px;font-family:inherit;cursor:pointer;max-width:260px}
.nbx-select:hover{border-color:var(--dsw-alias-border-l2)}
.nbx-btn{background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-secondary);border:1px solid var(--dsw-alias-border-l1);border-radius:7px;padding:4px 9px;font-size:12px;font-family:inherit;cursor:pointer}
.nbx-btn:hover{color:var(--dsw-alias-label-primary);border-color:var(--dsw-alias-border-l2)}
.nbx-btn[disabled]{opacity:.5;cursor:default}
.nbx-state{color:var(--dsw-alias-label-secondary);font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nbx-err{color:var(--dsw-alias-state-error-primary)}
.nbx-grow{flex:1 1 auto}
.nbx-host{flex:1 1 auto;min-height:0;position:relative;display:block}
`

    /**
     * 把原版看板挂进一个 shadow root。
     * root: ShadowRoot（原版脚本里的 document.getElementById / querySelector 全部被改写到它上面）
     * host: { onRefresh?: () => void }
     */
    function mountBoard(root, host) {
      const cleanups = []
      const byId = (id) => root.getElementById(id)
      const onRoot = (type, fn, opts) => {
        root.addEventListener(type, fn, opts)
        cleanups.push(() => root.removeEventListener(type, fn, opts))
      }
      const onWin = (type, fn, opts) => {
        window.addEventListener(type, fn, opts)
        cleanups.push(() => window.removeEventListener(type, fn, opts))
      }
      const setInterval = (fn, ms) => {
        const id = window.setInterval(fn, ms)
        cleanups.push(() => window.clearInterval(id))
        return id
      }
      const panelRoute = {
        _h: '',
        get hash() {
          return this._h ? '#' + this._h : ''
        },
        replaceState(_state, _title, url) {
          this._h = String(url || '').replace(/^#/, '')
        },
      }

      /* ===== 以下为原版看板脚本（构建时注入，未重写） ===== */
      
'use strict';

const LIFECYCLES = ['implemented', 'proposed', 'rejected', 'archived'];
const STATUS_LABELS = { implemented: '已落地', proposed: '待评审', rejected: '已否决', archived: '已归档' };

const CLASSES = ['architecture', 'feature', 'bug-fix', 'simplification', 'process', 'testing'];
const CLASS_LABELS = {
  architecture: '架构设计',
  feature: '功能特性',
  'bug-fix': '缺陷修复',
  simplification: '化简裁撤',
  process: '流程规范',
  testing: '测试基建'
};

const DB_NAME = 'AgentNotesBoardDB';
const STORE_NAME = 'handles';

const Core = {
  nodes: [],
  byId: new Map(),
  inCount: new Map(),
  outMap: new Map(),
  activeTab: 'baseline',
  dirHandle: null,
  lastSyncTime: 0,
  filterQuery: '',
  stFilter: '',
  clsFilter: '',
  sortMode: 'new',
  altQuery: '',
  timelineMonth: '',
  timelineClass: '',
  drawerId: null,
};

// 全序日期比较器：date 相同时以唯一 id 兜底，保证任意刷新顺序一致
const byDateDesc = (a, b) => (b.date || '').localeCompare(a.date || '') || a.id.localeCompare(b.id);
const byDateAsc  = (a, b) => (a.date || '').localeCompare(b.date || '') || a.id.localeCompare(b.id);

function getDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveDirHandle(handle) {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(handle, 'notesDirHandle');
    await new Promise(r => tx.oncomplete = r);
  } catch (e) { console.warn('Cannot persist dir handle', e); }
}

async function loadSavedDirHandle() {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get('notesDirHandle');
    return new Promise(resolve => {
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch { return null; }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function parseMarkdown(text) {
  if (!text) return '';
  let s = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  s = s.replace(/```([\s\S]*?)```/g, (m, c) => `<pre><code>${c.trim()}</code></pre>`);
  s = s.replace(/`([^`\n]+)`/g, '<code>$1</code>');
  s = s.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, linkText, href) => {
    const cleanHref = href.trim();
    if (/^(?:javascript|data|vbscript):/i.test(cleanHref)) {
      return linkText;
    }
    const safeHref = escapeHtml(cleanHref);
    return `<a href="javascript:void(0)" class="md-deep-link" data-deep-link="${safeHref}" style="color:var(--brand-cyan);text-decoration:underline;">${linkText}</a>`;
  });
  s = s.replace(/^- (.*)$/gm, '• $1');
  return s.split(/\n{2,}/).map(p => {
    p = p.trim();
    if (!p) return '';
    if (p.startsWith('<pre>')) return p;
    return `<p style="margin-bottom:10px;">${p.replace(/\n/g, '<br>')}</p>`;
  }).join('');
}

function parseNote(raw, relPath, slugToId = new Map()) {
  const slug = relPath.split('/').pop().replace(/\.md$/, '');
  const parts = relPath.split('/');
  const lifecycle = parts[0];
  const cls = parts[1] || 'architecture';

  let title = slug;
  let status = lifecycle;
  let date = '';

  const dMatch = /^(\d{4}-\d{2}-\d{2})/.exec(slug);
  if (dMatch) date = dMatch[1];

  const h1Match = /^# Agent Note[^:：]*[:：]\s*(.*)$/m.exec(raw);
  if (h1Match) title = h1Match[1].trim();

  function extractSection(pattern) {
    const re = new RegExp(`^## (?:${pattern})\\s*\\n+([\\s\\S]*?)(?=^## |\\s*$)`, 'm');
    const m = re.exec(raw);
    return m ? m[1].trim() : '';
  }

  const problem = extractSection('Problem|问题');
  const decision = extractSection('Decision|Proposal|决策|提案');
  const alternatives = extractSection('Alternatives considered|曾考虑的替代方案|曾考虑的备选');
  const consequences = extractSection('Consequences|后果');

  const links = [];
  for (const m of raw.matchAll(/\]\(([^)]+\.md)\)/g)) {
    let targetHref = m[1].split('#')[0].trim();
    if (targetHref.includes('://')) continue;
    targetHref = targetHref.replace(/\.zh\.md$/, '.md');
    const segs = `${lifecycle}/${cls}/${targetHref}`.split('/');
    const resolved = [];
    for (const s of segs) {
      if (!s || s === '.') continue;
      if (s === '..') resolved.pop();
      else resolved.push(s);
    }
    const cleanTarget = resolved.join('/');

    let finalTarget = '';
    if (slugToId.has(cleanTarget)) {
      finalTarget = slugToId.get(cleanTarget);
    } else {
      const targetSlug = targetHref.split('/').pop().replace(/\.md$/, '');
      if (slugToId.has(targetSlug)) {
        finalTarget = slugToId.get(targetSlug);
      }
    }
    if (finalTarget && finalTarget !== relPath) {
      links.push(finalTarget);
    }
  }

  return {
    id: relPath,
    slug,
    lifecycle,
    cls,
    date,
    title,
    status,
    problem,
    decision,
    alternatives,
    consequences,
    outLinks: [...new Set(links)],
    rawBody: raw,
  };
}

async function scanDirectory(rootHandle) {
  const notesMap = new Map();
  async function walk(dirHandle, currentPath = '') {
    for await (const entry of dirHandle.values()) {
      if (entry.name.startsWith('.')) continue;
      const subPath = currentPath ? `${currentPath}/${entry.name}` : entry.name;
      if (entry.kind === 'directory') {
        await walk(entry, subPath);
      } else if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        const isZh = entry.name.endsWith('.zh.md');
        const cleanRel = isZh ? subPath.replace(/\.zh\.md$/, '.md') : subPath;
        const parts = cleanRel.split('/');
        if (parts.length >= 3 && LIFECYCLES.includes(parts[0])) {
          try {
            const file = await entry.getFile();
            const text = await file.text();
            if (!notesMap.has(cleanRel) || isZh) {
              notesMap.set(cleanRel, text);
            }
          } catch (err) {
            console.warn('Read note error:', subPath, err);
          }
        }
      }
    }
  }

  let targetHandle = rootHandle;
  try {
    const agentsDir = await rootHandle.getDirectoryHandle('.agents');
    targetHandle = await agentsDir.getDirectoryHandle('notes');
  } catch {}

  await walk(targetHandle);

  const slugToId = new Map();
  for (const rel of notesMap.keys()) {
    const slug = rel.split('/').pop().replace(/\.md$/, '');
    slugToId.set(slug, rel);
    slugToId.set(rel, rel);
  }

  const notes = [];
  for (const [cleanRel, text] of notesMap.entries()) {
    notes.push(parseNote(text, cleanRel, slugToId));
  }
  return notes;
}

function ingestDataset(notes) {
  Core.nodes = notes;
  Core.byId.clear();
  Core.inCount.clear();
  Core.outMap.clear();

  notes.forEach(n => {
    Core.byId.set(n.id, n);
    Core.outMap.set(n.id, n.outLinks);
  });

  notes.forEach(n => {
    n.outLinks.forEach(target => {
      if (Core.byId.has(target)) {
        Core.inCount.set(target, (Core.inCount.get(target) || 0) + 1);
      }
    });
  });

  Core.nodes.sort(byDateDesc);

  byId('chip-total-count').textContent = `${notes.length} 项`;
  byId('deck-onboarding').style.display = notes.length ? 'none' : 'flex';

  renderInterface();
}

function renderView(view) {
  if (view === 'timeline') renderTimeline();
  else if (view === 'alternatives') renderAlternatives();
  else if (view === 'directory') renderDirectory();
  else renderBaseline();
}

function renderInterface() {
  renderView(Core.activeTab);
}

function renderBaseline() {
  const nodes = Core.nodes;
  const implemented = nodes.filter(n => n.lifecycle === 'implemented');
  const proposed = nodes.filter(n => n.lifecycle === 'proposed');
  const rejected = nodes.filter(n => n.lifecycle === 'rejected');
  const simplifications = nodes.filter(n => n.cls === 'simplification');

  const kpis = [
    { label: '现行落地', count: implemented.length, desc: '生产已交付生效', color: '#10B981', filter: 'implemented' },
    { label: '待评审提案', count: proposed.length, desc: '待团队确认', color: '#F59E0B', filter: 'proposed' },
    { label: '避坑否决', count: rejected.length, desc: '防重犯事实存档', color: '#FF3366', filter: 'rejected' },
    { label: '化简裁撤', count: simplifications.length, desc: '代码只减不增', color: '#14B8A6', filter: 'simplification' },
  ];

  byId('kpi-row').innerHTML = kpis.map(k => `
    <div class="kpi-instrument" data-kpi-filter="${escapeHtml(k.filter)}">
      <div class="kpi-tag">
        <span>${escapeHtml(k.label)}</span>
        <span style="width:6px;height:6px;border-radius:50%;background:${k.color}"></span>
      </div>
      <div class="kpi-num">${k.count}</div>
      <div class="kpi-caption">${escapeHtml(k.desc)}</div>
      <div class="kpi-accent-bar" style="background:${k.color}"></div>
    </div>
  `).join('');

  const pillars = [...nodes]
    .filter(n => n.lifecycle === 'implemented')
    .sort((a, b) => (Core.inCount.get(b.id) || 0) - (Core.inCount.get(a.id) || 0))
    .slice(0, 6);

  byId('pillars-vault').innerHTML = pillars.map(n => {
    const cites = Core.inCount.get(n.id) || 0;
    const title = escapeHtml(n.title);
    const plain = (n.decision || n.problem || '系统核心架构协议')
      .replace(/<[^>]+>/g, '')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\[(.*?)\]\([^)]*\)/g, '$1')
      .replace(/[*`>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const desc = escapeHtml(plain);
    const safeCls = escapeHtml(n.cls);
    const clsLabel = escapeHtml(CLASS_LABELS[n.cls] || n.cls);
    const safeDate = escapeHtml(n.date || '进行中');
    const safeSlug = escapeHtml(n.slug);
    const safeId = escapeHtml(n.id);
    return `
      <div class="pillar-specimen" data-node-id="${safeId}">
        <div>
          <div class="pillar-meta">
            <span class="class-badge cls-${safeCls}">${clsLabel}</span>
            <span class="weight-gauge">被引用 × ${cites}</span>
          </div>
          <div class="pillar-core-title">${title}</div>
          <div class="pillar-abstract">${desc}</div>
        </div>
        <div class="pillar-telemetry">
          <span>${safeDate}</span>
          <span>#${safeSlug}</span>
        </div>
      </div>
    `;
  }).join('');

  const activeNodes = nodes.filter(n => n.lifecycle === 'implemented' || n.lifecycle === 'proposed');
  byId('matrix-chambers').innerHTML = CLASSES.map(c => {
    const colNodes = activeNodes.filter(n => n.cls === c);
    const clsLabel = escapeHtml(CLASS_LABELS[c] || c);
    return `
      <div class="chamber-pod">
        <div class="chamber-header">
          <span class="chamber-name">
            <span style="width:6px;height:6px;background:var(--brand-cyan);border-radius:1px;"></span>
            ${clsLabel}
          </span>
          <span class="chamber-count">${colNodes.length}</span>
        </div>
        <div class="chamber-stream">
          ${colNodes.length ? colNodes.map(n => `
            <div class="specimen-row" data-node-id="${escapeHtml(n.id)}">
              <div class="specimen-title">${escapeHtml(n.title)}</div>
              <div class="specimen-info">
                <span>${escapeHtml(n.date || '—')}</span>
                ${(Core.inCount.get(n.id) || 0) ? `<span style="color:var(--brand-blue)">↗${Core.inCount.get(n.id)}</span>` : ''}
              </div>
            </div>
          `).join('') : '<div style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:11px;padding:8px;">// 暂无该类活跃决策</div>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderTimeline() {
  const allDatedNodes = [...Core.nodes].filter(n => n.date).sort(byDateDesc);

  // 1. 统计全部月份
  const monthsMap = new Map();
  allDatedNodes.forEach(n => {
    const mo = n.date.slice(0, 7);
    if (!monthsMap.has(mo)) monthsMap.set(mo, []);
    monthsMap.get(mo).push(n);
  });

  // 2. 渲染月份筛选胶囊
  const monthPillsContainer = byId('timeline-month-pills');
  if (monthPillsContainer) {
    const allPill = `<button class="month-pill ${!Core.timelineMonth ? 'active' : ''}" data-mo="">全部 (${allDatedNodes.length})</button>`;
    const moPills = [...monthsMap.entries()].map(([mo, items]) => `
      <button class="month-pill ${Core.timelineMonth === mo ? 'active' : ''}" data-mo="${mo}">${mo} (${items.length})</button>
    `).join('');
    monthPillsContainer.innerHTML = allPill + moPills;

    monthPillsContainer.querySelectorAll('.month-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        Core.timelineMonth = btn.dataset.mo;
        renderTimeline();
      });
    });
  }

  // 3. 渲染大类分类筛选胶囊
  const classPillsContainer = byId('timeline-class-pills');
  if (classPillsContainer) {
    const allClsPill = `<button class="class-pill ${!Core.timelineClass ? 'active' : ''}" data-cls="">全部分类 (${allDatedNodes.length})</button>`;
    const clsPills = CLASSES.map(c => {
      const cnt = allDatedNodes.filter(n => n.cls === c).length;
      return `<button class="class-pill ${Core.timelineClass === c ? 'active' : ''}" data-cls="${c}">${CLASS_LABELS[c]} (${cnt})</button>`;
    }).join('');
    classPillsContainer.innerHTML = allClsPill + clsPills;

    classPillsContainer.querySelectorAll('.class-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        Core.timelineClass = btn.dataset.cls;
        renderTimeline();
      });
    });
  }

  // 4. 重置筛选按钮
  const btnReset = byId('btn-reset-timeline-filter');
  if (btnReset) {
    btnReset.onclick = () => {
      Core.timelineMonth = '';
      Core.timelineClass = '';
      renderTimeline();
    };
  }

  // 5. 正交组合过滤
  let filteredNodes = allDatedNodes;
  if (Core.timelineMonth) {
    filteredNodes = filteredNodes.filter(n => n.date.startsWith(Core.timelineMonth));
  }
  if (Core.timelineClass) {
    filteredNodes = filteredNodes.filter(n => n.cls === Core.timelineClass);
  }

  // 6. 更新信息条
  const infoEl = byId('timeline-filter-info');
  if (infoEl) {
    const parts = [];
    if (Core.timelineMonth) parts.push(Core.timelineMonth);
    if (Core.timelineClass) parts.push(CLASS_LABELS[Core.timelineClass] || Core.timelineClass);
    infoEl.textContent = parts.length
      ? `已切片 [${parts.join(' · ')}] 对应 ${filteredNodes.length} 条记录`
      : `全周期全分类共 ${filteredNodes.length} 条演化记录`;
  }

  // 7. 按月份分组展示
  const filteredMonthsMap = new Map();
  filteredNodes.forEach(n => {
    const mo = n.date.slice(0, 7);
    if (!filteredMonthsMap.has(mo)) filteredMonthsMap.set(mo, []);
    filteredMonthsMap.get(mo).push(n);
  });

  let html = '';
  for (const [mo, items] of filteredMonthsMap.entries()) {
    html += `
      <div class="chrono-node-epoch">
        <div class="chrono-epoch-badge">${escapeHtml(mo)} · ${items.length} 条</div>
        <div class="chrono-cards">
          ${items.map(n => `
            <div class="chrono-card" data-node-id="${escapeHtml(n.id)}">
              <div class="chrono-pulse"></div>
              <div class="chrono-meta-row">
                <span class="chrono-date-badge">📅 ${escapeHtml(n.date || '进行中')}</span>
                <span class="class-badge cls-${escapeHtml(n.cls)}">${escapeHtml(CLASS_LABELS[n.cls] || n.cls)}</span>
                <span class="status-badge st-${escapeHtml(n.lifecycle)}">${escapeHtml(STATUS_LABELS[n.lifecycle] || n.lifecycle)}</span>
                <span class="chrono-heading">${escapeHtml(n.title)}</span>
              </div>
              <div class="chrono-body">${escapeHtml((n.problem || n.decision || '').slice(0, 180))}...</div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }
  byId('chrono-track').innerHTML = html || '<div style="color:var(--text-tertiary);padding:36px;font-family:var(--font-mono);text-align:center;">// 未找到符合此切片组合的演化记录</div>';
}

function renderAlternatives() {
  const q = (Core.altQuery || '').toLowerCase();
  const altItems = [];

  Core.nodes.forEach(n => {
    const title = n.title;
    const altContent = n.alternatives;

    if (n.lifecycle === 'rejected') {
      const crux = (n.rawBody || '').split('\n')[2]?.replace(/Status:\s*rejected\s*[—–-]/, '').trim() || n.problem || '审慎否决，防止重犯。';
      altItems.push({
        nodeId: n.id,
        title,
        cls: n.cls,
        discarded: `[已否决提案] ${title}`,
        crux,
        winner: '提案直接否决'
      });
    }
    if (altContent) {
      const parts = altContent.split(/\n(?=###? |- )/);
      parts.forEach(p => {
        const clean = p.replace(/^[-#* ]+/, '').trim()
          .replace(/\*\*([^*]+)\*\*/g, '$1')
          .replace(/\*\*/g, '')
          .replace(/__([^_]+)__/g, '$1')
          .replace(/`([^`]*)`/g, '$1')
          .replace(/\[(.*?)\]\([^)]*\)/g, '$1');
        if (clean.length > 5) {
          const colonIdx = clean.indexOf('：') > -1 ? clean.indexOf('：') : clean.indexOf(':');
          let heading = clean.slice(0, 45);
          let reason = clean;
          if (colonIdx > 0 && colonIdx < 35) {
            heading = clean.slice(0, colonIdx);
            reason = clean.slice(colonIdx + 1);
          }
          altItems.push({
            nodeId: n.id,
            title,
            cls: n.cls,
            discarded: heading,
            crux: reason,
            winner: `采纳决策: ${title}`
          });
        }
      });
    }
  });

  const filtered = altItems.filter(item => {
    if (!q) return true;
    return item.discarded.toLowerCase().includes(q) || item.crux.toLowerCase().includes(q) || item.title.toLowerCase().includes(q);
  });

  byId('pitfalls-grid').innerHTML = filtered.length ? filtered.map(item => `
    <div class="pitfall-dossier" data-node-id="${escapeHtml(item.nodeId)}">
      <div>
        <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
          <span class="class-badge cls-${escapeHtml(item.cls)}">${escapeHtml(CLASS_LABELS[item.cls] || item.cls)}</span>
          <span style="font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary);">#${escapeHtml(item.nodeId.split('/').pop().replace('.md',''))}</span>
        </div>
        <div class="hazard-banner">🚫 放弃备选：${escapeHtml(item.discarded)}</div>
        <div class="crux-evidence" style="margin-top:12px;">💡 权衡依据：${escapeHtml(item.crux)}</div>
      </div>
      <div class="triumphant-verdict">✅ ${escapeHtml(item.winner)}</div>
    </div>
  `).join('') : `<div style="grid-column:1/-1;color:var(--text-tertiary);text-align:center;padding:48px;font-family:var(--font-mono);">// 未检索到相关避坑记录</div>`;
}

function renderDirectory() {
  const q = (Core.filterQuery || '').toLowerCase();
  const st = Core.stFilter;
  const cls = Core.clsFilter;

  let list = Core.nodes.filter(n => {
    if (st && n.lifecycle !== st) return false;
    if (cls && n.cls !== cls) return false;
    if (q) {
      const hay = `${n.title} ${n.slug} ${n.problem || ''} ${n.decision || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });

  if (Core.sortMode === 'new') list.sort(byDateDesc);
  else if (Core.sortMode === 'old') list.sort(byDateAsc);
  else if (Core.sortMode === 'cites') list.sort((a, b) => (Core.inCount.get(b.id) || 0) - (Core.inCount.get(a.id) || 0));

  byId('matrix-matched-count').textContent = `匹配 ${list.length} 条`;

  byId('matrix-rows-stream').innerHTML = list.length ? list.map((n, idx) => {
    const cites = Core.inCount.get(n.id) || 0;
    return `
      <div class="matrix-row-cell" data-node-id="${escapeHtml(n.id)}">
        <span class="cell-index">#${String(idx + 1).padStart(3, '0')}</span>
        <span><span class="class-badge cls-${escapeHtml(n.cls)}">${escapeHtml(CLASS_LABELS[n.cls] || n.cls)}</span></span>
        <span class="cell-title">${escapeHtml(n.title)}</span>
        <span><span class="status-badge st-${escapeHtml(n.lifecycle)}">${escapeHtml(STATUS_LABELS[n.lifecycle] || n.lifecycle)}</span></span>
        <span class="cell-date">${escapeHtml(n.date || '—')}</span>
        <span class="cell-cites">${cites ? `↗ ${cites}` : ''}</span>
      </div>
    `;
  }).join('') : '<div style="padding:40px;text-align:center;color:var(--text-tertiary);font-family:var(--font-mono);">// 没有匹配的决策记录</div>';
}

function openConsole(id) {
  const n = Core.byId.get(id);
  if (!n) return;

  Core.drawerId = id;

  const stBadge = byId('dr-status-badge');
  stBadge.className = `status-badge st-${n.lifecycle}`;
  stBadge.textContent = STATUS_LABELS[n.lifecycle] || n.lifecycle;

  const clsBadge = byId('dr-class-badge');
  clsBadge.className = `class-badge cls-${n.cls}`;
  clsBadge.textContent = CLASS_LABELS[n.cls] || n.cls;

  const anchor = `// Note: 见 .agents/notes/${n.id}`;
  byId('dr-anchor-code').textContent = anchor;
  byId('btn-anchor-copy').onclick = () => {
    navigator.clipboard.writeText(anchor);
    const btn = byId('btn-anchor-copy');
    const old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(() => btn.textContent = old, 1500);
  };

  byId('dr-headline').textContent = n.title;
  byId('dr-timestamp-bar').innerHTML = `
    <span>${escapeHtml(n.date || '无日期')}</span>
    <span>·</span>
    <span>${escapeHtml(n.slug)}</span>
    ${(Core.inCount.get(n.id) || 0) ? `<span>·</span><span style="color:var(--brand-blue);font-weight:700;">被引用 ${Core.inCount.get(n.id)} 次</span>` : ''}
  `;

  byId('dr-body-problem').innerHTML = parseMarkdown(n.problem) || '<span style="color:var(--text-tertiary);">（未独立分节说明问题）</span>';
  byId('dr-body-decision').innerHTML = parseMarkdown(n.decision) || '<span style="color:var(--text-tertiary);">（未记录具体裁定事实）</span>';
  byId('dr-body-alt').innerHTML = parseMarkdown(n.alternatives) || '<span style="color:var(--text-tertiary);">（无曾考虑的备选对比）</span>';
  byId('dr-body-consequences').innerHTML = parseMarkdown(n.consequences) || '<span style="color:var(--text-tertiary);">（未详述工程后果）</span>';

  const incoming = Core.nodes.filter(x => x.outLinks.includes(n.id));
  const outgoing = n.outLinks.map(t => Core.byId.get(t)).filter(Boolean);

  let lineageHtml = '';
  if (outgoing.length) {
    lineageHtml += `
      <div>
        <div class="lineage-group-title">前置先决依据：</div>
        <div class="lineage-chips">
          ${outgoing.map(o => `<div class="lineage-chip" data-node-id="${escapeHtml(o.id)}">↖ ${escapeHtml(o.title)}</div>`).join('')}
        </div>
      </div>
    `;
  }
  if (incoming.length) {
    lineageHtml += `
      <div style="margin-top:10px;">
        <div class="lineage-group-title">派生制约影响：</div>
        <div class="lineage-chips">
          ${incoming.map(i => `<div class="lineage-chip" data-node-id="${escapeHtml(i.id)}">↘ ${escapeHtml(i.title)}</div>`).join('')}
        </div>
      </div>
    `;
  }
  if (!incoming.length && !outgoing.length) {
    lineageHtml = '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary);">独立节点，暂无交叉引用</span>';
  }
  byId('dr-lineage-stream').innerHTML = lineageHtml;

  // 打开新笔记前重置滚动位置，避免从上一篇的底部开始显示
  root.querySelector('#drawer-console .console-body').scrollTop = 0;

  byId('drawer-curtain').classList.add('open');
  byId('drawer-console').classList.add('open');
  panelRoute.replaceState(null, '', '#note=' + encodeURIComponent(id));
}

function closeConsole() {
  byId('drawer-curtain').classList.remove('open');
  byId('drawer-console').classList.remove('open');
  panelRoute.replaceState(null, '', '#' + Core.activeTab);
}

function handleDeepLink(link) {
  for (const n of Core.nodes) {
    if (link.includes(n.slug)) {
      openConsole(n.id);
      return;
    }
  }
}

function routeToListFilter(filterVal) {
  switchDeckTab('directory');
  // 彻底清空可能残留的旧筛选项与搜索词，确保列表与点击的卡片完全对应
  Core.stFilter = '';
  Core.clsFilter = '';
  Core.filterQuery = '';
  const gq = byId('global-query');
  if (gq) gq.value = '';
  byId('select-status').value = '';
  byId('select-class').value = '';

  if (['implemented', 'proposed', 'rejected', 'archived'].includes(filterVal)) {
    Core.stFilter = filterVal;
    byId('select-status').value = filterVal;
  } else if (CLASSES.includes(filterVal)) {
    Core.clsFilter = filterVal;
    byId('select-class').value = filterVal;
  }
  renderDirectory();
}

function switchDeckTab(viewId) {
  if (viewId.startsWith('note=')) {
    const id = decodeURIComponent(viewId.slice('note='.length));
    openConsole(id);
    return;
  }
  if (!['baseline', 'timeline', 'alternatives', 'directory'].includes(viewId)) viewId = 'baseline';
  Core.activeTab = viewId;
  renderView(viewId);
  root.querySelectorAll('.deck-tab').forEach(t => t.classList.toggle('active', t.dataset.view === viewId));
  root.querySelectorAll('.canvas-view').forEach(p => p.classList.toggle('active', p.id === `view-${viewId}`));
  if (panelRoute.hash.slice(1) !== viewId && !panelRoute.hash.includes('note=')) {
    panelRoute.replaceState(null, '', '#' + viewId);
  }
}

async function triggerLiveSync(silent = false) {
  if (!Core.dirHandle) return;
  const radar = byId('radar-indicator');
  const beaconText = byId('beacon-status');
  radar.className = 'radar-dot syncing';
  beaconText.textContent = '正在同步…';

  try {
    const notes = await scanDirectory(Core.dirHandle);
    ingestDataset(notes);
    radar.className = 'radar-dot active';
    beaconText.textContent = `已连接本地目录（${notes.length} 篇）`;
    Core.lastSyncTime = Date.now();
  } catch (err) {
    console.error('Directory sync fault:', err);
    radar.className = 'radar-dot';
    beaconText.textContent = '重新授权目录';
  }
}

async function startMission() {
  root.querySelectorAll('.deck-tab').forEach(tab => {
    tab.addEventListener('click', () => switchDeckTab(tab.dataset.view));
  });

  onWin('hashchange', () => {
    const h = panelRoute.hash.slice(1);
    if (h) switchDeckTab(h);
  });

  const queryInput = byId('global-query');
  const searchPopover = byId('search-popover');
  let selectedSearchIdx = -1;

  function renderSearchPopover(q) {
    if (!q) {
      searchPopover.classList.remove('open');
      searchPopover.innerHTML = '';
      selectedSearchIdx = -1;
      return;
    }

    const matches = [];
    for (const n of Core.nodes) {
      const hay = `${n.title} ${n.titleZh || ''} ${n.slug} ${n.problem || ''} ${n.problemZh || ''} ${n.decision || ''} ${n.decisionZh || ''}`.toLowerCase();
      if (hay.includes(q)) matches.push(n);
    }

    const topMatches = matches.slice(0, 7);
    selectedSearchIdx = -1;

    if (!topMatches.length) {
      searchPopover.innerHTML = `<div class="popover-empty">// 未找到与 "${escapeHtml(q)}" 匹配的决策记录</div>`;
    } else {
      searchPopover.innerHTML = topMatches.map((n, idx) => {
        const title = escapeHtml(n.title);
        const cites = Core.inCount.get(n.id) || 0;
        return `
          <div class="popover-item" data-id="${escapeHtml(n.id)}" data-idx="${idx}">
            <div class="popover-item-main">
              <div class="popover-title">${title}</div>
              <div class="popover-sub">
                <span class="class-badge cls-${escapeHtml(n.cls)}">${escapeHtml(CLASS_LABELS[n.cls] || n.cls)}</span>
                <span>${escapeHtml(n.date || '进行中')}</span>
                <span>#${escapeHtml(n.slug)}</span>
              </div>
            </div>
            ${cites ? `<span class="weight-gauge">↗${cites}</span>` : ''}
          </div>
        `;
      }).join('') + `
        <div class="popover-footer">
          <span>共找到 <b>${matches.length}</b> 项决策</span>
          <span>按 ↵ 回车在全量清单中查看全部</span>
        </div>
      `;

      searchPopover.querySelectorAll('.popover-item').forEach(item => {
        item.addEventListener('click', () => {
          openConsole(item.dataset.id);
          searchPopover.classList.remove('open');
        });
      });
    }

    searchPopover.classList.add('open');
  }

  queryInput.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    Core.filterQuery = q;
    Core.altQuery = q;
    renderDirectory();
    renderAlternatives();
    renderSearchPopover(q);
  });

  queryInput.addEventListener('keydown', e => {
    const items = searchPopover.querySelectorAll('.popover-item');
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!items.length) return;
      selectedSearchIdx = (selectedSearchIdx + 1) % items.length;
      items.forEach((it, i) => it.classList.toggle('selected', i === selectedSearchIdx));
      items[selectedSearchIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!items.length) return;
      selectedSearchIdx = (selectedSearchIdx - 1 + items.length) % items.length;
      items.forEach((it, i) => it.classList.toggle('selected', i === selectedSearchIdx));
      items[selectedSearchIdx]?.scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedSearchIdx >= 0 && items[selectedSearchIdx]) {
        openConsole(items[selectedSearchIdx].dataset.id);
        searchPopover.classList.remove('open');
      } else {
        switchDeckTab('directory');
        searchPopover.classList.remove('open');
      }
    } else if (e.key === 'Escape') {
      searchPopover.classList.remove('open');
    }
  });

  onRoot('click', e => {
    const kpiTrigger = e.target.closest('[data-kpi-filter]');
    if (kpiTrigger) {
      const kpiFilter = kpiTrigger.getAttribute('data-kpi-filter');
      if (kpiFilter) routeToListFilter(kpiFilter);
      return;
    }
    const nodeTrigger = e.target.closest('[data-node-id]');
    if (nodeTrigger) {
      const id = nodeTrigger.getAttribute('data-node-id');
      if (id) {
        openConsole(id);
        return;
      }
    }
    const deepLink = e.target.closest('.md-deep-link');
    if (deepLink) {
      e.preventDefault();
      const target = deepLink.getAttribute('data-deep-link');
      if (target) handleDeepLink(target);
      return;
    }
    if (!e.target.closest('.hud-search')) {
      searchPopover.classList.remove('open');
    }
  });

  onWin('keydown', e => {
    if (e.key === '/' && document.activeElement !== queryInput) {
      e.preventDefault();
      queryInput.focus();
    }
    if (e.key === 'Escape') closeConsole();
  });

  byId('alt-query-input').addEventListener('input', e => {
    Core.altQuery = e.target.value;
    renderAlternatives();
  });

  const selSt = byId('select-status');
  LIFECYCLES.forEach(s => selSt.innerHTML += `<option value="${s}">状态：${STATUS_LABELS[s]}</option>`);
  selSt.addEventListener('change', e => { Core.stFilter = e.target.value; renderDirectory(); });

  const selCls = byId('select-class');
  CLASSES.forEach(c => selCls.innerHTML += `<option value="${c}">分类：${CLASS_LABELS[c]}</option>`);
  selCls.addEventListener('change', e => { Core.clsFilter = e.target.value; renderDirectory(); });

  byId('select-sort').addEventListener('change', e => { Core.sortMode = e.target.value; renderDirectory(); });

  const btnResetMatrix = byId('btn-reset-matrix-filter');
  if (btnResetMatrix) {
    btnResetMatrix.addEventListener('click', () => {
      Core.stFilter = '';
      Core.clsFilter = '';
      Core.filterQuery = '';
      const gq = byId('global-query');
      if (gq) gq.value = '';
      byId('select-status').value = '';
      byId('select-class').value = '';
      renderDirectory();
    });
  }

  byId('btn-console-close').addEventListener('click', closeConsole);
  byId('drawer-curtain').addEventListener('click', closeConsole);

  async function requestDirectoryAccess() {
    if (!('showDirectoryPicker' in window)) {
      alert('请使用 Chrome / Edge 浏览器体验 File System Access 本地无感同步。');
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read' });
      Core.dirHandle = handle;
      await saveDirHandle(handle);
      await triggerLiveSync();
    } catch (err) {
      if (err.name !== 'AbortError') console.error('Directory request fault:', err);
    }
  }

  byId('beacon-sync').addEventListener('click', requestDirectoryAccess);
  byId('btn-authorize-dir').addEventListener('click', requestDirectoryAccess);
  byId('btn-mount-demo').addEventListener('click', () => loadSampleDataset());

  // 数据由宿主注入：React 侧拿到 .agents/notes 原文后调用 ingestFiles()
  onWin('focus', () => {
    if (Core.dirHandle && Date.now() - Core.lastSyncTime > 2500) {
      triggerLiveSync(true);
    }
  });

  setInterval(() => {
    if (Core.dirHandle && document.hasFocus() && Date.now() - Core.lastSyncTime > 4000) {
      triggerLiveSync(true);
    }
  }, 5000);

  if (panelRoute.hash.slice(1)) {
    switchDeckTab(panelRoute.hash.slice(1));
  }
}

function loadSampleDataset() {
  const sample = [
    {
      id: 'implemented/architecture/2026-06-13-capability-seams.md',
      slug: '2026-06-13-capability-seams',
      lifecycle: 'implemented',
      cls: 'architecture',
      date: '2026-06-13',
      title: '能力 Seam：Service Definition / Provider / Consumer 三权分立',
      problem: '各项能力关注点以不同速率变化。把实现与面向模型的工具契约绑在一起，会导致换沙箱实现时工具 Schema 频发破坏性变更。',
      decision: '拆分为 Service Definition（Cordis 抽象服务声明）、Service Provider（本地或沙箱实现插件）与 Consumer（面向模型的 Schema 工具），实现三者独立演进。',
      alternatives: '### 始终合并各角色\n否决，重新耦合了独立变化的关注点。\n### @cordisjs/plugin-capability\n这是权限安全服务，并非实现替换机制。',
      consequences: '增加包数量与胶水样板；换来沙箱后端替换时彻底零破坏面向模型的工具约定。',
      outLinks: [],
    },
    {
      id: 'implemented/architecture/2026-07-20-canonical-tool-output-contract.md',
      slug: '2026-07-20-canonical-tool-output-contract',
      lifecycle: 'implemented',
      cls: 'architecture',
      date: '2026-07-20',
      title: '规范化工具输出契约 (Canonical Output Contract)',
      problem: '工具直接产出 model-facing 的 ContentBlock 文本，导致编程式工具调用（PTC）无法拿到稳定的强类型领域对象。',
      decision: '每个工具声明强制的 Canonical Output：执行期输出强类型 DTO，并通过纯函数式 render() 投影成持久化和模型可读文本。',
      alternatives: '### 双轨制返回值\n否决，维护双重契约增加心智负担。',
      consequences: '执行期拥有强类型无损数据；PTC 模式无需反向解析字符串。',
      outLinks: ['implemented/architecture/2026-06-13-capability-seams.md'],
    }
  ];
  ingestDataset(sample);
}

/* 启动由宿主 mountBoard() 调用 startMission() */

      /* ===== 原版看板脚本结束 ===== */

      /** 宿主把工作区的 .agents/notes 原文喂进来，走原版 parseNote / ingestDataset */
      function ingestFiles(files) {
        const notesMap = new Map()
        for (const file of files || []) {
          const cleanRel = String(file.path || '').replace(/\.zh\.md$/, '.md')
          const parts = cleanRel.split('/')
          if (parts.length >= 3 && LIFECYCLES.includes(parts[0])) notesMap.set(cleanRel, String(file.raw || ''))
        }
        const slugToId = new Map()
        for (const rel of notesMap.keys()) {
          const slug = rel.split('/').pop().replace(/\.md$/, '')
          slugToId.set(slug, rel)
          slugToId.set(rel, rel)
        }
        const notes = []
        for (const [rel, text] of notesMap.entries()) notes.push(parseNote(text, rel, slugToId))
        ingestDataset(notes)
        return notes.length
      }

      try {
        const boot = startMission()
        if (boot && typeof boot.catch === 'function') {
          boot.catch((error) => console.error('[dsh-notes-board] startMission failed', error))
        }
      } catch (error) {
        console.error('[dsh-notes-board] startMission failed', error)
      }

      return {
        ingest: ingestFiles,
        /* 测试用：scripts/test-board.mjs 用它验证懒渲染 */
        switchTab: switchDeckTab,
        dispose() {
          cleanups.splice(0).forEach((fn) => {
            try {
              fn()
            } catch {
              /* 卸载期单个清理失败不影响其余 */
            }
          })
        },
      }
    }

    /* ── 面板 ─────────────────────────────────────────────── */

    function NotesBoard() {
      const [workspaces, setWorkspaces] = useState([])
      const [selected, setSelected] = useState('')
      const [state, setState] = useState('正在读取工作区清单…')
      const [busy, setBusy] = useState(false)
      const [failed, setFailed] = useState(false)
      const hostRef = useRef(null)
      const boardRef = useRef(null)
      const abortRef = useRef(null)

      const fetchJson = async (url, signal) => {
        const response = await fetch(url, { cache: 'no-store', signal })
        const payload = await response.json().catch(() => null)
        if (!response.ok || !payload || payload.ok === false) {
          throw new Error((payload && payload.message) || `请求失败 (${response.status})`)
        }
        return payload
      }

      useEffect(() => {
        const hostEl = hostRef.current
        if (!hostEl) return undefined
        const shadow = hostEl.shadowRoot || hostEl.attachShadow({ mode: 'open' })
        shadow.innerHTML =
          '<style>' + BOARD_CSS + '</style>' + BOARD_FONT + '<div class="nbx-stage">' + BOARD_HTML + '</div>'
        let mounted = null
        try {
          mounted = mountBoard(shadow, {})
          boardRef.current = mounted
        } catch (error) {
          console.error('[dsh-notes-board] mount failed', error)
          setState('看板挂载失败：' + (error && error.message ? error.message : error))
          setFailed(true)
        }
        return () => {
          if (mounted) mounted.dispose()
          boardRef.current = null
          shadow.innerHTML = ''
        }
      }, [])

      useEffect(() => {
        let alive = true
        fetchJson(`${API}/workspaces`)
          .then((data) => {
            if (!alive) return
            const list = data.workspaces || []
            setWorkspaces(list)
            const remembered = window.localStorage.getItem(STORE_KEY) || ''
            const preferred = list.find((w) => w.id === remembered) || list.find((w) => w.hasNotes) || list[0]
            setSelected(preferred ? preferred.id : '')
            if (!preferred) setState('没有可用工作区')
          })
          .catch((error) => {
            if (!alive) return
            setFailed(true)
            setState('读取工作区失败：' + (error.message || error))
          })
        return () => {
          alive = false
        }
      }, [])

      const load = useCallback((workspaceId) => {
        if (!workspaceId) return
        if (abortRef.current) abortRef.current.abort()
        const controller = new AbortController()
        abortRef.current = controller
        setBusy(true)
        setFailed(false)
        setState('正在扫描 .agents/notes…')
        fetchJson(`${API}/scan?workspace=${encodeURIComponent(workspaceId)}`, controller.signal)
          .then((data) => {
            const count = boardRef.current ? boardRef.current.ingest(data.files || []) : 0
            const label = (data.workspace && data.workspace.title) || '工作区'
            setBusy(false)
            const cut = data.truncated ? `（已达安全阀 ${data.safetyLimit} 篇，结果被截断）` : ''
            setState(data.exists ? `${label} · ${count} 篇笔记${cut}` : `${label} 下还没有 .agents/notes`)
            setFailed(!!data.truncated)
            const shadow = hostRef.current && hostRef.current.shadowRoot
            const beacon = shadow && shadow.getElementById('beacon-status')
            const radar = shadow && shadow.getElementById('radar-indicator')
            if (beacon) beacon.textContent = data.exists ? `宿主直连 · ${count} 篇` : '该工作区没有笔记'
            if (radar) radar.className = data.exists ? 'radar-dot active' : 'radar-dot'
          })
          .catch((error) => {
            if (error && error.name === 'AbortError') return
            setBusy(false)
            setFailed(true)
            setState('扫描失败：' + (error.message || error))
          })
      }, [])

      useEffect(() => {
        if (!selected) return
        window.localStorage.setItem(STORE_KEY, selected)
        load(selected)
      }, [selected, load])

      useEffect(() => () => abortRef.current && abortRef.current.abort(), [])

      return h(
        'div',
        { className: 'nbx-shell' },
        h('style', null, SHELL_CSS),
        h(
          'div',
          { className: 'nbx-bar' },
          h('span', { className: 'nbx-title' }, '笔记看板'),
          h(
            'select',
            {
              className: 'nbx-select',
              value: selected,
              onChange: (event) => setSelected(event.target.value),
            },
            workspaces.length
              ? workspaces.map((w) =>
                  h('option', { key: w.id, value: w.id }, `${w.title}${w.hasNotes ? '' : '（无笔记）'}`),
                )
              : h('option', { value: '' }, '没有可用工作区'),
          ),
          h('button', {
            className: 'nbx-btn',
            disabled: !selected || busy,
            onClick: () => load(selected),
          }, busy ? '刷新中…' : '刷新'),
          h('span', { className: 'nbx-grow' }),
          h('span', { className: 'nbx-state' + (failed ? ' nbx-err' : '') }, state),
        ),
        h('div', { className: 'nbx-host', ref: hostRef }),
      )
    }

    /* ── 侧栏图标 ─────────────────────────────────────────── */

    function PanelIcon(props) {
      const size = (props && props.size) || 20
      const active = !!(props && props.active)
      return h(
        'svg',
        {
          width: size,
          height: size,
          viewBox: '0 0 24 24',
          fill: 'none',
          stroke: 'currentColor',
          strokeWidth: active ? 2 : 1.7,
          strokeLinecap: 'round',
          strokeLinejoin: 'round',
          'aria-hidden': true,
          style: { display: 'block' },
        },
        h('path', { d: 'M6 3.5h9.5L19 7v13.5H6z' }),
        h('path', { d: 'M15 3.5V7h4' }),
        h('path', { d: 'M9 11h7M9 14.5h7M9 18h4' }),
      )
    }

    return {
      inject: ['slots'],
      /* 测试用出口：scripts/test-board.mjs 直接拿它跑桩 DOM 冒烟 */
      mountBoard,
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({ name: 'main', key: PANEL_ID }, NotesBoard))
        ctx.slots.inject('sidebar.panellist', () =>
          ctx.slots.register(
            { name: 'sidebar.panellist', id: PANEL_ID, order: 20, label: '笔记看板' },
            PanelIcon,
          ),
        )
      },
    }
  },
})
