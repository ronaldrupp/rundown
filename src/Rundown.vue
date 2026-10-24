<script setup>
import Live from './Live.vue'
import { caller } from './caller'
import { sw } from './switcher'
import SwitcherPanel from './SwitcherPanel.vue'
import { ref, computed, watchEffect } from 'vue'
import { FPS, show, clock, cues, liveIdx, camOf, stc, parseStc, bb, parseBb, dur, tc, seek, toggle, addCue, removeCue, addCam, addItem, snapBeat, spb, secs, loadAudio, loadYoutube, audio } from './store'

defineProps({ liveMode: Boolean }) // not `live`: that name is the on-air shot below

const PH = 0.3 // playhead sits at 30% of the track width
const x = t => `calc(${PH * 100}% + ${(t - clock.now) * show.zoom}px)`
const w = d => `${d * show.zoom}px`
// shortcut: renders a fixed ±30s/60s window, fine for normal zoom levels; virtualize if zooming far out matters
const span = computed(() => [clock.now - 1200 / show.zoom, clock.now + 2400 / show.zoom])
const visible = (a, b) => b > span.value[0] && a < span.value[1]

const swOpen = ref(false)
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
// drag a shot block to move its cut (snapped to the beat, kept between its neighbours); a click without movement selects it
function dragCut(e, c) {
  const el = e.currentTarget, x0 = e.clientX, i = cues.value.indexOf(c), cue = show.cues.find(q => q.id === c.id)
  const lo = i ? cues.value[i - 1].start + 1 / FPS : 0, hi = (cues.value[i + 1]?.start ?? show.duration) - 1 / FPS
  let moved = false
  el.setPointerCapture(e.pointerId)
  el.onpointermove = m => {
    if (!moved && Math.abs(m.clientX - x0) < 4) return
    moved = true
    cue.start = Math.min(hi, Math.max(lo, snapBeat(c.start + (m.clientX - x0) / show.zoom)))
  }
  el.onpointerup = () => { el.onpointermove = el.onpointerup = null; if (!moved) pick(c) }
}
function cut(cam) { addCue(snapBeat(clock.now), cam.id); selId.value = null }
function renameCam(cam) { const n = prompt('Camera name', cam.name); if (n) cam.name = n.toUpperCase() }

// time under the mouse on the track area
const timeAt = e => { const r = e.currentTarget.getBoundingClientRect(); return clock.now + (e.clientX - r.left - r.width * PH) / show.zoom }
const wheel = e => seek(clock.now + (e.deltaX || e.deltaY) / show.zoom)

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
const curLyric = computed(() => show.tracks.find(t => t.kind === 'lyrics') && items(show.tracks.find(t => t.kind === 'lyrics')).findLast(i => i.start <= clock.now && clock.now < i.end))

const live = computed(() => cues.value[liveIdx.value])
const next = computed(() => cues.value[liveIdx.value + 1])

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

// how far the on-air shot has run, for the progress bar under NOW/NEXT
const progress = computed(() => live.value ? Math.min(100, ((clock.now - live.value.start) / (live.value.end - live.value.start)) * 100) : 0)

