import { readFileSync } from 'node:fs'
import vm from 'node:vm'

import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'client.js')

const cache = new Map()
function makeEl(id) {
  return {
    id, style: {}, dataset: {}, children: [], innerHTML: '', textContent: '', value: '', className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false } },
    appendChild() {}, removeChild() {}, append() {},
    addEventListener() {}, removeEventListener() {},
    querySelector(sel) { return bySel(sel) }, querySelectorAll() { return [] },
    getAttribute() { return null }, setAttribute() {}, closest() { return null },
    focus() {}, scrollIntoView() {}, insertAdjacentHTML() {}, remove() {},
  }
}
const byId = (id) => { if (!cache.has(id)) cache.set(id, makeEl(id)); return cache.get(id) }
const bySel = (sel) => { const k = 'sel:' + sel; if (!cache.has(k)) cache.set(k, makeEl(k)); return cache.get(k) }

const listeners = []
const shadow = {
  getElementById: byId,
  querySelector: bySel,
  querySelectorAll: () => [],
  addEventListener: (t, fn) => listeners.push([t, fn]),
  removeEventListener: () => {},
}

const sandbox = {
  window: { __ModuleLoader__: { load(d) { sandbox.__def = d } }, addEventListener() {}, removeEventListener() {}, setInterval: () => 0, clearInterval() {} },
  console, setTimeout, clearTimeout,
  setInterval: () => 0, clearInterval() {},
  location: { hash: '' }, history: { replaceState() {} },
  document: { activeElement: null, hasFocus: () => true, addEventListener() {}, createElement: () => makeEl('tmp') },
  alert: (m) => console.log('[alert]', m),
}
sandbox.globalThis = sandbox
vm.createContext(sandbox)
vm.runInContext(readFileSync(SRC, 'utf8'), sandbox, { filename: SRC })

const ReactStub = { createElement: () => null, useState: () => [null, () => {}], useEffect: () => {}, useRef: () => ({ current: null }), useCallback: (f) => f }
const plugin = sandbox.__def.factory((name) => { if (name === 'react') return ReactStub; throw new Error('unexpected require ' + name) })
plugin.apply({ slots: { inject(_n, fn) { fn() }, register() { return () => {} } } })

const A = `# Agent Note: 能力 seam 三权分立

Status: implemented

## Problem

各项能力关注点以不同速率变化，换沙箱实现时工具 Schema 频发破坏性变更。

## Decision

拆成 Service Definition / Provider / Consumer 三者独立演进。

## Alternatives considered

### 始终合并各角色
否决，重新耦合了独立变化的关注点。

## Consequences

包数量增加；换来后端替换零破坏。
`
const B = `# Agent Note: 工具输出规范化

Status: implemented

## Problem

工具直接产出模型可读文本，编程式调用拿不到强类型对象。

## Decision

每个工具声明 Canonical Output，执行期给强类型 DTO。

## Alternatives considered

### 双轨返回值
否决，双重契约增加心智负担。

## Consequences

PTC 模式无需反解析字符串。参见 [能力 seam](../architecture/2026-10-01-a.md)。
`
const C = `# Agent Note: 笔记看板接入 GUI

Status: proposed

## Problem

笔记只能翻目录看。

## Proposal

左侧栏加一个原生面板。

## Alternatives considered

无

## Acceptance criteria

能在面板里切换工作区。

## Risks

只读路由的权限边界。
`
const D = `# Agent Note: 用 iframe 复用原版看板

Status: rejected

## Problem

想直接嵌原版 HTML。

## Proposal

Host 提供 HTML，面板 iframe 引用。

## Alternatives considered

### 内联移植
否决，工作量大。

## Risks

拿不到宿主主题与 locale。
`

const files = [
  { path: 'implemented/architecture/2026-10-01-a.md', raw: A },
  { path: 'implemented/feature/2026-10-15-b.md', raw: B },
  { path: 'proposed/process/2026-11-01-c.md', raw: C },
  { path: 'rejected/bug-fix/2026-11-02-d.md', raw: D },
]

const board = plugin.mountBoard(shadow, {})
const count = board.ingest(files)
console.log('ingest 数量:', count)
console.log('总计数 chip:', byId('chip-total-count').textContent)
console.log('统计条:', byId('beacon-status').textContent)

const probe = (label, id, needle) => {
  const html = byId(id).innerHTML || ''
  console.log(`  ${html.includes(needle) ? 'ok  ' : 'MISS'} ${label} (${id}, ${html.length}B)`)
}
probe('承重墙含被引用笔记', 'pillars-vault', '能力 seam')
probe('分类阵列非空', 'matrix-chambers', '架构')
console.log('  首屏未渲染时间线（懒渲染生效）:', (byId('chrono-track').innerHTML || '').length === 0)

board.switchTab('timeline')
probe('时间线非空', 'chrono-track', '2026')
board.switchTab('alternatives')
probe('避坑智库含否决项', 'pitfalls-grid', 'iframe')
board.switchTab('directory')
probe('决策清单含标题', 'matrix-rows-stream', '能力 seam 三权分立')

console.log('注册的根监听:', listeners.map(([t]) => t))
// 抽屉：模拟点击某行 -> openConsole
const clickHandler = (listeners.find(([t]) => t === 'click') || [])[1]
if (!clickHandler) throw new Error('没有拿到 click 代理')
clickHandler({
  target: { closest: (sel) => (sel === '[data-node-id]' ? { getAttribute: () => 'implemented/architecture/2026-10-01-a.md' } : null) },
})
probe('抽屉-背景', 'dr-body-problem', '换沙箱实现')
probe('抽屉-裁定', 'dr-body-decision', 'Service Definition')
probe('抽屉-备选', 'dr-body-alt', '始终合并各角色')
probe('抽屉-代价', 'dr-body-consequences', '零破坏')
console.log('抽屉标题:', byId('dr-headline').textContent)
console.log('抽屉血缘:', (byId('dr-lineage-stream').innerHTML || '').length, 'B')
board.dispose()
console.log('dispose ok')
