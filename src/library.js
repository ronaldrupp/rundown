import { reactive, computed, watch, toRaw } from 'vue'
import { show, clock, remote, live, rundowns, openShow, clearHistory } from './store'

// productions > rundowns (e.g. Semi Final 1) > performances (items, e.g. Country 1). A production owns its cameras
// (prod.cams, copied into show.cams of the open performance and back on edits). Each item is one `show`;
// show.item holds the open item's id, so the server saves edits to it. path: the ids the library screen has drilled into.
export const lib = reactive({ productions: [], path: [] })
const id = () => crypto.randomUUID()

// windowId: the server tells the other director windows about a save, but not the one that made it
export const windowId = id()
let timer, saved = ''
const body = () => JSON.stringify({ library: { productions: lib.productions } })
function save() {
  const b = body()
  if (b === saved) return // e.g. the tree another window just saved, reloaded here
  saved = b
  fetch('/api/library', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Window': windowId }, body: b })
}

// also when this window becomes the active one: while it mirrored, its copy may have gone stale
export async function reloadLibrary() {
  const { library } = await (await fetch('/api/library')).json()
  if (library) { lib.productions = library.productions; saved = body() }
  return library
}

export async function loadLibrary() {
  if (!await reloadLibrary()) {
    // first visit: the bundled example songs, plus the rundown this account already had
    show.item ??= id()
    const items = [{ id: show.item, name: show.title || 'My rundown' }, ...Object.keys(rundowns).map(name => ({ id: id(), name, from: name }))]
    lib.productions = [{ id: id(), name: 'Examples', rundowns: [{ id: id(), name: 'Songs', items }] }]
    save()
  }
  watch(() => lib.productions, () => { clearTimeout(timer); timer = setTimeout(save, 500) }, { deep: true })
  // only the active window: a mirroring one gets its cameras with the rundown, and its tree may be stale
  watch(() => show.cams, cams => {
    const p = here.value?.p
    if (p && !clock.following && !same(p.cams, cams)) p.cams = copy(cams)
  }, { deep: true })
  watch(() => [here.value?.p, here.value?.p.cams, clock.following], ([p, cams]) => {
    if (!p || clock.following) return
    if (!cams) p.cams = copy(show.cams) // a production from before camera lists: it takes the open song's cameras
    else if (!same(cams, show.cams)) show.cams = copy(cams)
  }, { deep: true })
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const copy = a => structuredClone(toRaw(a))

// where an item sits: { p: production, r: rundown, i: index }
function where(id) {
  for (const p of lib.productions) for (const r of p.rundowns) {
    const i = r.items.findIndex(it => it.id === id)
    if (i >= 0) return { p, r, i }
  }
  return null
}
export const here = computed(() => where(show.item)) // the one open in this window
export const liveHere = computed(() => live.show && where(live.show.item)) // the one the active window plays

const blank = name => ({ ...rundowns.Demo, title: name, artist: '', cues: [], media: null, tracks: rundowns.Demo.tracks.map(t => ({ ...t, items: [] })) })

// a window that isn't the active one: the live performance mirrors it, any other opens here to work on alone
export async function openItem(it) {
  if (clock.following) { if (it.id === show.item) return; clock.following = false }
  else if (live.show && it.id === live.show.item) return mirror()
  if (it.id === show.item) return // already open; reloading would drop edits the server hasn't saved yet
  const { show: saved } = await (await fetch(`/api/item?id=${encodeURIComponent(it.id)}`)).json()
  // never opened yet: start from its example file, or an empty song with the demo cameras
  const base = saved ?? rundowns[it.from] ?? blank(it.name)
  const p = lib.productions.find(p => p.rundowns.some(r => r.items.some(i => i.id === it.id)))
  await openShow({ ...base, item: it.id, cams: toRaw(p?.cams) ?? base.cams })
  clearHistory()
}

// back to following the active window, with its media loaded so Take over carries on without a gap
export async function mirror() {
  await openShow(live.show)
  clearHistory()
  clock.following = true
}

// previous/next performance in the open rundown
export function step(d) {
  const it = here.value?.r.items[here.value.i + d]
  if (it) openItem(it)
}

export const add = (list, name) => list.push({ id: id(), name, ...(lib.path.length === 0 ? { rundowns: [] } : lib.path.length === 1 ? { items: [] } : {}) })
