<script setup>
import { Scissors, X, ListPlus, Music, Download, SkipBack, Play, Pause, Gauge, Volume2, VolumeX, ArrowLeftRight, Timer, ZoomIn, CircleDot, Type, Flag, Plus, Clock } from 'lucide-vue-next'
import Live from './Live.vue'
import { caller } from './caller'
import { sw } from './switcher'
import SwitcherPanel from './SwitcherPanel.vue'
import ChasePanel from './ChasePanel.vue'
import { chase } from './chase'
import { rec, take, cutTo, accept, discard } from './rehearsal'
import { ref, computed, watch, watchEffect, onMounted, onUnmounted } from 'vue'
import { FPS, show, clock, cues, liveIdx, camOf, stc, parseStc, bb, parseBb, dur, tc, seek, toggle, addCue, removeCue, addCam, addItem, snapBeat, spb, secs, loadAudio, loadYoutube, audio, ink, swatch } from './store'

defineProps({ liveMode: Boolean }) // not `live`: that name is the on-air shot below

const PH = 0.3 // playhead sits at 30% of the track width
const x = t => `calc(${PH * 100}% + ${(t - clock.now) * show.zoom}px)`
const w = d => `${d * show.zoom}px`
// shortcut: renders a fixed ±30s/60s window, fine for normal zoom levels; virtualize if zooming far out matters
const span = computed(() => [clock.now - 1200 / show.zoom, clock.now + 2400 / show.zoom])
const visible = (a, b) => b > span.value[0] && a < span.value[1]

const panel = ref('') // 'sw' switcher output, 'tc' timecode chase; one at a time, they share the corner
const open = p => (panel.value = panel.value === p ? '' : p)
const selId = ref(null)
const sel = computed(() => cues.value.find(c => c.id === selId.value) ?? cues.value[liveIdx.value])
const selIdx = computed(() => cues.value.indexOf(sel.value))
const raw = computed(() => show.cues.find(c => c.id === sel.value?.id))
const rel = d => `${d < 0 ? '−' : '+'}${Math.floor(Math.abs(d) / 60)}:${dur(Math.abs(d) % 60)}`

function setStart(val, parse) {
  const t = parse(val)
  if (t !== null && raw.value) raw.value.start = Math.max(0, t)
}
function pick(c) { selId.value = c.id; seek(c.start) }
// Delete/Backspace removes the clicked shot; never the on-air fallback, so a stray key can't drop the live shot
function onDel(e) {
  if (!['Delete', 'Backspace'].includes(e.key) || e.target.matches('input, select, textarea') || !selId.value) return
  e.preventDefault(); removeCue(selId.value); selId.value = null
}
onMounted(() => addEventListener('keydown', onDel))
onUnmounted(() => removeEventListener('keydown', onDel))
// drag a shot block to move its cut (snapped to the playhead or beat, kept between its neighbours); a click without movement selects it
function dragCut(e, c) {
  const el = e.currentTarget, x0 = e.clientX, i = cues.value.indexOf(c), cue = show.cues.find(q => q.id === c.id)
  const lo = i ? cues.value[i - 1].start + 1 / FPS : 0, hi = (cues.value[i + 1]?.start ?? show.duration) - 1 / FPS
  let moved = false
  el.setPointerCapture(e.pointerId)
  el.onpointermove = m => {
    if (!moved && Math.abs(m.clientX - x0) < 4) return
    moved = true
    const t = c.start + (m.clientX - x0) / show.zoom
    // within 8px of the playhead, the cut sticks to it (beats the beat grid)
    cue.start = Math.min(hi, Math.max(lo, Math.abs(t - clock.now) * show.zoom < 8 ? clock.now : snapBeat(t)))
  }
  el.onpointerup = () => { el.onpointermove = el.onpointerup = null; if (!moved) pick(c) }
}
function cut(cam) { cutTo(cam.id); selId.value = null }
function renameCam(cam) { const n = prompt('Camera name', cam.name); if (n) cam.name = n.toUpperCase() }

