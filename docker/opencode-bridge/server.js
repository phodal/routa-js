#!/usr/bin/env node
/**
 * OpenCode ACP Bridge Server
 *
 * Wraps the `opencode acp` CLI (JSON-RPC over stdin/stdout) as an HTTP+SSE API.
 * This allows Routa's DockerOpenCodeAdapter to communicate with opencode inside
 * a Docker container without needing a native HTTP server mode.
 *
 * Endpoints:
 *   GET  /health
 *   POST /session/new    { cwd? }               → { sessionId }
 *   POST /session/prompt { sessionId, prompt }  → text/event-stream (SSE)
 *   POST /session/cancel { sessionId }          → { ok: true }
 *   POST /session/delete { sessionId }          → { ok: true }
 */
'use strict'

const http = require('http')
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { execFile } = require('child_process')

const PORT = parseInt(process.env.PORT || '4321', 10)
const HOST = process.env.HOST || '0.0.0.0'
const WORKSPACE = process.env.WORKSPACE || process.cwd()

// ─── Resolve the opencode binary ─────────────────────────────────────────────

function resolveOpenCodeBin() {
  const envPath = process.env.OPENCODE_BIN_PATH
  if (envPath && fs.existsSync(envPath)) {
    return envPath
  }

  // Walk up from opencode-ai's bin dir looking for the platform binary
  // (same logic as the opencode-ai wrapper script)
  const platformCandidates = [
    // Linux arm64 musl (Alpine)
    '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-arm64-musl/bin/opencode',
    '/usr/local/lib/node_modules/opencode-linux-arm64-musl/bin/opencode',
    // Linux x64 musl (Alpine)
    '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64-musl/bin/opencode',
    '/usr/local/lib/node_modules/opencode-linux-x64-musl/bin/opencode',
    // Linux arm64 glibc
    '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-arm64/bin/opencode',
    '/usr/local/lib/node_modules/opencode-linux-arm64/bin/opencode',
    // Linux x64 glibc
    '/usr/local/lib/node_modules/opencode-ai/node_modules/opencode-linux-x64/bin/opencode',
    '/usr/local/lib/node_modules/opencode-linux-x64/bin/opencode',
    // Fallback system paths
    '/usr/local/bin/opencode',
    '/usr/bin/opencode',
  ]

  for (const p of platformCandidates) {
    if (fs.existsSync(p)) return p
  }

  return 'opencode' // last resort: rely on PATH
}

const OPENCODE_BIN = resolveOpenCodeBin()
console.log(`[bridge] opencode binary: ${OPENCODE_BIN}`)
console.log(`[bridge] workspace:       ${WORKSPACE}`)

// ─── Session management ───────────────────────────────────────────────────────

let nextReqId = 1
const sessions = new Map() // localSessionId → OpenCodeSession

class OpenCodeSession {
  constructor(cwd) {
    this.cwd = cwd || WORKSPACE
    this.proc = null
    this.buffer = ''
    this.pendingRequests = new Map()
    this.sseClients = new Set()
    this.opencodeSessionId = null
    this.alive = false
  }

