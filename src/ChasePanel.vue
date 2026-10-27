<script setup>
import { X } from 'lucide-vue-next'
import { clock } from './store'
import { chase, connect } from './chase'
defineEmits(['close'])
</script>

<template>
  <div class="panel" role="dialog" aria-label="Chase timecode">
    <div class="row head"><b>Chase timecode</b><button @click="$emit('close')" aria-label="Close"><X /></button></div>
    <label class="row">Source
      <select v-model="chase.src" @change="chase.input = ''; connect()">
        <option value="off">Off (media is the clock)</option><option value="mtc">MIDI timecode (MTC)</option><option value="ltc">LTC on an audio input</option>
      </select>
    </label>
    <template v-if="chase.src !== 'off'">
      <label class="row">Input
        <select v-model="chase.input" @change="connect">
          <option value="">{{ chase.src === 'mtc' ? 'All MIDI inputs' : 'Default input' }}</option>
          <option v-for="i in chase.inputs" :key="i.id" :value="i.id">{{ i.name }}</option>
        </select>
      </label>
      <div class="row"><button @click="connect">Connect</button>
        <span class="status" :class="{ ok: clock.locked, bad: chase.status.startsWith('error') }">{{ clock.locked ? `locked · ${chase.fps} fps` : chase.status }}</span></div>
      <div class="row"><span>Incoming</span><b class="tc">{{ clock.locked ? chase.tc : '--:--:--:--' }}</b></div>
    </template>
    <p class="hint">While chasing, house timecode runs the show: play, pause and seek are off, and the video follows it muted. The song starts at the LTC start time in the header.</p>
  </div>
</template>

<style scoped>
.panel { position: absolute; right: 12px; bottom: 56px; z-index: 10; width: 340px; background: var(--glass-thick); border-radius: var(--r-lg); padding: 14px 16px; box-shadow: var(--float); font-size: 13px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; color: var(--text); }
.row select { width: 200px; }
.head button { background: none; box-shadow: none; }
.status { color: var(--dim); }
.status.ok { color: var(--green); }
.status.bad { color: var(--red); }
.tc { font-family: var(--mono); font-size: 18px; font-weight: 500; }
.hint { color: var(--dim); font-size: 11px; margin: 8px 0 0; }
</style>
