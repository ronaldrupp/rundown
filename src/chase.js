import { reactive, watch } from 'vue'
import { clock, ext, pause } from './store'
import { mtcParser, seconds } from './timecode'
import workletUrl from './ltc-worklet.js?worker&url'

// Chase house timecode: the show clock follows MTC (Web MIDI) or LTC (an audio input) instead of the media (store.js chaseClock).
let saved = {}
try { saved = JSON.parse(localStorage.getItem('chase')) ?? {} } catch {}
export const chase = reactive({ src: 'off', input: '', ...saved, inputs: [], status: 'off', tc: '', fps: 0 })
watch(() => ({ src: chase.src, input: chase.input }), v => { try { localStorage.setItem('chase', JSON.stringify(v)) } catch {} })

const p = n => String(n).padStart(2, '0')
function heard(fr) {
  Object.assign(ext, { t: seconds(fr), at: performance.now(), running: fr.running })
  chase.tc = `${p(fr.h)}:${p(fr.m)}:${p(fr.s)}:${p(fr.f % fr.fps)}`
  chase.fps = fr.fps
}

let stop = () => {}
// back to this window's own transport, stopped (a mirroring window's pause would go to the active one)
function release() {
  stop()
  stop = () => {}
  clock.chasing = false
  if (!clock.following) pause()
}
export async function connect() {
  release()
  ext.at = -1e9
  clock.chasing = chase.src !== 'off'
  chase.status = clock.chasing ? 'connecting' : 'off'
  try {
    if (chase.src === 'mtc') {
      if (!navigator.requestMIDIAccess) throw new Error('Web MIDI needs Chrome, Edge or Firefox')
      // full-frame locates are SysEx; without that permission quarter frames still work
      const midi = await navigator.requestMIDIAccess({ sysex: true }).catch(() => navigator.requestMIDIAccess())
      const parse = mtcParser(heard)
      const bind = () => {
        chase.inputs = [...midi.inputs.values()].map(i => ({ id: i.id, name: i.name }))
        for (const i of midi.inputs.values()) i.onmidimessage = !chase.input || i.id === chase.input ? e => parse(e.data) : null
      }
      bind()
      midi.onstatechange = bind // interfaces plugged in later
      stop = () => { midi.onstatechange = null; for (const i of midi.inputs.values()) i.onmidimessage = null }
    } else if (chase.src === 'ltc') {
      // processing off: echo cancelling and gain control would mangle the square wave
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: chase.input || undefined, echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
      const ctx = new AudioContext()
      stop = () => { stream.getTracks().forEach(t => t.stop()); ctx.close() }
      chase.inputs = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput').map(d => ({ id: d.deviceId, name: d.label || 'Audio input' }))
      await ctx.audioWorklet.addModule(workletUrl)
      const node = new AudioWorkletNode(ctx, 'ltc')
      node.port.onmessage = e => heard(e.data)
      ctx.createMediaStreamSource(stream).connect(node).connect(ctx.destination) // outputs silence; connected so it gets processed
      await ctx.resume()
      if (ctx.state !== 'running') throw new Error('click Connect to start the audio input')
    }
    if (clock.chasing) chase.status = 'listening'
  } catch (e) {
    release()
    chase.status = `error: ${e.message}`
  }
}

// pick up the source chosen last time (the browser may ask for MIDI or microphone access again)
if (chase.src !== 'off') connect()
