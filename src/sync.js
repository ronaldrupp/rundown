import { watch } from 'vue'
import { show, clock } from './store'

// LAN sync over Vite's dev-server websocket: the director window publishes the rundown and clock,
// camera operator views follow. shortcut: dev-server only, last writer wins; a real show needs its own sync server
const hot = import.meta.hot
const plain = o => JSON.parse(JSON.stringify(o))

export function publish() {
  if (!hot) return
  const sendShow = () => hot.send('rundown:show', plain(show))
  watch(show, sendShow, { deep: true })
  hot.on('rundown:hello', sendShow) // a camera view just connected
  setInterval(() => hot.send('rundown:clock', { now: clock.now, playing: clock.playing }), 100)
}

export function follow() {
  if (!hot) return
  hot.on('rundown:show', s => Object.assign(show, s))
  hot.on('rundown:clock', c => Object.assign(clock, c))
  hot.send('rundown:hello')
}
