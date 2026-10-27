<script setup>
import { SkipBack, SkipForward, Play, Pause } from 'lucide-vue-next'
import { computed } from 'vue'
import { live, remote, clock, tc, swatch } from './store'
import { liveHere, openItem } from './library'
import { link, takeOver } from './sync'

// Spotify-style player bar for a director window that isn't the active one: what the active window plays,
// with its transport. This window's own editor stays free to work on another performance.
const s = computed(() => live.show)
const onAir = computed(() => {
  const cue = [...(s.value?.cues ?? [])].sort((a, b) => a.start - b.start).findLast(c => c.start <= live.now)
  return cue && (s.value.cams.find(c => c.id === cue.cam) ?? { name: '?', color: '#8e8e93' })
})
const at = d => liveHere.value?.r.items[liveHere.value.i + d]
const open = d => remote.send({ cmd: 'open', item: at(d) })
const watching = computed(() => clock.following)
</script>

<template>
  <div class="player" role="region" aria-label="Now live">
    <span class="state" :class="{ on: live.playing }">{{ live.playing ? 'LIVE' : 'PAUSED' }}</span>
    <template v-if="s">
      <span class="no">{{ s.songNo }}</span>
      <div class="what">
        <b>{{ s.artist }} <span>{{ s.title }}</span></b>
        <small v-if="liveHere">{{ liveHere.p.name }} › {{ liveHere.r.name }} · {{ liveHere.i + 1 }}/{{ liveHere.r.items.length }}</small>
      </div>
      <div class="transport">
        <button @click="open(-1)" :disabled="!at(-1)" aria-label="Previous performance on the live window"><SkipBack /></button>
        <button class="pp" @click="remote.send({ cmd: live.playing ? 'pause' : 'play' })" :aria-label="live.playing ? 'Pause the live window' : 'Play the live window'"><Pause v-if="live.playing" /><Play v-else /></button>
        <button @click="open(1)" :disabled="!at(1)" aria-label="Next performance on the live window"><SkipForward /></button>
      </div>
      <span class="tc">{{ tc(live.now + (s.tcOffset ?? 0)) }}</span>
      <span v-if="onAir" class="cam" :style="swatch(onAir.color)" title="On air">{{ onAir.name }}</span>
      <button v-if="!watching && liveHere" class="watch" @click="openItem(liveHere.r.items[liveHere.i])" title="Open the live performance here and follow it">Watch</button>
      <span v-else-if="watching" class="following">Following</span>
    </template>
    <span v-else class="what"><small>Waiting for the live window…</small></span>
    <button class="take" @click="takeOver" :disabled="link.taking">{{ link.taking ? 'Loading video…' : 'Take over' }}</button>
    <i class="prog" :style="{ width: s ? `${Math.min(100, live.now / s.duration * 100)}%` : 0 }"></i>
  </div>
</template>

<style scoped>
.player { position: relative; display: flex; align-items: center; gap: 12px; padding: 6px 16px 8px; background: var(--bg2); border-bottom: 1px solid var(--line); font-size: 13px; }
.state { font-size: 11px; font-weight: 600; letter-spacing: .06em; padding: 2px 8px; border-radius: var(--r-sm); box-shadow: var(--rim); color: var(--dim); }
.state.on { background: var(--red); color: #fff; box-shadow: none; }
.no { min-width: 28px; height: 28px; display: grid; place-items: center; border-radius: var(--r-sm); box-shadow: inset 0 0 0 1px var(--line); font-weight: 600; }
.what { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.what b { font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.what b span { font-weight: 400; color: var(--dim); }
.what small { color: var(--dim); font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.transport { display: flex; gap: 4px; }
.transport button { background: none; padding: 4px 8px; }
.transport button:hover { background: var(--fill); }
.transport .pp { background: var(--primary); color: var(--primary-fg); width: 32px; padding: 4px 0; }
.transport .pp:hover { background: var(--primary); opacity: .9; }
.tc { font-family: var(--mono); color: var(--dim); }
.cam { font-size: 12px; font-weight: 600; padding: 2px 8px; border-radius: var(--r-sm); }
.following { font-size: 12px; color: var(--dim); }
.take { background: var(--primary); color: var(--primary-fg); }
.take:hover { background: var(--primary); opacity: .9; }
.prog { position: absolute; left: 0; bottom: -1px; height: 2px; background: var(--red); transition: width .1s linear; }
@media (max-width: 700px) { .tc, .what small, .following { display: none; } }
@media (prefers-reduced-motion: reduce) { .prog { transition: none; } }
</style>

<style>
/* in the sidebar: a stacked card, like a mini player */
.side .player { display: grid; grid-template-columns: auto 1fr auto; grid-template-areas: 'state tc tc' 'no what what' 'prog prog prog' 'tr tr tr' 'watch watch watch' 'take take take'; gap: 8px; margin: 8px 0; padding: 12px; border: 0; border-radius: var(--r-lg); background: var(--bg3); box-shadow: var(--rim); }
.side .player .state { grid-area: state; justify-self: start; }
.side .player .tc { grid-area: tc; justify-self: end; font-size: 12px; }
.side .player .cam { display: none; }
.side .player .no { grid-area: no; justify-self: start; }
.side .player .what { grid-area: what; }
.side .player .transport { grid-area: tr; justify-content: center; }
.side .player .transport button { text-align: center; }
.side .player .watch, .side .player .following { grid-area: watch; text-align: center; }
.side .player .watch { background: var(--fill); }
.side .player .take { grid-area: take; text-align: center; }
.side .player .prog { grid-area: prog; position: static; height: 3px; border-radius: 2px; justify-self: start; }
</style>
