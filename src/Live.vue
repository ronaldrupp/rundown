<script setup>
import { computed } from 'vue'
import { show, clock, cues, liveIdx, camOf, stc, secs } from './store'

const WINDOW = 12 // seconds shown across the bar area
const ROWS = 14
const pct = t => `${(t / WINDOW) * 100}%`

const live = computed(() => cues.value[liveIdx.value])
const upcoming = computed(() => cues.value.slice(liveIdx.value + 1, liveIdx.value + 1 + ROWS))
// per camera: seconds until its next shot (or time left if it is on air)
const camTimes = computed(() => show.cams.map(cam => {
  const onair = live.value?.cam === cam.id
  const nxt = cues.value.find((c, i) => i > liveIdx.value && c.cam === cam.id)
  return { cam, onair, isNext: !onair && nxt && nxt === cues.value[liveIdx.value + 1], t: onair ? live.value.end - clock.now : nxt && nxt.start - clock.now }
}))
// the bar's position relative to now; the on-air shot's bar shrinks into the now-line
const bar = c => ({ left: pct(Math.max(0, c.start - clock.now)), width: pct(c.end - Math.max(c.start, clock.now)), background: camOf(c.cam).color })
</script>

<template>
  <div class="list">
    <div class="rows">
    <div v-if="live" class="row onair">
      <span class="no">{{ liveIdx + 1 }}</span>
      <span class="cam" :style="{ background: camOf(live.cam).color }">{{ live.cam }}</span>
      <span class="cnt red">{{ secs(live.end - clock.now) }}</span>
      <span class="txt"><i :style="bar(live)"></i><b>{{ live.note || camOf(live.cam).name }}</b></span>
    </div>
    <div class="row now">
      <span class="tc">{{ stc(clock.now) }}</span>
      <span class="txt"></span>
    </div>
    <div v-for="(c, i) in upcoming" :key="c.id" class="row">
      <span class="no">{{ liveIdx + i + 2 }}</span>
      <span class="cam" :style="{ background: camOf(c.cam).color }">{{ c.cam }}</span>
      <span class="cnt">{{ secs(c.end - c.start) }}</span>
      <span class="txt"><i :style="bar(c)"></i><b>{{ c.note || camOf(c.cam).name }}</b></span>
    </div>
    </div>
    <div class="cams">
      <div v-for="x in camTimes" :key="x.cam.id" class="tile" :class="{ onair: x.onair, next: x.isNext, done: x.t == null }">
        <b>{{ x.t == null ? '—' : secs(x.t) }}</b><span :style="{ background: x.cam.color }">{{ x.cam.id }}</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.list { height: 100%; overflow: hidden; background: #0b0b0b; border-left: 3px solid var(--red); display: flex; flex-direction: column; }
.row { display: grid; grid-template-columns: 52px 64px 56px 1fr; align-items: center; height: 36px; flex: none; font-size: 17px; text-transform: uppercase; }
.no { text-align: right; padding-right: 12px; color: #bbb; }
.cam { height: 100%; display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 18px; text-shadow: 0 1px 2px #0006; }
.cnt { text-align: right; padding-right: 12px; color: #ddd; font-variant-numeric: tabular-nums; }
.cnt.red { color: var(--red); font-weight: 700; }
.txt { position: relative; height: 100%; display: flex; align-items: center; border-left: 1px solid #333; overflow: hidden; }
.txt i { position: absolute; top: 0; bottom: 0; opacity: .75; }
.txt b { position: relative; font-weight: 400; padding-left: 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: #e6e6e6; }
.onair .txt b { color: #fff; font-weight: 600; }
.onair .txt i { opacity: .9; }
.rows { flex: 1; min-height: 0; overflow: hidden; }
.cams { display: flex; overflow-x: auto; flex: none; border-top: 1px solid #333; }
.tile { flex: 0 0 64px; display: flex; flex-direction: column; text-align: center; border-right: 1px solid #333; }
.tile b { height: 36px; line-height: 36px; font-size: 17px; font-weight: 400; color: #ddd; font-variant-numeric: tabular-nums; }
.tile span { height: 36px; display: grid; place-items: center; color: #fff; font-weight: 600; font-size: 18px; text-shadow: 0 1px 2px #0006; }
.tile.onair b { color: var(--red); font-weight: 700; }
.tile.next b { color: #3ddc84; font-weight: 700; }
.tile.done { opacity: .35; }
.now { grid-template-columns: 172px 1fr; }
.now .tc { text-align: right; padding-right: 12px; font: 20px ui-monospace, monospace; color: #fff; }
</style>
