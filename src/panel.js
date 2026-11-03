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
    const BOARD_CSS = /*__BOARD_CSS__*/ ''
    const BOARD_HTML = /*__BOARD_HTML__*/ ''
    const BOARD_FONT = /*__BOARD_FONT__*/ ''

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
      /*__BOARD_SCRIPT__*/
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