// time under the mouse on the track area
const timeAt = e => { const r = e.currentTarget.getBoundingClientRect(); return clock.now + (e.clientX - r.left - r.width * PH) / show.zoom }
// trackpad pinch arrives as a ctrl+wheel event; clamp to the zoom slider's range
const wheel = e => e.ctrlKey
  ? show.zoom = Math.min(300, Math.max(10, show.zoom * Math.exp(-e.deltaY / 100)))
  : seek(clock.now + (e.deltaX || e.deltaY) / show.zoom)

const bars = computed(() => {
  const b = spb() * show.beatsPerBar, out = []
  for (let i = Math.max(0, Math.floor(span.value[0] / b)); i * b < span.value[1]; i++) out.push({ i, t: i * b })
  return out
})
const items = track => {
  const s = [...track.items].sort((a, b) => a.start - b.start)
  return s.map((it, i) => ({ ...it, end: s[i + 1]?.start ?? it.start + 4 }))
}
function editItem(track, it) {
  const t = prompt('Text (empty deletes)', it.text)
  if (t === null) return
  const i = track.items.findIndex(x => x.id === it.id)
  t ? (track.items[i].text = t) : track.items.splice(i, 1)
}
function newItem(track) { const t = prompt(`${track.name} at ${stc(clock.now)}`); if (t) addItem(track, snapBeat(clock.now), t) }
function newTrack() { const n = prompt('Track name'); if (n) show.tracks.push({ id: Date.now(), name: n, kind: 'note', items: [] }) }
// overview minimap: first note track labels sections, lyrics show as grey blobs, box marks the visible window
const sections = computed(() => { const t = show.tracks.find(t => t.kind === 'note'); return t ? items(t) : [] })
const lyricBlobs = computed(() => show.tracks.filter(t => t.kind === 'lyrics').flatMap(items))
const tl = ref(), laneW = ref(0)
const ro = new ResizeObserver(([e]) => (laneW.value = e.contentRect.width - 190))
onMounted(() => ro.observe(tl.value))
onUnmounted(() => ro.disconnect())
const pct = t => (t / show.duration) * 100 + '%'
const view = computed(() => ({ left: pct(clock.now - (PH * laneW.value) / show.zoom), width: pct(laneW.value / show.zoom) }))
// grab inside the window box drags it by its grip point; outside, the playhead jumps there and then follows the pointer
function scrub(e) {
  const el = e.currentTarget, r = el.getBoundingClientRect(), at = m => ((m.clientX - r.left) / r.width) * show.duration
  const t0 = at(e), lo = clock.now - (PH * laneW.value) / show.zoom, inBox = t0 >= lo && t0 <= lo + laneW.value / show.zoom
  const off = inBox ? t0 - clock.now : 0
  seek(t0 - off)
  el.setPointerCapture(e.pointerId)
  el.onpointermove = m => seek(at(m) - off)
  el.onpointerup = () => (el.onpointermove = el.onpointerup = null)
}
const curLyric = computed(() => show.tracks.find(t => t.kind === 'lyrics') && items(show.tracks.find(t => t.kind === 'lyrics')).findLast(i => i.start <= clock.now && clock.now < i.end))

const live = computed(() => cues.value[liveIdx.value])
const next = computed(() => cues.value[liveIdx.value + 1])
// the mixer's program isn't the planned shot for longer than a cut takes to come back from it
const offPlan = ref(false)
let offTimer
watch(() => clock.playing && sw.tally != null && !!live.value && sw.tally !== live.value.cam, d => {
  clearTimeout(offTimer)
  if (d) offTimer = setTimeout(() => (offPlan.value = true), 500)
  else offPlan.value = false
})

// LIVE: draggable split between shot list and monitor, remembered per browser
let saved = 57
try { saved = +localStorage.getItem('liveSplit') || 57 } catch {}
const split = ref(saved)
const setSplit = v => { split.value = Math.min(80, Math.max(20, v)); try { localStorage.setItem('liveSplit', split.value) } catch {} }
function drag(e) {
  const box = e.currentTarget.parentElement.getBoundingClientRect()
  e.currentTarget.setPointerCapture(e.pointerId)
  e.currentTarget.onpointermove = m => setSplit(((m.clientX - box.left) / box.width) * 100)
  e.currentTarget.onpointerup = u => (u.currentTarget.onpointermove = null)
}


