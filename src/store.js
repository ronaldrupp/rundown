import { reactive, computed, watch } from 'vue'

export const FPS = 25
const COLORS = ['#ff4a12', '#3d8bfd', '#d61fd6', '#1fb74a', '#6a3df5', '#8b3fc9', '#4a5a8a', '#8a2a6a', '#e0461b', '#f2e600',
  '#19e3c4', '#9b3bf0', '#ff7a1a', '#22d65a', '#7a3a2a', '#f5c518', '#6b5a2a', '#3b3f9a', '#c03df0', '#6b3a1a']
const CAM_NAMES = ['CU LEFT', 'CU CENTER LOW', 'CU RIGHT', 'CU CENTER HIGH', 'CU 45° LEFT', 'CU 45° RIGHT', 'TOWER CAM', 'DOLLY', 'DOLLY A', 'DOLLY B',
  'STEADI A', 'STEADI B', 'CRANE LEFT', 'CRANE RIGHT', 'LINE CAM', 'HANDHELD']

const demo = {
  production: 'Live Show 2026', episode: 'FINALE', songNo: 10, title: 'Demo Song', artist: 'Demo Artist',
  media: null, bpm: 120, beatsPerBar: 4, snap: true, duration: 180, tcOffset: 7 * 3600 + 40 * 60, zoom: 80,
  cams: CAM_NAMES.map((name, i) => ({ id: i + 1, name, color: COLORS[i] })),
  cues: [[0, 7, 'TOWER WIDE OPENING'], [8, 6, 'FS > ZO GENTLY'], [16, 4, 'CENTER MS > PAN LEFT'], [20, 1, 'ECU ZOOM OUT + FLY UP ON TEMPO'],
    [28, 3, 'ECU'], [30, 6, 'STG ZI'], [32, 8, 'DOLLY RIGHT'], [40, 10, 'WIDE CHORUS']]
    .map(([start, cam, note], i) => ({ id: i + 1, start, cam, note })),
  tracks: [
    { id: 1, name: 'Lyrics 1', kind: 'lyrics', items: [[4, '(verse 1, line 1)'], [10, '(verse 1, line 2)'], [16, '(pre-chorus)'], [22, '(chorus)']] },
    { id: 2, name: 'Lighting-FX', kind: 'note', items: [[6, 'Air raid with roof rig white'], [20, 'Xbars + extra, narrow, intense dim fx'], [32, 'White tubes fast attack']] },
  ].map(t => ({ ...t, items: t.items.map(([start, text], i) => ({ id: i + 1, start, text })) })),
}

let saved = null
try { saved = JSON.parse(localStorage.getItem('rundown')) } catch {}
export const show = reactive({ ...structuredClone(demo), ...saved }) // spread keeps older saves loadable
watch(show, v => { try { localStorage.setItem('rundown', JSON.stringify(v)) } catch {} }, { deep: true })

export const clock = reactive({ now: 0, playing: false, audioName: '', peaks: null, hasVideo: false, loading: '' })

// one media element for music files and downloaded videos; the monitor mounts it
export const audio = document.createElement('video')
audio.playsInline = true
let last = performance.now()
function update() {
  const ts = performance.now()
  if (clock.playing) clock.now = audio.src ? audio.currentTime : Math.min(clock.now + (ts - last) / 1000, show.duration)
  if (clock.now >= show.duration) clock.playing = false
  last = ts
}
// rAF keeps the display smooth; the timer keeps cuts (switcher, caller, sync) going when the window is
// covered or in the background, where browsers stop rAF but keep timers running for pages playing audio
const frame = () => { update(); requestAnimationFrame(frame) }
requestAnimationFrame(frame)
setInterval(update, 20)

export function play() { clock.playing = true; if (audio.src) audio.play().catch(() => (clock.playing = false)) } // e.g. blocked without a user click
export function pause() { clock.playing = false; audio.pause() }
export const toggle = () => (clock.playing ? pause() : play())
export function seek(t) { clock.now = Math.max(0, Math.min(t, show.duration)); if (audio.src) audio.currentTime = clock.now }

let loadId = 0
export async function loadAudio(file, name = file.name) {
  const id = ++loadId
  audio.src = URL.createObjectURL(file)
  clock.audioName = name
  clock.hasVideo = file.type.startsWith('video/')
  const buf = await new AudioContext().decodeAudioData(await file.arrayBuffer())
  if (id !== loadId) return // a newer load started meanwhile; don't clobber it
  show.duration = buf.duration
  const data = buf.getChannelData(0), n = Math.ceil(buf.duration * 50), step = Math.floor(data.length / n)
  clock.peaks = Array.from({ length: n }, (_, i) => {
    let m = 0
    for (let j = i * step; j < (i + 1) * step; j += 16) m = Math.max(m, Math.abs(data[j]))
    return m
  })
  seek(0)
  if (clock.playing) audio.play().catch(() => (clock.playing = false)) // play was pressed while the media was still loading
}

export async function loadYoutube(url) {
  clock.loading = 'Downloading…'
  try {
    const r = await fetch(`/api/youtube?url=${encodeURIComponent(url)}`, { method: 'POST' })
    const j = await r.json()
    if (!r.ok) throw new Error(j.error)
    show.media = { file: j.file, title: j.title, url }
    await loadMedia()
  } catch (e) { alert(`YouTube download failed: ${e.message}`) }
  clock.loading = ''
}
// reload the downloaded video saved with the show
export async function loadMedia() {
  if (!show.media) return
  const r = await fetch(show.media.file)
  if (r.ok) await loadAudio(await r.blob(), show.media.title)
}

