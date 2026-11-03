#!/usr/bin/env node
/**
 * 把原版看板模板（vendor/board.html）改造成能挂在 Harness 面板里的形态，
 * 与 src/panel.js 拼成 client.js。
 *
 * 设计原则：原版逻辑一行都不重写，只做「作用域改写 + 宿主接管数据源」两类机械补丁。
 * 上游更新时：替换 vendor/board.html → 重跑本脚本；补丁数量断言会立刻告诉你哪里变了。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const src = readFileSync(resolve(ROOT, 'vendor/board.html'), 'utf8')
const shell = readFileSync(resolve(ROOT, 'src/panel.js'), 'utf8')

function must(condition, message) {
  if (!condition) throw new Error('build failed: ' + message)
}

function replaceCounted(text, from, to, expected, label) {
  const count = text.split(from).length - 1
  must(count === expected, `${label}: 期望 ${expected} 处 "${from}"，实际 ${count} 处（上游可能已变）`)
  return text.split(from).join(to)
}

/* ── 1. 切出 CSS / 正文 / 脚本 / 字体 ─────────────────────── */

const cssMatch = /<style[^>]*>([\s\S]*?)<\/style>/.exec(src)
must(cssMatch, '找不到 <style> 块')
let css = cssMatch[1]

const bodyStart = src.indexOf('<body>')
const bodyEnd = src.indexOf('<script')
must(bodyStart >= 0 && bodyEnd > bodyStart, '找不到 <body> … <script> 之间的正文')
const bodyHtml = src.slice(bodyStart + '<body>'.length, bodyEnd).trim()

const scripts = [...src.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1])
const script = scripts.find((s) => s.length > 5000)
must(script, '找不到看板主脚本')

const fontMatch = /<link href="https:\/\/fonts\.googleapis\.com[^>]*>/.exec(src)
const font = fontMatch ? fontMatch[0] : ''

/* ── 2. CSS：:root → :host，抽屉定位从 fixed 收到面板内 ───── */

must((css.match(/:root\s*\{/g) || []).length === 1, 'CSS 里 :root 应该只有一处')
css = css.replace(
  /:root\s*\{/,
  ':host{position:relative;display:block;height:100%;overflow:hidden;',
)
css = replaceCounted(css, 'position: fixed', 'position: absolute', 2, 'CSS 抽屉定位')
css +=
  '\n/* ── 宿主注入 ──────────────────────────────────────────── */\n' +
  '/* 原版靠浏览器默认白底，面板里没有 body，这里补上 */\n' +
  '.nbx-stage{height:100%;overflow:auto;background:var(--bg-base);color:var(--text-primary);}\n' +
  '/* 原版顶栏按整页宽度设计，窄面板里会被压成竖排：改成可换行 + 子项不压缩 */\n' +
  'header.hud-topbar{flex-wrap:wrap;height:auto;min-height:56px;padding:8px 16px;gap:12px;row-gap:8px;}\n' +
  'header.hud-topbar>*{flex-shrink:0;}\n' +
  '.brand-text,nav.deck-tabs,.deck-tab,.sync-beacon,.telemetry-chip{white-space:nowrap;}\n' +
  '.hud-grow{flex:1 1 auto;min-width:0;}\n' +
  '.hud-search{width:220px;flex:0 0 auto;}\n' +
  '/* 原版聚焦时把输入框撑到 320px，溢出 260px 容器、盖住右侧同步状态 */\n' +
  '.hud-search input:focus{width:100%;}\n' +
  '.onboarding-deck{display:none !important;}\n'

/* ── 3. JS：作用域改写 ───────────────────────────────────── */

// 先摘掉「自动读取浏览器授权目录」那段启动逻辑，数据改由宿主注入。
const bootStart = script.indexOf('if (window.__INLINE_DATA__')
const bootEnd = script.indexOf("window.addEventListener('focus'")
must(bootStart > 0 && bootEnd > bootStart, '找不到原版启动数据块')
let code =
  script.slice(0, bootStart) +
  '// 数据由宿主注入：React 侧拿到 .agents/notes 原文后调用 ingestFiles()\n  ' +
  script.slice(bootEnd)

code = replaceCounted(code, 'document.getElementById(', 'byId(', 51, 'getElementById 作用域改写')
code = replaceCounted(code, 'document.querySelectorAll(', 'root.querySelectorAll(', 3, 'querySelectorAll 作用域改写')
code = replaceCounted(code, 'document.querySelector(', 'root.querySelector(', 1, 'querySelector 作用域改写')
code = replaceCounted(code, 'window.addEventListener(', 'onWin(', 3, 'window 事件接管')
code = replaceCounted(code, 'document.addEventListener(', 'onRoot(', 2, 'document 事件接管')
code = replaceCounted(
  code,
  "onRoot('DOMContentLoaded', startMission);",
  '/* 启动由宿主 mountBoard() 调用 startMission() */',
  1,
  '移除 DOMContentLoaded 自启动',
)
code = replaceCounted(code, 'location.hash', 'panelRoute.hash', 5, 'hash 路由收进面板')
code = replaceCounted(code, 'history.replaceState', 'panelRoute.replaceState', 3, 'history 收进面板')

// 懒渲染：原版一次把四个视图全渲染出来，1300 篇时时间线单次产出近 1MB HTML。
// 改成只渲染当前 tab，切 tab 时再按需渲染 —— 首屏从四份降到一份。
code = replaceCounted(
  code,
  `function renderInterface() {
  renderBaseline();
  renderTimeline();
  renderAlternatives();
  renderDirectory();
}`,
  `function renderView(view) {
  if (view === 'timeline') renderTimeline();
  else if (view === 'alternatives') renderAlternatives();
  else if (view === 'directory') renderDirectory();
  else renderBaseline();
}

function renderInterface() {
  renderView(Core.activeTab);
}`,
  1,
  '视图懒渲染',
)
code = replaceCounted(
  code,
  '  Core.activeTab = viewId;',
  '  Core.activeTab = viewId;\n  renderView(viewId);',
  1,
  '切换 tab 时补渲染',
)

/* ── 4. 拼装 client.js ───────────────────────────────────── */

let out = shell
for (const [token, value] of [
  ['/*__BOARD_CSS__*/ \'\'', `/*__BOARD_CSS__*/ ${JSON.stringify(css)}`],
  ['/*__BOARD_HTML__*/ \'\'', `/*__BOARD_HTML__*/ ${JSON.stringify(bodyHtml)}`],
  ['/*__BOARD_FONT__*/ \'\'', `/*__BOARD_FONT__*/ ${JSON.stringify(font)}`],
  ['/*__BOARD_SCRIPT__*/', code],
]) {
  must(out.includes(token), `src/panel.js 缺少占位符 ${token.slice(0, 24)}…`)
  out = out.replace(token, () => value)
}

writeFileSync(resolve(ROOT, 'client.js'), out, 'utf8')
console.log(
  `ok: client.js ${(out.length / 1024).toFixed(1)}KB（css ${(css.length / 1024).toFixed(1)}KB / ` +
    `html ${(bodyHtml.length / 1024).toFixed(1)}KB / js ${(code.length / 1024).toFixed(1)}KB）`,
)
