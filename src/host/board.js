/**
 * dsh-notes-board · 看板半边的 Host 代码
 *
 * 由根 index.js 在 webServer 服务就绪后调用（applyBoard），不单独作为插件入口。
 * 只做两件事，都是只读：
 *   1. 把 workspace registry 里登记的工作区列成 JSON（面板顶部的下拉框用它）；
 *   2. 读某个工作区 <dir>/.agents/notes 下的 Markdown 原文，按相对路径回给客户端。
 *
 * 解析、分类、引用入度、四个视图，全部交给原版看板的前端逻辑
 * （vendor/board.html 里的 parseNote / ingestDataset），Host 不重复实现一遍。
 */

import { existsSync } from 'node:fs'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, join, sep } from 'node:path'
import { gzipSync } from 'node:zlib'

const BASE = '/api/dsh-notes-board'
/* 安全阀，不是业务上限：只防挂错目录（比如挂到家目录）时把进程拖死。
   真触发时响应里带 truncated:true，面板会明确提示，绝不静默截断。 */
const SAFETY_MAX_FILES = 50000
const MAX_BODY = 400 * 1024

function sendJson(req, res, code, payload) {
  const raw = Buffer.from(JSON.stringify(payload), 'utf8')
  const accepts = String((req && req.headers && req.headers['accept-encoding']) || '')
  if (raw.length > 64 * 1024 && /\bgzip\b/.test(accepts)) {
    const body = gzipSync(raw)
    res.writeHead(code, {
      'content-type': 'application/json; charset=utf-8',
      'content-encoding': 'gzip',
      'content-length': body.length,
      'cache-control': 'no-store',
    })
    res.end(body)
    return
  }
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': raw.length,
    'cache-control': 'no-store',
  })
  res.end(raw)
}

function fail(req, res, code, message) {
  sendJson(req, res, code, { ok: false, message })
}

function listWorkspaces(ctx) {
  const registry = ctx.get('workspaceRegistry')
  if (!registry || typeof registry.list !== 'function') return []
  const seen = new Set()
  const out = []
  for (const workspace of registry.list()) {
    const path = typeof workspace?.path === 'string' ? workspace.path : ''
    if (!path || seen.has(path)) continue
    seen.add(path)
    out.push({
      id: String(workspace.id ?? path),
      title: String(workspace.title || basename(path) || path),
      path,
      hasNotes: existsSync(join(path, '.agents', 'notes')),
    })
  }
  return out
}

function resolveWorkspace(ctx, idOrPath) {
  const wanted = String(idOrPath || '')
  if (!wanted) return undefined
  const all = listWorkspaces(ctx)
  return (
    all.find((w) => w.id === wanted) ||
    all.find((w) => w.path === wanted) ||
    all.find((w) => w.title === wanted)
  )
}

/** 广度优先收集 .agents/notes 下的 Markdown，跳过点开头目录 */
async function walkNotes(root) {
  const found = []
  const queue = [{ dir: root, depth: 0 }]
  let truncated = false
  while (queue.length) {
    const current = queue.shift()
    let entries
    try {
      entries = await readdir(current.dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const abs = join(current.dir, entry.name)
      if (entry.isDirectory()) {
        if (current.depth < 5) queue.push({ dir: abs, depth: current.depth + 1 })
        continue
      }
      if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
      if (found.length >= SAFETY_MAX_FILES) {
        truncated = true
        break
      }
      found.push(abs)
    }
    if (truncated) break
  }
  return { paths: found, truncated }
}

async function readNotes(workspace) {
  const root = join(workspace.path, '.agents', 'notes')
  if (!existsSync(root)) return { root, exists: false, files: [], truncated: false }
  const { paths: absPaths, truncated } = await walkNotes(root)
  // 中英对照的 x.md / x.zh.md 只回一份，按原版看板的规则「zh 优先」
  const byCleanPath = new Map()
  for (const abs of absPaths) {
    const rel = abs.slice(root.length + 1).split(sep).join('/')
    const isZh = /\.zh\.md$/i.test(rel)
    const clean = isZh ? rel.replace(/\.zh\.md$/i, '.md') : rel
    const current = byCleanPath.get(clean)
    if (!current || isZh) byCleanPath.set(clean, { abs, rel, isZh })
  }
  const files = []
  for (const [cleanRel, entry] of byCleanPath) {
    try {
      const info = await stat(entry.abs)
      const text = await readFile(entry.abs, 'utf8')
      files.push({
        path: cleanRel,
        raw: text.length > MAX_BODY ? text.slice(0, MAX_BODY) : text,
        mtime: Math.round(info.mtimeMs / 1000),
      })
    } catch {
      /* 单个文件读失败不影响整体 */
    }
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return { root, exists: true, files, truncated }
}

export function applyBoard(ctx) {
  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: `${BASE}/workspaces`,
      handler(req, res) {
        try {
          sendJson(req, res, 200, { ok: true, workspaces: listWorkspaces(ctx) })
        } catch (error) {
          fail(req, res, 500, error instanceof Error ? error.message : String(error))
        }
      },
    }),
  )

  ctx.effect(() =>
    ctx.webServer.register({
      kind: 'exact',
      path: `${BASE}/scan`,
      async handler(req, res) {
        const url = new URL(req.url || '/', 'http://localhost')
        const workspace = resolveWorkspace(ctx, url.searchParams.get('workspace') || '')
        if (!workspace) return fail(req, res, 404, '未登记的工作区')
        try {
          const { root, exists, files, truncated } = await readNotes(workspace)
          sendJson(req, res, 200, {
            ok: true,
            workspace,
            root,
            exists,
            files,
            truncated: !!truncated,
            safetyLimit: SAFETY_MAX_FILES,
            scannedAt: Date.now(),
          })
        } catch (error) {
          fail(req, res, 500, error instanceof Error ? error.message : String(error))
        }
      },
    }),
  )
}
