/**
 * The public request link's API client (/api/ticket-share/:token) — no CP login. Same shape as studioApi's ticket
 * methods, so the ticket creator works unchanged; every call carries who the request is from.
 * Local dev uses the studio fixture unless VITE_STUDIO_LIVE=1.
 */
const LIVE = !import.meta.env.DEV || import.meta.env.VITE_STUDIO_LIVE === '1';
const fx = () => import('../components/studio/dev/fixture');

async function call(url, { method = 'GET', body } = {}) {
  const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: body !== undefined ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data = null, json = true;
  try { data = text ? JSON.parse(text) : null; } catch { data = null; json = false; }
  if (!res.ok) {
    const err = new Error((json && data?.error) || (res.status === 504 ? 'That took too long — try again' : res.status >= 502 ? 'The studio’s system is updating — try again in a moment' : `Request failed (${res.status})`));
    err.status = res.status;
    throw err;
  }
  return data;
}

/** getRequester() → { name, email } at the time of each call */
export function shareTicketApi(token, getRequester) {
  const base = `/api/ticket-share/${encodeURIComponent(token)}`;
  let formPromise = null;
  return {
    ticketForm: () => {
      if (!formPromise) formPromise = LIVE ? call(base) : fx().then(m => ({ ...m.fixtureTicketForm, requesters: (m.fixtureTicketForm.people?.requesters?.length ? m.fixtureTicketForm.people.requesters : [{ id: '1', name: 'Dana Levi' }, { id: '2', name: 'Omer Barak' }, { id: '3', name: 'Lilian Krumholz' }]).map(p => ({ id: String(p.id), name: p.name, photo: null })), recent: [] }));
      formPromise.catch(() => { formPromise = null; });
      return formPromise;
    },
    draftTicket: async (body) => (LIVE ? call(`${base}/draft`, { method: 'POST', body: { ...body, requester: getRequester() } }) : (await new Promise(r => setTimeout(r, 700)), (await fx()).fixtureDraft(body))),
    submitTicket: async (body) => (LIVE ? call(`${base}/submit`, { method: 'POST', body: { ...body, requester: getRequester(), confirm: true } }) : { ok: true, id: '1', url: 'https://monday.com', name: 'Test ticket', requester: getRequester()?.name, tagged: true }),
    uploadTicketFile: async (file) => {
      if (!LIVE) {
        await new Promise(r => setTimeout(r, 400));
        const kind = file.type.startsWith('image/') ? 'image' : /pdf/.test(file.type) ? 'pdf' : 'other';
        return { id: `dev-${Date.now()}`, name: file.name, mime: file.type, size: file.size, kind, readable: kind !== 'other' };
      }
      const fd = new FormData();
      fd.append('file', file, file.name || 'pasted-image.png');
      const res = await fetch(`${base}/files`, { method: 'POST', body: fd });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || (res.status === 413 ? 'That file is too large' : `Upload failed (${res.status})`));
      return data;
    },
  };
}
