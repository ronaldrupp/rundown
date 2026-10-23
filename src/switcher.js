import { reactive, watch } from 'vue'
import { clock, cues, liveIdx } from './store'

// Sends the planned cuts to a vision mixer while playing: OBS (WebSocket v5) or vMix (HTTP API).
let saved = {}
try { saved = JSON.parse(localStorage.getItem('switcher')) ?? {} } catch {}
export const sw = reactive({ kind: 'off', obsUrl: 'ws://localhost:4455', vmixUrl: 'http://localhost:8088', preview: false, map: {}, ...saved, password: '', status: 'off' })
// the OBS password stays in memory only
watch(() => ({ kind: sw.kind, obsUrl: sw.obsUrl, vmixUrl: sw.vmixUrl, preview: sw.preview, map: sw.map }),
  v => { try { localStorage.setItem('switcher', JSON.stringify(v)) } catch {} }, { deep: true })

// OBS scene name or vMix input (number or name) for a camera
export const target = cam => sw.map[cam] || `CAM ${cam}`

let ws = null, reqId = 0
const b64sha256 = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))))

export function connect() {
  ws?.close(); ws = null
  if (sw.kind === 'vmix') return (sw.status = 'ready')
  if (sw.kind !== 'obs') return (sw.status = 'off')
  sw.status = 'connecting'
  let sock
  try { sock = ws = new WebSocket(sw.obsUrl) } catch (e) { return (sw.status = `error: ${e.message}`) }
  sock.onmessage = async e => {
    const m = JSON.parse(e.data)
    if (m.op === 0) { // Hello: answer with Identify, solving the auth challenge if OBS asks for one
      const a = m.d.authentication
      const authentication = a && (await b64sha256((await b64sha256(sw.password + a.salt)) + a.challenge))
      sock.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, ...(a && { authentication }) } }))
    } else if (m.op === 2) sw.status = 'connected'
    else if (m.op === 7 && !m.d.requestStatus.result) sw.status = `error: ${m.d.requestStatus.comment}`
  }
  sock.onclose = e => { if (ws === sock) sw.status = e.code === 4009 ? 'error: wrong password' : 'disconnected' }
}

function obs(requestType, requestData) {
  if (ws?.readyState === WebSocket.OPEN && sw.status !== 'connecting') ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: String(++reqId), requestData } }))
}
// vMix sends no CORS headers, so calls are fire-and-forget
const vmix = (fn, input) => fetch(`${sw.vmixUrl}/api/?Function=${fn}&Input=${encodeURIComponent(input)}`, { mode: 'no-cors' }).catch(() => (sw.status = 'error: vMix unreachable'))

export function take(cam) { sw.kind === 'obs' ? obs('SetCurrentProgramScene', { sceneName: target(cam) }) : sw.kind === 'vmix' && vmix('CutDirect', target(cam)) }
function preview(cam) { sw.kind === 'obs' ? obs('SetCurrentPreviewScene', { sceneName: target(cam) }) : sw.kind === 'vmix' && vmix('PreviewInput', target(cam)) }

// cut whenever the on-air camera changes during playback; resync on the next play after a pause
let sentCam = null, sentNext = null
watch(() => [liveIdx.value, clock.playing, sw.kind], () => {
  if (sw.kind === 'off' || !clock.playing) return (sentCam = sentNext = null)
  const live = cues.value[liveIdx.value], next = cues.value[liveIdx.value + 1]
  if (live && live.cam !== sentCam) take((sentCam = live.cam))
  if (sw.preview && next && next.cam !== sentNext) preview((sentNext = next.cam))
})