const screen = ref()
// overlays are laid out on a REF-px-wide canvas and scaled to the picture, so they sit in the video like a burnt-in graphic
const REF = 960, frame = ref(), fw = ref(REF), vdim = ref(0)
const ar = computed(() => (clock.hasVideo && vdim.value) || 16 / 9)
const onDim = () => (vdim.value = audio.videoWidth / audio.videoHeight || 0)
const fro = new ResizeObserver(([e]) => (fw.value = e.contentRect.width))
onMounted(() => { fro.observe(frame.value); onDim(); audio.addEventListener('loadedmetadata', onDim); audio.addEventListener('resize', onDim) })
onUnmounted(() => { fro.disconnect(); audio.removeEventListener('loadedmetadata', onDim); audio.removeEventListener('resize', onDim) })
watchEffect(() => clock.hasVideo && screen.value?.appendChild(audio))
function youtube() { const u = prompt('YouTube link'); if (u) loadYoutube(u.trim()) }

const wave = ref()
watchEffect(() => {
  const c = wave.value, p = clock.peaks, now = clock.now, z = show.zoom
  if (!c) return
  const g = c.getContext('2d'), W = (c.width = c.clientWidth), H = (c.height = c.clientHeight)
  g.clearRect(0, 0, W, H)
  if (!p) return
  g.fillStyle = '#5b7cff'
  for (let px = 0; px < W; px++) {
    const t = now + (px - W * PH) / z, v = p[Math.floor((t / show.duration) * p.length)]
    if (v) g.fillRect(px, H / 2 - (v * H) / 2, 1, v * H)
  }
})
</script>

