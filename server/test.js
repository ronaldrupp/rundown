import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'

// npm test: starts the dev server on a throwaway database and checks the auth rules
const PORT = 5199, base = `http://localhost:${PORT}`
const data = mkdtempSync(join(tmpdir(), 'rundown-test-'))
let server, sid, code

const post = (path, body, headers = { 'Content-Type': 'application/json' }) =>
  fetch(base + path, { method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body) })
// resolves with the first message, or the close code if the server hangs up first
const first = (url, headers, send) => new Promise(resolve => {
  const ws = new WebSocket(url, { headers })
  ws.on('open', () => send && ws.send(JSON.stringify(send)))
  ws.on('message', m => { ws.close(); resolve(JSON.parse(m)) })
  ws.on('close', c => resolve(c))
})

before(async () => {
  server = spawn('node', ['server/index.js', '--dev'], { env: { ...process.env, PORT, DATA_DIR: data }, stdio: 'ignore' })
  for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/me'); return } catch { await new Promise(r => setTimeout(r, 100)) } }
})
after(() => { server.kill(); rmSync(data, { recursive: true }) })

test('only the first account can sign up', async () => {
  const r = await post('/api/signup', { email: 'dir@test.localhost', password: 'testpass-123' })
  assert.equal(r.status, 200)
  ;({ code } = await r.json())
  sid = r.headers.get('set-cookie').match(/sid=(\w+)/)[1]
  assert.equal((await post('/api/signup', { email: 'b@test.localhost', password: 'testpass-123' })).status, 403)
})

test('login needs JSON, so a cross-site form cannot post it', async () => {
  const r = await post('/api/login', 'email=dir@test.localhost&password=testpass-123', { 'Content-Type': 'application/x-www-form-urlencoded' })
  assert.equal(r.status, 400)
})

test('rundown and media need a login', async () => {
  assert.equal((await fetch(base + '/api/show')).status, 401)
  assert.equal((await fetch(base + '/api/show', { headers: { Cookie: `sid=${sid}` } })).status, 200)
  assert.equal((await fetch(base + '/media/x.mp4')).status, 404)
})

test('websocket: wrong code and foreign-origin cookie are refused', async () => {
  assert.equal(await first(`ws://localhost:${PORT}/ws?code=WRONG1`), 4001)
  assert.equal(await first(`ws://localhost:${PORT}/ws`, { Cookie: `sid=${sid}`, Origin: 'https://evil.example' }), 4001)
})

test('director publishes, a camera gets the stored rundown but cannot change it', async () => {
  const dir = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Cookie: `sid=${sid}` } })
  await new Promise(r => dir.on('open', r))
  dir.send(JSON.stringify({ event: 'rundown:show', data: { id: 'd', show: { title: 'Real' } } }))
  const cam = `ws://localhost:${PORT}/ws?code=${code}`
  await new Promise(r => setTimeout(r, 100))
  const camWs = new WebSocket(cam)
  await new Promise(r => camWs.on('open', r))
  camWs.send(JSON.stringify({ event: 'rundown:show', data: { id: 'c', show: { title: 'Hijacked' } } }))
  await new Promise(r => setTimeout(r, 100))
  const m = await first(cam, {}, { event: 'rundown:hello' })
  assert.equal(m.data.show.title, 'Real')
  dir.close(); camWs.close()
})
