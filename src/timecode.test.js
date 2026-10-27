import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ltcDecoder, mtcParser } from './timecode.js'
import { ltcSignal } from './ltc-signal.js'

for (const [sr, fps] of [[48000, 25], [44100, 30], [48000, 24]]) {
  test(`LTC ${fps} fps at ${sr} Hz decodes`, () => {
    const got = []
    const decode = ltcDecoder(sr, f => got.push(f))
    const start = ((20 * 60 + 1) * 60 + 31) * fps + 19 // 20:01:31:19
    decode(ltcSignal(sr, fps, start, 10))
    assert.ok(got.length >= 8) // the first frame or two go to finding the bit rate and the sync word
    const last = got.at(-1)
    // the 10th frame's last bit never ends (the signal stops), so start + 8 is the last one read, reported 1 frame later
    assert.equal(((last.h * 60 + last.m) * 60 + last.s) * fps + last.f, start + 9)
    assert.equal(last.fps, fps)
  })
}

test('MTC quarter frames and full frame', () => {
  const got = []
  const parse = mtcParser(f => got.push(f))
  // 01:02:03:04 at 25 fps (rate 1)
  const [h, m, s, f, r] = [1, 2, 3, 4, 1]
  const pieces = [f & 15, f >> 4, s & 15, s >> 4, m & 15, m >> 4, h & 15, (h >> 4) | (r << 1)]
  pieces.forEach((v, p) => parse([0xf1, (p << 4) | v]))
  assert.deepEqual(got[0], { h: 1, m: 2, s: 3, f: 6, fps: 25, running: true })
  parse([0xf0, 0x7f, 0x7f, 0x01, 0x01, (3 << 5) | 10, 20, 30, 15, 0xf7])
  assert.deepEqual(got[1], { h: 10, m: 20, s: 30, f: 15, fps: 30, running: false })
})
