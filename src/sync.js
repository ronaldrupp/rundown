import { reactive, watch, watchEffect } from 'vue'
import { show, clock, live, audio, remote, play, pause, seek, loadMedia, openShow, chased } from './store'
import { heard } from './chase'
import { openItem, reloadLibrary, mirror, windowId } from './library'

// Sync over server/index.js: the logged-in director window publishes the rundown and clock,
// camera operator views (joined with the director's code) follow it.
const plain = o => JSON.parse(JSON.stringify(o))
const me = Math.random().toString(36).slice(2, 10) // identifies this window's messages
// last: when a follower last heard its director (performance.now ms); denied: the server refused the join code or login
// active: this director window drives the show (null until the server says); taking: Take over is loading the media
export const link = reactive({ last: 0, denied: false, active: null, taking: false })

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
  // house timecode read by the server: it says so right after connecting, then sends every frame
  on('open', () => (clock.server = ''))
  on('rundown:tc', m => {
    clock.server = m.src
    if (m.at) heard(m, performance.now() - (serverNow() - m.at))
  })
  setInterval(() => send('ping', { t: Date.now() }), 2000)
  on('open', () => send('ping', { t: Date.now() }))
  open()
  return { on, send }
}

// glide toward the leader's time while playing; jump on seeks. Wi-Fi delivers late, never early,
// so catch up fast but back off slowly, or every delayed burst yanks the clock back
function followClock(c, to = clock, duration = show.duration) {
  to.playing = c.playing
  const now = c.playing && c.at ? Math.min(c.now + Math.max(0, serverNow() - c.at) / 1000, duration) : c.now
  const drift = now - to.now
  to.now = c.playing && Math.abs(drift) < 0.5 ? to.now + drift * (drift > 0 ? 0.5 : 0.05) : now
}

// director window, Spotify Connect style: the server makes one window active. It publishes the rundown and clock;
// the others show it in their player bar and either mirror it or work on another performance (saved on its own),
// and send their transport to it, until someone presses Take over.
export function publish() {
  hot = connect('')
  remote.send = m => hot.send('rundown:control', m)
  watchEffect(() => (clock.alone = link.active === false && !clock.following))
  const sendShow = () => link.active && hot.send('rundown:show', { id: me, show: plain(show) })
  watch(show, () => (link.active ? sendShow() : link.active === false && !clock.following && hot.send('rundown:save', { show: plain(show) })), { deep: true })
  hot.on('open', () => hot.send('rundown:hello')) // the live rundown for the player bar, before anything changes
  hot.on('rundown:leader', async ({ you }) => {
    if (you === link.active) return
    const own = link.active === false && !clock.following
    link.active = you
    if (!you) { clock.following = true; return audio.pause() }
    // carry on where the other window was (Take over has loaded the media already; a window promoted
    // because the active one closed loads it now, and drops the performance it was working on alone)
    const { now, playing } = own ? live : clock
    clock.following = false
    if (own && live.show) await openShow(live.show)
    sendShow()
    reloadLibrary()
    if (staleMedia()) await loadMedia()
    seek(now)
    if (playing) play()
  })
  hot.on('rundown:show', m => {
    if (link.active) return
    live.show = m.show
    if (clock.following) Object.assign(show, m.show)
    // shortcut: the active window opened the performance this one edits; it wins, edits from the last second may be lost
    else if (link.active === false && m.show.item === show.item) mirror()
  })
  hot.on('rundown:clock', c => {
    if (link.active) return
    followClock(c, live, live.show?.duration ?? show.duration)
    if (clock.following && !clock.server) followClock(c)
  })
  hot.on('rundown:library', m => m?.from !== windowId && reloadLibrary())
  // transport from a mirroring window or a remote (the iPad app's director mode); the server only relays it from logged-in ones
  hot.on('rundown:control', m => {
    if (m?.cmd === 'play') play()
    else if (m?.cmd === 'pause') pause()
    else if (m?.cmd === 'seek' && Number.isFinite(m.t)) seek(m.t)
    else if (m?.cmd === 'open' && typeof m.item?.id === 'string') openItem(m.item)
  })
  // read the media clock directly: rAF (and so clock.now) stops while this window is in the background
  // at: when `now` was read, in server time, so followers can add the network delay
  setInterval(() => link.active && hot.send('rundown:clock', { id: me, now: audio.src && !chased() ? audio.currentTime : clock.now, playing: clock.playing, at: serverNow() }), 100)
}

// load this window's copy of the video first, so playback moves over without a gap
const staleMedia = () => show.media && clock.audioName !== show.media.title
export async function takeOver() {
  link.taking = true
  if (!clock.following && live.show) await mirror() // take over the live performance, not the one this window works on
  if (staleMedia()) await loadMedia()
  link.taking = false
  hot.send('rundown:takeover')
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
    leaderPlaying = c.playing
    if (!clock.server) followClock(c)
  })
  hot.on('open', () => hot.send('rundown:hello'))
}
