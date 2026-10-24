<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { FPS, show, clock, toggle, seek, tc, parseTc, addCue, snapBeat, spb, rundowns, loadShow, loadMedia, undo, redo } from './store'
import { publish, follow, link as syncLink } from './sync'
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

// warn when another director window publishes too: camera views can only follow one
const otherDirector = ref(false)
if (!cam) setInterval(() => (otherDirector.value = performance.now() - syncLink.others < 2000), 1000)

// keys: space = play/pause, 1-9/0 = record a cut to that camera at the playhead, arrows = one frame, shift+arrows = one bar
function onKey(e) {
  if (e.target.matches('input, select, textarea')) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
  if (e.code === 'Space') { e.preventDefault(); toggle() }
  else if (/^[0-9]$/.test(e.key) && show.cams[(+e.key || 10) - 1]) addCue(snapBeat(clock.now), show.cams[(+e.key || 10) - 1].id)
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
    e.preventDefault()
    seek(clock.now + (e.key === 'ArrowLeft' ? -1 : 1) * (e.shiftKey ? spb() * show.beatsPerBar : 1 / FPS))
  }
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
    <span v-if="otherDirector" class="warn" title="Another director window is open on this dev server. Camera views follow only one director, so close the others.">⚠ Another director is open</span>
    <button class="live" :class="{ on: view === 'live' }" @click="view = view === 'live' ? 'rundown' : 'live'">LIVE</button>
  </header>
  <main>
    <Rundown :live-mode="view === 'live'" />
  </main>
  <footer>Space play/pause · 1–9, 0 cut to camera · drag shots to move cuts · ⌘Z / ⇧⌘Z undo/redo · ←/→ one bar · wheel scrubs · L toggles LIVE</footer>
  </template>
</template>

<style>
/* Apple HIG dark system colors + Liquid Glass materials; components use these tokens only */
:root {
  color-scheme: dark;
  --bg: #000; --bg2: #1c1c1e; --bg3: #2c2c2e;
  --text: #fff; --dim: rgba(235, 235, 245, .6); --faint: rgba(235, 235, 245, .3);
  --line: rgba(84, 84, 88, .65); --fill: rgba(120, 120, 128, .24); --fill-hi: rgba(120, 120, 128, .36);
  --red: #ff453a; --green: #30d158; --blue: #0a84ff; --orange: #ff9f0a;
  --glass: rgba(30, 30, 32, .55); --glass-thick: rgba(30, 30, 32, .72);
  --glass-blur: blur(24px) saturate(180%);
  /* specular rim: light catches the top edge, a faint ring defines the shape */
  --rim: inset 0 1px 0 rgba(255, 255, 255, .14), inset 0 0 0 .5px rgba(255, 255, 255, .1);
  --float: var(--rim), 0 8px 32px rgba(0, 0, 0, .45);
  --r-sm: 8px; --r: 12px; --r-lg: 20px;
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Inter Variable', Inter, system-ui, sans-serif; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
#app { display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 24px; padding: 8px 16px; background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); box-shadow: var(--rim); border-bottom: .5px solid var(--line); position: relative; z-index: 4; }
header input { background: none; border: 0; padding: 2px 6px; }
header input:focus { background: var(--fill); }
.prod { flex: 1; font-size: 13px; }
.prod div { display: flex; gap: 6px; align-items: center; }
.prod input { width: 12em; }
.ep { font-weight: 600; }
.badge { background: var(--blue); color: #fff; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 999px; }
.badge.out { background: none; box-shadow: inset 0 0 0 1px var(--faint); color: var(--dim); }
.song { flex: 1; display: flex; align-items: center; gap: 10px; }
.song .pick { width: 6em; color: var(--dim); }
.song .no { width: 2.2em; height: 36px; text-align: center; font-size: 20px; font-weight: 600; background: var(--fill); box-shadow: inset 0 0 0 2px var(--green); border-radius: var(--r-sm); -moz-appearance: textfield; }
.song .no::-webkit-inner-spin-button { display: none; }
.song div { display: flex; flex-direction: column; font-size: 13px; }
.song .artist { font-weight: 700; text-transform: uppercase; }
.ltc { display: flex; align-items: center; gap: 10px; }
.ltc div { display: flex; flex-direction: column; align-items: center; font-size: 13px; color: var(--dim); }
.ltc input { width: 7em; text-align: center; color: var(--dim); }
header .warn { margin-left: auto; color: var(--orange); font-size: 12px; font-weight: 600; }
header .warn + button.live { margin-left: 0; }
button.live { margin-left: auto; padding: 6px 16px; font-weight: 600; letter-spacing: .04em; }
button.live.on { background: var(--red); color: #fff; }
main { flex: 1; min-height: 0; overflow: auto; }
footer { padding: 6px 16px; color: var(--dim); font-size: 12px; background: var(--bg2); border-top: .5px solid var(--line); }
/* controls: capsule glass buttons, filled rounded fields */
button, input, select { font: inherit; color: inherit; background: var(--fill); border: 0; border-radius: var(--r-sm); padding: 5px 10px; transition: background .15s, transform .15s; }
button { cursor: pointer; border-radius: 999px; box-shadow: var(--rim); }
button:hover { background: var(--fill-hi); }
button:active { transform: scale(.96); }
:focus-visible { outline: 3px solid color-mix(in srgb, var(--blue) 60%, transparent); outline-offset: 1px; }
input:focus, select:focus { outline: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--blue) 50%, transparent); }
input[type=number] { width: 4.5em; }
input[type=range], input[type=checkbox] { accent-color: var(--blue); }
label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
@media (prefers-reduced-transparency: reduce) { :root { --glass: var(--bg2); --glass-thick: var(--bg2); --glass-blur: none; } }
@media (prefers-reduced-motion: reduce) { button { transition: none; } button:active { transform: none; } }
</style>
