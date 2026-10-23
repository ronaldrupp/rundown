<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { show, clock, toggle, seek, tc, parseTc, addCue, snapBeat, spb, rundowns, loadShow, loadMedia, undo, redo } from './store'
import { publish, follow } from './sync'
import Rundown from './Rundown.vue'
import CamView from './CamView.vue'

// deep link: #live&show=<rundown name>&t=<seconds>, or #cam=<n> for a camera operator view
const link = new URLSearchParams(location.hash.slice(1))
const cam = +link.get('cam') || null
const view = ref(link.has('live') ? 'live' : 'rundown')
addEventListener('hashchange', () => location.reload()) // deep links are read once at startup
if (cam) follow()
else {
  publish()
  if (rundowns[link.get('show')]) loadShow(link.get('show')).then(() => link.has('t') && seek(+link.get('t')))
  else loadMedia().then(() => link.has('t') && seek(+link.get('t')))
}

// keys: space = play/pause, 1-9/0 = record a cut to that camera at the playhead, arrows = nudge one bar
function onKey(e) {
  if (e.target.matches('input, select, textarea')) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
  if (e.code === 'Space') { e.preventDefault(); toggle() }
  else if (/^[0-9]$/.test(e.key) && show.cams[(+e.key || 10) - 1]) addCue(snapBeat(clock.now), show.cams[(+e.key || 10) - 1].id)
  else if (e.key === 'ArrowLeft') seek(clock.now - spb() * show.beatsPerBar)
  else if (e.key === 'ArrowRight') seek(clock.now + spb() * show.beatsPerBar)
  else if (e.key === 'Home') seek(0)
  else if (e.key === 'l') view.value = view.value === 'live' ? 'rundown' : 'live'
}
onMounted(() => cam || addEventListener('keydown', onKey))
onUnmounted(() => removeEventListener('keydown', onKey))
</script>

<template>
  <CamView v-if="cam" :cam="cam" />
  <template v-else>
  <header>
    <div class="prod">
      <div><input v-model="show.production" aria-label="Production" /><span class="badge">Production</span></div>
      <input class="ep" v-model="show.episode" aria-label="Episode" />
    </div>
    <div class="song">
      <select class="pick" @change="loadShow($event.target.value); $event.target.value = ''" aria-label="Open rundown">
        <option value="">Open…</option><option v-for="(_, name) in rundowns" :key="name">{{ name }}</option>
      </select>
      <input class="no" type="number" v-model.number="show.songNo" aria-label="Song number" />
      <div><input class="artist" v-model="show.artist" aria-label="Artist" /><input v-model="show.title" aria-label="Title" /></div>
    </div>
    <div class="ltc">
      <span class="badge out">LTC</span>
      <div><input class="mono" :value="tc(show.tcOffset)" @change="show.tcOffset = parseTc($event.target.value) ?? show.tcOffset" aria-label="Start timecode" />
        <small>{{ Math.floor(show.duration / 60) }}:{{ String(Math.floor(show.duration % 60)).padStart(2, '0') }}</small></div>
    </div>
    <button class="live" :class="{ on: view === 'live' }" @click="view = view === 'live' ? 'rundown' : 'live'">LIVE</button>
  </header>
  <main>
    <Rundown :live-mode="view === 'live'" />
  </main>
  <footer>Space play/pause · 1–9, 0 cut to camera · drag shots to move cuts · ⌘Z / ⇧⌘Z undo/redo · ←/→ one bar · wheel scrubs · L toggles LIVE</footer>
  </template>
</template>

<style>
:root { --bg: #000; --panel: #141414; --line: #2a2a2a; --text: #e6e9ef; --dim: #8a93a3; --red: #e5484d; color-scheme: dark; }
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.4 system-ui, sans-serif; }
#app { display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 24px; padding: 6px 16px; background: #1c1c1c; border-bottom: 1px solid #000; }
header input { background: none; border: 0; padding: 0; }
header input:focus { outline: 1px solid #444; }
.prod { flex: 1; font-size: 13px; }
.prod div { display: flex; gap: 6px; align-items: center; }
.prod input { width: 12em; }
.ep { font-weight: 600; }
.badge { background: #2563eb; color: #fff; font-size: 11px; padding: 1px 6px; border-radius: 3px; }
.badge.out { background: none; border: 1px solid var(--dim); color: var(--dim); }
.song { flex: 1; display: flex; align-items: center; gap: 10px; }
.song .pick { width: 5.5em; color: var(--dim); }
.song .no { width: 2.2em; height: 36px; text-align: center; font-size: 20px; border: 2px solid #3ddc84 !important; border-radius: 6px; -moz-appearance: textfield; }
.song .no::-webkit-inner-spin-button { display: none; }
.song div { display: flex; flex-direction: column; font-size: 13px; }
.song .artist { font-weight: 700; text-transform: uppercase; }
.ltc { display: flex; align-items: center; gap: 10px; }
.ltc div { display: flex; flex-direction: column; align-items: center; font-size: 13px; }
.ltc input { width: 7em; text-align: center; color: var(--dim); }
button.live { margin-left: auto; padding: 6px 14px; font-weight: 600; background: #2a2a2a; }
button.live.on { background: var(--red); color: #fff; }
main { flex: 1; min-height: 0; overflow: auto; }
footer { padding: 4px 12px; color: var(--dim); font-size: 12px; border-top: 1px solid var(--line); }
button, input, select { font: inherit; color: inherit; background: #222832; border: 1px solid var(--line); border-radius: 4px; padding: 4px 8px; }
button { cursor: pointer; }
button:hover { background: #2c3440; }
input[type=number] { width: 4.5em; }
label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
</style>
