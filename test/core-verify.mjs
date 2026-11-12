/**
 * Verifier staging test: an installed plugin's vendored `.ts` scripts live under
 * node_modules, where Node refuses to strip types
 * (ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING). `runVerify` must stage them
 * outside node_modules, and must keep running in place everywhere else.
 * Run: node test/core-verify.mjs
 */
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { join, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { runVerify, stageScripts } from '../src/core/notes.js'

const results = []
const check = (label, cond) => {
  results.push({ label, ok: !!cond })
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${label}`)
}

const VERIFIERS = ['verify-agent-note-tree', 'verify-agent-note-format', 'verify-archived-agent-notes']

/** Minimal stand-in for the upstream skill: one shared module + three verifiers. */
function fakeSkill(root, { inNodeModules }) {
  // AGENT_NOTES_SKILL_DIR points at the skill directory; its scripts/ child is what runs.
  const skillDir = join(root, inNodeModules ? 'node_modules' : 'vendor', 'fake-skill')
  const dir = join(skillDir, 'scripts')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'agent-note-tree.ts'), 'export const marker: string = "shared"\n', 'utf8')
  for (const name of VERIFIERS) {
    writeFileSync(
      join(dir, `${name}.ts`),
      [
        "import { marker } from './agent-note-tree.ts'",
        'const where: string = process.argv[1] ?? ""',
        'console.log(`ok: ${marker} @ ${where}`)',
        '',
      ].join('\n'),
      'utf8',
    )
  }
  return { skillDir, scriptsDir: dir }
}

const work = mkdtempSync(join(tmpdir(), 'notes-board-verify-'))
const notesRoot = join(work, 'project')
mkdirSync(join(notesRoot, '.agents', 'notes'), { recursive: true })

// 1. installed plugin: scripts under node_modules get staged out
const installed = fakeSkill(join(work, 'install'), { inNodeModules: true })
const staged = stageScripts(installed.scriptsDir)
check('staging moves node_modules scripts out of node_modules', !staged.split(sep).includes('node_modules'))
check('staging target holds the shared sibling module', existsSync(join(staged, 'agent-note-tree.ts')))
check('staging is content-addressed (same dir for same content)', stageScripts(installed.scriptsDir) === staged)

process.env.AGENT_NOTES_SKILL_DIR = installed.skillDir
const installedRun = await runVerify(notesRoot)
check('verify runs all three verifiers from the staged copy', installedRun.ok === true && installedRun.results.length === 3)
check(
  'no verifier executes from node_modules',
  installedRun.results.every((r) => r.ok && !r.stdout.includes('node_modules')),
)
check('staged verifiers can import their sibling module', /ok: shared @/.test(installedRun.results[0]?.stdout ?? ''))

// 2. repo checkout / custom AGENT_NOTES_SKILL_DIR: run in place so edits take effect at once
const checkout = fakeSkill(join(work, 'repo'), { inNodeModules: false })
process.env.AGENT_NOTES_SKILL_DIR = checkout.skillDir
const checkoutRun = await runVerify(notesRoot)
check('checkout scripts run in place', checkoutRun.ok === true)
check(
  'in-place run keeps the original path',
  checkoutRun.results.every((r) => r.stdout.includes(join('vendor', 'fake-skill', 'scripts'))),
)

delete process.env.AGENT_NOTES_SKILL_DIR
rmSync(work, { recursive: true, force: true })

const failed = results.filter((r) => !r.ok).length
console.log(`\n${results.length - failed}/${results.length} passed`)
if (failed) process.exitCode = 1
