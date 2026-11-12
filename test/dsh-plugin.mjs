/**
 * Entry + hook logic test: loads the merged plugin entry against stubbed host
 * packages, asserts it mounts both halves, then replays session events to check
 * when the end-of-turn reminder fires.
 * Run: node --import ./test/stubs/register.mjs test/dsh-plugin.mjs
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const results = []
const check = (label, cond) => {
  results.push({ label, ok: !!cond })
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`)
}

const mod = await import('../index.js')

/** 最小 ctx：够 applyBoard / applyNotes 挂载用，inject 只放行 available 里的服务。
    inject 回调故意给一个**不同的子 scope**（自己的 on 记账），这样能验证钩子监听
    确实挂在插件 ctx 上——挂到子 scope 就收不到外层冒泡上来的 session/event。 */
function makeCtx(available) {
  const registered = []
  const routes = []
  const handlers = new Map()
  const subHandlers = new Map()
  const base = {
    tools: { register: (def) => registered.push(def) },
    webServer: {
      register: (route) => {
        routes.push(route)
        return () => {}
      },
    },
    get: (name) => (name === 'workspaceRegistry' ? { list: () => [] } : undefined),
    effect: (fn) => {
      const dispose = fn()
      return () => dispose?.()
    },
    logger: { info: () => {}, warn: () => {} },
  }
  const plugins = []
  const ctx = {
    ...base,
    // index.js mounts the bundled skill provider through ctx.plugin; record it so
    // the test can assert the provider config without a real Harness.
    plugin: (child, cfg) => {
      plugins.push({ child, cfg })
      return () => {}
    },
    on: (type, cb) => {
      handlers.set(type, cb)
      return () => {}
    },
  }
  ctx.inject = (deps, callback) => {
    if (!deps.every((dep) => available.includes(dep))) return () => {}
    callback({
      ...base,
      on: (type, cb) => {
        subHandlers.set(type, cb)
        return () => {}
      },
    })
    return () => {}
  }
  return { ctx, registered, routes, handlers, subHandlers, plugins }
}

const { ctx, registered, routes, handlers, subHandlers, plugins } = makeCtx(['webServer', 'tools'])
mod.apply(ctx, {})

check('entry declares no hard inject', mod.inject === undefined)
check('entry exports a Config schema', typeof mod.Config === 'object' && mod.Config !== null)
check('entry mounts both board routes', routes.length === 2)
check('board routes are exact', routes.every((r) => r.kind === 'exact') && routes.map((r) => r.path).join(',').includes('/api/dsh-notes-board/scan'))
check('hook listens on the plugin ctx (not the inject sub-scope)', handlers.size === 2 && subHandlers.size === 0)
check('registers 5 tools', registered.length === 5)
check('tool names are canonical', registered.map((t) => t.name).join(',') === 'note_search,note_read,note_write,note_verify,note_skip')
check('tool has parameters DSL', registered[2].parameters.lifecycle.required === true)
check('tool renders text', typeof registered[0].output.render === 'function')

check('mounts the bundled skill provider', plugins.length === 1 && plugins[0].child?.name === 'dsh-skill-filesystem')
check('skill provider is namespaced away from filesystem', plugins[0]?.cfg?.providerName === 'agent-notes')
check('skill provider points at the vendored skills dir', /vendor\/write-notes-like-deepseek\/skills$/.test(plugins[0]?.cfg?.bundledSkillDir ?? ''))
check('skill provider does not rescan default roots', plugins[0]?.cfg?.includeDefaultRoots === false && plugins[0]?.cfg?.watch === false)
check('vendored skill has a SKILL.md the provider can index', existsSync(join(plugins[0]?.cfg?.bundledSkillDir ?? '', 'write-notes-like-deepseek', 'SKILL.md')))

const injected = []
let followed = 0
// In the host, Agent.id IS the session id; register one agent per session.
const agentFor = (sessionId) => {
  const agent = { id: sessionId, inject: (m) => injected.push(m), followup: () => followed++ }
  handlers.get('agent/created')({ agent })
  return agent
}

const emit = (session, type, data) => {
  if (!agentFor.registered?.has(session)) {
    agentFor.registered = agentFor.registered ?? new Set()
    agentFor.registered.add(session)
    agentFor(session)
  }
  handlers.get('session/event')({ id: session }, { type, data })
}

// A: code change without a note -> reminder
emit('s1', 'turn/start', { turn: 1 })
emit('s1', 'tool/call', { name: 'bash', args: { command: 'git commit -am "feat: x"' } })
emit('s1', 'turn/end', { turn: 1, reason: { kind: 'completed' } })
check('reminds when code changed without a note', injected.length === 1)
check('reminder names both outlets', /note_write/.test(injected[0]?.content[0].text ?? '') && /note_skip/.test(injected[0]?.content[0].text ?? ''))
check('reminder carries turn + touched file', /Turn 1/.test(injected[0]?.content[0].text ?? ''))

// B: same session, note_write discharges
emit('s1', 'turn/start', { turn: 2 })
emit('s1', 'tool/call', { name: 'edit', args: { path: 'src/a.js' } })
emit('s1', 'tool/call', { name: 'note_write', args: { title: 'x' } })
emit('s1', 'turn/end', { turn: 2 })
check('note_write suppresses the reminder', injected.length === 1)

// C: read-only commands never remind
emit('s1', 'turn/start', { turn: 3 })
emit('s1', 'tool/call', { name: 'bash', args: { command: 'ls -la && git status' } })
emit('s1', 'turn/end', { turn: 3 })
check('read-only bash does not remind', injected.length === 1)

// D: note_skip suppresses
emit('s1', 'turn/start', { turn: 4 })
emit('s1', 'tool/call', { name: 'write', args: { path: 'README.md' } })
emit('s1', 'tool/call', { name: 'note_skip', args: { reason: 'typo only' } })
emit('s1', 'turn/end', { turn: 4 })
check('note_skip suppresses the reminder', injected.length === 1)

// E: no work -> no reminder
emit('s2', 'turn/start', { turn: 1 })
emit('s2', 'turn/end', { turn: 1 })
check('idle turn does not remind', injected.length === 1)

// F: sessions are independent
emit('s3', 'turn/start', { turn: 1 })
emit('s3', 'tool/call', { name: 'edit', args: { path: 'src/b.js' } })
emit('s3', 'turn/end', { turn: 1 })
check('second session reminds independently', injected.length === 2)

// G: cap
for (let t = 2; t <= 12; t++) {
  emit('s3', 'turn/start', { turn: t })
  emit('s3', 'tool/call', { name: 'edit', args: { path: 'src/b.js' } })
  emit('s3', 'turn/end', { turn: t })
}
check('stops after maxPerSession', injected.length === 2 + 5)

// H: 半边依赖缺失时，另一半照常挂载
const toolsOnly = makeCtx(['tools'])
mod.apply(toolsOnly.ctx, {})
check('profile without webServer still gets tools', toolsOnly.routes.length === 0 && toolsOnly.registered.length === 5)

const webOnly = makeCtx(['webServer'])
mod.apply(webOnly.ctx, {})
check('profile without tools still gets board routes', webOnly.routes.length === 2 && webOnly.registered.length === 0)

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) process.exitCode = 1