const screen = ref()
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
        <div v-if="cues[selIdx - 1]" class="card small" @click="pick(cues[selIdx - 1])" :style="{ '--c': camOf(cues[selIdx - 1].cam).color }">
          <b>{{ cues[selIdx - 1].cam }} {{ cues[selIdx - 1].note || camOf(cues[selIdx - 1].cam).name }}</b>
          <span>{{ rel(cues[selIdx - 1].start - clock.now) }}</span>
        </div>
        <div v-if="sel" class="card big" :style="{ '--c': camOf(sel.cam).color }">
          <div class="row"><select v-model="raw.cam" aria-label="Camera"><option v-for="c in show.cams" :key="c.id" :value="c.id">{{ c.id }}</option></select>
            <input class="shotname" v-model="raw.note" :placeholder="camOf(sel.cam).name" aria-label="Shot description" /></div>
          <div class="row">◧ Cut</div>
          <div class="row"><input class="tc" :value="stc(sel.start)" @change="setStart($event.target.value, parseStc)" aria-label="Timecode" />
            <span>({{ dur(sel.end - sel.start) }})</span>
            <input class="bb" :value="bb(sel.start)" @change="setStart($event.target.value, parseBb)" aria-label="Bar.Beat" /></div>
          <div class="row"><b>{{ selIdx + 1 }}</b><i>{{ camOf(sel.cam).name }}</i>
            <button class="del" @click="removeCue(sel.id); selId = null" aria-label="Delete shot">✕</button></div>
        </div>
        <div v-if="cues[selIdx + 1]" class="card small" @click="pick(cues[selIdx + 1])" :style="{ '--c': camOf(cues[selIdx + 1].cam).color }">
          <span>{{ rel(cues[selIdx + 1].start - clock.now) }}</span>
          <b>{{ cues[selIdx + 1].cam }} {{ cues[selIdx + 1].note || camOf(cues[selIdx + 1].cam).name }}</b>
        </div>
      </div>
      <div class="grid">
        <button v-for="cam in show.cams" :key="cam.id" class="cam" @click="cut(cam)" @dblclick="renameCam(cam)"
          :class="{ onair: live?.cam === cam.id, preview: next?.cam === cam.id }" :title="`Cut to ${cam.name} at playhead (double-click to rename)`">
          <b :style="{ background: cam.color }">{{ cam.id }}</b><small>{{ cam.name }}</small>
        </button>
        <button class="cam add" @click="addCam"><b>+</b><small>ADD</small></button>
      </div>
    </aside>

    <section class="monitor" :class="{ video: clock.hasVideo }" :style="{ '--c': live ? camOf(live.cam).color : '#333' }">
      <div ref="screen" class="screen" v-show="clock.hasVideo"></div>
      <div class="tcbox" v-if="live">
        <div class="tcl">{{ stc(clock.now) }}</div>
        <div class="tcr"><span>{{ liveIdx + 1 }}</span><b :style="{ background: camOf(live.cam).color }">{{ live.cam }}</b><span>{{ secs(live.end - clock.now) }}</span></div>
      </div>
      <div class="pgm">
        <div class="num">{{ live?.cam ?? '–' }}</div>
        <div class="name">{{ live ? camOf(live.cam).name : 'NO SHOT' }}</div>
        <div class="desc">{{ live?.note }}</div>
        <div class="lyric" v-if="curLyric">{{ curLyric.text }}</div>
      </div>
      <div class="pvw" v-if="live || next">
        <div v-if="live" class="sec now" :style="{ '--c': camOf(live.cam).color }">
          <span class="tag">NOW · {{ secs(live.end - clock.now) }}</span>
          <b>{{ live.cam }} {{ camOf(live.cam).name }}</b><small>{{ live.note }}</small>
        </div>
        <div v-if="next" class="sec" :style="{ '--c': camOf(next.cam).color }">
          <span class="tag">NEXT · {{ (next.start - clock.now).toFixed(1) }}s</span>
          <b>{{ next.cam }} {{ camOf(next.cam).name }}</b><small>{{ next.note }}</small>
        </div>
        <i v-if="live" class="prog" :class="{ late: live.end - clock.now < 1 }" :style="{ width: progress + '%' }"></i>
      </div>
    </section>

    <div class="toolbar">
      <button @click="addCue(snapBeat(clock.now), live?.cam ?? 1)" title="Add cut at playhead">＋</button>
      <button @click="newTrack" title="Add track">≡＋</button>
      <label class="file" title="Load music">♫ {{ clock.audioName || 'Load music' }}<input type="file" accept="audio/*" hidden @change="show.media = null; loadAudio($event.target.files[0])" /></label>
      <button class="yt" @click="youtube" :disabled="!!clock.loading" title="Download a YouTube video">▶ {{ clock.loading || 'YouTube' }}</button>
      <span class="spacer"></span>
      <button @click="seek(0)" aria-label="To start">⏮</button>
      <button @click="toggle" :aria-label="clock.playing ? 'Pause' : 'Play'">{{ clock.playing ? '❚❚' : '▶' }}</button>
      <div class="bigtc"><small>C</small>{{ stc(clock.now) }}</div>
      <span class="bbr">{{ bb(clock.now) }}</span>
      <span class="spacer"></span>
      <label title="Tempo">♩<input type="number" min="20" max="300" v-model.number="show.bpm" /></label>
      <label title="Beats per bar"><input type="number" min="1" max="12" v-model.number="show.beatsPerBar" />/4</label>
      <button class="caller" :class="{ on: caller.on }" @click="caller.on = !caller.on" :aria-pressed="caller.on" title="Spoken camera calls and countdown">{{ caller.on ? '🔊' : '🔇' }} Caller</button>
      <button class="caller" :class="{ on: sw.kind !== 'off' }" @click="swOpen = !swOpen" :aria-expanded="swOpen" title="Send cuts to OBS or vMix">⇄ Output{{ sw.kind !== 'off' ? ` · ${sw.kind.toUpperCase()}` : '' }}</button>
      <label title="Snap cuts to the beat"><input type="checkbox" v-model="show.snap" />Snap</label>
      <label v-if="!clock.audioName" title="Song length in seconds">⏱<input type="number" min="1" v-model.number="show.duration" /></label>
      <label title="Zoom">🔍<input type="range" min="10" max="300" v-model.number="show.zoom" /></label>
    </div>

    <SwitcherPanel v-if="swOpen" @close="swOpen = false" />

    <div class="overview" @click="seek((($event.clientX - $event.currentTarget.getBoundingClientRect().left) / $event.currentTarget.clientWidth) * show.duration)">
      <div v-for="c in cues" :key="c.id" :style="{ left: (c.start / show.duration) * 100 + '%', width: ((c.end - c.start) / show.duration) * 100 + '%', background: camOf(c.cam).color }"></div>
      <i :style="{ left: (clock.now / show.duration) * 100 + '%' }"></i>
    </div>

    <div class="timeline" @wheel.prevent="wheel">
      <div class="track ruler">
        <div class="head"></div>
        <div class="lane" @click="seek(timeAt($event))">
          <div v-for="b in bars" :key="b.i" class="bar" :style="{ left: x(b.t) }"><b>{{ b.i + 1 }}</b><small>{{ tc(b.t + show.tcOffset).slice(3) }}</small></div>
        </div>
      </div>
      <div class="track switcher">
        <div class="head"><span class="ico red">⏺</span>Switcher 1<small>M/E 1</small></div>
        <div class="lane" @click.self="seek(timeAt($event))">
          <template v-for="(c, i) in cues" :key="c.id">
            <div v-if="visible(c.start, c.end)" class="shot" :class="{ sel: c === sel }" @pointerdown="dragCut($event, c)"
              :style="{ left: x(c.start), width: w(c.end - c.start), background: camOf(c.cam).color }">
              <b>{{ c.cam }}&nbsp; {{ c.note || camOf(c.cam).name }}</b>
              <span>◧</span>
              <span>{{ stc(c.start).slice(3) }} ({{ dur(c.end - c.start) }})</span>
              <span><b>{{ i + 1 }}</b> <i>{{ camOf(c.cam).name }}</i></span>
            </div>
          </template>
        </div>
      </div>
      <div v-for="tr in show.tracks" :key="tr.id" class="track" :class="tr.kind">
        <div class="head"><span class="ico">{{ tr.kind === 'lyrics' ? 'A' : '⚑' }}</span>{{ tr.name }}<button @click="newItem(tr)" :aria-label="`Add to ${tr.name}`">＋</button></div>
        <div class="lane">
          <template v-for="it in items(tr)" :key="it.id">
            <div v-if="visible(it.start, it.end)" class="item" @click="editItem(tr, it)" :style="{ left: x(it.start), maxWidth: w(it.end - it.start) }">{{ it.text }}</div>
          </template>
        </div>
      </div>
      <div class="track audio">
        <div class="head"><span class="ico">♫</span>{{ clock.audioName || 'Audio' }}</div>
        <div class="lane"><canvas ref="wave"></canvas></div>
      </div>
      <div class="playhead"></div>
    </div>
  </div>
