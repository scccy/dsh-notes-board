/**
 * End-to-end smoke: a real MCP client over stdio, exercising all five tools.
 * Run: node test/smoke.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const root = mkdtempSync(join(tmpdir(), 'agent-notes-'))
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [new URL('../bin/agent-notes-mcp.js', import.meta.url).pathname, '--root', root],
})
const client = new Client({ name: 'smoke', version: '0' })
await client.connect(transport)

const { tools } = await client.listTools()
console.log('root:', root)
console.log('tools:', tools.map((t) => t.name).join(', '))

async function call(name, args) {
  const r = await client.callTool({ name, arguments: args })
  console.log(`\n--- ${name} (isError=${r.isError ?? false}) ---\n${r.content.map((c) => c.text).join('\n').slice(0, 800)}`)
  return r
}

await call('note_search', { query: 'transport' })
await call('note_write', {
  lifecycle: 'implemented',
  class: 'architecture',
  title: 'MCP transport is stateless HTTP',
  body:
    '## Problem\nstdio forces one process per session.\n\n' +
    '## Decision\nUse POST /mcp stateless.\n\n' +
    '## Alternatives considered\n- stdio: one instance per session\n\n' +
    '## Consequences\nNo session id required.',
})
await call('note_search', { query: 'stateless' })
await call('note_read', { path: 'implemented/architecture/' + '2026-11-12-mcp-transport-is-stateless-http.md' })
await call('note_write', { lifecycle: 'proposed', class: 'feature', title: 'bad note', body: 'no problem heading' })
await call('note_skip', { reason: 'smoke test', scope: 'test/' })
await call('note_verify', {})

await client.close()
rmSync(root, { recursive: true, force: true })
