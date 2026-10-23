import { reactive, watch } from 'vue'
import { show, clock, audio } from './store'

// LAN sync over Vite's dev-server websocket: the director window publishes the rundown and clock,
// camera operator views follow. shortcut: dev-server only, last writer wins; a real show needs its own sync server
const hot = import.meta.hot
const plain = o => JSON.parse(JSON.stringify(o))
export const link = reactive({ last: 0 }) // when a follower last heard the director (performance.now ms)

export function publish() {
  if (!hot) return
  const sendShow = () => hot.send('rundown:show', plain(show))
  watch(show, sendShow, { deep: true })
  hot.on('rundown:hello', sendShow) // a camera view just connected
  // read the media clock directly: rAF (and so clock.now) stops while this window is in the background
  setInterval(() => hot.send('rundown:clock', { now: audio.src ? audio.currentTime : clock.now, playing: clock.playing }), 100)
}

export function follow() {
  if (!hot) return
  hot.on('rundown:show', s => Object.assign(show, s))
  hot.on('rundown:clock', c => {
    link.last = performance.now()
    clock.playing = c.playing
    // glide toward the director's time while playing instead of snapping back every 100ms; jump on seeks
    const drift = c.now - clock.now
    clock.now = c.playing && Math.abs(drift) < 0.25 ? clock.now + drift * 0.3 : c.now
  })
  hot.send('rundown:hello')
}
