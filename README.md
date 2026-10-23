# Rundown

A browser-based camera rundown for music performances in live TV. Plan every camera cut against **timecode** and **musical bars/beats**, then run the show from a **LIVE** view with a scrolling shot waterfall, per-camera countdowns and the program video beside it.

Built with Vue 3 and Vite. No backend except a small dev-server endpoint for downloading reference videos.

> Inspired by professional show-calling tools such as [LiveEdit](https://liveedit.app) and [CuePilot](https://www.cuepilot.com). This is an independent hobby project. It is not affiliated with, endorsed by or connected to either product or company. All product names and trademarks belong to their respective owners.

## Screenshots

Both screenshots show the example rundown for Tate McRae's "Housewife" ([see below](#example-reverse-engineered-shot-list)).

**Editor**: shot info, camera buttons, program monitor and the track timeline.

![Editor](docs/editor.png)

**LIVE**: the shot waterfall with sliding duration bars, per-camera countdowns, and the program monitor with a NOW/NEXT bar.

![LIVE view](docs/live.png)

<sub>Video frames: Tate McRae – 2026 Victoria's Secret Fashion Show Performance, © 2026 RCA Records / Sony Music Entertainment. Shown as reduced UI screenshots for illustration only.</sub>

## Features

- **Cut list on timecode and music**: each shot is a cut to a camera that runs until the next cut. Edit a shot by SMPTE timecode (25 fps, with an LTC start offset) or by `bar.beat`, using the song's BPM and time signature.
- **Timeline editor**: switcher track with LiveEdit-style shot blocks, a bar/timecode ruler, an overview strip, lyrics and note tracks, and an audio waveform. The playhead stays fixed while the content scrolls under it.
- **Live cutting**: press `1`–`9` / `0` or click a camera button to cut at the playhead, optionally snapped to the beat.
- **LIVE mode**:
  - a waterfall list of upcoming shots whose colored bars slide toward the now-line
  - a countdown for every camera to its next shot
  - a program monitor with a timecode/shot overlay and a NOW/NEXT bar with a progress bar
  - a draggable divider between the list and the video
- **Media**: load a local audio file or a reference video. The video drives the show clock, so picture and UI never drift apart.
- **YouTube import** (dev server only): paste a link and the server downloads it with `yt-dlp`.
- **Rundown files**: every `src/shows/*.json` appears in the **Open…** menu. Your edits autosave to the browser's `localStorage`.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:5173. A demo show loads by default.

The YouTube import also needs:

```bash
brew install yt-dlp ffmpeg
```

## Keyboard

| Key | Action |
| --- | --- |
| `Space` | Play / pause |
| `1`–`9`, `0` | Cut to camera 1–10 at the playhead |
| `←` / `→` | Jump one bar |
| `Home` | Back to start |
| `L` | Toggle LIVE mode |
| Mouse wheel on timeline | Scrub |

## Deep links

Open a rundown at a moment, optionally in LIVE mode:

```
http://localhost:5173/#live&show=Tate%20McRae%20%E2%80%93%20Housewife&t=86.2
```

`show` is the name shown in the **Open…** menu, and `t` is the time in seconds.

## Rundown format

A rundown is plain JSON. See [`src/shows/housewife.json`](src/shows/housewife.json):

```jsonc
{
  "title": "Housewife", "artist": "Tate McRae",
  "bpm": 133, "beatsPerBar": 4, "duration": 171.2,
  "tcOffset": 72000,               // LTC start, seconds (20:00:00:00)
  "media": { "file": "/media/housewife.mp4" },
  "cams": [{ "id": 1, "name": "CU CENTER TELE", "color": "#ff4a12" }],
  "cues": [{ "id": 1, "start": 0, "cam": 4, "note": "CRANE PUSH THRU DANCERS TO STAGE" }],
  "tracks": [{ "id": 2, "name": "Staging", "kind": "note", "items": [{ "id": 1, "start": 0, "text": "Dark open" }] }]
}
```

### Example: reverse-engineered shot list

`housewife.json` maps the camera plan of Tate McRae's "Housewife" performance at the 2026 Victoria's Secret Fashion Show from the published broadcast:

- **Cuts:** found with ffmpeg scene detection.
- **Song boundaries:** found from the audio levels.
- **Tempo and beat phase:** 133 BPM, from onset analysis.
- **Camera positions:** inferred by grouping the shots by framing. They are an interpretation of the edit, not the production's real camera plot.

The video itself is **not** included. To recreate `media/housewife.mp4` locally:

```bash
yt-dlp -f "bv*[ext=mp4][height<=720]+ba[ext=m4a]" --merge-output-format mp4 -o media/full.mp4 "https://www.youtube.com/watch?v=uo4JWL45ESY"
ffmpeg -ss 1.0613 -to 172.24 -i media/full.mp4 -c:v libx264 -c:a aac media/housewife.mp4
```

## How it works

- **One clock.** A `requestAnimationFrame` loop in [`src/store.js`](src/store.js) writes a single reactive `clock.now`. When media is loaded it reads `video.currentTime`, so the decoder is the master clock.
- **Everything else is derived.** Shot end times come from the next cut, and the on-air shot is `findLastIndex(start <= now)`. Program, preview, countdowns and tally colors all derive from those two values.
- **No scroll state.** Timeline items are positioned with `calc(30% + (start - now) * zoom px)`, so the browser does the layout. Only items inside a time window around the playhead are rendered.
- **Waveform.** `decodeAudioData` runs once into a peaks array (50 per second). A canvas redraws only the visible pixels each frame.
- **One `<video>` element** is created once and moved between views, so switching views never re-buffers.
- **YouTube import.** [`vite.config.js`](vite.config.js) adds a middleware that runs `yt-dlp` with an argument array (no shell) and accepts only https YouTube URLs.

## Limitations

- The YouTube import runs only with `npm run dev`. A static build has no server to call.
- Edits live in browser storage only. There's no export or sync yet.
- Downloaded videos are copyrighted by their owners and are excluded from the repo (`media/` is git-ignored). Respect YouTube's Terms of Service and only download content you have the rights to use.
