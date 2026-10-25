import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, mkdirSync, statSync } from 'node:fs'
import { extname, join, normalize } from 'node:path'
import { WebSocketServer } from 'ws'
import { userCount, addUser, checkPassword, newSession, endSession, sessionUser, userByCode, loadShow, saveShow } from './db.js'

// One process for the whole app: login API, YouTube import, the sync websocket, and the web app itself
// (Vite in middleware mode with --dev, the built dist/ otherwise). PORT defaults to 5173, as before.
const dev = process.argv.includes('--dev')
const PORT = +process.env.PORT || 5173
const MAX_BODY = 5e6 // rundowns are a few hundred KB at most
const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' }

const send = (res, code, body, headers = {}) => { res.writeHead(code, { 'Content-Type': 'application/json', ...headers }); res.end(JSON.stringify(body)) }
const cookie = req => Object.fromEntries((req.headers.cookie ?? '').split(/;\s*/).map(c => c.split('=')))
const https = req => req.headers['x-forwarded-proto'] === 'https' // behind a TLS proxy (Caddy, nginx, Fly)
const sidCookie = (req, token, maxAge) => `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${https(req) ? '; Secure' : ''}`
// browsers send the cookie, the iOS director remote sends its login token as ?token= or a Bearer header
const director = req => sessionUser(cookie(req).sid ?? new URL(req.url, 'http://x').searchParams.get('token') ?? req.headers.authorization?.replace(/^Bearer /, ''))

async function body(req) {
  // JSON only: a cross-site <form> can't send this content type, so the session cookie can't be ridden (CSRF)
  if (!req.headers['content-type']?.startsWith('application/json')) throw new Error('Expected JSON')
  let s = ''
  for await (const chunk of req) if ((s += chunk).length > MAX_BODY) throw new Error('Too large')
  return JSON.parse(s || '{}')
}

// shortcut: failed logins are counted in memory per email; good enough for one small server, use a proxy rate limit beyond that
const fails = new Map()
const locked = email => (fails.get(email)?.filter(t => Date.now() - t < 15 * 60e3).length ?? 0) >= 5

async function api(req, res, path) {
  if (path === '/api/me') {
    const u = director(req)
    return send(res, 200, u ? { email: u.email, code: u.code } : { setup: userCount() === 0 })
  }
  if (req.method !== 'POST' && path !== '/api/show') return send(res, 405, { error: 'Method not allowed' })
  try {
    const { email, password } = path === '/api/signup' || path === '/api/login' ? await body(req) : {}
    if (path === '/api/signup') {
      // only the very first account signs up here; later ones come from `npm run user add`
      if (userCount() > 0) return send(res, 403, { error: 'Sign-up is closed. Ask the admin for an account.' })
      if (!String(email).includes('@') || String(password).length < 8) return send(res, 400, { error: 'Enter an email and a password of 8+ characters' })
      addUser(email, password)
      path = '/api/login' // and log straight in
    }
    if (path === '/api/login') {
      const key = String(email).trim().toLowerCase()
      if (locked(key)) return send(res, 429, { error: 'Too many attempts. Try again in 15 minutes.' })
      const u = checkPassword(email, password)
      if (!u) { fails.set(key, [...(fails.get(key) ?? []), Date.now()]); return send(res, 401, { error: 'Wrong email or password' }) }
      fails.delete(key)
      const token = newSession(u.id)
      return send(res, 200, { email: u.email, code: u.code, token }, { 'Set-Cookie': sidCookie(req, token, 30 * 86400) })
    }
    if (path === '/api/logout') {
      endSession(cookie(req).sid ?? '')
      return send(res, 200, {}, { 'Set-Cookie': sidCookie(req, '', 0) })
    }
    const u = director(req)
    if (!u) return send(res, 401, { error: 'Log in first' })
    if (path === '/api/show') return send(res, 200, { show: JSON.parse(loadShow(u.id) ?? 'null') })
    if (path === '/api/youtube') return youtube(req, res)
    send(res, 404, { error: 'Not found' })
  } catch (e) { send(res, 400, { error: e.message }) }
}

// POST /api/youtube?url=... downloads the video with yt-dlp into ./media and returns its path
function youtube(req, res) {
  let url
  try { url = new URL(new URL(req.url, 'http://x').searchParams.get('url')) } catch { return send(res, 400, { error: 'Invalid URL' }) }
  if (url.protocol !== 'https:' || !YT_HOSTS.includes(url.hostname)) return send(res, 400, { error: 'Only https YouTube links are allowed' })
  if (!existsSync('media')) mkdirSync('media')
  // args array, no shell: the URL can't inject commands
  const p = spawn('yt-dlp', ['--no-playlist', '-f', 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4',
    '-o', 'media/%(id)s.%(ext)s', '--print', 'after_move:filepath', '--print', 'title', '--no-simulate', '--', url.href])
  let out = '', err = ''
  p.stdout.on('data', d => (out += d))
  p.stderr.on('data', d => (err += d))
  p.on('error', e => send(res, 500, { error: `yt-dlp not available: ${e.message}` }))
  p.on('close', code => {
    if (code !== 0) return send(res, 500, { error: err.trim().split('\n').pop() || 'Download failed' })
    const [title, file] = out.trim().split('\n')
    send(res, 200, { title, file: '/' + file.replace(/^.*?(media\/)/, '$1') })
  })
}