// music + timecode math
export const spb = () => 60 / show.bpm
export const snapBeat = t => (show.snap ? Math.round(t / spb()) * spb() : t)
export function tc(t) {
  const f = Math.floor(t * FPS + 1e-6), p = n => String(n).padStart(2, '0')
  return `${p(Math.floor(f / FPS / 3600))}:${p(Math.floor(f / FPS / 60) % 60)}:${p(Math.floor(f / FPS) % 60)}:${p(f % FPS)}`
}
export function parseTc(s) {
  const p = s.split(/[:;.]/).map(Number)
  if (p.some(isNaN)) return null
  while (p.length < 4) p.unshift(0)
  const [h, m, sec, f] = p.slice(-4)
  return h * 3600 + m * 60 + sec + f / FPS
}
export function bb(t) {
  const beat = Math.floor(t / spb() + 1e-6)
  return `${Math.floor(beat / show.beatsPerBar) + 1}.${(beat % show.beatsPerBar) + 1}`
}
// show timecode = song time + LTC start offset
export const stc = t => tc(t + show.tcOffset)
export const parseStc = s => { const t = parseTc(s); return t === null ? null : t - show.tcOffset }
export const dur = d => `${String(Math.floor(d)).padStart(2, '0')}:${String(Math.floor((d % 1) * FPS + 1e-6)).padStart(2, '0')}`
// countdown style used on live displays: :07, 1:05
export const secs = d => { const s = Math.max(0, Math.ceil(d)); return s < 60 ? `:${String(s).padStart(2, '0')}` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}` }
export function parseBb(s) {
  const [bar, beat = 1] = s.split('.').map(Number)
  return isNaN(bar) || isNaN(beat) ? null : ((bar - 1) * show.beatsPerBar + (beat - 1)) * spb()
}

// cut list: each cue runs until the next one
export const cues = computed(() => {
  const s = [...show.cues].sort((a, b) => a.start - b.start)
  return s.map((c, i) => ({ ...c, end: s[i + 1]?.start ?? show.duration }))
})
export const camOf = id => show.cams.find(c => c.id === id) ?? { name: '?', color: '#666' }
export const liveIdx = computed(() => cues.value.findLastIndex(c => c.start <= clock.now))

export function addCue(start, cam) {
  const hit = show.cues.find(c => Math.abs(c.start - start) < 1 / FPS)
  if (hit) return (hit.cam = cam) // cutting on an existing cut replaces its camera
  const id = Math.max(0, ...show.cues.map(c => c.id)) + 1
  show.cues.push({ id, start, cam, note: '' })
}
export const removeCue = id => show.cues.splice(show.cues.findIndex(c => c.id === id), 1)
export function addCam() {
  const id = Math.max(0, ...show.cams.map(c => c.id)) + 1
  show.cams.push({ id, name: `CAM ${id}`, color: COLORS[(id - 1) % COLORS.length] })
}
export function addItem(track, start, text) {
  track.items.push({ id: Math.max(0, ...track.items.map(i => i.id)) + 1, start, text })
}
// undo/redo: snapshots of the rundown (zoom excluded), recorded once edits settle
const hist = { past: [], future: [], cur: null, skip: false, timer: 0 }
const snap = () => JSON.stringify({ ...show, zoom: undefined })
hist.cur = snap()
watch(show, () => {
  if (hist.skip) return (hist.skip = false)
  clearTimeout(hist.timer)
  hist.timer = setTimeout(() => {
    const s = snap()
    if (s === hist.cur) return
    hist.past.push(hist.cur); hist.cur = s; hist.future = []
    if (hist.past.length > 100) hist.past.shift()
  }, 250)
}, { deep: true })
function restore(s) { clearTimeout(hist.timer); hist.skip = true; Object.assign(show, JSON.parse(s)); hist.cur = s }
export function undo() { if (hist.past.length) { hist.future.push(hist.cur); restore(hist.past.pop()) } }
export function redo() { if (hist.future.length) { hist.past.push(hist.cur); restore(hist.future.pop()) } }

// saved rundowns: every src/shows/*.json plus the demo
const files = import.meta.glob('./shows/*.json', { eager: true, import: 'default' })
export const rundowns = { Demo: demo, ...Object.fromEntries(Object.values(files).map(s => [`${s.artist} – ${s.title}`, s])) }
// self-check: a camera can't cut to itself live, so no rundown may put one shot of a camera right after another
for (const [name, r] of Object.entries(rundowns)) {
  const c = [...r.cues].sort((a, b) => a.start - b.start)
  console.assert(c.every((q, i) => !i || q.cam !== c[i - 1].cam), `${name}: same camera cut back to back`)
}
export function loadShow(name) {
  pause()
  audio.removeAttribute('src'); audio.load()
  Object.assign(clock, { now: 0, audioName: '', peaks: null, hasVideo: false })
  Object.assign(show, structuredClone(rundowns[name]))
  return loadMedia()
}

// self-check
console.assert(Math.abs(parseTc(tc(83.4)) - 83.4) < 1e-9 && Math.abs(parseTc('01:02:03:12') - 3723.48) < 1e-9 && bb(2.5) === '2.2', 'tc/bar math')
