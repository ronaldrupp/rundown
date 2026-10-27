import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import WebSocket from 'ws'
import { ltcSignal } from '../src/ltc-signal.js'

// the server reads house timecode and sends it to camera views: LTC through ffmpeg from a file, MTC from a virtual MIDI port
async function chasing(port, env, during) {
  const data = mkdtempSync(join(tmpdir(), 'rundown-chase-'))
  const server = spawn('node', ['server/index.js', '--dev'], { env: { ...process.env, PORT: port, DATA_DIR: data, ...env }, stdio: 'ignore' })
  try {
    const base = `http://localhost:${port}`
    for (let i = 0; i < 50; i++) { try { await fetch(base + '/api/me'); break } catch { await new Promise(r => setTimeout(r, 100)) } }
    const r = await fetch(base + '/api/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'd@test.localhost', password: 'testpass-123' }) })
    const ws = new WebSocket(`ws://localhost:${port}/ws?code=${(await r.json()).code}`)
    const got = []
    ws.on('message', m => { m = JSON.parse(m); if (m.event === 'rundown:tc') got.push(m.data) })
    await new Promise(r => ws.on('open', r))
    await during(got, data)
    ws.close()
  } finally { server.kill(); rmSync(data, { recursive: true }) }
}
const wait = ms => new Promise(r => setTimeout(r, ms))

test('LTC through ffmpeg reaches camera views', async t => {
  const dir = mkdtempSync(join(tmpdir(), 'rundown-ltc-'))
  const file = join(dir, 'ltc.f32')
  writeFileSync(file, ltcSignal(48000, 25, 10 * 3600 * 25, 200)) // 8 s from 10:00:00:00, longer than the test runs
  // -re reads the file in real time, like a live input
  await chasing(5198, { CHASE: 'ltc', CHASE_INPUT: `-re -f f32le -ar 48000 -ac 1 -i ${file}` }, async got => {
    await wait(2500)
    assert.equal(got[0].src, 'ltc') // said right after connecting, with the last frame if there is one
    const last = got.at(-1)
    assert.ok(got.length > 30, `${got.length} frames`)
    assert.equal(last.running, true)
    assert.equal(last.fps, 25)
    // ffmpeg started with the server, a few seconds ago
    const playing = last.t - 10 * 3600
    assert.ok(playing > 1 && playing < 8, `${playing} s in`)
    // frames keep time: their timecode advances as fast as their server timestamps
    const a = got.at(-20), b = got.at(-1)
    assert.ok(Math.abs((b.t - a.t) - (b.at - a.at) / 1000) < 0.05, `${b.t - a.t} s of timecode in ${(b.at - a.at) / 1000} s`)
    assert.ok(Math.abs(Date.now() - last.at) < 1000)
  })
  rmSync(dir, { recursive: true })
})

test('MTC from a MIDI port reaches camera views', async t => {
  let midi
  try { const m = await import('@julusian/midi'); midi = m.default ?? m } catch { return t.skip('@julusian/midi not installed') }
  const out = new midi.Output()
  try { out.openVirtualPort('rundown-test-mtc') } catch { return t.skip('no virtual MIDI ports on this system') }
  await chasing(5197, { CHASE: 'mtc', CHASE_INPUT: 'rundown-test-mtc' }, async got => {
    await wait(1500) // the server opens the port
    out.sendMessage([0xf0, 0x7f, 0x7f, 0x01, 0x01, (1 << 5) | 1, 2, 3, 4, 0xf7]) // locate 01:02:03:04 at 25 fps
    const [f, s, m, h] = [10, 3, 2, 1]
    ;[f & 15, f >> 4, s & 15, s >> 4, m & 15, m >> 4, h & 15, (h >> 4) | (1 << 1)].forEach((v, p) => out.sendMessage([0xf1, (p << 4) | v]))
    await wait(300)
    assert.deepEqual(got.slice(1).map(({ tc, running }) => [tc, running]), [['01:02:03:04', false], ['01:02:03:12', true]])
  })
  out.closePort()
})

test('the MTC generator speaks what the chase parser reads', async () => {
  const { quarterFrame, fullFrame } = await import('./mtc.js')
  const { mtcParser, frame } = await import('../src/timecode.js')
  const got = []
  const parse = mtcParser(f => got.push(frame(f)))
  const n = (20 * 3600 + 59 * 60 + 59) * 25 + 22 // 20:59:59:22, the next 2 frames roll over the hour
  parse(fullFrame(n))
  for (let p = 0; p < 8; p++) parse(quarterFrame(n, p))
  assert.deepEqual(got.map(({ tc, running, fps }) => [tc, running, fps]), [['20:59:59:22', false, 25], ['20:59:59:24', true, 25]])
})

test('MTC generator transport plays, pauses and locates', async () => {
  const { transport, frames } = await import('./mtc.js')
  const { mtcParser, frame } = await import('../src/timecode.js')
  let ms = 0
  const got = []
  const t = transport(frames('00:00:10:00'), mtcParser(f => got.push(frame(f).tc)), () => ms)
  t.play()
  ms = 1000; t.tick()
  assert.deepEqual(t.state(), { tc: '00:00:11:00', running: true, start: '00:00:10:00' })
  assert.equal(got.at(-1), '00:00:10:24') // last full set of quarter frames, a frame behind the clock
  t.pause(); ms = 5000; t.tick()
  assert.equal(t.state().tc, '00:00:11:00')
  assert.equal(got.at(-1), '00:00:11:00') // the pause locates receivers
  t.jump(-20)
  assert.equal(t.state().tc, '23:59:51:00') // wraps around midnight
  assert.equal(frames('00:00:00:25'), null)
})

test('MTC chase finds the port again after the generator restarts', async t => {
  let midi
  try { const m = await import('@julusian/midi'); midi = m.default ?? m } catch { return t.skip('@julusian/midi not installed') }
  const first = new midi.Output()
  try { first.openVirtualPort('rundown-test-mtc-2') } catch { return t.skip('no virtual MIDI ports on this system') }
  await chasing(5196, { CHASE: 'mtc', CHASE_INPUT: 'rundown-test-mtc-2' }, async got => {
    await wait(1500) // the server opens the port
    first.closePort()
    const again = new midi.Output()
    again.openVirtualPort('rundown-test-mtc-2')
    await wait(3500) // silent for over 2 s, so the server reopens it
    again.sendMessage([0xf0, 0x7f, 0x7f, 0x01, 0x01, (1 << 5) | 1, 2, 3, 4, 0xf7])
    await wait(300)
    assert.equal(got.at(-1)?.tc, '01:02:03:04')
    again.closePort()
  })
})
