<script setup>
import { PanelLeftClose, PanelLeftOpen, LayoutList, Radio, ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { FPS, show, clock, toggle, seek, tc, parseTc, spb, rundowns, loadShow, loadMedia, undo, redo } from './store'
import { publish, follow, link as syncLink } from './sync'
import { cutTo } from './rehearsal'
import Rundown from './Rundown.vue'
import CamView from './CamView.vue'
import Gate from './Gate.vue'
import Library from './Library.vue'
import Player from './Player.vue'
import { lib, loadLibrary, here, step, openItem } from './library'

// deep link: #live&show=<rundown name>&t=<seconds>, or #cam=<n>&code=<join code> for a camera operator view
const link = new URLSearchParams(location.hash.slice(1))
const cam = +link.get('cam') || null
const code = link.get('code')
const view = ref(link.has('live') ? 'live' : 'rundown')
const browsing = ref(!link.has('live') && !link.has('show')) // the productions/rundowns/performances screen instead of the editor
const browse = path => { lib.path = path; browsing.value = true }
// sidebar drills productions › rundowns › songs, following lib.path; dir picks the slide direction
const prod = computed(() => lib.productions.find(p => p.id === lib.path[0]))
const run = computed(() => prod.value?.rundowns.find(r => r.id === lib.path[1]))
const dir = ref('in')
watch(() => lib.path.length, (n, o) => (dir.value = n > o ? 'in' : 'out'))
function pick(x) {
  if (lib.path.length < 2) return browse([...lib.path, x.id])
  openItem(x)
  browsing.value = false
}
addEventListener('hashchange', () => location.reload()) // deep links are read once at startup

// director: { email, code } once logged in; gate: which form to show before that
const director = ref(null), gate = ref('')
if (cam) code && follow(code)
else fetch('/api/me').then(r => r.json()).then(u => (u.email ? start(u) : (gate.value = u.setup ? 'setup' : 'login')))

async function start(u) {
  director.value = u
  const { show: saved } = await (await fetch('/api/show')).json()
  if (saved) Object.assign(show, saved) // the account's rundown wins over this browser's copy
  publish()
  loadLibrary().then(() => here.value && !browsing.value && (lib.path = [here.value.p.id, here.value.r.id]))
  if (rundowns[link.get('show')]) loadShow(link.get('show')).then(() => link.has('t') && seek(+link.get('t')))
  else loadMedia().then(() => link.has('t') && seek(+link.get('t')))
}
const logout = () => fetch('/api/logout', { method: 'POST' }).then(() => location.reload())
const side = ref(true) // sidebar open, like Claude's desktop app
const copied = ref(false)
function copyJoin() {
  navigator.clipboard.writeText(`${location.origin}/#cam=1&code=${director.value.code}`)
  copied.value = true
  setTimeout(() => (copied.value = false), 1500)
}


// keys: space = play/pause, 1-9/0 = record a cut to that camera at the playhead, arrows = one frame, shift+arrows = one bar
function onKey(e) {
  // space plays/pauses from anywhere except a text field, so it never opens a focused select or presses a focused button
  if (e.code === 'Space' && !e.target.matches('textarea, input:not([type=checkbox], [type=radio], [type=range], [type=color])')) { e.preventDefault(); return toggle() }
  if (browsing.value || e.target.matches('input, select, textarea')) return
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); return e.shiftKey ? redo() : undo() }
  if (/^[0-9]$/.test(e.key) && show.cams[(+e.key || 10) - 1]) cutTo(show.cams[(+e.key || 10) - 1].id)
  else if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) { e.preventDefault(); step(e.key === 'ArrowLeft' ? -1 : 1) }
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
  <Gate v-if="cam && (!code || syncLink.denied)" mode="join" :cam="cam" :denied="syncLink.denied" />
  <CamView v-else-if="cam" :cam="cam" />
  <Gate v-else-if="!director && gate" :mode="gate" @in="start" />
  <div v-else-if="director" class="shell">
  <aside class="side" :class="{ closed: !side }" aria-label="Productions">
    <div class="top"><b>Rundown</b><button class="icon" @click="side = false" aria-label="Close sidebar" title="Close sidebar"><PanelLeftClose /></button></div>
    <button class="nav" :class="{ on: browsing && !lib.path.length }" @click="browse([])"><LayoutList /> Productions</button>
    <button class="nav" :class="{ on: view === 'live' && !browsing }" @click="view = 'live'; browsing = false"><Radio /> Live</button>
    <div class="tree">
      <Transition :name="dir">
        <div :key="lib.path.join()" class="level">
          <button v-if="lib.path.length" class="back" @click="browse(lib.path.slice(0, -1))"><ChevronLeft /> {{ run ? prod.name : 'Productions' }}</button>
          <div class="group">{{ run?.name ?? prod?.name ?? 'Productions' }}</div>
          <button v-for="x in run?.items ?? prod?.rundowns ?? lib.productions" :key="x.id" class="item" :class="{ on: x.id === show.item || x === here?.r || x === here?.p }" @click="pick(x)">
            {{ x.name }}<ChevronRight v-if="!run" class="chev" />
          </button>
        </div>
      </Transition>
    </div>
    <Player v-if="syncLink.active === false" />
    <div class="foot">
      <button class="nav join" @click="copyJoin" title="Copy the camera join link. Camera operators can also enter this code.">{{ copied ? 'Link copied' : `Join ${director.code}` }}</button>
      <button class="nav me" @click="logout" :title="`Logged in as ${director.email}. Click to log out.`"><span class="av">{{ director.email[0].toUpperCase() }}</span><span class="em">{{ director.email }}</span><small>Log out</small></button>
    </div>
  </aside>
  <div class="pane">
  <header>
    <div class="left">
      <button v-if="!side" class="icon" @click="side = true" aria-label="Open sidebar" title="Open sidebar"><PanelLeftOpen /></button>
      <nav class="prod" aria-label="Open performance">
        <div>
          <button class="crumb" @click="browse(here ? [here.p.id] : [])">{{ here?.p.name ?? 'Productions' }}</button>
          <template v-if="here"><span class="sep">–</span><button class="crumb" @click="browse([here.p.id, here.r.id])">{{ here.r.name }}</button></template>
          <span class="badge fps">{{ FPS }}</span>
        </div>
        <button v-if="here" class="ep" @click="browsing = false" title="Open the editor">{{ here.i + 1 }}/{{ here.r.items.length }} · {{ here.r.items[here.i].name }}</button>
      </nav>
    </div>
    <div class="center">
      <button v-if="here" class="icon" @click="step(-1)" :disabled="!here.i" aria-label="Previous performance" title="Previous performance (⌥←)"><ChevronLeft /></button>
      <div class="song">
        <input class="no" type="number" v-model.number="show.songNo" aria-label="Song number" />
        <div><input class="artist" v-model="show.artist" aria-label="Artist" /><input class="title" v-model="show.title" aria-label="Title" /></div>
      </div>
      <div class="ltc">
        <span class="badge out">LTC</span>
        <div><input class="mono" :value="tc(show.tcOffset)" @change="show.tcOffset = parseTc($event.target.value) ?? show.tcOffset" aria-label="Start timecode" />
          <small>{{ Math.floor(show.duration / 60) }}:{{ String(Math.floor(show.duration % 60)).padStart(2, '0') }}</small></div>
      </div>
      <button v-if="here" class="icon" @click="step(1)" :disabled="here.i === here.r.items.length - 1" aria-label="Next performance" title="Next performance (⌥→)"><ChevronRight /></button>
    </div>
    <button class="live" :class="{ on: view === 'live' && !browsing }" @click="view = view === 'live' && !browsing ? 'rundown' : 'live'; browsing = false">LIVE</button>
  </header>
  <main>
    <Library v-if="browsing" @open="browsing = false" />
    <Rundown v-else :live-mode="view === 'live'" />
  </main>
  <footer v-if="!browsing">Space play/pause · 1–9, 0 cut to camera · drag shots to move cuts · ⌘Z / ⇧⌘Z undo/redo · ←/→ one bar · ⌥←/⌥→ previous/next performance · wheel scrubs · L toggles LIVE</footer>
  </div>
  </div>
