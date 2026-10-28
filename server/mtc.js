import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { fileURLToPath } from 'node:url'
import { WebSocketServer } from 'ws'

// MTC generator for rehearsing without house timecode: `npm run mtc [hh:mm:ss:ff]`, then the server with
// CHASE=mtc CHASE_INPUT="Rundown MTC". Sends 25 fps from 20:00:00:00 by default, from a virtual MIDI port and as the
// same MIDI bytes on ws://localhost:5175/midi (CHASE_INPUT=ws://..., and in Docker, where there are no MIDI ports),
// with play, pause and locate controls on http://localhost:5175 (MTC_PORT), above a player that chases it (mtc.html)
const FPS = 25, RATE = 1 // MTC rate code for 25 fps

const parts = n => [Math.floor(n / FPS / 3600) % 24, Math.floor(n / FPS / 60) % 60, Math.floor(n / FPS) % 60, n % FPS]
const p2 = n => String(n).padStart(2, '0')
export const tc = n => parts(n).map(p2).join(':')
export const frames = s => {
  const m = /^(\d{1,2}):(\d{2}):(\d{2}):(\d{2})$/.exec(s ?? '')
  if (!m || +m[1] > 23 || +m[2] > 59 || +m[3] > 59 || +m[4] >= FPS) return null
  return ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * FPS + +m[4]
}

// quarter frame p (0-7) of the 8 that describe frame n
export function quarterFrame(n, p) {
  const [h, m, s, f] = parts(n)
  return [0xf1, (p << 4) | [f & 15, f >> 4, s & 15, s >> 4, m & 15, m >> 4, h & 15, (h >> 4) | (RATE << 1)][p]]
}

export function fullFrame(n) {
  const [h, m, s, f] = parts(n)
  return [0xf0, 0x7f, 0x7f, 0x01, 0x01, (RATE << 5) | h, m, s, f, 0xf7]
}

const DAY = 24 * 3600 * FPS

// transport: send(msg) gets each MIDI message, now() is in ms. tick() sends the quarter frames that are due
export function transport(start, send, now = () => performance.now()) {
  let base = start, t0 = null, sent = 0 // t0 is null while paused
  const pos = () => t0 === null ? base : base + Math.floor((now() - t0) * FPS / 1000)
  const locate = n => { base = ((n % DAY) + DAY) % DAY; sent = 0; if (t0 !== null) t0 = now(); send(fullFrame(base)) }
  return {
    state: () => ({ tc: tc(pos() % DAY), running: t0 !== null, start: tc(start) }),
    play() { if (t0 === null) { t0 = now(); sent = 0 } },
    pause() { if (t0 !== null) { base = pos(); t0 = null; send(fullFrame(base)) } },
    locate,
    jump: s => locate(pos() + s * FPS),
    // 4 quarter frames per frame, counted from the wall clock so timer jitter doesn't make the timecode drift
    tick() {
      if (t0 === null) return
      for (const due = Math.floor((now() - t0) * FPS * 4 / 1000); sent < due; sent++) send(quarterFrame(base + (sent >> 3) * 2, sent & 7))
    },
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const start = frames(process.argv[2] ?? '20:00:00:00')
  if (start === null) { console.error('usage: npm run mtc [hh:mm:ss:ff]'); process.exit(1) }
  let out = null
  try {
    const mod = await import('@julusian/midi')
    out = new (mod.default ?? mod).Output()
    out.openVirtualPort('Rundown MTC')
  } catch (e) { out = null; console.log(`No MIDI port (${e.message}); timecode on the websocket only`) }
  let wss
  const t = transport(start, m => {
    out?.sendMessage(m)
    const b = Buffer.from(m)
    for (const c of wss?.clients ?? []) if (c.readyState === 1) c.send(b)
  })
  t.locate(start)
  if (!process.argv.includes('--paused')) t.play()
  setInterval(t.tick, 5)

  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)) }
  const PORT = +process.env.MTC_PORT || 5175
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/html' }); return res.end(readFileSync(new URL('mtc.html', import.meta.url))) }
    if (req.method === 'GET' && req.url === '/state') return json(res, 200, t.state())
    if (req.method === 'GET' && req.url === '/timecode.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return res.end(readFileSync(new URL('../src/timecode.js', import.meta.url))) }
    if (req.method !== 'POST' || req.url !== '/cmd') return json(res, 404, { error: 'not found' })
    let body = ''
    req.on('data', d => { body += d; if (body.length > 1000) req.destroy() })
    req.on('end', () => {
      let c
      try { c = JSON.parse(body) } catch { return json(res, 400, { error: 'bad JSON' }) }
      if (c.cmd === 'play') t.play()
      else if (c.cmd === 'pause') t.pause()
      else if (c.cmd === 'jump' && Number.isFinite(c.s)) t.jump(c.s)
      else if (c.cmd === 'locate' && frames(c.tc) !== null) t.locate(frames(c.tc))
      else return json(res, 400, { error: 'unknown command' })
      json(res, 200, t.state())
    })
  })
  // a new listener gets the current position right away, as a locate, instead of waiting for the next one
  wss = new WebSocketServer({ server, path: '/midi' })
  wss.on('connection', ws => ws.send(Buffer.from(fullFrame(frames(t.state().tc)))))
  // MTC_HOST=0.0.0.0 in Docker, where the container's port is published to this machine only (compose.yml)
  server.listen(PORT, process.env.MTC_HOST || '127.0.0.1', () => console.log(`Rundown MTC: 25 fps from ${tc(start)}, controls and playback on http://localhost:${PORT}, Ctrl+C to stop`))
}
