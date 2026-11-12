/**
 * MCP surface — exposes the same five tools to any MCP host (Claude Code,
 * Codex, Cursor, ...). The DeepSeek Harness does not need this surface: it gets
 * the same tools natively from `src/dsh/index.js` plus the turn/end hook.
 *
 * Usage:
 *   node bin/agent-notes-mcp.js                 # stdio, root = cwd
 *   node bin/agent-notes-mcp.js --http 8848     # stateless Streamable HTTP
 *   node bin/agent-notes-mcp.js --root /path    # explicit workspace root
 */
import { createServer as createHttpServer } from 'node:http'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { capabilitiesText, TOOLS } from '../core/tools.js'
import { resolveRoot } from '../core/notes.js'

const VERSION = '0.1.0'

/** Neutral parameter DSL → zod raw shape. */
function zodShape(params = {}) {
  const shape = {}
  for (const [key, spec] of Object.entries(params)) {
    let s
    if (spec.enum) s = z.enum(spec.enum)
    else if (spec.type === 'integer') s = z.number().int()
    else if (spec.type === 'boolean') s = z.boolean()
    else s = z.string()
    if (spec.description) s = s.describe(spec.description)
    shape[key] = spec.required ? s : s.optional()
  }
  return shape
}

export function createServer({ root, sessionId } = {}) {
  const server = new McpServer(
    { name: 'agent-notes', version: VERSION },
    { instructions: capabilitiesText() },
  )
  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: zodShape(tool.parameters),
        annotations: {
          readOnlyHint: tool.readOnly !== false,
          destructiveHint: false,
          openWorldHint: false,
        },
      },
      async (args) => {
        const out = await tool.run(args ?? {}, { root, sessionId })
        return { content: [{ type: 'text', text: out.text }], isError: out.ok === false }
      },
    )
  }
  return server
}

async function readJsonBody(req) {
  if (req.method !== 'POST') return undefined
  const chunks = []
  for await (const chunk of req) chunks.push(chunk)
  if (!chunks.length) return undefined
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return undefined
  }
}

export async function startHttp({ port = 8848, host = '127.0.0.1', root } = {}) {
  const httpServer = createHttpServer(async (req, res) => {
    const url = (req.url ?? '/').split('?')[0]
    if (url === '/health') {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ ok: true, server: 'agent-notes', version: VERSION, tools: TOOLS.length, root: resolveRoot(root) }))
      return
    }
    if (url !== '/mcp') {
      res.writeHead(404, { 'content-type': 'text/plain' })
      res.end('not found')
      return
    }
    const body = await readJsonBody(req)
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true })
    const server = createServer({ root })
    res.on('close', () => {
      transport.close().catch(() => {})
      server.close().catch(() => {})
    })
    await server.connect(transport)
    await transport.handleRequest(req, res, body)
  })
  await new Promise((resolve, reject) => {
    httpServer.once('error', reject)
    httpServer.listen(port, host, resolve)
  })
  process.stderr.write(`agent-notes MCP listening on http://${host}:${port}/mcp (root ${resolveRoot(root)})\n`)
  return httpServer
}

export async function main(argv = process.argv.slice(2)) {
  const opts = { http: null, root: undefined, host: '127.0.0.1' }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--http') opts.http = Number(argv[++i] ?? 8848)
    else if (a === '--root') opts.root = argv[++i]
    else if (a === '--host') opts.host = argv[++i]
    else if (a === '--help' || a === '-h') {
      process.stdout.write('agent-notes-mcp [--http PORT] [--host HOST] [--root DIR]\n')
      return
    }
  }
  if (opts.http) {
    await startHttp({ port: opts.http, host: opts.host, root: opts.root })
    return
  }
  const transport = new StdioServerTransport()
  await createServer({ root: opts.root }).connect(transport)
}
