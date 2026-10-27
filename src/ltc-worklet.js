import { ltcDecoder } from './timecode.js'

// decodes LTC off the audio thread; chase.js loads it with ?worker&url so Vite bundles the import
registerProcessor('ltc', class extends AudioWorkletProcessor {
  constructor() {
    super()
    this.decode = ltcDecoder(sampleRate, f => this.port.postMessage(f))
  }
  process([input]) {
    if (input[0]) this.decode(input[0])
    return true
  }
})
