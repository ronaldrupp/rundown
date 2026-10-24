# Rundown

A browser-based camera rundown for music performances in live TV. Plan every camera cut against **timecode** and **musical bars/beats**, then run the show from a **LIVE** view with a scrolling shot waterfall, per-camera countdowns and the program video beside it.

![Director LIVE view and the iPhone camera operator app, camera 2 on air](docs/overview.png)

<sub>Tate McRae's "Housewife" at 20:01:31:19 with camera 2 on air: the director's LIVE view in the browser (left) and the iPhone app as camera 2's operator view (right), synced over the network.</sub>

Built with Vue 3 and Vite. No separate backend: the Vite dev server also downloads reference videos and relays the clock to camera operator devices.

**Vibe-coded and open source.** The web app and the iOS app were built by describing what they should do to an AI coding assistant ([Claude Code](https://claude.com/claude-code)), reviewing the result in the running app, and iterating. The code is MIT-licensed ([see below](#license)): use it, fork it, learn from it. Expect rough edges, and test it yourself before you take it near a real show.

> Inspired by professional show-calling tools such as [LiveEdit](https://liveedit.app) and [CuePilot](https://www.cuepilot.com). This is an independent hobby project. It is not affiliated with, endorsed by or connected to either product or company. All product names and trademarks belong to their respective owners.

## Screenshots

All screenshots show the example rundown for Tate McRae's "Housewife" ([see below](#example-reverse-engineered-shot-list)). The performance video is blurred on purpose.

### iPhone camera operator app

Camera 2 just before and during its shot 32. **Standby** (left): camera 2 is next, so the screen edge glows green and the countdown bar runs down to the cut. **On air** (right): the glow turns red and the shot is marked LIVE. The yellow line is the operator's own note on that shot.

<p>
<img src="docs/ios-standby.png" alt="iPhone camera view on standby: green glow, camera 2 next in 1.7 seconds, with the operator's note on the shot" width="260">
<img src="docs/ios-onair.png" alt="iPhone camera view on air: red glow, camera 2's shot marked LIVE" width="260">
</p>

- **Top:** the whole cut flow, scrolling up under the floating header.
- **Middle:** the countdown to this camera's next cut, or the time left on air. Drag it to resize the two lists; it snaps to the middle of the screen.
- **Below:** only this camera's shots, with the time to reposition between them. Every bar shares one playhead.

Tap a shot to write notes on it, and tap the camera in the header to switch cameras.

**Landscape**: the cut flow on the left, the countdown and this camera's shots on the right.

<img src="docs/ios-landscape.png" alt="iPhone camera view in landscape, camera 2 on air" width="540">

### Browser

**Editor**: shot info with the previous and next shot, camera buttons, program monitor and track timeline.

![Editor](docs/editor.png)

**LIVE**: the shot waterfall with sliding duration bars, per-camera countdowns, and the program monitor with a NOW/NEXT bar.

![LIVE view](docs/live.png)

**Camera operator view** (`/#cam=2` on a tablet, CuePilot-style): the same layout as the iPhone app, following the director's window live.

<img src="docs/camera.png" alt="Camera operator view on a tablet, camera 2 on standby" width="420">

<sub>Video frames (blurred): Tate McRae – 2026 Victoria's Secret Fashion Show Performance, © 2026 RCA Records / Sony Music Entertainment. Shown for illustration only.</sub>

## Features

- **Cut list on timecode and music**: each shot is a cut to a camera that runs until the next cut. Edit a shot by SMPTE timecode (25 fps, with an LTC start offset) or by `bar.beat`, using the song's BPM and time signature.
- **Timeline editor**: switcher track with LiveEdit-style shot blocks, a bar/timecode ruler, an overview strip, lyrics and note tracks, and an audio waveform. The playhead stays fixed while the content scrolls under it.
- **Live cutting**: press `1`–`9` / `0` or click a camera button to cut at the playhead, optionally snapped to the beat.
- **Timeline editing**: drag a shot to move its cut (snapped to the beat, kept between its neighbours), with undo/redo.
- **LIVE mode**:
  - a waterfall list of upcoming shots whose colored bars slide toward the now-line
  - a countdown for every camera to its next shot
  - a program monitor with a timecode/shot overlay and a NOW/NEXT bar with a progress bar
  - a draggable divider between the list and the video
- **Camera operator view**: `/#cam=3` on a tablet or phone shows the cut flow, this camera's countdown bar (ON AIR / STANDBY / NEXT IN) and its own shots with repositioning time. It has an optional spoken "3, 2, 1" and a sync indicator, and follows the director's window live.
- **iPhone and iPad app**: a native camera operator view, and a director remote with play, pause and seek ([see below](#iphone-and-ipad-app)).
- **Switcher output**: sends the planned cuts to **OBS** (WebSocket v5, with password) or **vMix** (HTTP API) while the rundown plays, and optionally the next shot to preview.
- **Caller**: a spoken PA call at each cut ("Five. Next, three.") and a "3, 2, 1" count before longer shots, one voice at a time.
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
| `⌘Z` / `⇧⌘Z` | Undo / redo |
| `L` | Toggle LIVE mode |
| Mouse wheel on timeline | Scrub |

## Camera operator view

Run the dev server on your network, then open a camera's view on each operator's device:

```bash
npm run dev:lan
```

```
http://<your-mac's-ip>:5173/#cam=3
```

The director's window (the normal view) publishes the rundown and clock about 10 times a second over the dev server's WebSocket. Camera views only follow. Keep the director's window in front: browsers slow down background tabs, which pauses the clock updates.

`dev:lan` makes the whole dev server, including the YouTube download endpoint, reachable from your local network. Only use it on networks you trust.

## iPhone and iPad app

`ios/` holds a native SwiftUI app (iOS 26, Liquid Glass) that follows the director's window over the same WebSocket as the browser camera views. The web director stays the host. Tap the camera in the header to pick a camera or the director remote:

- **Camera**: the waterfall from the browser camera view, or a card layout with a big countdown. The screen edge glows green on standby and red on air. Tap a shot to write notes on it; they stay on the device and show in this camera's list. Turn the phone sideways for a side-by-side layout.
- **Director remote**: for a director on the move with an iPad. It shows what is on air and next, plus the whole cut flow. Play, pause, jump one bar, or tap a shot to jump there. The director's browser window carries out each command.

Both shot lists scroll on their own, and **Back to live** returns them to the shot on air.

<img src="docs/ios-ipad-director.png" alt="iPad director remote: on air and next cards, the cut flow and play controls" width="440">

<sub>Director remote on an iPad Pro 11".</sub>

Open `ios/CamOp.xcodeproj` in Xcode 26 or later, pick your team under *Signing & Capabilities*, and run it. In the app's settings (gear icon), enter your Mac's address, for example `192.168.1.10:5173`, with the dev server started via `npm run dev:lan`. iOS asks for local network access the first time. The Xcode project is generated from `ios/project.yml` with [XcodeGen](https://github.com/yonaskolb/XcodeGen) (`cd ios && xcodegen generate`).

Like the browser views, the app trusts anyone on the network: the remote's play, pause and seek commands are not authenticated.

## Switcher output

Open **⇄ Output** in the toolbar, pick the mixer and map each camera to an OBS scene or a vMix input (the default is `CAM <n>`). **Take** cuts to a camera immediately, for testing. During playback, every change of the on-air camera is sent to the mixer.

![OBS Studio in Studio Mode, driven by the rundown](docs/obs.png)

<sub>OBS 32 in Studio Mode, driven by the "Housewife" rundown: camera 5 on Program, the next shot (camera 3) waiting in Preview, and the transition set to Cut. The scenes are plain color cards named `CAM 1`–`CAM 11`.</sub>

- **OBS**: enable *Tools → WebSocket Server Settings*. Connecting sets the OBS transition to **Cut**, so planned cuts land on the frame. After every cut, the next shot is put back into Preview, because OBS moves the previous Program scene there. The default URL is `ws://localhost:4455`. The password is kept in memory only. "Send next shot to preview" needs Studio Mode.
- **vMix**: enable *Settings → Web Controller*. The default URL is `http://localhost:8088`. Calls are fire-and-forget (vMix sends no CORS headers), so a wrong input name fails silently in vMix.

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

### Examples: reverse-engineered shot lists

Two rundowns ship as examples: Tate McRae's "Housewife" (below), and Parov Stelar's "Black Lilies", the interval act of the Eurovision Song Contest 2026 Grand Final in Vienna ([`black-lilies.json`](src/shows/black-lilies.json): 9 cameras, 43 shots, 125 BPM, including dissolves and long single-take crane and Steadicam shots).

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

- The YouTube import and camera-view sync run only with the dev server. A static build has no server to call.
- Sync is last-writer-wins. Run one director window per show.
- Edits live in browser storage only. There's no export or sync yet.
- Downloaded videos are copyrighted by their owners and are excluded from the repo (`media/` is git-ignored). Respect YouTube's Terms of Service and only download content you have the rights to use.

## License

[MIT](LICENSE) © 2026 Ronald Rupp. The license covers the code. It doesn't cover the third-party performances shown in the screenshots or referenced by the example rundowns.
