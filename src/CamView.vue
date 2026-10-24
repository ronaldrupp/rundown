<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { show, clock, cues, liveIdx, camOf, stc, swatch } from './store'
import { link } from './sync'

// Camera operator view (CuePilot-style): the whole cut flow on top, this camera's own shots below,
// both on one sliding time axis, and a countdown bar to this camera's next cut in between.
const props = defineProps({ cam: Number })
const WINDOW = 16 // seconds across the bar area
// shortcut: enough rows to fill a tall portrait screen, the sections clip the rest; raise if a display shows a gap
const ROWS = 40

const me = computed(() => camOf(props.cam))
const all = computed(() => cues.value.map((c, i) => ({ ...c, no: i + 1 })))
const live = computed(() => all.value[liveIdx.value])
const flow = computed(() => all.value.slice(Math.max(0, liveIdx.value), Math.max(0, liveIdx.value) + ROWS))
// my shots from the one on air (or the next) onwards, with repositioning time since my previous shot ended
const mine = computed(() => {
  const own = all.value.filter(c => c.cam === props.cam)
  return own.map((c, i) => ({ ...c, gap: i ? c.start - own[i - 1].end : null })).filter(c => c.end > clock.now)
})
const onAir = computed(() => live.value?.cam === props.cam)
const nextMine = computed(() => mine.value.find(c => c.start > clock.now))
const standby = computed(() => !onAir.value && nextMine.value && nextMine.value.no === liveIdx.value + 2)
// big number: seconds left on air, otherwise seconds until my next cut
const left = computed(() => (onAir.value ? live.value.end - clock.now : nextMine.value ? nextMine.value.start - clock.now : null))

