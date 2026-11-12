/**
 * Agent Note core — the single source of truth behind the plugin's tools, its
 * settlement hook and the bundled skill's verifiers. Pure Node, no dependencies.
 *
 * Structure contract (mirrors vendor/write-notes-like-deepseek scripts):
 *   .agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md
 *   lifecycle ∈ proposed | implemented | rejected (+ archived)
 *   class     ∈ feature | bug-fix | simplification | architecture | process | testing
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
  appendFileSync,
  copyFileSync,
  renameSync,
  rmSync,
} from 'node:fs'
import { createHash } from 'node:crypto'
import { dirname, join, resolve, sep } from 'node:path'
import { execFile } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'

const HERE = dirname(fileURLToPath(import.meta.url))
export const PKG_ROOT = resolve(HERE, '..', '..')

export const ACTIVE_LIFECYCLES = Object.freeze(['proposed', 'implemented', 'rejected'])
export const LIFECYCLES = Object.freeze([...ACTIVE_LIFECYCLES, 'archived'])
export const CLASSES = Object.freeze([
  'feature',
  'bug-fix',
  'simplification',
  'architecture',
  'process',
  'testing',
])
export const SKIP_LOG = '.skips.log'
const FILENAME_RE = /^\d{4}-\d{2}-\d{2}-.+\.md$/
const ROOT_ALLOWLIST = new Set(['AGENTS.md', 'CLAUDE.md'])

const STATUS_RE = {
  proposed: /^Status: proposed$|^状态[:：] ?(?:proposed|已提议)$/,
  implemented: /^Status: implemented$|^状态[:：] ?(?:implemented|已实现)$/,
  rejected: /^Status: rejected — .+$|^状态[:：] ?(?:rejected|已否决) — .+$/,
}
const PROBLEM_FIRST = ['## Problem', '## 问题']
const REQUIRED = {
  proposed: [
    ['## Proposal', '## 提议', '## 方案', '## 提案'],
    ['## Acceptance criteria', '## 验收标准', '## 验收条件', '## 接受标准'],
    ['## Risks', '## 风险'],
  ],
  implemented: [
    ['## Decision', '## 决定', '## 决策'],
    ['## Consequences', '## 后果', '## 影响', '## 结果', '## 结果与代价', '## 影响与验证', '## 后果与边界'],
  ],
  rejected: [['## Proposal', '## 提议', '## 方案', '## 提案']],
}
const BANNED_IMPLEMENTED = new Set([
  '## proposal', '## plan', '## migration plan', '## acceptance criteria',
  '## 提议', '## 方案', '## 提案', '## 计划', '## 规划', '## 迁移计划',
  '## 验收标准', '## 验收条件', '## 接受标准',
])
const ALTERNATIVES_RE = /^## (?:Alternatives considered|.{0,8}?(?:替代方案|备选(?:方案)?|其他做法))$/

// ---------------------------------------------------------------- root / paths

/** Resolve the workspace root whose `.agents/notes` we operate on. */
export function resolveRoot(root) {
  const r = root ?? process.env.AGENT_NOTES_ROOT ?? process.env.AGENT_NOTE_ROOT ?? process.cwd()
  return resolve(r)
}

export function notesDir(root) {
  return join(resolveRoot(root), '.agents', 'notes')
}

/** Locate the upstream skill `scripts/` directory (vendored copy first). */
export function skillScriptsDir() {
  const candidates = [
    process.env.AGENT_NOTES_SKILL_DIR,
    join(PKG_ROOT, 'vendor', 'write-notes-like-deepseek', 'skills', 'write-notes-like-deepseek'),
    join(process.env.DSH_HOME ?? join(homedir(), '.dsh'), 'skills', 'write-notes-like-deepseek'),
  ].filter(Boolean)
  for (const dir of candidates) {
    if (existsSync(join(dir, 'scripts', 'verify-agent-note-format.ts'))) return join(dir, 'scripts')
  }
  return null
}

// ------------------------------------------------------------------- utilities

