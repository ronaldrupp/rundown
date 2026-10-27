// House timecode decoders, pure so the LTC worklet and `npm test` share them. Both report { h, m, s, f, fps, running }.
// shortcut: forward only (no reverse LTC or MTC) and 29.97 drop-frame reads as 30 fps; add both if a show needs them

const SYNC = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1] // LTC bits 64-79
const RATES = [24, 25, 30]
const nearest = x => RATES.reduce((a, f) => (Math.abs(f - x) < Math.abs(a - x) ? f : a))

// LTC: biphase-mark audio. Every bit starts with a level change, a 1 has another one halfway through
export function ltcDecoder(sampleRate, onFrame) {
  let T = sampleRate / 2000 // samples per bit; starts at 25 fps, adapts to 24-30
  let level = 0, since = 0, half = 0
  const bits = []
  const field = (from, n) => bits.slice(from, from + n).reduce((v, b, i) => v | (b << i), 0)
  function bit(b) {
    bits.push(b)
    if (bits.length > 80) bits.shift()
    if (bits.length < 80 || SYNC.some((s, i) => bits[64 + i] !== s)) return
    // its last bit only shows at the next level change, when the following frame starts: 1 frame later now
    onFrame({ h: field(48, 4) + 10 * field(56, 2), m: field(32, 4) + 10 * field(40, 3), s: field(16, 4) + 10 * field(24, 3),
      f: field(0, 4) + 10 * field(8, 2) + 1, fps: nearest(sampleRate / T / 80), running: true })
    bits.length = 0
  }
  return samples => {
    for (const x of samples) {
      since++
      const l = x > 0.02 ? 1 : x < -0.02 ? -1 : level // hysteresis: noise around zero isn't a level change
      if (l === level) continue
      level = l
      const n = since
      since = 0
      if (n > T * 0.75) { // a whole bit: 0
        if (n < T * 1.5) T += (n - T) * 0.1 // not after silence
        half = 0
        bit(0)
      } else if (half) { T += (half + n - T) * 0.1; half = 0; bit(1) }
      else half = n
    }
  }
}

// MTC: 8 quarter-frame messages (F1) per 2 frames while rolling, a full-frame SysEx when the house locates
export function mtcParser(onFrame) {
  const q = new Array(8).fill(0)
  const fps = r => [24, 25, 30, 30][r]
  return data => {
    if (data[0] === 0xf1) {
      const p = data[1] >> 4
      q[p] = data[1] & 15
      // the 8 pieces describe the frame when piece 0 went out, 2 frames ago
      if (p === 7) onFrame({ h: q[6] | ((q[7] & 1) << 4), m: q[4] | (q[5] << 4), s: q[2] | (q[3] << 4), f: (q[0] | (q[1] << 4)) + 2, fps: fps(q[7] >> 1), running: true })
    } else if (data[0] === 0xf0 && data[1] === 0x7f && data[3] === 1 && data[4] === 1) {
      onFrame({ h: data[5] & 31, m: data[6], s: data[7], f: data[8], fps: fps((data[5] >> 5) & 3), running: false })
    }
  }
}

export const seconds = ({ h, m, s, f, fps }) => h * 3600 + m * 60 + s + f / fps
// what the clock needs from a frame, the same from the browser's and the server's chase
const p = n => String(n).padStart(2, '0')
export const frame = fr => ({ t: seconds(fr), running: fr.running, fps: fr.fps, tc: `${p(fr.h)}:${p(fr.m)}:${p(fr.s)}:${p(fr.f % fr.fps)}` })
