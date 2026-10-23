import { reactive, watch } from 'vue'
import { clock, cues, liveIdx } from './store'

// Spoken show calling like a PA: camera on air + next at each cut, "3, 2, 1" before cuts that leave room for it.
let saved = false
try { saved = localStorage.getItem('caller') === '1' } catch {}
export const caller = reactive({ on: saved })
watch(() => caller.on, v => { try { localStorage.setItem('caller', v ? '1' : '0') } catch {} if (!v) speechSynthesis.cancel() })

const COUNT = 3 // seconds counted down before a cut
const voice = () => speechSynthesis.getVoices().find(v => v.lang === 'en-US' && v.localService) ?? speechSynthesis.getVoices().find(v => v.lang.startsWith('en'))
function say(text) {
  // one voice only: whatever is still talking is cut off by the newer, more urgent call
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.voice = voice() ?? null
  u.rate = 1.25
  speechSynthesis.speak(u)
}

let lastIdx = -1, lastCount = null
watch(() => clock.now, now => {
  const idx = liveIdx.value
  if (!caller.on || !clock.playing) { lastIdx = idx; lastCount = null; return }
  const live = cues.value[idx], next = cues.value[idx + 1]
  // announce only natural progression, not seeks/jumps
  if (idx === lastIdx + 1 && live) say(next ? `${live.cam}. Next, ${next.cam}` : `${live.cam}. Last shot`)
  lastIdx = idx
  if (!next || !live) return
  const left = next.start - now, n = Math.ceil(left)
  // the cut call takes ~1.5s, so count only when the shot is long enough for both
  if (n >= 1 && n <= COUNT && next.start - live.start >= COUNT + 2 && n !== lastCount) say(String(n))
  lastCount = n <= COUNT ? n : null
})
