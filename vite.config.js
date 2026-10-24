import vue from '@vitejs/plugin-vue'

// the API and sync live in server/index.js, which runs Vite in middleware mode for `npm run dev`
export default {
  plugins: [vue()],
  server: {
    watch: { ignored: ['**/media/**', '**/data/**'] },
    // Vite's defaults plus the account database, which the dev server would otherwise hand out as a file
    fs: { deny: ['.env', '.env.*', '*.{crt,pem}', '**/.git/**', '**/data/**'] },
  },
}
