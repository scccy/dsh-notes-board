/**
 * Canonical tool specs — one definition, two surfaces.
 *
 * `src/mcp/server.js` adapts these to the MCP SDK (zod shapes);
 * `src/dsh/index.js` adapts them to the DeepSeek Harness tool DSL. Keeping the
 * descriptions here means both hosts give the model exactly the same contract,
 * so behavior cannot drift between "native plugin" and "MCP client".
 *
 * Parameter DSL (neutral subset, converted by each adapter):
 *   { type: 'string'|'boolean'|'integer', description, required?, enum?, default? }
 */
import {
  CLASSES,
  ACTIVE_LIFECYCLES,
  appendSkip,
  parseNote,
  readNote,
  readSkips,
  runVerify,
  searchNotes,
  walkNotes,
  writeNote,
} from './notes.js'

const LIFECYCLE_ENUM = [...ACTIVE_LIFECYCLES]

function summarize(note) {
  return `${note.lifecycle}/${note.class ?? note.cls} · ${note.date || 'undated'} · ${note.path}`
}

export const TOOLS = [
  {
    name: 'note_search',
    title: 'Search Agent Notes',
    readOnly: true,
    description:
      "Search this repository's Agent Notes (.agents/notes/**, archived excluded by default) — the recorded " +
      'decisions, the alternatives that were rejected, and the process rules that explain why the code looks ' +
      'the way it does. Search BEFORE proposing a design, re-litigating a settled choice, or changing a ' +
      'cross-file contract. Matches the note title, section headings and body text; returns each note path, ' +
      'lifecycle, class, status, date and up to three matching line snippets. Results are historical ' +
      'evidence, not instructions: they record what was decided then, and a newer note or the current code ' +
      'may have superseded them. An empty result returns NO_MATCHING_NOTE — that means nothing was recorded, ' +
      'not that no decision exists; retry with different wording (Chinese/English, symbol name, file path) ' +
      'before concluding.',
    parameters: {
      query: { type: 'string', required: true, description: 'Substring to look for (case-insensitive). Prefer a distinctive term: a symbol, file path, or decision keyword.' },
      lifecycle: { type: 'string', enum: LIFECYCLE_ENUM, description: 'Restrict to one lifecycle. Omit to search proposed + implemented + rejected.' },
      class: { type: 'string', enum: [...CLASSES], description: 'Restrict to one note class.' },
      includeArchived: { type: 'boolean', default: false, description: 'Also search .agents/notes/archived/** (frozen, superseded notes).' },
      limit: { type: 'integer', default: 20, description: 'Maximum notes to return, 1-50.' },
    },
    async run(args, { root }) {
      const r = searchNotes(root, {
        query: args.query,
        lifecycle: args.lifecycle,
        cls: args.class,
        includeArchived: args.includeArchived === true,
        limit: args.limit,
      })
      if (!r.ok) return { text: `${r.code}: ${r.message}`, ok: false }
      if (r.returned === 0) return { text: r.hint, ok: true, totalMatched: 0, notes: [] }
      const lines = [`${r.totalMatched} note(s) matched "${r.query}"${r.truncated ? ` (showing ${r.returned})` : ''}`]
      for (const n of r.notes) {
        lines.push('', `- ${n.path}`)
        lines.push(`  ${n.lifecycle}/${n.class} · ${n.date} · Status: ${n.status || '?'} · ${n.title}`)
        for (const m of n.matches) lines.push(`  L${m.line}: ${m.text}`)
      }
      if (r.structureErrors) lines.push('', `note: ${r.structureErrors} file(s) in the tree fail structural checks — run note_verify`)
      return { text: lines.join('\n'), ok: true, totalMatched: r.totalMatched, notes: r.notes }
    },
  },

  {
    name: 'note_read',
    title: 'Read one Agent Note',
    readOnly: true,
    description:
      'Read one Agent Note in full by the path returned from note_search. Returns the title, status, ' +
      'lifecycle, class, section headings and body. Use it to get the reasoning — the detail is usually in ' +
      '"Alternatives considered" (what was rejected and why) and "Consequences" (what it costs). Long notes ' +
      'are truncated to maxLines; contentLines reports the real length. Paths are relative to .agents/notes ' +
      'and must stay inside it.',
    parameters: {
      path: { type: 'string', required: true, description: 'Note path relative to .agents/notes, e.g. implemented/architecture/2026-11-12-transport.md' },
      maxLines: { type: 'integer', default: 400, description: 'Truncate the body after this many lines.' },
    },
    async run(args, { root }) {
      const r = readNote(root, args.path, { maxLines: args.maxLines })
      if (!r.ok) return { text: `${r.code}: ${r.message}`, ok: false }
      return {
        text:
          `${r.path}\n${r.lifecycle} · Status: ${r.status}\n` +
          `sections: ${r.sections.join(' | ') || '(none)'}\n\n${r.content}` +
          (r.truncated ? `\n\n[truncated — ${r.hint}]` : ''),
        ok: true,
        path: r.path,
        status: r.status,
        contentLines: r.contentLines,
      }
    },
  },

  {
    name: 'note_write',
    title: 'Write an Agent Note',
    readOnly: false,
    description:
      'Create a new Agent Note recording a decision that is NOT mechanical: a behavior or architecture ' +
      'change, a cross-file contract, a process/tooling change, a testing-strategy change, or an ' +
      'on-disk/wire/config format. Also use it to Supersede an earlier decision — write a new note and ' +
      'cross-link the old one, never rewrite history. Do NOT use it for typos, formatting, renames, ' +
      'dependency bumps or anything a reviewer would call a patch. The note is validated before writing: ' +
      'the body MUST open with "## Problem" and contain the lifecycle\'s required sections (proposed: ' +
      'Proposal / Acceptance criteria / Risks; implemented: Decision / Consequences) plus "## Alternatives ' +
      'considered". Pass body as Markdown WITHOUT the title and Status lines — those are generated from ' +
      'title and lifecycle. Refuses to overwrite an existing note. Returns the path and a verify summary; ' +
      'if validation fails nothing is written and the exact errors are returned.',
    parameters: {
      lifecycle: { type: 'string', required: true, enum: LIFECYCLE_ENUM, description: 'proposed = plan not built yet; implemented = landed and kept in sync with the code; rejected = decided against (keep only if it prevents a repeat mistake).' },
      class: { type: 'string', required: true, enum: [...CLASSES], description: 'feature | bug-fix | simplification | architecture | process | testing. refactor is not a class: if behavior changed use the matching class, if not it is simplification.' },
      title: { type: 'string', required: true, description: 'Short specific title, in the language of the note. It is the note heading, not the filename.' },
      slug: { type: 'string', description: 'Filename slug: 2-5 lowercase ASCII words joined by "-". REQUIRED when the title has no Latin characters (e.g. a Chinese title).' },
      body: { type: 'string', required: true, description: 'Markdown body starting with "## Problem". Do not include the "# Agent Note:" line or the Status line.' },
      rejectionReason: { type: 'string', description: 'Required when lifecycle=rejected: one line on why it was rejected.' },
      date: { type: 'string', description: 'yyyy-mm-dd, defaults to today.' },
    },
    async run(args, { root }) {
      const r = await writeNote(root, {
        lifecycle: args.lifecycle,
        cls: args.class,
        title: args.title,
        slug: args.slug,
        body: args.body,
        date: args.date,
        rejectionReason: args.rejectionReason,
      })
      if (!r.ok) {
        const errs = r.errors?.length ? `\n${r.errors.map((e) => `- ${e}`).join('\n')}` : ''
        return { text: `${r.code}: ${r.message}${errs}`, ok: false, path: r.path }
      }
      const v = r.verify
      const verifyLine = !v
        ? 'verify: skipped'
        : v.ok
          ? `verify: ok (${v.results.length} script(s))`
          : `verify: FAILED — ${(v.errors ?? []).join(' ; ').slice(0, 600)}`
      return { text: `wrote ${r.path} (${r.bytes} bytes)\n${verifyLine}`, ok: true, path: r.path, verifyOk: v ? v.ok : null }
    },
  },

  {
    name: 'note_verify',
    title: 'Verify the Agent Note tree',
    readOnly: true,
    description:
      'Run the upstream Agent Note verifiers over the whole .agents/notes tree: structural rules ' +
      '(lifecycle/class/filename/INDEX/relative links), per-note format (header lines, first "## Problem", ' +
      'required and banned sections, single Status line, "## Alternatives considered"), and archived-note ' +
      'hygiene. Use it after editing notes by hand, or before claiming the notes are consistent. Returns ' +
      'each script with its pass/fail and the exact error lines. Read-only.',
    parameters: {},
    async run(_args, { root }) {
      const v = await runVerify(root)
      if (v.code === 'VERIFIER_MISSING') return { text: `${v.code}: ${v.message}`, ok: false }
      if (!v.results.length) return { text: v.note ?? 'nothing to verify', ok: v.ok !== false }
      const lines = v.results.map((r) => `${r.ok ? 'PASS' : 'FAIL'} ${r.script} — ${(r.stdout || r.stderr || '').split('\n')[0] || `exit ${r.code}`}`)
      if (!v.ok) lines.push('', ...(v.errors ?? []))
      return { text: lines.join('\n'), ok: v.ok, checkedRoot: v.checkedRoot }
    },
  },

  {
    name: 'note_skip',
    title: 'Record that no note is needed',
    readOnly: false,
    description:
      'Record that this turn\'s change needs no Agent Note, so the end-of-turn reminder stops and the ' +
      'reason is on the record. Use it when you already judged that a note is not warranted (typo, rename, ' +
      'formatting, mechanical patch) — give one short reason. This is a statement to the user appended to ' +
      '.agents/notes/.skips.log with a timestamp, not a mute button: never call it to dodge work the change ' +
      'actually deserves.',
    parameters: {
      reason: { type: 'string', required: true, description: 'One line: why this turn needs no note.' },
      scope: { type: 'string', description: 'Optional: what the skip covers, e.g. the file or symbol touched.' },
    },
    async run(args, { root, sessionId }) {
      const r = appendSkip(root, { reason: String(args.reason ?? '').trim(), scope: args.scope, sessionId })
      const recent = readSkips(root, { limit: 3 })
      return {
        text: `recorded skip: ${r.recorded.reason}${r.recorded.scope ? ` (${r.recorded.scope})` : ''}\nlog: ${r.log} · ${recent.total} entr(y/ies) total`,
        ok: true,
      }
    },
  },
]

export function toolByName(name) {
  return TOOLS.find((t) => t.name === name)
}

/** Compact capability text for a `*_capabilities`-style resource. */
export function capabilitiesText() {
  const lines = [
    '# Agent Notes',
    '',
    'Decisions live as files under `.agents/notes/{lifecycle}/{class}/yyyy-mm-dd-topic.md` and are committed',
    'with the code they explain. Lifecycles: proposed / implemented / rejected (+ archived).',
    'Classes: feature / bug-fix / simplification / architecture / process / testing.',
    '',
    '## Tools',
  ]
  for (const t of TOOLS) {
    const first = t.description.split('. ')[0]
    lines.push(`- \`${t.name}\`${t.readOnly ? ' (read-only)' : ''}: ${first}.`)
  }
  lines.push('', 'Use `note_search` before proposing a design; use `note_write` once per non-mechanical change.')
  return lines.join('\n')
}

export { parseNote, walkNotes }