const pct = t => `${(t / WINDOW) * 100}%`
const bar = c => ({ left: pct(Math.max(0, c.start - clock.now)), width: pct(Math.max(0, c.end - Math.max(c.start, clock.now))), background: camOf(c.cam).color })
const dur = d => (d < 1 ? `${d.toFixed(1)}s` : d % 1 < 0.05 || d >= 10 ? `${Math.round(d)}s` : `${d.toFixed(1)}s`)
const elapsed = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`

// sync status: green while the director's clock keeps arriving
const tick = ref(performance.now())
const timer = setInterval(() => (tick.value = performance.now()), 500)
onUnmounted(() => clearInterval(timer))
const connected = computed(() => tick.value - link.last < 1500)

// optional countdown pips before this camera's cuts: short at 3, 2, 1, long at the cut
const beeps = ref(false)
let ctx = null
function toggleBeeps() {
  beeps.value = !beeps.value
  // browsers only allow audio after a user gesture, so the context starts on this tap
  if (beeps.value) (ctx ??= new AudioContext()).resume()
}
function pip(freq, ms) {
  if (!ctx) return
  const t = ctx.currentTime, end = t + ms / 1000, o = ctx.createOscillator(), g = ctx.createGain()
  o.frequency.value = freq
  g.gain.setValueAtTime(0.0001, t)
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.005) // short ramps avoid clicks
  g.gain.setValueAtTime(0.5, end - 0.015)
  g.gain.exponentialRampToValueAtTime(0.0001, end)
  o.connect(g).connect(ctx.destination)
  o.start(t); o.stop(end + 0.01)
}
let lastN = null
watch(left, t => {
  const n = t == null ? null : Math.ceil(t)
  if (beeps.value && clock.playing && !onAir.value && n >= 1 && n <= 3 && n !== lastN) pip(1000, 90)
  lastN = n
})
watch(onAir, (on, was) => { if (on && !was && beeps.value && clock.playing) pip(1500, 400) })

// drag the countdown bar to share height between shot flow and own shots, remembered per browser
let saved = 50
try { saved = +localStorage.getItem('camSplit') || 50 } catch {}
const split = ref(saved)
const setSplit = v => { split.value = Math.min(85, Math.max(15, v)); try { localStorage.setItem('camSplit', split.value) } catch {} }
const flowEl = ref(), ownEl = ref()
function drag(e) {
  if (e.target.closest('button')) return
  const top = flowEl.value.getBoundingClientRect().top, h = ownEl.value.getBoundingClientRect().bottom - top, band = e.currentTarget.offsetHeight
  e.currentTarget.setPointerCapture(e.pointerId)
  // the band's centre follows the pointer and snaps to the screen's vertical centre within 20px
  const centre = y => (Math.abs(y - innerHeight / 2) < 20 ? innerHeight / 2 : y)
  e.currentTarget.onpointermove = m => setSplit(((centre(m.clientY) - top - band / 2) / (h - band)) * 100)
  e.currentTarget.onpointerup = u => (u.currentTarget.onpointermove = null)
}
</script>

<template>
  <div class="cv" :class="{ onair: onAir, stby: standby }">
    <header>
      <span class="mnum" :style="swatch(me.color)">{{ cam }}</span>
      <span class="sno">{{ show.songNo }}</span>
      <div class="song"><b>{{ show.title }}</b><small>{{ show.artist }}</small></div>
      <span class="link" :class="{ ok: connected }"
        :title="connected ? 'Synced with director' : 'No director signal'">●</span>
      <button class="spk" :aria-pressed="beeps" @click="toggleBeeps"
        :title="beeps ? 'Countdown pips on' : 'Countdown pips off'">{{ beeps ? '🔊' : '🔈' }}</button>
      <span class="tally" :class="{ onair: onAir, stby: standby }"
        :aria-label="onAir ? 'On air' : standby ? 'Standby' : 'Off air'">((•))</span>
    </header>

    <section ref="flowEl" class="flow" aria-label="Shot flow" :style="{ flex: split }">
      <TransitionGroup name="rise" tag="div" class="stack">
        <div v-for="c in flow" :key="c.id" class="row" :class="{ live: c === live, mine: c.cam === cam }">
          <span class="no">{{ c.no }}</span>
          <span class="cam" :style="swatch(camOf(c.cam).color)">{{ c.cam }}</span>
          <span class="txt"><i :style="bar(c)"></i><span class="lbl"><small>{{ dur(c.end - c.start) }}</small><b>{{ c.note ||
            camOf(c.cam).name }}</b></span></span>
        </div>
      </TransitionGroup>
    </section>

    <div class="me" :class="{ onair: onAir, stby: standby }" role="separator" aria-orientation="horizontal"
      aria-label="Resize shot rows" tabindex="0" :aria-valuenow="Math.round(split)" @pointerdown="drag"
      @keydown.up.prevent="setSplit(split - 2)" @keydown.down.prevent="setSplit(split + 2)">
      <span class="cnt">
        <b class="count">{{ left == null ? '—' : Math.ceil(left) }}</b>
        <small class="state">{{ onAir ? 'ON AIR' : standby ? 'STANDBY' : nextMine ? 'NEXT IN' : 'DONE' }}</small>
      </span>
      <span class="track"><i :style="{ width: left == null ? 0 : pct(Math.min(left, WINDOW)) }"></i></span>
    </div>

    <section ref="ownEl" class="flow own" :aria-label="`Camera ${cam} shots`" :style="{ flex: 100 - split }">
      <TransitionGroup name="rise" tag="div" class="stack">
        <div v-for="c in mine.slice(0, ROWS)" :key="c.id" class="mrow" :class="{ live: c.id === live?.id }">
          <span class="otrack"><i :style="bar(c)"></i></span>
          <span class="no">{{ c.no }}</span>
          <i class="stripe" :style="{ background: me.color }"></i>
          <span class="info"><b>{{ c.note || me.name }}</b><small>{{ dur(c.end - c.start) }}<template
            v-if="c.gap != null"> · {{ dur(c.gap) }} reset</template></small></span>
          <span class="when">{{ c.id === live?.id ? 'LIVE' : `in ${dur(c.start - clock.now)}` }}</span>
        </div>
      </TransitionGroup>
      <p v-if="!mine.length" class="empty">No more shots for camera {{ cam }}.</p>
    </section>

    <footer>
      <span class="play">{{ clock.playing ? '▶' : '❚❚' }}</span>
      <span class="time">{{ elapsed(clock.now) }}</span>
      <span class="prog"><i :style="{ width: (clock.now / show.duration) * 100 + '%' }"></i></span>
      <span class="tc">{{ stc(clock.now) }}</span>
    </footer>
  </div>
</template>

<style scoped>
.cv {
  position: relative;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
  color: var(--text);
  user-select: none;
}

/* tally frame drawn on top of everything, so row backgrounds can't cover it: red on air, green on standby */
.cv.onair::after,
.cv.stby::after {
  --t: var(--red);
  content: '';
  position: absolute;
  inset: 0;
  box-shadow: inset 0 0 0 6px var(--t), inset 0 0 28px 10px color-mix(in srgb, var(--t) 70%, transparent);
  pointer-events: none;
  z-index: 5;
}

.cv.stby::after {
  --t: var(--green);
}

header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--rim);
  flex: none;
}

.sno {
  font-size: 22px;
  color: var(--dim);
  min-width: 28px;
  text-align: center;
}

.song {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}

.song b {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.song small {
  color: var(--dim);
}

.link {
  color: var(--faint);
  font-size: 14px;
}

.link.ok {
  color: var(--green);
}

.tally {
  padding: 6px 12px;
  border-radius: 999px;
  background: var(--fill);
  color: var(--dim);
  box-shadow: var(--rim);
  font-weight: 700;
  font-size: 13px;
}

.tally.onair {
  background: var(--red);
  color: #fff;
}

.tally.stby {
  background: var(--green);
  color: #000;
}

.flow {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 4px 8px;
}

.stack {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

/* a finished shot slides up and out, the rest follow */
.rise-move,
.rise-enter-active,
.rise-leave-active {
  transition: transform .25s, opacity .25s;
}

.rise-leave-active {
  position: absolute;
  width: 100%;
}

.rise-leave-to {
  transform: translateY(-100%);
  opacity: 0;
}

.rise-enter-from {
  opacity: 0;
}

.row {
  display: grid;
  grid-template-columns: 44px 52px 1fr;
  min-height: 50px;
  flex: none;
  background: var(--bg2);
  border-radius: var(--r-sm);
  overflow: hidden;
}

.no {
  align-self: center;
  text-align: right;
  padding-right: 8px;
  color: var(--dim);
  font-size: 14px;
}

.cam {
  display: grid;
  place-items: center;
  font-size: 22px;
  font-weight: 700;
  color: #fff;
}

.txt {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4px 0;
  overflow: hidden;
  line-height: 1.25;
}

.lbl {
  position: relative;
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 0 8px;
}

.txt i {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: .55;
}

.lbl small,
.lbl b {
  position: relative;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lbl small {
  font-size: 13px;
  color: var(--dim);
}

.lbl b {
  font-weight: 400;
  font-size: 15px;
  text-transform: uppercase;
}

.row.live .lbl b {
  font-weight: 700;
}

/* own shots: a list entry over its sliding bar */
.mrow {
  position: relative;
  overflow: hidden;
  display: grid;
  grid-template-columns: 44px 6px 1fr auto;
  align-items: center;
  gap: 0 12px;
  padding: 10px 12px 10px 0;
  background: var(--bg2);
  border-radius: var(--r-sm);
}

/* the bar area starts 96px in, where the shot flow's does, and slides under the text */
.otrack {
  position: absolute;
  inset: 0 0 0 96px;
  overflow: hidden;
}

.otrack i {
  position: absolute;
  top: 0;
  bottom: 0;
  opacity: .35;
}

.mrow > :not(.otrack) {
  position: relative;
}

.mrow.live {
  background: color-mix(in srgb, var(--red) 35%, var(--bg2));
}

.stripe {
  align-self: stretch;
  border-radius: 3px;
}

.info {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.info b {
  font-size: 18px;
  font-weight: 400;
}

.mrow.live .info b {
  font-weight: 700;
}

.info small {
  color: var(--dim);
  font-variant-numeric: tabular-nums;
}

.when {
  font-size: 18px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}

.flow:not(.own) .row.mine {
  box-shadow: inset 0 0 0 2px var(--faint);
}

/* same 96px lead column and 8px side margins as the shot rows, so every bar shares one playhead */
.me {
  display: grid;
  grid-template-columns: 96px 1fr;
  align-items: center;
  height: 52px;
  margin: 0 8px;
  border-radius: var(--r-sm);
  flex: none;
  background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--float);
  cursor: row-resize;
  touch-action: none;
}

.me:focus-visible {
  outline: 3px solid var(--blue);
  outline-offset: -2px;
}

.me.stby {
  background: var(--green);
  color: #000;
}

.me.onair {
  background: var(--red);
}

.spk {
  background: none;
  box-shadow: none;
  font-size: 18px;
  padding: 0;
}

.mnum {
  padding: 2px 12px;
  border-radius: var(--r-sm);
  font-size: 22px;
  font-weight: 800;
  color: #fff;
}

.cnt {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.1;
}

.count {
  text-align: center;
  font-size: 28px;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}

.track {
  height: 26px;
  position: relative;
}

.track i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: currentColor;
}

.state {
  font-weight: 800;
  letter-spacing: .06em;
  font-size: 11px;
}

.empty {
  color: var(--dim);
  text-align: center;
  margin: 16px;
}

footer {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
  background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur);
  box-shadow: var(--rim);
  flex: none;
}

.play {
  color: var(--dim);
}

.time {
  font-size: 20px;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}

.prog {
  flex: 1;
  height: 6px;
  border-radius: 999px;
  overflow: hidden;
  background: var(--fill);
  position: relative;
}

.prog i {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: var(--blue);
}

.tc {
  font-size: 13px;
  color: var(--dim);
}
</style>