<template>
  <div class="editor" :class="{ live: liveMode }" :style="liveMode && { gridTemplateColumns: `${split}% 6px 1fr` }">
    <template v-if="liveMode">
    <Live />
    <div class="gutter" role="separator" aria-orientation="vertical" aria-label="Resize preview" tabindex="0"
      :aria-valuenow="Math.round(split)" @pointerdown="drag" @keydown.left.prevent="setSplit(split - 2)" @keydown.right.prevent="setSplit(split + 2)"></div>
    </template>
    <aside v-else>
      <div class="tabs"><span>Info</span></div>
      <div class="info">
        <textarea class="brief" v-model="show.brief" rows="2" placeholder="Note to all cameras for this performance" aria-label="Note to all cameras"></textarea>
        <div v-if="cues[selIdx - 1]" class="card small" @click="pick(cues[selIdx - 1])" :style="{ '--c': camOf(cues[selIdx - 1].cam).color }">
          <b>{{ cues[selIdx - 1].cam }} {{ cues[selIdx - 1].note || camOf(cues[selIdx - 1].cam).name }}</b>
          <span>{{ rel(cues[selIdx - 1].start - clock.now) }}</span>
        </div>
        <div v-if="sel" class="card big" :style="{ '--c': camOf(sel.cam).color, color: ink(camOf(sel.cam).color) }">
          <div class="row"><select v-model="raw.cam" aria-label="Camera"><option v-for="c in show.cams" :key="c.id" :value="c.id">{{ c.id }}</option></select>
            <input class="shotname" v-model="raw.note" :placeholder="camOf(sel.cam).name" aria-label="Shot description" /></div>
          <div class="row"><Scissors /> Cut</div>
          <div class="row"><input class="tc" :value="stc(sel.start)" @change="setStart($event.target.value, parseStc)" aria-label="Timecode" />
            <span>({{ dur(sel.end - sel.start) }})</span>
            <input class="bb" :value="bb(sel.start)" @change="setStart($event.target.value, parseBb)" aria-label="Bar.Beat" /></div>
          <div class="row"><b>{{ selIdx + 1 }}</b><i>{{ camOf(sel.cam).name }}</i>
            <button class="del" @click="removeCue(sel.id); selId = null" aria-label="Delete shot"><X /></button></div>
        </div>
        <div v-if="cues[selIdx + 1]" class="card small" @click="pick(cues[selIdx + 1])" :style="{ '--c': camOf(cues[selIdx + 1].cam).color }">
          <span>{{ rel(cues[selIdx + 1].start - clock.now) }}</span>
          <b>{{ cues[selIdx + 1].cam }} {{ cues[selIdx + 1].note || camOf(cues[selIdx + 1].cam).name }}</b>
        </div>
      </div>
      <div class="grid">
        <button v-for="cam in show.cams" :key="cam.id" class="cam" @click="cut(cam)" @dblclick="renameCam(cam)"
          :class="{ onair: live?.cam === cam.id, preview: next?.cam === cam.id }" :title="`Cut to ${cam.name} at playhead (double-click to rename)`">
          <b :style="swatch(cam.color)">{{ cam.id }}</b><small><span v-if="sw.tally === cam.id" class="pgm-dot" title="On the mixer's program">● </span>{{ cam.name }}</small>
        </button>
        <button class="cam add" @click="addCam"><b>+</b><small>ADD</small></button>
      </div>
    </aside>

    <section class="monitor" :class="{ video: clock.hasVideo }" :style="{ '--c': live ? camOf(live.cam).color : '#333' }">
      <div ref="frame" class="frame" :style="{ '--ar': ar }">
      <div ref="screen" class="screen" v-show="clock.hasVideo"></div>
      <div class="ovl" :style="{ width: REF + 'px', height: REF / ar + 'px', transform: `scale(${fw / REF})` }">
      <div class="offplan" v-if="offPlan" role="status">Mixer on {{ sw.tally }} · plan {{ live?.cam }}</div>
      <div class="tcbox" v-if="live">
        <div class="tcl">{{ stc(clock.now) }}</div>
        <div class="tcr"><span>{{ liveIdx + 1 }}</span><b :style="swatch(camOf(live.cam).color)">{{ live.cam }}</b><span>{{ secs(live.end - clock.now) }}</span></div>
      </div>
      <div class="pgm">
        <div class="num">{{ live?.cam ?? '–' }}</div>
        <div class="name">{{ live ? camOf(live.cam).name : 'NO SHOT' }}</div>
        <div class="desc">{{ live?.note }}</div>
        <div class="lyric" v-if="curLyric">{{ curLyric.text }}</div>
      </div>
      <div class="pvw" v-if="live || next">
        <div v-if="live" class="sec now">
          <span class="tag">Now</span><b class="chip" :style="swatch(camOf(live.cam).color)">{{ live.cam }}</b>
          <b>{{ camOf(live.cam).name }}</b><small>{{ live.note }}</small><span class="t">{{ secs(live.end - clock.now) }}</span>
        </div>
        <div v-if="next" class="sec">
          <span class="tag">Next</span><b class="chip" :style="swatch(camOf(next.cam).color)">{{ next.cam }}</b>
          <b>{{ camOf(next.cam).name }}</b><small>{{ next.note }}</small><span class="t">{{ (next.start - clock.now).toFixed(1) }}s</span>
        </div>
      </div>
      </div>
      </div>
    </section>

    <div class="toolbar">
      <button @click="addCue(snapBeat(clock.now), live?.cam ?? 1)" title="Add cut at playhead">＋</button>
      <button @click="newTrack" title="Add track"><ListPlus /></button>
      <label class="file" title="Load music"><Music /> {{ clock.audioName || 'Load music' }}<input type="file" accept="audio/*" hidden @change="show.media = null; loadAudio($event.target.files[0])" /></label>
      <button class="yt" @click="youtube" :disabled="!!clock.loading" title="Download a YouTube video"><Download /> {{ clock.loading || 'YouTube' }}</button>
      <span class="spacer"></span>
      <button @click="seek(0)" aria-label="To start"><SkipBack /></button>
      <button @click="toggle" :aria-label="clock.playing ? 'Pause' : 'Play'"><Pause v-if="clock.playing" /><Play v-else /></button>
      <div class="bigtc"><small>C</small>{{ stc(clock.now) }}</div>
      <span class="bbr">{{ bb(clock.now) }}</span>
      <span class="spacer"></span>
      <label title="Tempo"><Gauge /><input type="number" min="20" max="300" v-model.number="show.bpm" /></label>
      <label title="Beats per bar"><input type="number" min="1" max="12" v-model.number="show.beatsPerBar" />/4</label>
      <button class="caller" :class="{ on: caller.on }" @click="caller.on = !caller.on" :aria-pressed="caller.on" title="Spoken camera calls and countdown"><Volume2 v-if="caller.on" /><VolumeX v-else /> Caller</button>
      <button class="caller" :class="{ rec: rec.on }" @click="rec.on = !rec.on" :aria-pressed="rec.on" title="Record a rehearsal take: camera keys (and the mixer's cuts, when the output only listens) go into a take beside the plan"><CircleDot /> Rec</button>
      <button class="caller" :class="{ on: sw.kind !== 'off' }" @click="open('sw')" :aria-expanded="panel === 'sw'" title="Send cuts to OBS or vMix"><ArrowLeftRight /> Output{{ sw.kind !== 'off' ? ` · ${sw.kind.toUpperCase()}` : '' }}</button>
      <button class="caller" :class="{ on: clock.locked, bad: clock.chasing && !clock.locked }" @click="open('tc')" :aria-expanded="panel === 'tc'" title="Chase house timecode (MTC or LTC)"><Clock /> Chase{{ clock.chasing ? ` · ${chase.src.toUpperCase()}` : '' }}</button>
      <label title="Snap cuts to the beat"><input type="checkbox" v-model="show.snap" />Snap</label>
      <label v-if="!clock.audioName" title="Song length in seconds"><Timer /><input type="number" min="1" v-model.number="show.duration" /></label>
      <label title="Zoom"><ZoomIn /><input type="range" min="10" max="300" v-model.number="show.zoom" /></label>
    </div>

    <SwitcherPanel v-if="panel === 'sw'" @close="panel = ''" />
    <ChasePanel v-if="panel === 'tc'" @close="panel = ''" />

    <div class="overview" @pointerdown="scrub" @wheel.prevent="wheel">
      <span v-for="s in sections" :key="s.id" class="sec-label" :style="{ left: pct(s.start), width: pct(s.end - s.start) }">{{ s.text }}</span>
      <div v-for="c in cues" :key="c.id" class="seg" :style="{ left: pct(c.start), width: pct(c.end - c.start), background: camOf(c.cam).color }"></div>
      <div v-for="l in lyricBlobs" :key="l.id" class="blob" :style="{ left: pct(l.start), width: pct(l.end - l.start) }"></div>
      <i class="window" :style="view"></i>
    </div>

    <div ref="tl" class="timeline" @wheel.prevent="wheel">
      <div class="track ruler">
        <div class="head"></div>
        <div class="lane" @click="seek(timeAt($event))">
          <div v-for="b in bars" :key="b.i" class="bar" :style="{ left: x(b.t), width: w(spb() * show.beatsPerBar), backgroundSize: `${100 / show.beatsPerBar}% 8px` }" :title="tc(b.t + show.tcOffset)"><b>{{ b.i + 1 }}</b></div>
        </div>
      </div>
      <div class="track switcher">
        <div class="head"><span class="ico red"><CircleDot /></span>Switcher 1<small>M/E 1</small></div>
        <div class="lane" @click.self="seek(timeAt($event))">
          <template v-for="(c, i) in cues" :key="c.id">
            <div v-if="visible(c.start, c.end)" class="shot" :class="{ sel: c === sel }" @pointerdown="dragCut($event, c)"
              :style="{ left: x(c.start), width: w(c.end - c.start), background: camOf(c.cam).color, color: ink(camOf(c.cam).color) }">
              <b><big>{{ c.cam }}</big> {{ c.note || camOf(c.cam).name }}</b>
              <span><Scissors /></span>
              <span>{{ stc(c.start).slice(3) }} ({{ dur(c.end - c.start) }})</span>
              <span><b>{{ i + 1 }}</b> <i>{{ camOf(c.cam).name }}</i></span>
            </div>
          </template>
        </div>
      </div>
      <div class="track take">
        <div class="head"><span class="ico" :class="{ red: rec.on }"><CircleDot /></span>Rehearsal
          <template v-if="rec.cues.length"><button class="acc" @click="accept" title="Replace the plan with the take where it was recorded (⌘Z undoes it)">Accept</button>
          <button @click="discard" aria-label="Discard take" title="Discard take"><X /></button></template></div>
        <div class="lane">
          <template v-for="c in take" :key="c.id">
            <div v-if="visible(c.start, c.end)" class="shot" :class="{ diff: !c.match }" :title="c.match ? 'Same as the plan' : 'Differs from the plan'"
              :style="{ left: x(c.start), width: w(c.end - c.start), background: camOf(c.cam).color, color: ink(camOf(c.cam).color) }">
              <b><big>{{ c.cam }}</big> {{ camOf(c.cam).name }}</b>
            </div>
          </template>
        </div>
      </div>
      <div v-for="tr in show.tracks" :key="tr.id" class="track" :class="tr.kind">
        <div class="head"><span class="ico"><Type v-if="tr.kind === 'lyrics'" /><Flag v-else /></span>{{ tr.name }}<button @click="newItem(tr)" :aria-label="`Add to ${tr.name}`"><Plus /></button></div>
        <div class="lane">
          <template v-for="it in items(tr)" :key="it.id">
            <div v-if="visible(it.start, it.end)" class="item" @click="editItem(tr, it)" :style="{ left: x(it.start), maxWidth: w(it.end - it.start) }">{{ it.text }}</div>
          </template>
        </div>
      </div>
      <div class="track audio">
        <div class="head"><span class="ico"><Music /></span>{{ clock.audioName || 'Audio' }}</div>
        <div class="lane"><canvas ref="wave"></canvas></div>
      </div>
      <div class="playhead"></div>
    </div>
  </div>