</template>

<style>
/* shadcn/ui neutral dark theme + Vercel Geist type; components use these tokens only */
:root {
  color-scheme: dark;
  --bg: #0a0a0a; --bg2: #171717; --bg3: #262626;
  --text: #fafafa; --dim: #a1a1a1; --faint: #737373;
  --line: rgba(255, 255, 255, .1); --input: rgba(255, 255, 255, .15);
  --fill: #262626; --fill-hi: #2f2f2f;
  --primary: #e5e5e5; --primary-fg: #171717; --ring: #737373;
  --red: #e5484d; --green: #46a758; --blue: #0090ff; --orange: #f76b15;
  /* solid surfaces; overlays get a border plus shadow-md like shadcn popovers */
  --glass: var(--bg2); --glass-thick: var(--bg2);
  --glass-blur: none;
  --rim: inset 0 0 0 1px var(--line);
  --float: inset 0 0 0 1px var(--line), 0 4px 6px -1px rgba(0, 0, 0, .3), 0 2px 4px -2px rgba(0, 0, 0, .3);
  --r-sm: 6px; --r: 8px; --r-lg: 10px;
  --mono: 'Geist Mono Variable', ui-monospace, SFMono-Regular, Menlo, monospace;
}
* { box-sizing: border-box; }
html, body, #app { margin: 0; height: 100%; }
body { background: var(--bg); color: var(--text); font: 14px/1.4 'Geist Variable', -apple-system, BlinkMacSystemFont, system-ui, sans-serif; font-variant-numeric: tabular-nums; -webkit-font-smoothing: antialiased; }
#app { display: flex; flex-direction: column; }
header { display: flex; align-items: center; gap: 24px; padding: 8px 16px; background: var(--glass); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); border-bottom: 1px solid var(--line); position: relative; z-index: 4; }
header input { background: none; border: 0; box-shadow: none; padding: 2px 6px; }
header input:focus { background: var(--fill); }
.shell { flex: 1; min-height: 0; display: flex; }
.pane { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.side { width: 260px; flex: none; transition: margin-left .25s ease, visibility .25s; display: flex; flex-direction: column; gap: 2px; padding: 8px; background: var(--bg2); border-right: 1px solid var(--line); font-size: 13px; }
/* slides off to the left; visibility (switched after the slide) keeps its controls out of the tab order */
.side.closed { margin-left: -260px; visibility: hidden; }
.side .top { display: flex; align-items: center; justify-content: space-between; padding: 4px 4px 10px 8px; font-size: 15px; }
.side button { background: none; text-align: left; padding: 6px 8px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.side button:hover, .side button.on { background: var(--fill); }
.side .nav { font-weight: 500; }
.tree { flex: 1; min-height: 0; position: relative; overflow: hidden; margin-top: 12px; }
.level { position: absolute; inset: 0; overflow: auto; display: flex; flex-direction: column; gap: 1px; }
.tree .group { color: var(--faint); font-size: 12px; font-weight: 500; padding: 10px 8px 4px; }
.tree .back { color: var(--dim); }
.chev { float: right; color: var(--faint); margin-top: 1px; }
.in-enter-active, .in-leave-active, .out-enter-active, .out-leave-active { transition: transform .25s ease, opacity .25s ease; }
.in-enter-from, .out-leave-to { transform: translateX(100%); }
.in-leave-to, .out-enter-from { transform: translateX(-30%); opacity: 0; }
.tree .item { color: var(--dim); font-weight: 400; }
.tree .item.on { color: var(--text); }
.foot { display: flex; flex-direction: column; gap: 2px; padding-top: 8px; border-top: 1px solid var(--line); }
.foot .join { font-family: var(--mono); letter-spacing: .06em; color: var(--dim); }
.foot .me { display: flex; align-items: center; gap: 8px; }
.av { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; background: var(--primary); color: var(--primary-fg); font-size: 12px; font-weight: 600; }
.em { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.foot .me small { color: var(--faint); }
button.icon { background: none; color: var(--dim); padding: 4px 8px; }
/* top bar: production info left, ‹ song · LTC › centered, LIVE right */
header { display: grid; grid-template-columns: 1fr auto 1fr; gap: 16px; padding: 6px 12px; }
header .left { display: flex; align-items: center; gap: 4px; min-width: 0; }
header .center { display: flex; align-items: center; gap: 12px; }
header .center .icon:disabled { opacity: .3; }
.prod { min-width: 0; font-size: 12px; display: flex; flex-direction: column; align-items: flex-start; }
.prod div { display: flex; gap: 2px; align-items: center; min-width: 0; max-width: 100%; color: var(--faint); }
.prod button { background: none; box-shadow: none; padding: 0 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.prod .crumb { font-weight: 600; color: var(--text); }
.prod .fps { flex: none; margin-left: 6px; font-family: var(--mono); font-size: 11px; padding: 0 5px; background: var(--fill-hi); color: var(--text); }
.ep { font-weight: 500; color: var(--text); max-width: 100%; }
.badge { background: var(--primary); color: var(--primary-fg); font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: var(--r-sm); }
.badge.out { background: none; box-shadow: var(--rim); color: var(--dim); }
.song { display: flex; align-items: center; gap: 8px; }
.song .title { color: var(--dim); }
.song div input { field-sizing: content; min-width: 4em; max-width: 24em; }
.song .no { width: 1.8em; height: 32px; text-align: center; font-size: 20px; font-weight: 600; background: var(--fill); box-shadow: inset 0 0 0 1px var(--green); border-radius: var(--r-sm); -moz-appearance: textfield; }
.song .no::-webkit-inner-spin-button { display: none; }
.song div { display: flex; flex-direction: column; font-size: 13px; }
.song .artist { font-weight: 700; text-transform: uppercase; }
.ltc { display: flex; align-items: center; gap: 10px; }
.ltc div { display: flex; flex-direction: column; align-items: center; font-size: 13px; color: var(--dim); }
.ltc input { width: 7em; text-align: center; color: var(--dim); }
button.live { justify-self: end; padding: 6px 16px; font-weight: 600; letter-spacing: .04em; }
button.live.on { background: var(--red); color: #fff; }
main { flex: 1; min-height: 0; overflow: auto; }
footer { padding: 6px 16px; color: var(--dim); font-size: 12px; background: var(--bg2); border-top: 1px solid var(--line); }
/* controls: shadcn secondary buttons, bordered inputs */
button, input, select { font: inherit; color: inherit; background: var(--fill); border: 0; border-radius: var(--r-sm); padding: 6px 12px; transition: background .15s, box-shadow .15s; }
button { cursor: pointer; font-weight: 500; }
button:disabled { cursor: default; opacity: .5; }
input, select { background: rgba(255, 255, 255, .045); box-shadow: inset 0 0 0 1px var(--input); }
button:hover { background: var(--fill-hi); }
:focus-visible { outline: none; box-shadow: inset 0 0 0 1px var(--ring), 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent); }
input:focus, select:focus { outline: none; box-shadow: inset 0 0 0 1px var(--ring), 0 0 0 3px color-mix(in srgb, var(--ring) 50%, transparent); }
input[type=number] { width: 4.5em; }
input[type=range], input[type=checkbox] { accent-color: var(--primary); }
.lucide { width: 1.15em; height: 1.15em; vertical-align: -.22em; flex: none; }
.sep { color: var(--faint); }
label { display: flex; align-items: center; gap: 4px; color: var(--dim); }
@media (prefers-reduced-motion: reduce) { button, .level, .side { transition: none !important; } }
</style>
