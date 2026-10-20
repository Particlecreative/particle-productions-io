/**
 * Small ffmpeg helpers (ffmpeg ships in the backend image — see backend/Dockerfile).
 */
const { spawn } = require('child_process');

function run(args, { input = null, timeoutMs = 20000 } = {}) {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    const out = [];
    let err = '';
    const timer = setTimeout(() => { p.kill('SIGKILL'); reject(new Error('ffmpeg timed out')); }, timeoutMs);
    p.stdout.on('data', d => out.push(d));
    p.stderr.on('data', d => { err += d.toString(); if (err.length > 4000) err = err.slice(-4000); });
    p.on('error', e => { clearTimeout(timer); reject(e); });
    p.on('close', code => {
      clearTimeout(timer);
      const buf = Buffer.concat(out);
      if (code === 0 && buf.length) resolve(buf);
      else reject(new Error(`ffmpeg exited ${code}: ${err.split('\n').slice(-3).join(' ')}`));
    });
    if (input) { p.stdin.on('error', () => {}); p.stdin.end(input); } else p.stdin.end();
  });
}

/** JPEG poster frame (~1s in) from a video URL (range-capable HTTP; large masters get a longer budget). */
function posterFromUrl(url, { width = 640, timeoutMs = 30000 } = {}) {
  return run(['-hide_banner', '-loglevel', 'error', '-ss', '1', '-i', url, '-frames:v', '1',
    '-vf', `scale=${width}:-2`, '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { timeoutMs });
}

/** Downscale image bytes to a JPEG of at most `width` px wide. */
function downscaleImage(bytes, { width = 640 } = {}) {
  return run(['-hide_banner', '-loglevel', 'error', '-i', 'pipe:0', '-frames:v', '1',
    '-vf', `scale='min(${width},iw)':-2`, '-q:v', '4', '-f', 'image2', '-c:v', 'mjpeg', 'pipe:1'], { input: bytes });
}

module.exports = { posterFromUrl, downscaleImage };
