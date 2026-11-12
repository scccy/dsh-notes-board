/**
 * dsh-notes-board · 笔记半边的 Host 代码
 *
 * 由根 index.js 调用（applyNotes），不单独作为插件入口。
 * 提供与 MCP 面同一套 5 个原生工具，外加 turn/end 钩子，把"决定必须落库"变成
 * 确定性约束。
 *
 * Why the hook exists: a skill and an MCP tool are both "the model may choose
 * to use this". A hook runs whether or not the model feels like it, so the rule
 * "a non-mechanical change must end with note_write or note_skip" is enforced at
 * the point the turn closes, not hoped for at the point it starts.
 *
 * Imports host-provided packages (@deepseek-ai/dsh-tools, /dsh-llm, /schemastery)
 * that exist inside the running Harness, not in this package's node_modules.
 */
import z from '@deepseek-ai/schemastery'
import { defineTool } from '@deepseek-ai/dsh-tools'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { TOOLS } from '../core/tools.js'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE_KIND = 'agent-notes'
const DISCHARGE_TOOLS = new Set(['note_write', 'note_skip'])
const NOTE_ROOT_MARKER = '.agents/notes'

const DEFAULT_CODE_TOOLS = ['bash', 'write', 'edit', 'apply_patch', 'multiedit', 'str_replace_editor', 'notebook_edit']
/** A bash call matching only these is a read, not a change. */
const DEFAULT_READONLY_CMD = String.raw`^\s*(ls|cat|head|tail|wc|grep|rg|fd|find|jq|pwd|which|type|stat|file|tree|echo|printf|env|git\s+(status|diff|log|show|branch|remote|rev-parse|ls-files)|node\s+(--version|-v))\b`

export const NotesConfig = z.object({
  root: z.string().description('Workspace root holding .agents/notes. Defaults to the agent working directory, then process.cwd().'),
  reminder: z
    .object({
      enabled: z.boolean().default(true).description('Fire the end-of-turn reminder at all.'),
      wake: z.boolean().default(false).description('Also call agent.followup() so the agent acts immediately instead of waiting for the next user message.'),
      maxPerSession: z.number().default(6).description('Stop reminding after this many reminders in one session; the reminder is a nudge, not a loop.'),
    })
    .description('End-of-turn reminder behavior.'),
  codeTools: z.array(z.string()).default(DEFAULT_CODE_TOOLS).description('Tool names whose use counts as changing the workspace.'),
  readonlyCommandPattern: z.string().default(DEFAULT_READONLY_CMD).description('A bash command matching this is treated as read-only and does not trigger a reminder.'),
})

function toDshParameters(params = {}) {
  const out = {}
  for (const [key, spec] of Object.entries(params)) {
    const p = { type: spec.type === 'integer' ? 'integer' : spec.type, description: spec.description }
    if (spec.required) p.required = true
    if (spec.enum) p.enum = spec.enum
    if (spec.default !== undefined) p.default = spec.default
    out[key] = p
  }
  return out
}

const OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: true,
    properties: { text: { type: 'string', required: true } },
  },
  render: (_args, value) => [{ type: 'text', text: value.text }],
}

/** Best-effort "which tool is this event about", tolerant of envelope changes. */
function pickToolName(data) {
  if (!data || typeof data !== 'object') return undefined
  for (const key of ['name', 'toolName', 'tool', 'tool_name']) {
    const v = data[key]
    if (typeof v === 'string') return v
    if (v && typeof v === 'object' && typeof v.name === 'string') return v.name
  }
  return undefined
}

function toolArgs(data) {
  if (!data || typeof data !== 'object') return undefined
  for (const key of ['args', 'arguments', 'input', 'parameters']) {
    const v = data[key]
    if (v && typeof v === 'object') return v
  }
  return undefined
}

/** Bounded scan for the notes marker anywhere in the event payload. */
function mentionsNotes(data) {
  try {
    const text = JSON.stringify(data ?? '')
    return text.includes(NOTE_ROOT_MARKER)
  } catch {
    return false
  }
}

function describeTouched(args) {
  if (!args || typeof args !== 'object') return undefined
  for (const key of ['path', 'file_path', 'filePath', 'file', 'command']) {
    const v = args[key]
    if (typeof v === 'string' && v) return v.length > 120 ? `${v.slice(0, 120)}…` : v
  }
  return undefined
}

