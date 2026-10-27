import { spawn } from 'node:child_process'
import { ltcDecoder, mtcParser, frame } from '../src/timecode.js'

// House timecode read on the show machine (CHASE=ltc or mtc), so the show clock doesn't depend on a browser tab
// staying in front. onFrame gets { t: seconds incl. hours, at: Date.now() of that moment, running, fps, tc }
const SR = 48000

// LTC: ffmpeg captures the audio input as raw float samples. input: ffmpeg's input arguments,
// by default the first audio input (`-f avfoundation -i :0` on a Mac, `-f alsa -i default` on Linux)
// shortcut: ffmpeg's own capture buffering (a few ms) isn't subtracted; calibrate if cameras see cuts late
function ltc(onFrame, input = process.platform === 'darwin' ? '-f avfoundation -i :0' : '-f alsa -i default') {
  let missing = false
  const start = () => {
    const ff = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', ...input.split(' '), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'])
    let rest = Buffer.alloc(0), after = 0
    const decode = ltcDecoder(SR, fr => onFrame({ ...frame(fr), at: Date.now() - (after / SR) * 1000 }))
    ff.stdout.on('data', d => {
      const buf = Buffer.concat([rest, d]), n = buf.length >> 2
      rest = buf.subarray(n * 4)
      const s = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + n * 4))
      // in 10 ms slices, so a frame's time allows for the samples that came after it in this chunk
      for (let i = 0; i < n; i += SR / 100) { after = Math.max(0, n - i - SR / 100); decode(s.subarray(i, i + SR / 100)) }
    })
    ff.stderr.on('data', d => console.error(`chase ltc: ${String(d).trim()}`))
    ff.on('error', e => { missing = true; console.error(`chase ltc: ffmpeg not available (${e.message})`) })
    ff.on('close', () => missing || setTimeout(start, 2000)) // input unplugged or busy: try again
  }
  start()
}

// MTC: a MIDI input through the optional @julusian/midi package. name: part of the port's name, any port by default
async function mtc(onFrame, name) {
  let m
  try { m = await import('@julusian/midi') } catch { return console.error('chase mtc: run `npm install @julusian/midi` first') }
  const parse = mtcParser(fr => onFrame({ ...frame(fr), at: Date.now() }))
  let input = null, last = 0, opened = ''
  const open = () => {
    // a fresh Input each time: reopening the same one after its port went away receives nothing
    const probe = new (m.default ?? m).Input()
    const i = [...Array(probe.getPortCount()).keys()].find(i => !name || probe.getPortName(i).includes(name))
    if (i === undefined) { probe.destroy?.(); return setTimeout(open, 2000) } // wait for it to be plugged in
    input = probe
    input.on('message', (_, data) => { last = Date.now(); parse(data) })
    input.openPort(i)
    input.ignoreTypes(false, false, true) // keep SysEx (full-frame locates) and timing (quarter frames)
    last = Date.now()
    if (input.getPortName(i) !== opened) console.log(`chase mtc: ${(opened = input.getPortName(i))}`)
  }
  open()
  // a port that went away (interface unplugged, generator restarted under the same name) just goes quiet, so reopen
  // after 2 s of silence; nothing is lost, since a house that sends nothing is stopped anyway
  setInterval(() => { if (input && Date.now() - last > 2000) { input.closePort(); input.destroy?.(); input = null; open() } }, 1000)
}

export function startChase(kind, input, onFrame) {
  if (kind === 'ltc') ltc(onFrame, input)
  else if (kind === 'mtc') mtc(onFrame, input)
  else console.error('CHASE must be ltc or mtc')
}
