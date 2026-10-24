<script setup>
import { show, swatch } from './store'
import { sw, connect, take } from './switcher'
defineEmits(['close'])
</script>

<template>
  <div class="panel" role="dialog" aria-label="Switcher output">
    <div class="row head"><b>Switcher output</b><button @click="$emit('close')" aria-label="Close">✕</button></div>
    <label class="row">Mixer
      <select v-model="sw.kind" @change="connect">
        <option value="off">Off</option><option value="obs">OBS (WebSocket)</option><option value="vmix">vMix (HTTP API)</option>
      </select>
    </label>
    <template v-if="sw.kind === 'obs'">
      <label class="row">URL <input v-model="sw.obsUrl" /></label>
      <label class="row">Password <input type="password" v-model="sw.password" autocomplete="off" placeholder="if enabled in OBS" /></label>
    </template>
    <label v-if="sw.kind === 'vmix'" class="row">URL <input v-model="sw.vmixUrl" /></label>
    <template v-if="sw.kind !== 'off'">
      <label class="row"><span><input type="checkbox" v-model="sw.preview" /> Send next shot to preview</span></label>
      <div class="row"><button @click="connect">{{ sw.kind === 'obs' ? 'Connect' : 'Apply' }}</button><span class="status" :class="{ ok: /connected|ready/.test(sw.status), bad: sw.status.startsWith('error') }">{{ sw.status }}</span></div>
      <div class="map">
        <div class="mh"><span>Cam</span><span>{{ sw.kind === 'obs' ? 'OBS scene' : 'vMix input' }}</span><span></span></div>
        <div v-for="c in show.cams" :key="c.id" class="mr">
          <b :style="swatch(c.color)">{{ c.id }}</b>
          <input v-model="sw.map[c.id]" :placeholder="`CAM ${c.id}`" :aria-label="`Target for camera ${c.id} ${c.name}`" />
          <button @click="take(c.id)" title="Cut to this now">Take</button>
        </div>
      </div>
    </template>
    <p class="hint">Cuts are sent while the rundown plays. {{ sw.kind === 'obs' ? 'OBS: Tools → WebSocket Server Settings. Connecting sets the OBS transition to Cut.' : sw.kind === 'vmix' ? 'vMix: Settings → Web Controller.' : '' }}</p>
  </div>
</template>

<style scoped>
.panel { position: absolute; right: 12px; bottom: 56px; z-index: 10; width: 340px; max-height: 70vh; overflow: auto; background: var(--glass-thick); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-radius: var(--r-lg); padding: 14px 16px; box-shadow: var(--float); font-size: 13px; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 6px 0; color: var(--text); }
.row input:not([type=checkbox]), .row select { width: 200px; }
.head button { background: none; box-shadow: none; }
.status { color: var(--dim); }
.status.ok { color: var(--green); }
.status.bad { color: var(--red); }
.map { margin-top: 8px; border-top: .5px solid var(--line); padding-top: 6px; }
.mh, .mr { display: grid; grid-template-columns: 36px 1fr 52px; gap: 6px; align-items: center; margin: 4px 0; }
.mh { color: var(--dim); font-size: 11px; }
.mr b { text-align: center; padding: 3px 0; color: #fff; border-radius: 6px; }
.mr button { padding: 3px 6px; font-size: 12px; }
.hint { color: var(--dim); font-size: 11px; margin: 8px 0 0; }
</style>
