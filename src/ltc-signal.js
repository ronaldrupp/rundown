// test signal for src/timecode.test.js and server/chase.test.js
// LTC as a playback deck sends it: 80 bits per frame, biphase mark, LSB first per field
export function ltcSignal(sampleRate, fps, start, frames) {
  const out = [], spb = sampleRate / fps / 80
  let level = 0.5, pos = 0
  for (let k = 0; k < frames; k++) {
    const n = start + k, f = n % fps, s = Math.floor(n / fps) % 60, m = Math.floor(n / fps / 60) % 60, h = Math.floor(n / fps / 3600)
    const bits = new Array(80).fill(0)
    const put = (from, len, v) => { for (let i = 0; i < len; i++) bits[from + i] = (v >> i) & 1 }
    put(0, 4, f % 10); put(8, 2, Math.floor(f / 10)); put(16, 4, s % 10); put(24, 3, Math.floor(s / 10))
    put(32, 4, m % 10); put(40, 3, Math.floor(m / 10)); put(48, 4, h % 10); put(56, 2, Math.floor(h / 10))
    ;[0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 1].forEach((b, i) => (bits[64 + i] = b))
    for (const b of bits) {
      level = -level
      const end = pos + spb
      for (; out.length < end - spb / 2; ) out.push(level)
      if (b) level = -level
      for (; out.length < end; ) out.push(level)
      pos = end
    }
  }
  return Float32Array.from(out)
}