export function today() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function slugify(title) {
  const s = String(title ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\\/:*?"<>|`]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '')
  return s.slice(0, 60).replace(/[-.]+$/, '')
}

/** Latin-only slug used for filenames; empty when the title has no ASCII letters. */
export function fileSlug(title) {
  return slugify(title).replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^[-.]+|[-.]+$/g, '')
}

function listMd(dir, prefix) {
  if (!existsSync(dir)) return []
  const out = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) out.push(...listMd(resolve(dir, entry.name), rel))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(rel)
  }
  return out
}

function normalize(raw) {
  return String(raw ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
}

// -------------------------------------------------------------- tree traversal

/**
 * Walk the note tree. Returns notes that satisfy the structural contract;
 * structurally invalid files are reported in `errors` instead of silently
 * disappearing.
 */
export function walkNotes(root, { includeArchived = false } = {}) {
  const base = notesDir(root)
  const notes = []
  const errors = []
  if (!existsSync(base)) return { notes, errors, root: base }

  for (const lifecycle of ACTIVE_LIFECYCLES) {
    for (const rel of listMd(resolve(base, lifecycle), lifecycle).sort()) {
      const segs = rel.split('/')
      if (segs.length === 2 && ROOT_ALLOWLIST.has(segs[1] ?? '')) continue
      if (rel.endsWith('.zh.md')) continue
      const cls = segs[1]
      const file = segs[2]
      if (segs.length !== 3 || cls === undefined || file === undefined) {
        errors.push(`structure: ${rel} — expected {lifecycle}/{class}/file.md (got depth ${segs.length})`)
        continue
      }
      if (!CLASSES.includes(cls)) {
        errors.push(`structure: ${rel} — unknown class folder "${cls}" (allowed: ${CLASSES.join(', ')})`)
        continue
      }
      if (!FILENAME_RE.test(file)) {
        errors.push(`structure: ${rel} — filename must be yyyy-mm-dd-topic.md`)
        continue
      }
      notes.push({ rel, lifecycle, cls, date: file.slice(0, 10), abs: resolve(base, rel) })
    }
  }

  if (includeArchived) {
    for (const rel of listMd(resolve(base, 'archived'), 'archived').sort()) {
      if (rel.endsWith('.zh.md')) continue
      const file = rel.split('/').pop() ?? rel
      const date = FILENAME_RE.test(file) ? file.slice(0, 10) : ''
      notes.push({ rel, lifecycle: 'archived', cls: rel.split('/')[1] ?? '', date, abs: resolve(base, rel) })
    }
  }
  return { notes, errors, root: base }
}

/** Parse header + section headings from note text. */
export function parseNote(text) {
  const lines = normalize(text).split('\n')
  const title = (lines[0] ?? '').replace(/^# Agent Note[:：]\s*/, '').trim()
  const statusLine = (lines[2] ?? '').trim()
  const status = statusLine.replace(/^Status:\s*/, '').replace(/^状态[:：]\s*/, '')
  const sections = lines
    .filter((l) => l.startsWith('## '))
    .map((l) => l.replace(/[（(].*$/, '').trimEnd())
  return { title, status, statusLine, sections, lineCount: lines.length }
}

// ---------------------------------------------------------------- validation

/** Strip fenced code so headings inside samples are not counted. */
function proseLines(text) {
  const lines = normalize(text).split('\n')
  const out = []
  let fenced = false
  for (const line of lines) {
    if (/^\s{0,3}```/.test(line)) {
      fenced = !fenced
      continue
    }
    if (fenced) continue
    out.push(line)
  }
  return out
}

/**
 * Pre-write check: the same gates the upstream verifiers enforce, so a bad
 * note never reaches disk. Returns an array of human-readable errors.
 */
export function validateNoteText(lifecycle, text) {
  const errors = []
  const lines = normalize(text).split('\n')
  if (!ACTIVE_LIFECYCLES.includes(lifecycle)) {
    errors.push(`lifecycle must be one of ${ACTIVE_LIFECYCLES.join(', ')}`)
    return errors
  }
  if (!/^# Agent Note[:：] ?\S/.test(lines[0] ?? '')) errors.push('line 1 must be `# Agent Note: <title>`')
  if (lines[1] !== '') errors.push('line 2 must be blank')
  const re = STATUS_RE[lifecycle]
  if (re && !re.test(lines[2] ?? '')) errors.push(`line 3 must match ${lifecycle} status grammar`)
  if (lines[3] !== '') errors.push('line 4 must be blank')

  const prose = proseLines(text)
  const statusCount = prose.filter((l) => Object.values(STATUS_RE).some((r) => r.test(l.trim()))).length
  if (statusCount !== 1) errors.push('Status: line must appear exactly once')

  const headings = prose.filter((l) => l.startsWith('## ')).map((l) => l.replace(/[（(].*$/, '').trimEnd())
  if (!PROBLEM_FIRST.includes(headings[0] ?? '')) {
    errors.push(`first section must be ## Problem or ## 问题 (got ${JSON.stringify(headings[0] ?? '<none>')})`)
  }
  for (const group of REQUIRED[lifecycle] ?? []) {
    if (!group.some((h) => headings.includes(h))) errors.push(`missing one of ${JSON.stringify(group)}`)
  }
  if (lifecycle === 'implemented') {
    for (const h of headings.filter((x) => BANNED_IMPLEMENTED.has(x.toLowerCase()))) {
      errors.push(`banned in implemented: ${h}`)
    }
  }
  if (!headings.some((h) => ALTERNATIVES_RE.test(h))) {
    errors.push('missing ## Alternatives considered / ## 备选方案')
  }
  return errors
}

// --------------------------------------------------------------------- writes

function composeNote({ lifecycle, title, body, rejectionReason }) {
  const statusLine =
    lifecycle === 'rejected' ? `Status: rejected — ${rejectionReason}` : `Status: ${lifecycle}`
  let clean = normalize(body).trim()
  clean = clean.replace(/^# Agent Note[:：][^\n]*\n+/, '')
  clean = clean.replace(/^Status:[^\n]*\n+/, '')
  return `# Agent Note: ${title}\n\n${statusLine}\n\n${clean}\n`
}

/**
 * Create a note. Refuses to overwrite, validates before writing, and then
 * runs the upstream verifiers over the whole tree.
 */
export async function writeNote(root, opts = {}) {
  const {
    lifecycle,
    cls,
    title,
    slug,
    body = '',
    date = today(),
    rejectionReason,
    runVerify: doVerify = true,
  } = opts

  const fail = (code, message, extra = {}) => ({ ok: false, code, message, ...extra })

  if (!ACTIVE_LIFECYCLES.includes(lifecycle)) {
    return fail('BAD_LIFECYCLE', `lifecycle must be one of ${ACTIVE_LIFECYCLES.join(', ')}; use the archive script to retire a note`)
  }
  if (!CLASSES.includes(cls)) return fail('BAD_CLASS', `class must be one of ${CLASSES.join(', ')}`)
  const cleanTitle = String(title ?? '').replace(/[\r\n]+/g, ' ').trim()
  if (!cleanTitle) return fail('BAD_TITLE', 'title is required')
  // Filenames are ASCII: a Chinese-only title needs an explicit slug.
  const filenameSlug = fileSlug(slug || '') || fileSlug(cleanTitle)
  if (!filenameSlug) {
    return fail('NEEDS_SLUG', 'title has no Latin characters to build a filename from; pass slug with 2-5 ASCII words', { title: cleanTitle })
  }
  if (lifecycle === 'rejected' && !String(rejectionReason ?? '').trim()) {
    return fail('BAD_REASON', 'rejected notes require rejectionReason (one-line why)')
  }
  if (!FILENAME_RE.test(`${date}-x.md`)) return fail('BAD_DATE', 'date must be yyyy-mm-dd')

  const text = composeNote({ lifecycle, title: cleanTitle, body, rejectionReason: String(rejectionReason ?? '').trim() })
  const errors = validateNoteText(lifecycle, text)
  if (errors.length) return fail('INVALID_NOTE', 'note failed format validation; nothing was written', { errors })

  const rel = `${lifecycle}/${cls}/${date}-${filenameSlug}.md`
  const abs = resolve(notesDir(root), rel)
  if (existsSync(abs)) {
    return fail('EXISTS', `note already exists: ${rel}`, { path: rel })
  }
  mkdirSync(dirname(abs), { recursive: true })
  writeFileSync(abs, text, 'utf8')

  const result = { ok: true, path: rel, absPath: abs, bytes: Buffer.byteLength(text), lifecycle, class: cls, date }
  if (doVerify) result.verify = await runVerify(root)
  return result
}

// -------------------------------------------------------------------- reading

export function readNote(root, rel, { maxLines = 400 } = {}) {
  const base = notesDir(root)
  const abs = resolve(base, String(rel ?? ''))
  if (!abs.startsWith(base + sep)) {
    return { ok: false, code: 'OUTSIDE_ROOT', message: `path must stay inside ${base}` }
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { ok: false, code: 'NOT_FOUND', message: `no note at ${rel}`, path: rel }
  }
  const text = normalize(readFileSync(abs, 'utf8'))
  const lines = text.split('\n')
  const parsed = parseNote(text)
  const truncated = lines.length > maxLines
  const segs = String(rel).split('/')
  return {
    ok: true,
    path: rel,
    lifecycle: segs[0],
    class: segs[1],
    ...parsed,
    content: truncated ? lines.slice(0, maxLines).join('\n') : text,
    contentLines: lines.length,
    truncated,
    hint: truncated ? `showing first ${maxLines} of ${lines.length} lines` : undefined,
  }
}

// ------------------------------------------------------------------- searching

const MAX_SNIPPET = 160

export function searchNotes(root, opts = {}) {
  const { query, lifecycle, cls, includeArchived = false, limit = 20 } = opts
  const q = String(query ?? '').trim()
  if (!q) return { ok: false, code: 'EMPTY_QUERY', message: 'query is required' }
  const needle = q.toLowerCase()
  const cap = Math.min(Math.max(Number(limit) || 20, 1), 50)

  const { notes, errors } = walkNotes(root, { includeArchived })
  const hits = []
  for (const note of notes) {
    if (lifecycle && note.lifecycle !== lifecycle) continue
    if (cls && note.cls !== cls) continue
    const text = normalize(readFileSync(note.abs, 'utf8'))
    const parsed = parseNote(text)
    const lines = text.split('\n')
    const matches = []
    let score = 0
    if (parsed.title.toLowerCase().includes(needle)) score += 100
    lines.forEach((line, i) => {
      const low = line.toLowerCase()
      if (!low.includes(needle)) return
      if (line.startsWith('## ')) score += 10
      else score += 1
      if (matches.length < 3) {
        const snippet = line.trim()
        matches.push({
          line: i + 1,
          text: snippet.length > MAX_SNIPPET ? `${snippet.slice(0, MAX_SNIPPET)}…` : snippet,
        })
      }
    })
    if (score > 0) {
      hits.push({
        path: note.rel,
        lifecycle: note.lifecycle,
        class: note.cls,
        date: note.date,
        title: parsed.title,
        status: parsed.status,
        score,
        matches,
      })
    }
  }
  hits.sort((a, b) => b.score - a.score || String(b.date).localeCompare(String(a.date)))
  const returned = hits.slice(0, cap)
  return {
    ok: true,
    query: q,
    totalMatched: hits.length,
    returned: returned.length,
    truncated: hits.length > returned.length,
    structureErrors: errors.length,
    notes: returned,
    ...(returned.length === 0
      ? {
          hint:
            'NO_MATCHING_NOTE — no Agent Note matches this query. Do not infer that no decision exists; ' +
            'try different wording (Chinese/English, symbol name, file path), or search the repository directly.',
        }
      : {}),
  }
}

// ----------------------------------------------------------------- skip ledger

/**
 * Record "this turn needs no note" so the hook stops nagging. The file is
 * dot-prefixed, so the upstream tree walker ignores it.
 */
export function appendSkip(root, entry = {}) {
  const dir = notesDir(root)
  mkdirSync(dir, { recursive: true })
  const line = JSON.stringify({ at: new Date().toISOString(), ...entry })
  appendFileSync(join(dir, SKIP_LOG), `${line}\n`, 'utf8')
  return { ok: true, recorded: JSON.parse(line), log: join('.agents', 'notes', SKIP_LOG) }
}

export function readSkips(root, { limit = 10 } = {}) {
  const file = join(notesDir(root), SKIP_LOG)
  if (!existsSync(file)) return { ok: true, total: 0, entries: [] }
  const lines = normalize(readFileSync(file, 'utf8')).split('\n').filter(Boolean)
  const entries = []
  for (const line of lines.slice(-limit)) {
    try {
      entries.push(JSON.parse(line))
    } catch {
      entries.push({ unparsable: line })
    }
  }
  return { ok: true, total: lines.length, entries }
}

// -------------------------------------------------------------------- verifying

const VERIFY_SCRIPTS = [
  'verify-agent-note-tree.ts',
  'verify-agent-note-format.ts',
  'verify-archived-agent-notes.ts',
]

/**
 * Node refuses to strip TypeScript types for files under `node_modules`
 * (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), and an installed plugin's
 * vendored scripts always live there. Copy them to a content-addressed cache
 * directory outside `node_modules` and run that copy instead. A repo checkout
 * (or `AGENT_NOTES_SKILL_DIR`) keeps running in place, so edits take effect
 * immediately. The copy is keyed by content, so an upgrade lands in a new
 * directory instead of reusing stale sources.
 */
export function stageScripts(dir) {
  if (!dir.split(sep).includes('node_modules')) return dir
  const files = readdirSync(dir)
    .filter((name) => name.endsWith('.ts'))
    .sort()
  if (files.length === 0) return dir
  const hash = createHash('sha256')
  for (const name of files) hash.update(name).update(readFileSync(join(dir, name)))
  const target = join(tmpdir(), `dsh-notes-board-verify-${hash.digest('hex').slice(0, 16)}`)
  if (existsSync(target)) return target
  const staging = `${target}.tmp-${process.pid}`
  rmSync(staging, { recursive: true, force: true })
  mkdirSync(staging, { recursive: true })
  for (const name of files) copyFileSync(join(dir, name), join(staging, name))
  try {
    renameSync(staging, target)
  } catch {
    // Another process won the race; its copy is identical (same content hash).
    rmSync(staging, { recursive: true, force: true })
  }
  return target
}

function runScript(scriptPath, base) {
  return new Promise((done) => {
    execFile(
      process.execPath,
      [scriptPath],
      { cwd: base, env: { ...process.env, AGENT_NOTE_ROOT: base }, timeout: 30_000 },
      (err, stdout, stderr) => {
        done({
          script: scriptPath.split(sep).pop(),
          code: err ? (typeof err.code === 'number' ? err.code : 1) : 0,
          ok: !err,
          stdout: String(stdout ?? '').trim(),
          stderr: String(stderr ?? '').trim(),
        })
      },
    )
  })
}

/** Run the upstream verifiers. This is authoritative — do not re-implement. */
export async function runVerify(root) {
  const base = notesDir(root)
  const scripts = skillScriptsDir()
  if (!scripts) {
    return {
      ok: false,
      code: 'VERIFIER_MISSING',
      message:
        'upstream verify scripts not found. Set AGENT_NOTES_SKILL_DIR to the write-notes-like-deepseek skill directory.',
      results: [],
    }
  }
  if (!existsSync(base)) {
    return { ok: true, note: 'no .agents/notes yet — nothing to verify', results: [] }
  }
  const results = []
  const staged = stageScripts(scripts)
  for (const name of VERIFY_SCRIPTS) {
    const scriptPath = join(staged, name)
    if (!existsSync(scriptPath)) {
      results.push({ script: name, ok: false, code: 'MISSING_SCRIPT' })
      continue
    }
    results.push(await runScript(scriptPath, base))
  }
  const failed = results.filter((r) => !r.ok)
  return {
    ok: failed.length === 0,
    checkedRoot: base,
    results,
    errors: failed.flatMap((r) => (r.stderr ? r.stderr.split('\n') : [])).filter(Boolean),
  }
}
