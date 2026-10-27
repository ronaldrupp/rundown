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

test('performances save to their own item; deleting one from the library drops it', async () => {
  const dir = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Cookie: `sid=${sid}` } })
  await new Promise(r => dir.on('open', r))
  const auth = { Cookie: `sid=${sid}` }, item = id => fetch(`${base}/api/item?id=${id}`, { headers: auth }).then(r => r.json())
  const library = { productions: [{ id: 'p', name: 'ESC', rundowns: [{ id: 'r', name: 'SF1', items: [{ id: 'a', name: 'Opening' }, { id: 'b', name: 'Country 1' }] }] }] }
  assert.equal((await post('/api/library', { library }, { 'Content-Type': 'application/json', ...auth })).status, 200)
  // switching to b right away still saves a's last edit
  dir.send(JSON.stringify({ event: 'rundown:show', data: { id: 'd', show: { item: 'a', title: 'A' } } }))
  dir.send(JSON.stringify({ event: 'rundown:show', data: { id: 'd', show: { item: 'b', title: 'B' } } }))
  await new Promise(r => setTimeout(r, 1200))
  assert.equal((await item('a')).show.title, 'A')
  assert.equal((await item('b')).show.title, 'B')
  library.productions[0].rundowns[0].items.pop()
  await post('/api/library', { library }, { 'Content-Type': 'application/json', ...auth })
  assert.equal((await item('b')).show, null)
  assert.equal((await post('/api/library', { library: {} }, { 'Content-Type': 'application/json', ...auth })).status, 400)
  dir.close()
})

test('one active director window; another can take over', async () => {
  const open = () => new Promise(r => {
    const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: { Cookie: `sid=${sid}` } })
    ws.got = []
    ws.on('message', m => { m = JSON.parse(m); if (m.event === 'rundown:leader') ws.got.push(m.data.you) })
    ws.on('open', () => r(ws))
  })
  const wait = () => new Promise(r => setTimeout(r, 100))
  const a = await open(); await wait()
  const b = await open(); await wait()
  assert.equal(a.got.at(-1), true)
  assert.equal(b.got.at(-1), false)
  b.send(JSON.stringify({ event: 'rundown:takeover' })); await wait()
  assert.equal(a.got.at(-1), false)
  assert.equal(b.got.at(-1), true)
  b.close(); await wait()
  assert.equal(a.got.at(-1), true) // the active window left, so the other one takes over
  a.close()
})

test('a mirroring window saves its own performance but never the live one', async () => {
  const auth = { Cookie: `sid=${sid}` }, item = id => fetch(`${base}/api/item?id=${id}`, { headers: auth }).then(r => r.json())
  const open = () => new Promise(r => { const ws = new WebSocket(`ws://localhost:${PORT}/ws`, { headers: auth }); ws.on('open', () => r(ws)) })
  const wait = ms => new Promise(r => setTimeout(r, ms))
  const library = { productions: [{ id: 'p', name: 'ESC', rundowns: [{ id: 'r', name: 'SF1', items: [{ id: 'live', name: 'A' }, { id: 'mine', name: 'B' }] }] }] }
  await post('/api/library', { library }, { 'Content-Type': 'application/json', ...auth })
  const a = await open(); await wait(100)
  const b = await open(); await wait(100)
  a.send(JSON.stringify({ event: 'rundown:show', data: { id: 'a', show: { item: 'live', title: 'Live' } } }))
  await wait(100)
  b.send(JSON.stringify({ event: 'rundown:save', data: { show: { item: 'live', title: 'Clobbered' } } }))
  b.send(JSON.stringify({ event: 'rundown:save', data: { show: { item: 'mine', title: 'Mine' } } }))
  b.close() // closing writes the pending edit right away
  await wait(1200)
  assert.equal((await item('live')).show.title, 'Live')
  assert.equal((await item('mine')).show.title, 'Mine')
  assert.equal((await fetch(base + '/api/show', { headers: auth }).then(r => r.json())).show.title, 'Live')
  const c = await open(); await wait(100)
  const told = new Promise(r => c.on('message', m => { m = JSON.parse(m); if (m.event === 'rundown:library') r(m.data) }))
  await post('/api/library', { library }, { 'Content-Type': 'application/json', 'X-Window': 'w1', ...auth })
  assert.equal((await told).from, 'w1')
  a.close(); c.close()
})

test('vMix tally: only the program input goes back, logged in only', async () => {
  const { createServer } = await import('node:http')
  const vmix = createServer((req, res) => res.end(req.url === '/api/'
    ? '<vmix><inputs><input key="k1" number="1" type="Colour" title="CAM 1">CAM 1</input><input key="k2" number="2" type="Colour" title="CAM 2 &amp; 3">x</input></inputs><active>2</active><preview>1</preview></vmix>'
    : 'secret page'))
  await new Promise(r => vmix.listen(0, r))
  const url = u => `${base}/api/vmix?url=${encodeURIComponent(u)}`, auth = { headers: { Cookie: `sid=${sid}` } }
  const at = `http://localhost:${vmix.address().port}`
  assert.equal((await fetch(url(at))).status, 401)
  assert.deepEqual(await (await fetch(url(at), auth)).json(), { number: 2, title: 'CAM 2 & 3' })
  assert.equal((await fetch(url('file:///etc/passwd'), auth)).status, 400)
  assert.equal((await fetch(url('http://localhost:1'), auth)).status, 502)
  vmix.close()
})
