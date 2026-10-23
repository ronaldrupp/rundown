import vue from '@vitejs/plugin-vue'
import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'

const YT_HOSTS = ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']

// POST /api/youtube?url=... downloads the video with yt-dlp into ./media and returns its path.
// shortcut: dev-server only; a production build needs a real backend for this
const youtube = {
  name: 'youtube-download',
  configureServer(server) {
    server.middlewares.use('/api/youtube', (req, res) => {
      const send = (code, body) => { res.statusCode = code; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)) }
      let url
      try { url = new URL(new URL(req.url, 'http://x').searchParams.get('url')) } catch { return send(400, { error: 'Invalid URL' }) }
      if (req.method !== 'POST' || url.protocol !== 'https:' || !YT_HOSTS.includes(url.hostname)) return send(400, { error: 'Only https YouTube links are allowed' })
      if (!existsSync('media')) mkdirSync('media')
      // args array, no shell: the URL can't inject commands
      const p = spawn('yt-dlp', ['--no-playlist', '-f', 'bv*[ext=mp4][height<=720]+ba[ext=m4a]/b[ext=mp4]/b', '--merge-output-format', 'mp4',
        '-o', 'media/%(id)s.%(ext)s', '--print', 'after_move:filepath', '--print', 'title', '--no-simulate', '--', url.href])
      let out = '', err = ''
      p.stdout.on('data', d => (out += d))
      p.stderr.on('data', d => (err += d))
      p.on('error', e => send(500, { error: `yt-dlp not available: ${e.message}` }))
      p.on('close', code => {
        if (code !== 0) return send(500, { error: err.trim().split('\n').pop() || 'Download failed' })
        const [title, file] = out.trim().split('\n')
        send(200, { title, file: '/' + file.replace(/^.*?(media\/)/, '$1') })
      })
    })
  },
}

// relays LAN sync messages (src/sync.js) between the director window and camera operator views
const sync = {
  name: 'rundown-sync',
  configureServer(server) {
    for (const ev of ['rundown:show', 'rundown:clock', 'rundown:hello']) server.ws.on(ev, data => server.ws.send(ev, data))
  },
}

export default { plugins: [vue(), youtube, sync], server: { watch: { ignored: ['**/media/**'] } } }
