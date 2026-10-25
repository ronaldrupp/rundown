# Production image: builds the web app, then runs server/index.js (login API, sync websocket,
# YouTube import) serving dist/. Needs Node >= 22.13 for node:sqlite.
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
# ffmpeg merges yt-dlp's video and audio streams; yt-dlp ships as a Python zipapp
# (works on amd64 and arm64). Debian's yt-dlp package is too old for YouTube.
ARG YT_DLP_VERSION=latest
RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg python3 ca-certificates curl \
 && rm -rf /var/lib/apt/lists/* \
 && if [ "$YT_DLP_VERSION" = latest ]; then base=https://github.com/yt-dlp/yt-dlp/releases/latest/download; \
    else base=https://github.com/yt-dlp/yt-dlp/releases/download/$YT_DLP_VERSION; fi \
 && curl -fsSL "$base/yt-dlp" -o /usr/local/bin/yt-dlp \
 && chmod +x /usr/local/bin/yt-dlp \
 && yt-dlp --version

WORKDIR /app
ENV NODE_ENV=production PORT=5173 DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server server
COPY --from=build /app/dist dist
# the server writes downloads to ./media and the SQLite database to $DATA_DIR
RUN mkdir -p media /data
COPY docker-entrypoint.sh /usr/local/bin/

EXPOSE 5173
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --start-interval=1s CMD node -e "fetch('http://localhost:'+process.env.PORT+'/api/me').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["node", "server/index.js"]
