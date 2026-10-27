import { reactive, watch } from 'vue'
import { show, clock, cues, liveIdx } from './store'

// Sends the planned cuts to a vision mixer while playing: OBS (WebSocket v5) or vMix (HTTP API), and reads back
// which camera the mixer has on program (tally). send off: listen only, e.g. to record a vision mixer's rehearsal (rehearsal.js).
let saved = {}
try { saved = JSON.parse(localStorage.getItem('switcher')) ?? {} } catch {}
// tally: the camera on the mixer's program, null when unknown or not one of ours
export const sw = reactive({ kind: 'off', obsUrl: 'ws://localhost:4455', vmixUrl: 'http://localhost:8088', preview: true, send: true, map: {}, ...saved, password: '', status: 'off', tally: null })
// the OBS password stays in memory only
watch(() => ({ kind: sw.kind, obsUrl: sw.obsUrl, vmixUrl: sw.vmixUrl, preview: sw.preview, send: sw.send, map: sw.map }),
  v => { try { localStorage.setItem('switcher', JSON.stringify(v)) } catch {} }, { deep: true })

// OBS scene name or vMix input (number or name) for a camera
export const target = cam => sw.map[cam] || `CAM ${cam}`
const camFor = name => show.cams.find(c => String(target(c.id)) === String(name))?.id ?? null

let ws = null, reqId = 0, sentCam = null, sentNext = null
const b64sha256 = async s => btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)))))

export function connect() {
  ws?.close(); ws = null
  sw.tally = null
  vmixPoll++
  if (sw.kind === 'vmix') { sw.status = 'ready'; return pollVmix(vmixPoll) }
  if (sw.kind !== 'obs') return (sw.status = 'off')
  sw.status = 'connecting'
  let sock
  try { sock = ws = new WebSocket(sw.obsUrl) } catch (e) { return (sw.status = `error: ${e.message}`) }
  sock.onmessage = async e => {
    const m = JSON.parse(e.data)
    if (m.op === 0) { // Hello: answer with Identify, solving the auth challenge if OBS asks for one
      const a = m.d.authentication
      const authentication = a && (await b64sha256((await b64sha256(sw.password + a.salt)) + a.challenge))
      // subscribe to scene events (bit 2) to re-arm preview after OBS swaps scenes
      sock.send(JSON.stringify({ op: 1, d: { rpcVersion: 1, eventSubscriptions: 4, ...(a && { authentication }) } }))
    } else if (m.op === 2) {
      sw.status = 'connected'
      obs('SetCurrentSceneTransition', { transitionName: 'Cut' }) // planned cuts are hard cuts, not fades
      sentCam = sentNext = null
      obs('GetCurrentProgramScene')
      sendState()
    } else if (m.op === 5 && m.d.eventType === 'CurrentProgramSceneChanged') {
      sw.tally = camFor(m.d.eventData.sceneName)
      // in Studio Mode OBS moves the old program into preview after each cut; put the next shot back.
      // only while playing, so a paused window doesn't fight the director that is running the show
      if (clock.playing && sw.preview && sentNext != null) preview(sentNext)
    }
    else if (m.op === 7 && !m.d.requestStatus.result) sw.status = `error: ${m.d.requestStatus.comment}`
    else if (m.op === 7 && m.d.requestType === 'GetCurrentProgramScene') sw.tally = camFor(m.d.responseData.sceneName ?? m.d.responseData.currentProgramSceneName)
  }
  sock.onclose = e => { if (ws !== sock) return; sw.tally = null; sw.status = e.code === 4009 ? 'error: wrong password' : 'disconnected' }
}

function obs(requestType, requestData) {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 6, d: { requestType, requestId: String(++reqId), requestData } }))
}
// vMix sends no CORS headers, so calls are fire-and-forget
// vMix tally: the server reads vMix's XML state for us (server/index.js, /api/vmix), 4 times a second
let vmixPoll = 0
async function pollVmix(id) {
  try {
    const r = await fetch(`/api/vmix?url=${encodeURIComponent(sw.vmixUrl)}`), j = await r.json()
    if (id !== vmixPoll) return
    if (!r.ok) throw new Error(j.error)
    sw.tally = camFor(j.number) ?? camFor(j.title)
    sw.status = 'connected'
  } catch (e) { if (id === vmixPoll) { sw.tally = null; sw.status = `error: ${e.message}` } }
  if (id === vmixPoll) setTimeout(() => pollVmix(id), 250)
}
const vmix = (fn, input) => fetch(`${sw.vmixUrl}/api/?Function=${fn}&Input=${encodeURIComponent(input)}`, { mode: 'no-cors' }).catch(() => (sw.status = 'error: vMix unreachable'))

export function take(cam) { sw.kind === 'obs' ? obs('SetCurrentProgramScene', { sceneName: target(cam) }) : sw.kind === 'vmix' && vmix('CutDirect', target(cam)) }
function preview(cam) { sw.kind === 'obs' ? obs('SetCurrentPreviewScene', { sceneName: target(cam) }) : sw.kind === 'vmix' && vmix('PreviewInput', target(cam)) }

// program cuts only during playback (resynced on the next play after a pause);
// the next shot sits in preview all the time, also while paused or scrubbing
function sendState() {
  if (sw.kind === 'off' || !sw.send) return (sentCam = sentNext = null)
  const live = cues.value[liveIdx.value], next = cues.value[liveIdx.value + 1]
  if (!clock.playing) sentCam = null
  else if (live && live.cam !== sentCam) take((sentCam = live.cam))
  if (!sw.preview) return (sentNext = null)
  // OBS only has a preview in Studio Mode
  if (sentNext == null && sw.kind === 'obs') obs('SetStudioModeEnabled', { studioModeEnabled: true })
  if (next && next.cam !== sentNext) preview((sentNext = next.cam))
}
watch(() => [liveIdx.value, clock.playing, sw.kind, sw.preview, sw.send], sendState)

// reconnect to the mixer chosen last time (an OBS password has to be entered again)
if (sw.kind !== 'off') connect()
