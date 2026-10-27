import { reactive, computed, watch } from 'vue'
import { show, clock, addCue, snapBeat, FPS } from './store'
import { sw } from './switcher'

// Rehearsal take: while Rec is on, camera keys (and the mixer's tally when the switcher only listens) cut into a take
// beside the plan instead of into it. Accept swaps the plan for the take over the stretch that was recorded.
// shortcut: the take lives in this window's memory only, a reload drops it
export const rec = reactive({ on: false, cues: [], from: Infinity, to: -Infinity })

export function record(t, cam) {
  rec.from = Math.min(rec.from, t)
  rec.to = Math.max(rec.to, t)
  const cues = rec.cues.filter(c => Math.abs(c.start - t) >= 1 / FPS) // a second cut on the same frame replaces the first
  if (cues.findLast(c => c.start < t)?.cam === cam) return // already on it, e.g. the tally confirming a key press
  rec.cues = [...cues, { id: Math.max(0, ...cues.map(c => c.id)) + 1, start: t, cam }].sort((a, b) => a.start - b.start)
}
// a camera key: into the take while recording, into the plan otherwise
export const cutTo = (cam, t = snapBeat(clock.now)) => (rec.on ? record(t, cam) : addCue(t, cam))

// the stretch played while recording; playing again from a point records over the take from there
watch(() => clock.now, now => { if (rec.on && clock.playing) { rec.from = Math.min(rec.from, now); rec.to = Math.max(rec.to, now) } })
watch(() => clock.playing, on => { if (on && rec.on) rec.cues = rec.cues.filter(c => c.start <= clock.now) })
watch(() => sw.tally, cam => { if (rec.on && clock.playing && cam != null && !sw.send) record(snapBeat(clock.now), cam) })

// match: the plan has the same camera within 3 frames, so the take agrees with it there
export const take = computed(() => rec.cues.map((c, i) => ({
  ...c, end: rec.cues[i + 1]?.start ?? Math.max(rec.to, c.start + 1),
  match: show.cues.some(p => p.cam === c.cam && Math.abs(p.start - c.start) < 3 / FPS),
})))

export function discard() { Object.assign(rec, { cues: [], from: Infinity, to: -Infinity }) }

// the plan outside the recorded stretch, the take inside it; shot notes carry over from the plan's nearest shot of that camera
export function accept() {
  const from = Math.min(rec.from, rec.cues[0]?.start ?? Infinity), to = Math.max(rec.to, rec.cues.at(-1)?.start ?? -Infinity)
  const near = c => show.cues.filter(p => p.cam === c.cam && Math.abs(p.start - c.start) < 2).sort((a, b) => Math.abs(a.start - c.start) - Math.abs(b.start - c.start))[0]
  const id0 = Math.max(0, ...show.cues.map(c => c.id))
  const merged = [...show.cues.filter(c => c.start < from || c.start > to), ...rec.cues.map((c, i) => ({ id: id0 + i + 1, start: c.start, cam: c.cam, note: near(c)?.note ?? '' }))]
    .sort((a, b) => a.start - b.start)
  show.cues = merged.filter((c, i) => !i || c.cam !== merged[i - 1].cam) // where the take meets the plan, never the same camera twice
  discard()
}
