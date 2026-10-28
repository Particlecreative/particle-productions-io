FROM node:20-alpine

# Install ffmpeg for video frame extraction, yt-dlp for YouTube downloads, pg_dump for the nightly database backup
RUN apk add --no-cache ffmpeg python3 py3-pip postgresql16-client && \
    pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]
