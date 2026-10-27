<script setup>
import { ChevronRight, ArrowUp, ArrowDown, X } from 'lucide-vue-next'
import { ref, computed } from 'vue'
import { show, addCam, swatch } from './store'
import { lib, openItem, add } from './library'

// one screen for all three levels: productions, then a production's rundowns, then a rundown's performances
const emit = defineEmits(['open'])
const prod = computed(() => lib.productions.find(p => p.id === lib.path[0]))
const run = computed(() => prod.value?.rundowns.find(r => r.id === lib.path[1]))
const list = computed(() => run.value?.items ?? prod.value?.rundowns ?? lib.productions)
const kind = computed(() => ['production', 'rundown', 'performance'][lib.path.length])
const name = ref('')

function enter(x) {
  if (lib.path.length < 2) return lib.path.push(x.id)
  openItem(x)
  emit('open')
}
function create() {
  if (name.value.trim()) add(list.value, name.value.trim())
  name.value = ''
}
function rename(x) { const n = prompt(`Rename ${kind.value}`, x.name); if (n?.trim()) x.name = n.trim() }
function remove(i) { if (confirm(`Delete "${list.value[i].name}" and everything in it?`)) list.value.splice(i, 1) }
const move = (i, d) => list.value.splice(i + d, 0, ...list.value.splice(i, 1))
// the production's cameras: numbers never shift, so a removed camera leaves a gap and cuts keep their camera
const removeCam = i => confirm(`Remove camera ${prod.value.cams[i].id}? Cuts to it will show "?".`) && prod.value.cams.splice(i, 1)
const count = x => (x.rundowns ? `${x.rundowns.length} rundowns` : x.items ? `${x.items.length} performances` : '')
</script>

<template>
  <section class="lib">
    <nav aria-label="Breadcrumb">
      <button class="crumb" @click="lib.path = []">Productions</button>
      <template v-if="prod"><ChevronRight class="sep" /> <button class="crumb" @click="lib.path = [prod.id]">{{ prod.name }}</button></template>
      <template v-if="run"><ChevronRight class="sep" /> <span>{{ run.name }}</span></template>
    </nav>
    <ol>
      <li v-for="(x, i) in list" :key="x.id" :class="{ open: x.id === show.item }">
        <button class="row" @click="enter(x)">
          <span class="no">{{ i + 1 }}</span><b>{{ x.name }}</b>
          <span v-if="x.id === show.item" class="badge">Open</span><small>{{ count(x) }}</small>
        </button>
        <template v-if="run">
          <button @click="move(i, -1)" :disabled="!i" aria-label="Move up"><ArrowUp /></button>
          <button @click="move(i, 1)" :disabled="i === list.length - 1" aria-label="Move down"><ArrowDown /></button>
        </template>
        <button @click="rename(x)">Rename</button>
        <button class="del" @click="remove(i)" :aria-label="`Delete ${x.name}`"><X /></button>
      </li>
      <li v-if="!list.length" class="empty">No {{ kind }}s yet.</li>
    </ol>
    <form @submit.prevent="create">
      <input v-model="name" :placeholder="`New ${kind}`" :aria-label="`New ${kind}`" />
      <button>Add</button>
    </form>
    <template v-if="prod && !run">
      <h2>Cameras <small>shared by every performance in {{ prod.name }}</small></h2>
      <table v-if="prod.cams?.length">
        <thead><tr><th>Cam</th><th>Name</th><th>Operator</th><th>Position</th><th></th></tr></thead>
        <tbody>
          <tr v-for="(c, i) in prod.cams" :key="c.id">
            <td><label class="num" :style="swatch(c.color)">{{ c.id }}<input type="color" v-model="c.color" :aria-label="`Camera ${c.id} color`" /></label></td>
            <td><input v-model="c.name" @change="c.name = c.name.toUpperCase()" :aria-label="`Camera ${c.id} name`" /></td>
            <td><input v-model="c.operator" placeholder="—" :aria-label="`Camera ${c.id} operator`" /></td>
            <td><input v-model="c.position" placeholder="—" :aria-label="`Camera ${c.id} position`" /></td>
            <td><button class="del" @click="removeCam(i)" :aria-label="`Remove camera ${c.id}`"><X /></button></td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">No cameras yet. Opening a performance gives the production that song's cameras, or add them here.</p>
      <button class="addcam" @click="addCam(prod.cams ??= [])">+ Camera</button>
    </template>
  </section>
</template>

<style scoped>
.lib { max-width: 760px; margin: 0 auto; padding: 24px 16px; display: flex; flex-direction: column; gap: 16px; }
nav { display: flex; align-items: center; gap: 6px; color: var(--faint); font-size: 20px; font-weight: 600; flex-wrap: wrap; }
nav span { color: var(--text); }
.crumb { background: none; box-shadow: none; padding: 2px 6px; color: var(--dim); }
ol { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
li { display: flex; gap: 6px; align-items: center; }
li > button:not(.row) { color: var(--dim); }
.row { flex: 1; display: flex; align-items: center; gap: 12px; text-align: left; padding: 12px 16px; border-radius: var(--r); background: var(--bg2); box-shadow: var(--rim); }
.row:hover { background: var(--bg3); }
.open .row { box-shadow: inset 0 0 0 2px var(--green); }
.no { width: 2em; color: var(--dim); font-weight: 600; }
.row small { margin-left: auto; color: var(--dim); }
.badge { background: var(--green); color: #000; font-size: 12px; font-weight: 500; padding: 2px 8px; border-radius: var(--r-sm); }
.del { color: var(--dim); }
.del:hover { color: var(--red); }
h2 { margin: 16px 0 0; font-size: 17px; }
h2 small { color: var(--dim); font-weight: 400; font-size: 13px; margin-left: 6px; }
table { border-collapse: collapse; width: 100%; }
th { text-align: left; color: var(--dim); font-size: 12px; font-weight: 500; padding: 0 4px 4px; }
td { padding: 2px 4px; }
td input { width: 100%; }
.num { position: relative; justify-content: center; width: 40px; height: 32px; border-radius: var(--r-sm); font-weight: 700; cursor: pointer; }
.num input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.addcam { align-self: flex-start; }
.empty { color: var(--dim); padding: 12px 16px; }
form { display: flex; gap: 8px; }
form input { flex: 1; padding: 9px 12px; }
form button { background: var(--primary); color: var(--primary-fg); font-weight: 500; padding: 9px 18px; }
button:disabled { opacity: .3; }
</style>
