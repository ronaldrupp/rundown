import { reactive, watch } from 'vue'
import { show, clock, audio, play, pause, seek } from './store'

// LAN sync over Vite's dev-server websocket: director windows publish the rundown and clock,
// camera operator views follow exactly one of them. shortcut: dev-server only; a real show needs its own sync server
const hot = import.meta.hot
const plain = o => JSON.parse(JSON.stringify(o))
const me = Math.random().toString(36).slice(2, 10) // identifies this window's messages
// last: when a follower last heard its director; others: when a director last heard another director (performance.now ms)
export const link = reactive({ last: 0, others: 0 })

export function publish() {
  if (!hot) return
  const sendShow = () => hot.send('rundown:show', { id: me, show: plain(show) })
  watch(show, sendShow, { deep: true })
  hot.on('rundown:hello', sendShow) // a camera view just connected or picked a director
  hot.on('rundown:clock', c => { if (c.id !== me) link.others = performance.now() })
  // transport from a remote (the iPad app's director mode); anyone on the LAN can send this, like the rest of the sync
  hot.on('rundown:control', m => {
    if (m?.cmd === 'play') play()
    else if (m?.cmd === 'pause') pause()
    else if (m?.cmd === 'seek' && Number.isFinite(m.t)) seek(m.t)
  })
  // read the media clock directly: rAF (and so clock.now) stops while this window is in the background
  setInterval(() => hot.send('rundown:clock', { id: me, now: audio.src ? audio.currentTime : clock.now, playing: clock.playing }), 100)
}

export function follow() {
  if (!hot) return
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
    // glide toward the director's time while playing instead of snapping back every 100ms; jump on seeks
    const drift = c.now - clock.now
    clock.now = c.playing && Math.abs(drift) < 0.25 ? clock.now + drift * 0.3 : c.now
  })
  hot.send('rundown:hello')
}