export function applyNotes(ctx, config = {}) {
  const cfg = {
    root: config.root || undefined,
    reminder: { enabled: true, wake: false, maxPerSession: 6, ...(config.reminder ?? {}) },
    codeTools: new Set(config.codeTools?.length ? config.codeTools : DEFAULT_CODE_TOOLS),
    readonlyCommandPattern: config.readonlyCommandPattern ?? DEFAULT_READONLY_CMD,
  }
  let readonlyRe
  try {
    readonlyRe = new RegExp(cfg.readonlyCommandPattern)
  } catch {
    readonlyRe = null
  }

  const rootOf = (agent) =>
    cfg.root ??
    agent?.workingDirectory?.path ??
    agent?.workingDirectory ??
    process.env.AGENT_NOTES_ROOT ??
    process.cwd()

  const isCodeChange = (toolName, args) => {
    if (!cfg.codeTools.has(toolName)) return false
    const cmd = typeof args?.command === 'string' ? args.command : undefined
    if (cmd && readonlyRe && readonlyRe.test(cmd)) return false
    return true
  }

  /* 两件事都只在 tools 服务就绪后挂载。但 session/event 的监听刻意挂在**插件自己的
     ctx** 上，不用 ctx.inject 给的那个 scope：cordis 事件沿 scope 往上冒泡，监听器
     挂在子 scope 上收不到外层发出的 session/event（已装插件里 billion-context 也是
     用外层 ctx.on 听 session/event）。 */
  const mount = (toolsCtx) => {
    // ---- tools -----------------------------------------------------------
    for (const tool of TOOLS) {
      toolsCtx.tools.register(
        defineTool({
          name: tool.name,
          description: tool.description,
          parameters: toDshParameters(tool.parameters),
          output: OUTPUT,
          async execute(args) {
            const out = await tool.run(args ?? {}, { root: cfg.root })
            return { text: out.text, ok: out.ok !== false, ...(out.path ? { path: out.path } : {}) }
          },
        }),
      )
    }

    // ---- turn/end hook ---------------------------------------------------
    const sessions = new Map()

    const stateFor = (session) => {
      const id = session?.id ?? 'unknown'
      let st = sessions.get(id)
      if (!st) {
        st = { turn: 0, touched: [], discharged: false, remCount: 0, lastTurn: 0 }
        sessions.set(id, st)
      }
      return st
    }

    const agents = new Map()
    ctx.on('agent/created', ({ agent }) => {
      if (agent?.id === undefined) return
      agents.set(agent.id, agent)
    })

    ctx.on('session/event', (session, event) => {
      if (!event || typeof event.type !== 'string') return
      const st = stateFor(session)
      const data = event.data

      if (event.type === 'turn/start') {
        st.turn = Number(data?.turn ?? st.turn + 1)
        st.touched = []
        st.discharged = false
        return
      }

      if (event.type === 'tool/call') {
        const toolName = pickToolName(data) ?? ''
        if (DISCHARGE_TOOLS.has(toolName)) st.discharged = true
        if (toolName === 'note_search' || toolName === 'note_read') return
        if (mentionsNotes(data)) st.discharged = true
        const args = toolArgs(data)
        if (isCodeChange(toolName, args)) {
          const what = describeTouched(args)
          if (what && st.touched.length < 5 && !st.touched.includes(what)) st.touched.push(what)
          else if (!what && st.touched.length === 0) st.touched.push(`${toolName}()`)
        }
        return
      }

      if (event.type === 'tool/result') {
        // A skip or write that only shows up in the result still discharges.
        if (mentionsNotes(data)) st.discharged = true
        return
      }

      if (event.type === 'turn/end') {
        if (!cfg.reminder.enabled) return
        if (st.discharged) return
        if (st.touched.length === 0) return
        if (st.remCount >= cfg.reminder.maxPerSession) return
        if (st.lastTurn === st.turn) return
        st.lastTurn = st.turn
        st.remCount += 1

        const root = rootOf(sessions.has(session?.id) ? agents.get(session?.id) : undefined)
        const text = buildReminder({ touched: st.touched, turn: st.turn, root })
        const agent = session?.id !== undefined ? agents.get(session.id) : undefined
        try {
          if (typeof agent?.inject === 'function') {
            agent.inject(createUserMessage({ content: [{ type: 'text', text }], source: { kind: SOURCE_KIND } }))
          } else {
            ctx.logger?.info?.(`agent-notes: reminder not delivered (no agent handle): ${st.touched.join(', ')}`)
          }
          if (cfg.reminder.wake && typeof agent?.followup === 'function') agent.followup()
        } catch (error) {
          ctx.logger?.warn?.(`agent-notes: reminder inject failed: ${String(error)}`)
        }
      }
    })
  }

  if (typeof ctx.inject === 'function') ctx.inject(['tools'], mount)
  else if (ctx.tools) mount(ctx)
}

function buildReminder({ touched, turn, root }) {
  const sample = touched.slice(0, 3).join(', ')
  return [
    'Agent Notes · 本轮改了代码，但没有记录决定。',
    `Turn ${turn} 动了：${sample}${touched.length > 3 ? ` 等 ${touched.length} 处` : ''}`,
    '',
    '现在二选一（这是 end-of-turn 检查，不是建议）：',
    '- note_write(lifecycle="implemented"|"proposed", class="feature|bug-fix|simplification|architecture|process|testing",',
    '             title="<具体标题>", body="## Problem ... ## Decision ... ## Alternatives considered ...")',
    '  → 行为/架构/跨文件契约/流程/测试策略发生了非机械变化，或需要推翻旧决定（新开一篇并互链）。',
    '- note_skip(reason="<一句话理由>")',
    '  → 纯机械改动（错别字/改名/格式化/依赖升级）。',
    '',
    `笔记根目录：${join(root ?? process.cwd(), '.agents/notes')}`,
    '本轮已经 note_write 或 note_skip 过的话，忽略这条。',
  ].join('\n')
}