// files under root, never outside it; null when missing
function file(root, path) {
  let f
  try { f = join(root, normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '')) } catch { return null } // malformed %-escape
  return f.startsWith(join(root)) && existsSync(f) && statSync(f).isFile() ? f : null
}
const serve = (res, f) => { res.writeHead(200, { 'Content-Type': TYPES[extname(f)] ?? 'application/octet-stream' }); createReadStream(f).pipe(res) }

const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname
  if (path.startsWith('/api/')) return api(req, res, path)
  // videos are third-party content: directors only (camera views don't play media)
  if (path.startsWith('/media/')) {
    const f = director(req) && file('media', path.slice(7))
    return f ? serve(res, f) : send(res, 404, { error: 'Not found' })
  }
  if (vite) return vite.middlewares(req, res)
  serve(res, file('dist', path) ?? 'dist/index.html') // single-page app: unknown paths get index.html
})

const vite = dev && await (await import('vite')).createServer({ server: { middlewareMode: true, hmr: { server } }, appType: 'spa' })
if (!dev && !existsSync('dist/index.html')) { console.error('No dist/ build. Run `npm run build` first, or `npm run dev`.'); process.exit(1) }

// ---- sync: one room per director account. The director window publishes the rundown and clock,
// camera views (join code) and the iOS director remote (login token) listen. Messages are {event, data},
// the shape src/sync.js and the iOS app already used over Vite's websocket.
const rooms = new Map() // user id -> { sockets: Set, leader, show, showFrom, saveTimer, save }
const room = id => rooms.get(id) ?? rooms.set(id, { sockets: new Set(), leader: null, show: JSON.parse(loadShow(id) ?? 'null'), showFrom: null }).get(id)
const msg = (event, data) => JSON.stringify({ event, data })

const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_BODY })
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://x')
  if (url.pathname !== '/ws') return // Vite's HMR socket handles its own upgrades in dev
  // a page on another site can open a websocket with our cookie attached; only trust the cookie from our own pages
  let sameSite = !req.headers.origin
  try { sameSite ||= new URL(req.headers.origin).host === req.headers.host } catch {} // Origin: null
  // a join code always means a camera view, even in a browser that is also logged in as the director
  const code = url.searchParams.get('code')
  const cam = code ? userByCode(code) : null
  const u = !code && sameSite ? director(req) : null
  wss.handleUpgrade(req, socket, head, ws => {
    // 4001 tells the client why, so it can ask for a new code or login instead of retrying forever
    if (!u && !cam) return ws.close(4001, 'Wrong join code or not logged in')
    enter(ws, room((u ?? cam).id), u ? (url.searchParams.get('role') === 'remote' ? 'remote' : 'director') : 'cam', (u ?? cam).id)
  })
})

function enter(ws, r, role, userId) {
  ws.role = role
  r.sockets.add(ws)
  const others = fn => r.sockets.forEach(s => s !== ws && s.readyState === 1 && fn(s))
  ws.on('message', raw => {
    let m
    try { m = JSON.parse(raw) } catch { return }
    // clock offset probe: clients estimate server time so countdowns can make up for network delay
    if (m.event === 'ping') return ws.send(msg('pong', { t: m.data?.t, s: Date.now() }))
    // answered from the stored rundown, so camera views get it before the director is even online
    if (m.event === 'rundown:hello') return r.show && ws.send(msg('rundown:show', { id: r.showFrom, show: r.show }))
    if (role === 'cam') return // listen only
    if (m.event === 'rundown:control') return r.leader?.readyState === 1 && r.leader.send(msg('rundown:control', m.data))
    if (role !== 'director') return
    r.leader ??= ws
    if (r.leader !== ws) {
      // a second director window: its clock reaches only the other directors, so both see the warning, never the cameras
      if (m.event === 'rundown:clock') others(s => s.role === 'director' && s.send(raw.toString()))
      return
    }
    if (m.event === 'rundown:show' && m.data?.show) {
      r.show = m.data.show
      r.showFrom = m.data.id
      clearTimeout(r.saveTimer) // edits arrive per keystroke; write once they settle
      r.save = () => { r.save = null; saveShow(userId, JSON.stringify(r.show)) }
      r.saveTimer = setTimeout(r.save, 1000)
    }
    if (m.event === 'rundown:show' || m.event === 'rundown:clock') others(s => s.send(raw.toString()))
  })
  ws.on('close', () => {
    r.sockets.delete(ws)
    if (r.leader === ws) r.leader = [...r.sockets].find(s => s.role === 'director') ?? null
  })
}

// docker stop / redeploys send SIGTERM: write rundown edits still waiting on their save timer first
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => {
  for (const r of rooms.values()) { clearTimeout(r.saveTimer); r.save?.() }
  process.exit(0)
})

server.listen(PORT, () => console.log(`Rundown ${dev ? 'dev server' : 'server'} on http://localhost:${PORT}`))
