/**
 * Nightly database backup to Dropbox (/CP Panel Backup/Database/cp-YYYY-MM-DD.sql.gz).
 * The finance log is finance's record now — the database needs a copy outside the server.
 * Cached media / uploaded ticket files are left out (they can be rebuilt).
 */
const { spawn } = require('child_process');
const { Writable } = require('stream');
const { pipeline } = require('stream/promises');
const zlib = require('zlib');
const db = require('../../db');
const W = require('../creative/week');

const EXCLUDE_DATA = ['creative_media_cache', 'studio_ticket_files'];
const CHUNK = 100 * 1024 * 1024;

/** pg_dump → gzip → Buffer. Resolves only when both the dump process exited cleanly and gzip finished. */
async function dump({ timeoutMs = 15 * 60 * 1000 } = {}) {
  const args = ['--no-owner', '--no-acl', ...EXCLUDE_DATA.map(t => `--exclude-table-data=${t}`), process.env.DATABASE_URL];
  const p = spawn('pg_dump', args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', d => { err += d.toString(); });
  const exited = new Promise((resolve, reject) => {
    p.on('error', reject);
    p.on('close', code => (code === 0 ? resolve() : reject(new Error(`pg_dump exited ${code}: ${err.slice(0, 300)}`))));
  });
  const chunks = [];
  const sink = new Writable({ write(chunk, _enc, cb) { chunks.push(chunk); cb(); } });
  const timer = setTimeout(() => p.kill('SIGKILL'), timeoutMs);
  try {
    await Promise.all([pipeline(p.stdout, zlib.createGzip({ level: 9 }), sink), exited]);
  } finally { clearTimeout(timer); }
  return Buffer.concat(chunks);
}

async function upload(token, path, buf) {
  const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/octet-stream' };
  if (buf.length <= CHUNK) {
    const r = await fetch('https://content.dropboxapi.com/2/files/upload', {
      method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': JSON.stringify({ path, mode: 'overwrite', mute: true }) }, body: buf,
    });
    if (!r.ok) throw new Error(`Dropbox upload ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return;
  }
  let r = await fetch('https://content.dropboxapi.com/2/files/upload_session/start', { method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': '{}' }, body: buf.subarray(0, CHUNK) });
  if (!r.ok) throw new Error(`Dropbox session ${r.status}`);
  const { session_id } = await r.json();
  let offset = CHUNK;
  while (buf.length - offset > CHUNK) {
    r = await fetch('https://content.dropboxapi.com/2/files/upload_session/append_v2', { method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': JSON.stringify({ cursor: { session_id, offset } }) }, body: buf.subarray(offset, offset + CHUNK) });
    if (!r.ok) throw new Error(`Dropbox append ${r.status}`);
    offset += CHUNK;
  }
  r = await fetch('https://content.dropboxapi.com/2/files/upload_session/finish', {
    method: 'POST', headers: { ...headers, 'Dropbox-API-Arg': JSON.stringify({ cursor: { session_id, offset }, commit: { path, mode: 'overwrite', mute: true } }) }, body: buf.subarray(offset),
  });
  if (!r.ok) throw new Error(`Dropbox finish ${r.status}`);
}

async function run() {
  const token = await require('../../routes/drive').getDropboxToken();
  if (!token) throw new Error('Dropbox is not connected');
  const buf = await dump();
  const path = `/CP Panel Backup/Database/cp-${W.localDate(Date.now())}.sql.gz`;
  await upload(token, path, buf);
  await db.query(`INSERT INTO app_config (key, value) VALUES ('db_backup_last', $1) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
    [JSON.stringify({ at: new Date().toISOString(), path, bytes: buf.length })]);
  return { path, bytes: buf.length };
}

module.exports = { run, dump };