</template>

<style scoped>
.gutter { cursor: col-resize; background: #1a1a1a; border-left: 1px solid #2a2a2a; border-right: 1px solid #2a2a2a; touch-action: none; }
.gutter:hover, .gutter:focus-visible { background: #3d8bfd; outline: none; }
.editor { position: relative; height: 100%; display: grid; grid-template-columns: minmax(300px, 560px) 1fr; grid-template-rows: minmax(0, 1fr) auto auto auto; background: #000; }
aside { display: flex; flex-direction: column; background: #121212; border-right: 1px solid #222; overflow: auto; min-height: 0; }
.tabs { padding: 6px 12px; color: var(--dim); font-size: 13px; text-align: center; border-bottom: 1px solid #222; }
.info { padding: 8px 12px; display: flex; flex-direction: column; gap: 6px; }
.card { border-radius: 4px; padding: 6px 12px; color: #fff; border-left: 3px solid color-mix(in srgb, var(--c) 60%, #fff); background: color-mix(in srgb, var(--c) 55%, #000); cursor: pointer; display: flex; flex-direction: column; }
.card.small { font-size: 13px; opacity: .85; }
.card.small span { opacity: .7; }
.card.big { background: var(--c); padding: 10px 12px; gap: 6px; cursor: default; font-size: 15px; }
.row { display: flex; align-items: center; gap: 8px; }
.card input, .card select { background: #0003; border: 1px solid #fff3; color: #fff; }
.card .shotname { flex: 1; font-weight: 600; text-transform: uppercase; }
.card .tc { width: 8.5em; }
.card .bb { width: 4.5em; }
.card i { opacity: .75; flex: 1; }
.del { background: #0003; border-color: #fff3; color: #fff; }
.grid { display: grid; grid-template-columns: repeat(5, 1fr); gap: 6px 8px; padding: 12px; border-top: 1px solid #222; }
.cam { display: flex; flex-direction: column; align-items: stretch; gap: 3px; padding: 0; background: none; border: 0; }
.cam:hover { background: none; filter: brightness(1.2); }
.cam b { border-radius: 6px; padding: 6px 0; font-size: 17px; color: #fff; text-shadow: 0 1px 2px #0006; border: 2px solid transparent; }
.cam small { font-size: 10px; color: #ccc; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cam.onair b { border-color: #fff; box-shadow: 0 0 0 2px var(--red); }
.cam.preview b { border-color: #3ddc84; }
.cam.add b { background: #222; color: var(--dim); }
.monitor { position: relative; display: grid; place-items: center; background: radial-gradient(ellipse at center, color-mix(in srgb, var(--c) 35%, #000), #000 75%); overflow: hidden; min-height: 0; }
.pgm { text-align: center; color: #fff; }
.screen { position: absolute; inset: 0; }
.screen :deep(video) { width: 100%; height: 100%; object-fit: contain; display: block; }
/* with video only the lyric subtitle remains; camera info lives in the TC box and NOW/NEXT box */
.video .pgm { position: absolute; left: 12px; right: 12px; bottom: 84px; }
.video .pgm > :not(.lyric) { display: none; }
.video .pgm .lyric { margin: 0; text-shadow: 0 1px 4px #000; }
.toolbar .caller { font-size: 13px; border-radius: 4px; color: var(--dim); }
.toolbar .caller.on { background: #2a2a2a; color: #fff; }
.toolbar .yt { font-size: 13px; background: #b0121e; color: #fff; border-radius: 4px; }
.pgm .num { font-size: clamp(60px, 12vw, 160px); font-weight: 800; line-height: 1; color: var(--c); text-shadow: 0 0 40px color-mix(in srgb, var(--c) 60%, transparent); }
.pgm .name { font-size: 28px; font-weight: 700; letter-spacing: .05em; }
.pgm .desc { opacity: .8; text-transform: uppercase; }
.pgm .lyric { margin-top: 16px; font-style: italic; opacity: .9; }
.tag { position: absolute; top: 10px; left: 12px; font-size: 11px; font-weight: 700; letter-spacing: .1em; background: var(--red); padding: 2px 6px; border-radius: 3px; }
.tcbox { position: absolute; left: 12px; top: 12px; z-index: 1; background: #000b; border: 1px solid #ffffff30; font-variant-numeric: tabular-nums; }
.tcl { font-size: 20px; font-weight: 500; padding: 2px 10px; text-align: center; color: #fff; border-bottom: 1px solid #ffffff30; }
.tcr { display: grid; grid-template-columns: 1fr 1fr 1fr; align-items: center; text-align: center; font-size: 18px; height: 30px; }
.tcr span { color: #ddd; }
.tcr b { height: 100%; display: grid; place-items: center; color: #fff; text-shadow: 0 1px 2px #0006; }
.pvw { position: absolute; left: 12px; right: 12px; bottom: 12px; display: flex; padding-bottom: 4px; border-radius: 6px; overflow: hidden; background: #000c; }
.prog { position: absolute; left: 0; bottom: 0; height: 4px; background: #fff; }
.prog.late { background: var(--red); }
.sec { flex: 1; min-width: 0; display: flex; flex-direction: column; padding: 5px 10px 6px; font-size: 14px; border-left: 4px solid var(--c); background: color-mix(in srgb, var(--c) 30%, #000c); }
.sec.now { border-right: 1px solid #ffffff22; opacity: .85; }
.sec .tag { position: static; align-self: flex-start; margin-bottom: 3px; background: #3ddc84; color: #000; }
.sec.now .tag { background: var(--red); color: #fff; }
.sec b, .sec small { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.sec small { opacity: .7; text-transform: uppercase; font-size: 11px; }
.sec .tag { font-size: 10px; }
.toolbar { grid-column: 1 / -1; display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: #1a1a1a; border-top: 1px solid #2a2a2a; flex-wrap: wrap; }
.toolbar button { background: none; border: 0; font-size: 18px; padding: 2px 8px; }
.toolbar label { font-size: 13px; }
.toolbar input[type=range] { width: 90px; padding: 0; }
.spacer { flex: 1; }
.bigtc { font-size: 26px; font-weight: 500; display: flex; align-items: center; gap: 6px; }
.bigtc small { font-size: 11px; border: 1px solid var(--dim); border-radius: 50%; width: 18px; height: 18px; display: grid; place-items: center; color: var(--dim); }
.bbr { color: var(--dim); }
.overview { grid-column: 1 / -1; position: relative; height: 8px; background: #111; cursor: pointer; }
.overview div { position: absolute; top: 0; bottom: 0; }
.overview i { position: absolute; top: -2px; bottom: -2px; width: 2px; background: #fff; }
.timeline { grid-column: 1 / -1; position: relative; background: #0a0a0a; overflow: hidden; user-select: none; }
.track { display: flex; height: 42px; border-bottom: 1px solid #1c1c1c; }
.head { width: 190px; flex: none; display: flex; align-items: center; gap: 8px; padding: 0 10px 0 0; background: #161616; border-right: 1px solid #222; font-size: 13px; z-index: 2; }
.head small { margin-left: auto; color: var(--dim); }
.head button { margin-left: auto; background: none; border: 0; color: var(--dim); padding: 0 4px; }
.ico { width: 34px; align-self: stretch; display: grid; place-items: center; background: #2a2a5a; color: #fff; }
.ico.red { background: #b0121e; }
.lane { position: relative; flex: 1; overflow: hidden; }
.ruler { height: 30px; }
.ruler .head { background: #0a0a0a; }
.ruler .lane { cursor: pointer; }
.bar { position: absolute; top: 0; bottom: 0; border-left: 1px solid #444; padding-left: 4px; font-size: 10px; color: var(--dim); display: flex; flex-direction: column; white-space: nowrap; }
.bar b { color: #ccc; }
.switcher { height: 96px; }
.switcher .head { background: #161616; }
.shot { position: absolute; top: 0; bottom: 0; padding: 6px 8px; color: #fff; display: flex; flex-direction: column; gap: 2px; overflow: hidden; white-space: nowrap; border-right: 2px solid #000; cursor: grab; font-size: 12px; touch-action: none; }
.shot:active { cursor: grabbing; }
.shot > b { font-size: 15px; text-transform: uppercase; text-overflow: ellipsis; overflow: hidden; }
.shot i { opacity: .7; }
.shot.sel { box-shadow: inset 0 0 0 2px #fff; }
.item { position: absolute; top: 50%; transform: translateY(-50%); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; cursor: pointer; font-size: 13px; }
.note .item { background: #2a2a2a; border: 1px solid #3a3a3a; border-radius: 4px; padding: 3px 8px; }
.lyrics .item { font-size: 15px; padding-left: 4px; border-left: 2px solid #ffffff40; }
.audio canvas { position: absolute; inset: 0; width: 100%; height: 100%; }
.playhead { position: absolute; top: 0; bottom: 0; width: 2px; background: var(--red); left: calc(190px + (100% - 190px) * 0.3); pointer-events: none; z-index: 3; }
</style>
