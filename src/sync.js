import { reactive, watch } from 'vue'
import { show, clock, audio, play, pause, seek } from './store'

// Sync over server/index.js: the logged-in director window publishes the rundown and clock,
// camera operator views (joined with the director's code) follow it.
const plain = o => JSON.parse(JSON.stringify(o))
const me = Math.random().toString(36).slice(2, 10) // identifies this window's messages
// last: when a follower last heard its director; others: when a director last heard another director (performance.now ms)
// denied: the server refused the join code or login
export const link = reactive({ last: 0, others: 0, denied: false })

// server time minus local time, from the fastest ping round trip seen on this connection
let offset = 0
const serverNow = () => Date.now() + offset
let hot

// one websocket with the on/send shape of Vite's import.meta.hot, which this used to run on; reconnects every second
function connect(query) {
  const handlers = {}
  const on = (ev, fn) => (handlers[ev] ??= []).push(fn)
  let ws, best = Infinity
  const open = () => {
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws${query}`)
    best = Infinity
    ws.onopen = () => handlers.open?.forEach(fn => fn())
    ws.onmessage = e => { const m = JSON.parse(e.data); handlers[m.event]?.forEach(fn => fn(m.data)) }
    ws.onclose = e => (e.code === 4001 ? (link.denied = true) : setTimeout(open, 1000))
  }
  on('pong', p => {
    const rtt = Date.now() - p.t
    if (rtt < best) { best = rtt; offset = p.s + rtt / 2 - Date.now() }
  })
  const send = (event, data) => ws.readyState === 1 && ws.send(JSON.stringify({ event, data }))
  setInterval(() => send('ping', { t: Date.now() }), 2000)
  on('open', () => send('ping', { t: Date.now() }))
  open()
  return { on, send }
}

export function publish() {
  hot = connect('')
  const sendShow = () => hot.send('rundown:show', { id: me, show: plain(show) })
  watch(show, sendShow, { deep: true })
  hot.on('open', sendShow) // the server keeps the rundown for camera views that join later
  hot.on('rundown:clock', c => { if (c.id !== me) link.others = performance.now() })
  // transport from a remote (the iPad app's director mode); the server only relays it from logged-in remotes
  hot.on('rundown:control', m => {
    if (m?.cmd === 'play') play()
    else if (m?.cmd === 'pause') pause()
    else if (m?.cmd === 'seek' && Number.isFinite(m.t)) seek(m.t)
  })
  // read the media clock directly: rAF (and so clock.now) stops while this window is in the background
  // at: when `now` was read, in server time, so followers can add the network delay
  setInterval(() => hot.send('rundown:clock', { id: me, now: audio.src ? audio.currentTime : clock.now, playing: clock.playing, at: serverNow() }), 100)
}

export function follow(code) {
  hot = connect(`?code=${encodeURIComponent(code)}`)
  let leader = null, leaderPlaying = false
  hot.on('rundown:show', m => { if (!leader || m.id === leader) Object.assign(show, m.show) })
  hot.on('rundown:clock', c => {
    const t = performance.now()
    // stick with one director; switch only if it went silent or a newcomer plays while it is paused
    if (c.id !== leader) {
      if (leader && t - link.last < 1500 && !(c.playing && !leaderPlaying)) return
      leader = c.id
      hot.send('rundown:hello') // ask for the rundown; only the new leader's copy is accepted
    }
    link.last = t
    leaderPlaying = clock.playing = c.playing
    // glide toward the director's time while playing; jump on seeks. Wi-Fi delivers late, never early,
    // so catch up fast but back off slowly, or every delayed burst yanks the clock back
    const now = c.playing && c.at ? Math.min(c.now + Math.max(0, serverNow() - c.at) / 1000, show.duration) : c.now
    const drift = now - clock.now
    clock.now = c.playing && Math.abs(drift) < 0.5 ? clock.now + drift * (drift > 0 ? 0.5 : 0.05) : now
  })
  hot.on('open', () => hot.send('rundown:hello'))
}