  /**
   * Spawn opencode in ACP mode and establish the JSON-RPC session.
   * Returns the remote opencode session ID.
   */
  async start() {
    console.log(`[session] spawning opencode acp --cwd ${this.cwd}`)

    this.proc = spawn(OPENCODE_BIN, ['acp', '--cwd', this.cwd], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env },
    })

    this.proc.stdout.on('data', (chunk) => {
      this.buffer += chunk.toString('utf8')
      this._drainBuffer()
    })

    this.proc.stderr.on('data', (chunk) => {
      const text = chunk.toString('utf8').trim()
      if (text) process.stderr.write(`[opencode] ${text}\n`)
    })

    this.proc.on('exit', (code, signal) => {
      console.log(`[session] exited code=${code} signal=${signal}`)
      this.alive = false
      for (const [, { reject, timer }] of this.pendingRequests) {
        clearTimeout(timer)
        reject(new Error(`opencode exited (code=${code})`))
      }
      this.pendingRequests.clear()
      for (const { res } of this.sseClients) {
        try { res.end() } catch {}
      }
      this.sseClients.clear()
    })

    this.proc.on('error', (err) => {
      console.error(`[session] spawn error:`, err)
      this.alive = false
    })

    await new Promise(r => setTimeout(r, 600))

    if (!this.proc.pid) {
      throw new Error(`Failed to spawn opencode (bin: ${OPENCODE_BIN})`)
    }
    this.alive = true

    // ACP handshake
    await this._request('initialize', {
      protocolVersion: 1,
      clientInfo: { name: 'routa-docker-bridge', version: '1.0.0' },
    })

    const result = await this._request('session/new', { cwd: this.cwd, mcpServers: [] })
    this.opencodeSessionId = result.sessionId
    console.log(`[session] ACP session: ${this.opencodeSessionId}`)
    return this.opencodeSessionId
  }

  addSSEClient(res) {
    this.sseClients.add({ res })
  }

  removeSSEClient(res) {
    for (const client of this.sseClients) {
      if (client.res === res) { this.sseClients.delete(client); break }
    }
  }

  /** Send prompt; session/update notifications stream to SSE clients. */
  async sendPrompt(text) {
    return this._request('session/prompt', {
      sessionId: this.opencodeSessionId,
      prompt: [{ type: 'text', text }],
    }, 300000) // 5-minute timeout
  }

  cancel() {
    if (this.alive && this.proc && this.proc.stdin) {
      this._write({
        jsonrpc: '2.0',
        method: 'session/cancel',
        params: { sessionId: this.opencodeSessionId },
      })
    }
  }

  kill() {
    this.alive = false
    if (this.proc) {
      try { this.proc.kill('SIGTERM') } catch {}
      setTimeout(() => {
        if (this.proc && this.proc.exitCode === null) {
          try { this.proc.kill('SIGKILL') } catch {}
        }
      }, 5000)
    }
  }

  // ── private ──────────────────────────────────────────────────────────────

  _write(msg) {
    if (this.proc && this.proc.stdin) {
      try { this.proc.stdin.write(JSON.stringify(msg) + '\n') } catch {}
    }
  }

  _drainBuffer() {
    const lines = this.buffer.split('\n')
    this.buffer = lines.pop() // keep incomplete last line
    for (const line of lines) {
      if (!line.trim()) continue
      try {
        this._handleMsg(JSON.parse(line))
      } catch {
        // Try to extract embedded JSON objects (some agents mix debug text)
        this._tryExtractJson(line)
      }
    }
  }

  _tryExtractJson(line) {
    let depth = 0, start = -1
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '{') { if (!depth) start = i; depth++ }
      else if (line[i] === '}') {
        depth--
        if (!depth && start >= 0) {
          try { this._handleMsg(JSON.parse(line.slice(start, i + 1))) } catch {}
          start = -1
        }
      }
    }
  }

  _handleMsg(msg) {
    // Response to a pending request
    if (msg.id != null && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        clearTimeout(pending.timer)
        this.pendingRequests.delete(msg.id)
        if (msg.error) {
          pending.reject(new Error(`ACP Error [${msg.error.code}]: ${msg.error.message}`))
        } else {
          pending.resolve(msg.result)
        }
        return
      }
    }

    // Agent→Client request (needs a response)
    if (msg.id != null && msg.method) {
      this._handleAgentRequest(msg)
      return
    }

    // Notification (session/update etc.)
    if (msg.method === 'session/update') {
      this._broadcastSSE(msg)
    }
  }

  _handleAgentRequest(msg) {
    const { method, id, params } = msg

    switch (method) {
      case 'session/request_permission':
        this._write({ jsonrpc: '2.0', id, result: { outcome: { outcome: 'approved' } } })
        break

      case 'fs/read_text_file': {
        const filePath = (params || {}).path
        if (!filePath) {
          this._write({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing path' } })
          break
        }
        fs.readFile(filePath, 'utf8', (err, content) => {
          if (err) {
            this._write({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } })
          } else {
            this._write({ jsonrpc: '2.0', id, result: { content } })
          }
        })
        break
      }

      case 'fs/write_text_file': {
        const { path: writePath, content } = params || {}
        if (!writePath) {
          this._write({ jsonrpc: '2.0', id, error: { code: -32602, message: 'Missing path' } })
          break
        }
        fs.mkdir(path.dirname(writePath), { recursive: true }, () => {
          fs.writeFile(writePath, content || '', 'utf8', (err) => {
            if (err) {
              this._write({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } })
            } else {
              this._write({ jsonrpc: '2.0', id, result: {} })
            }
          })
        })
        break
      }

      case 'fs/list_directory': {
        const dirPath = (params || {}).path || '.'
        fs.readdir(dirPath, { withFileTypes: true }, (err, entries) => {
          if (err) {
            this._write({ jsonrpc: '2.0', id, error: { code: -32000, message: err.message } })
          } else {
            this._write({
              jsonrpc: '2.0', id,
              result: {
                entries: entries.map(e => ({
                  name: e.name,
                  type: e.isDirectory() ? 'directory' : 'file',
                }))
              }
            })
          }
        })
        break
      }

      case 'terminal/create': {
        const p = params || {}
        const shell = p.shell || '/bin/sh'
        const cmd = typeof p.command === 'string' ? p.command
          : Array.isArray(p.command) ? p.command.join(' ') : null

        if (!cmd) {
          this._write({ jsonrpc: '2.0', id, result: { terminalId: `t-${id}`, output: '' } })
          break
        }

        execFile(shell, ['-c', cmd], { cwd: this.cwd, timeout: 30000 }, (err, stdout, stderr) => {
          const output = stdout + (stderr ? `\n${stderr}` : '')
          this._write({ jsonrpc: '2.0', id, result: { terminalId: `t-${id}`, output } })
        })
        break
      }

      default:
        console.warn(`[session] unhandled agent request: ${method}`)
        this._write({ jsonrpc: '2.0', id, result: {} })
        break
    }
  }

  _broadcastSSE(msg) {
    const frame = `data: ${JSON.stringify(msg)}\n\n`
    for (const { res } of this.sseClients) {
      try { res.write(frame) } catch { this.sseClients.delete({ res }) }
    }
  }

  _request(method, params, timeout = 10000) {
    return new Promise((resolve, reject) => {
      const id = nextReqId++
      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Timeout waiting for "${method}" (${timeout}ms)`))
      }, timeout)
      this.pendingRequests.set(id, { resolve, reject, timer })
      this._write({ jsonrpc: '2.0', id, method, params })
    })
  }
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', c => chunks.push(c))
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')) }
      catch { resolve({}) }
    })
    req.on('error', reject)
  })
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(json),
    'Access-Control-Allow-Origin': '*',
  })
  res.end(json)
}

// ─── HTTP server ──────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const urlPath = req.url.split('?')[0]

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    })
    res.end()
    return
  }

  try {
    // ── GET /health ────────────────────────────────────────────────────────
    if (req.method === 'GET' && urlPath === '/health') {
      return sendJson(res, 200, {
        status: 'ok',
        bin: OPENCODE_BIN,
        binExists: fs.existsSync(OPENCODE_BIN),
        sessions: sessions.size,
      })
    }

    // ── POST /session/new ──────────────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/session/new') {
      const body = await readBody(req)
      const cwd = body.cwd || WORKSPACE
      const session = new OpenCodeSession(cwd)

      await session.start() // may throw — lets HTTP handler return 500

      const localId = `bridge-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      sessions.set(localId, session)

      return sendJson(res, 200, { sessionId: localId })
    }

    // ── POST /session/prompt → SSE ─────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/session/prompt') {
      const body = await readBody(req)
      const { sessionId, prompt } = body

      const session = sessions.get(sessionId)
      if (!session) return sendJson(res, 404, { error: `Session not found: ${sessionId}` })
      if (!session.alive) return sendJson(res, 409, { error: 'Session process has exited' })

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      })

      session.addSSEClient(res)

      const cleanup = () => session.removeSSEClient(res)
      req.on('close', cleanup)
      req.on('error', cleanup)

      try {
        await session.sendPrompt(prompt)
        // DockerOpenCodeAdapter appends its own turn_complete after SSE ends
      } catch (err) {
        const errEvent = {
          jsonrpc: '2.0',
          method: 'session/update',
          params: {
            sessionId,
            update: { sessionUpdate: 'error', error: err.message },
          },
        }
        res.write(`data: ${JSON.stringify(errEvent)}\n\n`)
      } finally {
        cleanup()
        res.end()
      }
      return
    }

    // ── POST /session/cancel ───────────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/session/cancel') {
      const body = await readBody(req)
      const session = sessions.get(body.sessionId)
      if (session) session.cancel()
      return sendJson(res, 200, { ok: true })
    }

    // ── POST /session/delete ───────────────────────────────────────────────
    if (req.method === 'POST' && urlPath === '/session/delete') {
      const body = await readBody(req)
      const session = sessions.get(body.sessionId)
      if (session) {
        session.kill()
        sessions.delete(body.sessionId)
      }
      return sendJson(res, 200, { ok: true })
    }

    sendJson(res, 404, { error: 'Not found' })
  } catch (err) {
    console.error('[server] unhandled error:', err)
    if (!res.headersSent) sendJson(res, 500, { error: err.message })
  }
})

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[bridge] SIGTERM — shutting down')
  for (const session of sessions.values()) session.kill()
  server.close(() => process.exit(0))
})