</template>

<style scoped>
.gutter { cursor: col-resize; background: var(--bg2); border-left: 1px solid var(--line); border-right: 1px solid var(--line); touch-action: none; }
.gutter:hover, .gutter:focus-visible { background: var(--blue); outline: none; }
.editor { position: relative; height: 100%; display: grid; grid-template-columns: minmax(300px, 560px) 1fr; grid-template-rows: minmax(0, 1fr) auto auto auto; background: var(--bg); }
aside { display: flex; flex-direction: column; background: var(--bg2); overflow: auto; min-height: 0; }
.tabs { padding: 6px 12px; color: var(--dim); font-size: 13px; text-align: center; border-bottom: 1px solid var(--line); }
.info { padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.card { border-radius: var(--r); padding: 8px 12px; color: #fff; box-shadow: var(--rim); background: color-mix(in srgb, var(--c) 45%, var(--bg2)); cursor: pointer; display: flex; flex-direction: column; }
.card.small { font-size: 13px; opacity: .85; }
.card.small span { opacity: .7; }
.card.big { background: var(--c); padding: 12px 14px; border-radius: var(--r-lg); gap: 6px; cursor: default; font-size: 15px; }
.row { display: flex; align-items: center; gap: 8px; }
.card input, .card select { background: #0003; color: inherit; }
.card .shotname { flex: 1; font-weight: 600; text-transform: uppercase; }
.card .tc { width: 8.5em; }
.card .bb { width: 4.5em; }
.card i { opacity: .75; flex: 1; }
.del { background: #0003; color: inherit; }
.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 8px; padding: 12px; border-top: 1px solid var(--line); }
.cam { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 0; background: none; border: 0; box-shadow: none; }
.cam:hover { background: none; filter: brightness(1.2); }
.cam b { border-radius: var(--r-sm); padding: 8px 0; box-shadow: var(--rim); font-size: 17px; color: #fff; border: 2px solid transparent; }
.cam small { font-size: 11px; color: var(--dim); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cam.onair b { border-color: #fff; box-shadow: 0 0 0 2px var(--red); }
.cam.preview b { border-color: var(--green); }
.cam.add b { background: var(--fill); color: var(--dim); }
.monitor { position: relative; display: grid; place-items: center; background: color-mix(in srgb, var(--c) 20%, #000); overflow: hidden; min-height: 0; container-type: size; }
.video { background: #000; }
.frame { position: relative; width: min(100cqw, 100cqh * var(--ar)); aspect-ratio: var(--ar); overflow: hidden; }
.ovl { position: absolute; left: 0; top: 0; transform-origin: 0 0; display: grid; place-items: center; }
.pgm { text-align: center; color: #fff; }
.screen { position: absolute; inset: 0; }
.screen :deep(video) { width: 100%; height: 100%; object-fit: contain; display: block; }
/* with video only the lyric subtitle remains; camera info lives in the TC box and NOW/NEXT box */
.video .pgm { position: absolute; left: 16px; right: 16px; bottom: 96px; }
.video .pgm > :not(.lyric) { display: none; }
.video .pgm .lyric { margin: 0; text-shadow: 0 1px 4px #000; }
.toolbar .caller { font-size: 13px; color: var(--dim); }
.toolbar .caller.on { background: var(--fill-hi); color: #fff; }
.toolbar .caller.rec { background: var(--red); color: #fff; }
.toolbar .caller.bad { color: var(--red); }
.brief { font: inherit; color: inherit; background: rgba(255, 255, 255, .045); border: 0; box-shadow: inset 0 0 0 1px var(--input); border-radius: var(--r-sm); padding: 6px 10px; resize: vertical; }
.pgm-dot { color: var(--red); }
.offplan { position: absolute; right: 16px; top: 16px; z-index: 1; background: var(--red); color: #fff; font-weight: 700; font-size: 16px; letter-spacing: .04em; text-transform: uppercase; padding: 4px 12px; border-radius: 3px; }
.take .shot { opacity: .8; }
.take .shot.diff { opacity: 1; box-shadow: inset 0 0 0 2px #fff; }
.take .head .acc { font-size: 12px; padding: 2px 8px; color: var(--text); background: var(--fill); }
.take .head .acc + button { margin-left: 0; }
.toolbar .yt { font-size: 13px; background: var(--red); color: #fff; }
.pgm .num { font-size: 140px; font-weight: 800; line-height: 1; color: var(--c); }
.pgm .name { font-size: 28px; font-weight: 700; letter-spacing: .05em; }
.pgm .desc { opacity: .8; text-transform: uppercase; }
.pgm .lyric { margin-top: 16px; font-style: italic; opacity: .9; }
.tag { position: absolute; top: 10px; left: 12px; font-size: 11px; font-weight: 700; letter-spacing: .1em; background: var(--red); padding: 2px 8px; border-radius: var(--r-sm); }
.tcbox { position: absolute; left: 16px; top: 16px; z-index: 1; background: rgba(12, 12, 12, .88); box-shadow: var(--rim); border-radius: 3px; overflow: hidden; font-variant-numeric: tabular-nums; }
.tcl { font-size: 20px; font-weight: 500; font-family: var(--mono); padding: 2px 10px; text-align: center; color: #fff; border-bottom: 1px solid var(--line); }
.tcr { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; text-align: center; font-size: 18px; height: 30px; }
.tcr span { color: var(--dim); }
.tcr b { height: 100%; display: grid; place-items: center; color: #fff; }
/* lower third: on-air row on top, a slightly narrower cue row under it */
.pvw { position: absolute; left: 16px; bottom: 16px; width: 50%; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; }
.sec { width: 100%; min-width: 0; display: flex; align-items: center; gap: 10px; height: 32px; padding: 0 12px 0 0; font-size: 13px; background: rgba(12, 12, 12, .88); box-shadow: var(--rim); border-radius: 3px; overflow: hidden; }
.sec:not(.now) { width: 82%; height: 26px; font-size: 12px; color: var(--dim); }
.sec .tag { position: static; flex: none; align-self: stretch; width: 52px; display: grid; place-items: center; background: var(--bg3); padding: 0; border-radius: 0; font-size: 10px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--dim); }
.sec.now .tag { background: var(--red); color: #fff; }
.sec .chip { flex: none; min-width: 22px; padding: 1px 5px; border-radius: 2px; text-align: center; font-size: 12px; font-family: var(--mono); }
.sec b, .sec small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sec b { flex: none; max-width: 45%; font-weight: 600; letter-spacing: .02em; text-transform: uppercase; }
.sec small { flex: 1; min-width: 0; color: var(--faint); text-transform: uppercase; font-size: 10px; letter-spacing: .04em; }
.sec .t { flex: none; margin-left: auto; font-family: var(--mono); font-variant-numeric: tabular-nums; font-size: 12px; }
.toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 8px 12px; background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-top: 1px solid var(--line); flex-wrap: wrap; }
.toolbar button { background: none; box-shadow: none; font-size: 18px; padding: 4px 10px; }
.toolbar button:hover { background: var(--fill); }
.toolbar label { font-size: 13px; }
.toolbar input[type=range] { width: 90px; padding: 0; }
.spacer { flex: 1; }
.bigtc { font-size: 26px; font-weight: 600; display: flex; align-items: center; gap: 6px; }
.bigtc small { font-size: 11px; border: 1px solid var(--dim); border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; color: var(--dim); }
.bbr { color: var(--dim); }
.overview { grid-column: 1 / -1; position: relative; height: 56px; background: #000; cursor: grab; overflow: hidden; border-top: 1px solid var(--line); touch-action: none; user-select: none; }
.overview:active { cursor: grabbing; }
.sec-label { position: absolute; top: 6px; height: 14px; padding: 0 4px; font-size: 10px; font-weight: 600; line-height: 14px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; background: var(--bg2); border-left: 1px solid var(--faint); }
.seg { position: absolute; top: 24px; height: 10px; border-radius: 2px; border-right: 2px solid #000; }
.blob { position: absolute; top: 40px; height: 8px; border-radius: 2px; border-right: 2px solid #000; background: var(--bg3); }
.window { position: absolute; top: 2px; bottom: 2px; border: 2px solid var(--faint); border-radius: var(--r); background: rgba(255, 255, 255, .08); pointer-events: none; }
.timeline { grid-column: 1 / -1; position: relative; background: var(--bg); overflow: hidden; user-select: none; }
.track { display: flex; height: 42px; border-bottom: 1px solid var(--line); }
.head { width: 190px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 0; background: var(--bg2); border-right: 1px solid var(--line); font-size: 13px; z-index: 2; }
.head small { margin-left: auto; color: var(--dim); }
.head button { margin-left: auto; background: none; box-shadow: none; color: var(--dim); padding: 0 4px; }
.ico { width: 26px; height: 26px; margin-left: 6px; border-radius: var(--r-sm); display: grid; place-items: center; background: var(--primary); color: var(--primary-fg); font-size: 13px; }
.ico.red { background: var(--red); }
.lane { position: relative; flex: 1; overflow: hidden; }
.ruler { height: 48px; background: #000; }
.ruler .head { background: #000; }
.ruler .lane { cursor: pointer; }
/* bar line on the left, beat ticks drawn as a tiled 1px gradient along the bottom (tile width set inline) */
.bar { position: absolute; top: 0; bottom: 0; white-space: nowrap; background: linear-gradient(to right, var(--faint) 1px, transparent 1px) left bottom 6px / 25% 8px repeat-x; }
.bar::before { content: ''; position: absolute; left: 0; top: 10px; bottom: 6px; width: 2px; background: var(--dim); }
.bar b { position: absolute; left: 10px; top: 10px; font-size: 20px; font-weight: 700; color: var(--text); }
.switcher { height: 96px; }
.switcher .head { background: var(--bg2); }
.shot { position: absolute; top: 0; bottom: 0; padding: 6px 8px; color: #fff; display: flex; flex-direction: column; gap: 2px; overflow: hidden; white-space: nowrap; border-right: 4px solid transparent; background-clip: padding-box !important; border-radius: var(--r); cursor: grab; font-size: 12px; touch-action: none; }
.shot:active { cursor: grabbing; }
.shot > b { font-size: 18px; font-weight: 600; text-transform: uppercase; text-overflow: ellipsis; overflow: hidden; }
.shot > b big { font-size: 22px; font-weight: 800; margin-right: 8px; }
.shot i { opacity: .7; }
.shot.sel { box-shadow: inset 0 0 0 2px #fff; }
.item { position: absolute; top: 50%; transform: translateY(-50%); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; font-size: 13px; }
.note .item { background: var(--fill); box-shadow: var(--rim); border-radius: var(--r-sm); padding: 3px 10px; }
.lyrics .item { font-size: 15px; padding-left: 4px; border-left: 2px solid var(--faint); }
.audio canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red); left: calc(190px + (100% - 190px) * 0.3); pointer-events: none; z-index: 3; }
</style>
