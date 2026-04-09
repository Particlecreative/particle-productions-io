FROM node:20-alpine

# Install ffmpeg for video frame extraction and yt-dlp for YouTube downloads
RUN apk add --no-cache ffmpeg python3 py3-pip && \
    pip3 install --break-system-packages yt-dlp

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

COPY src ./src

EXPOSE 3001

CMD ["node", "src/server.js"]
