<script setup>
import { computed } from 'vue'
import { show, clock, cues, liveIdx, camOf, stc, secs } from './store'

const props = defineProps({ cam: Number })
const me = computed(() => camOf(props.cam))
const live = computed(() => cues.value[liveIdx.value])
const onAir = computed(() => live.value?.cam === props.cam)
// my upcoming shots, with their place in the whole cut list
const mine = computed(() => cues.value.map((c, i) => ({ ...c, no: i + 1 })).filter((c, i) => i > liveIdx.value && c.cam === props.cam))
const nextMine = computed(() => mine.value[0])
const standby = computed(() => !onAir.value && nextMine.value?.no === liveIdx.value + 2)
const state = computed(() => (onAir.value ? 'onair' : standby.value ? 'standby' : 'clear'))
const shot = computed(() => (onAir.value ? live.value : nextMine.value))
const timer = computed(() => (onAir.value ? live.value.end - clock.now : nextMine.value ? nextMine.value.start - clock.now : null))
</script>

<template>
  <div class="cv" :class="state" :style="{ '--c': me.color }">
    <div class="top">
      <b class="num">{{ cam }}</b>
      <div class="who"><b>{{ me.name }}</b><small>{{ show.artist }} – {{ show.title }}</small></div>
      <span class="tc">{{ stc(clock.now) }}</span>
    </div>
    <div class="tally">
      <div class="state">{{ onAir ? 'ON AIR' : standby ? 'STANDBY · NEXT' : nextMine ? 'CLEAR' : 'DONE' }}</div>
      <div class="timer" v-if="timer != null">{{ onAir ? 'OFF IN' : 'ON IN' }} {{ secs(timer) }}</div>
      <div class="shot" v-if="shot">{{ shot.note || me.name }}</div>
    </div>
    <ol class="list" aria-label="Your upcoming shots">
      <li v-for="c in mine.slice(onAir ? 0 : 1, 8)" :key="c.id">
        <span class="no">{{ c.no }}</span><span class="in">{{ secs(c.start - clock.now) }}</span>
        <span class="txt">{{ c.note || me.name }}</span><span class="dur">{{ secs(c.end - c.start) }}</span>
      </li>
    </ol>
  </div>
</template>

<style scoped>
.cv { height: 100%; display: flex; flex-direction: column; background: #0b0b0b; }
.top { display: flex; align-items: center; gap: 12px; padding: 8px 16px; background: #161616; }
.num { min-width: 56px; padding: 4px 10px; text-align: center; font-size: 32px; background: var(--c); color: #fff; text-shadow: 0 1px 2px #0006; border-radius: 4px; }
.who { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.who b { font-size: 18px; }
.who small { color: var(--dim); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.tc { font: 18px ui-monospace, monospace; }
.tally { flex: 1; display: grid; place-content: center; text-align: center; gap: 8px; padding: 16px; background: #1a1a1a; }
.onair .tally { background: var(--red); }
.standby .tally { background: #1f8a4c; }
.state { font-size: clamp(36px, 12vw, 120px); font-weight: 800; letter-spacing: .04em; line-height: 1; }
.timer { font-size: clamp(28px, 8vw, 72px); font-variant-numeric: tabular-nums; }
.shot { font-size: clamp(16px, 4vw, 28px); text-transform: uppercase; opacity: .9; }
.clear .state { color: #666; }
.list { list-style: none; margin: 0; padding: 0; max-height: 40%; overflow: auto; }
.list li { display: grid; grid-template-columns: 48px 64px 1fr 56px; align-items: center; height: 40px; border-bottom: 1px solid #222; font-size: 16px; text-transform: uppercase; }
.list .no { text-align: right; padding-right: 10px; color: #999; }
.list .in { text-align: right; padding-right: 12px; font-variant-numeric: tabular-nums; }
.list .txt { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.list .dur { text-align: right; padding-right: 12px; color: #999; }
</style>
