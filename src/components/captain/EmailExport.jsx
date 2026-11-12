import { useState } from 'react';
import { Mail, Download, Loader2 } from 'lucide-react';
import { captainApi } from '../../lib/captainService';

const BRANDS = ['Particle', 'Blurr', 'Biomella', 'Ashford'];

/**
 * Captain as an email proofreader for the Retention team: a .md file they load into Claude (a Project or a Skill).
 * Built fresh from the Brain on every download — what he learned from the videos and Figma designs — and their
 * emails never write back into it.
 */
export default function EmailExport({ notify }) {
  const [brand, setBrand] = useState('Particle');
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState(null);

  const download = async () => {
    setBusy(true);
    try {
      const r = await captainApi.exportEmail(brand);
      const url = URL.createObjectURL(new Blob([r.md], { type: 'text/markdown;charset=utf-8' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: r.filename });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setLast(r);
      notify(`Downloaded ${r.filename}`);
    } catch (err) { notify(err.message, true); } finally { setBusy(false); }
  };

  const c = last?.counts;
  return (
    <div className="trk-glass p-5">
      <div className="flex flex-wrap items-start gap-4">
        <div className="w-10 h-10 rounded-2xl grid place-items-center bg-[#0808f8]/10 text-[#0808f8] flex-none"><Mail size={18} /></div>
        <div className="flex-1 min-w-[260px]">
          <div className="font-semibold text-[15px]">Email proofreader for Retention</div>
          <p className="text-[13px] trk-muted mt-0.5 max-w-[640px]">
            Captain as a .md file the Retention team loads into Claude to proofread emails. It’s built from today’s Brain —
            what he learned from your videos and Figma designs — plus the claims, prices, offer codes and the brand’s website.
            Their emails never change the Brain. Send them a fresh one each month or when a campaign starts.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <label className="grid gap-1"><span className="trk-label">Brand</span>
            <select className="trk-input" value={brand} onChange={(e) => setBrand(e.target.value)} aria-label="Brand">
              {BRANDS.map(b => <option key={b}>{b}</option>)}
            </select>
          </label>
          <button type="button" className="trk-btn primary inline-flex items-center gap-1.5" onClick={download} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Download .md
          </button>
        </div>
      </div>
      {c && (
        <div className="mt-3 text-[12px] trk-muted">
          {last.brand} · {c.terms} terms · {c.rules + c.learned} rules · {c.mistakes} common mistakes · {c.offers} live offers · {c.prices} prices · {c.claims} claims{c.website ? ' · website facts' : ''}
          {c.left_out > 0 && ` · ${c.left_out} video/Figma-only rules left out (subtitles, timing, layers…)`}
        </div>
      )}
    </div>
  );
}
