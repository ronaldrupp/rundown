<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { show, clock, cues, liveIdx, camOf, stc } from './store'
import { link } from './sync'

// Camera operator view (CuePilot-style): the whole cut flow on top, this camera's own shots below,
// both on one sliding time axis, and a countdown bar to this camera's next cut in between.
const props = defineProps({ cam: Number })
const WINDOW = 16 // seconds across the bar area
const ROWS = 9

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

// optional spoken "3, 2, 1" before this camera's cuts; one voice, newest call wins
const voice = ref(false)
let lastN = null
watch(left, t => {
  const n = t == null ? null : Math.ceil(t)
  if (voice.value && clock.playing && !onAir.value && n >= 1 && n <= 3 && n !== lastN) {
    speechSynthesis.cancel()
    speechSynthesis.speak(Object.assign(new SpeechSynthesisUtterance(String(n)), { rate: 1.2 }))
  }
  lastN = n
})
</script>

<template>
  <div class="cv">
    <header>
      <span class="sno">{{ show.songNo }}</span>
      <div class="song"><b>{{ show.title }}</b><small>{{ show.artist }}</small></div>
      <span class="link" :class="{ ok: connected }" :title="connected ? 'Synced with director' : 'No director signal'">●</span>
      <span class="tally" :class="{ onair: onAir, stby: standby }" :aria-label="onAir ? 'On air' : standby ? 'Standby' : 'Off air'">((•))</span>
    </header>

    <section class="flow" aria-label="Shot flow">
      <div v-for="c in flow" :key="c.id" class="row" :class="{ live: c === live, mine: c.cam === cam }">
        <span class="no">{{ c.no }}</span>
        <span class="cam" :style="{ background: camOf(c.cam).color }">{{ c.cam }}</span>
        <span class="txt"><i :style="bar(c)"></i><small>{{ dur(c.end - c.start) }}</small><b>{{ c.note || camOf(c.cam).name }}</b></span>
      </div>
    </section>

    <div class="me" :class="{ onair: onAir, stby: standby }">
      <button class="spk" :aria-pressed="voice" @click="voice = !voice" :title="voice ? 'Spoken countdown on' : 'Spoken countdown off'">{{ voice ? '🔊' : '🔈' }}</button>
      <span class="mnum" :style="{ background: me.color }">{{ cam }}</span>
      <span class="count">{{ left == null ? '—' : Math.ceil(left) }}</span>
      <span class="track"><i :style="{ width: left == null ? 0 : pct(Math.min(left, WINDOW)) }"></i></span>
      <span class="state">{{ onAir ? 'ON AIR' : standby ? 'STANDBY' : nextMine ? 'NEXT IN' : 'DONE' }}</span>
    </div>

    <section class="flow own" :aria-label="`Camera ${cam} shots`">
      <div v-for="c in mine.slice(0, ROWS)" :key="c.id" class="row" :class="{ live: c === live }">
        <span class="no">{{ c.no }}</span>
        <span class="cam" :style="{ background: me.color }">{{ cam }}</span>
        <span class="txt"><i :style="bar(c)"></i><small>{{ dur(c.end - c.start) }}<em v-if="c.gap != null">+{{ Math.round(c.gap) }}s</em></small><b>{{ c.note || me.name }}</b></span>
      </div>
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
.cv { height: 100%; display: flex; flex-direction: column; background: #000; color: #eee; user-select: none; }
header { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #141414; flex: none; }
.sno { font-size: 22px; color: #999; min-width: 28px; text-align: center; }
.song { flex: 1; min-width: 0; display: flex; flex-direction: column; line-height: 1.2; }
.song b { font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.song small { color: #999; }
.link { color: #555; font-size: 14px; }
.link.ok { color: #22c55e; }
.tally { padding: 6px 10px; border-radius: 6px; background: #2a2a2a; color: #777; font-weight: 700; font-size: 13px; }
.tally.onair { background: #ff1a1a; color: #fff; }
.tally.stby { background: #16a34a; color: #fff; }
.flow { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; gap: 3px; padding: 3px 0; }
.row { display: grid; grid-template-columns: 44px 52px 1fr; min-height: 50px; flex: none; background: #2b2b2b; }
.no { align-self: center; text-align: right; padding-right: 8px; color: #bbb; font-size: 14px; }
.cam { display: grid; place-items: center; font-size: 22px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px #0008; border-radius: 6px 0 0 6px; }
.txt { position: relative; display: flex; flex-direction: column; justify-content: center; padding: 4px 8px; overflow: hidden; line-height: 1.25; }
.txt i { position: absolute; top: 0; bottom: 0; opacity: .55; }
.txt small, .txt b { position: relative; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.txt small { font-size: 13px; color: #ddd; }
.txt small em { font-style: normal; color: #aaa; margin-left: 28px; }
.txt b { font-weight: 400; font-size: 15px; text-transform: uppercase; }
.row.live .txt b { font-weight: 700; }
.flow:not(.own) .row.mine { box-shadow: inset 0 0 0 2px #fff6; }
.me { display: grid; grid-template-columns: 44px 52px 56px 1fr auto; align-items: center; height: 44px; flex: none; background: #333; }
.me.stby { background: #16a34a; }
.me.onair { background: #ff1a1a; }
.spk { background: none; border: 0; font-size: 18px; padding: 0; }
.mnum { height: 100%; display: grid; place-items: center; font-size: 22px; font-weight: 800; color: #fff; text-shadow: 0 1px 2px #0008; }
.count { text-align: center; font-size: 28px; font-weight: 800; font-variant-numeric: tabular-nums; }
.track { height: 26px; position: relative; }
.track i { position: absolute; left: 0; top: 0; bottom: 0; background: #e8e8e8; }
.state { padding: 0 12px; font-weight: 800; letter-spacing: .06em; font-size: 13px; }
.empty { color: #777; text-align: center; margin: 16px; }
footer { display: flex; align-items: center; gap: 12px; padding: 8px 14px; background: #141414; flex: none; }
.play { color: #999; }
.time { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.prog { flex: 1; height: 6px; background: #333; position: relative; }
.prog i { position: absolute; left: 0; top: 0; bottom: 0; background: #7fb2e5; }
.tc { font: 13px ui-monospace, monospace; color: #999; }
</style>
