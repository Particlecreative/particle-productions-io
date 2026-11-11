import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, Pencil, Check } from 'lucide-react';
import { mediumApi } from '../../lib/mediumService';
import { relTime } from './util';

const STATE = { ok: ['✅', 'Read'], partial: ['🟡', 'Partly read'], error: ['⚠️', 'Couldn’t read'], reading: ['⏳', 'Reading now…'] };

/** The brand websites Captain Caption and Medium learn from — products, prices, promises, ingredients, reviews. */
export default function BrandSites({ isAdmin, notify }) {
  const [sites, setSites] = useState(null);
  const [busy, setBusy] = useState(null);
  const [edit, setEdit] = useState({});
  const load = useCallback(async () => { try { setSites((await mediumApi.brandSites()).sites); } catch (e) { notify(e.message, true); } }, [notify]);
  useEffect(() => { load(); }, [load]);

  const read = async (brand) => {
    setBusy(brand);
    try { const r = await mediumApi.brandSiteRead(brand); notify(r.already_queued ? `${brand} is already being read` : `Reading the ${brand} website — a few minutes`); setTimeout(load, 5000); } catch (e) { notify(e.message, true); } finally { setBusy(null); }
  };
  const saveUrl = async (brand) => {
    try { await mediumApi.brandSiteUrl(brand, edit[brand]); setEdit(x => { const n = { ...x }; delete n[brand]; return n; }); notify('Saved — press Read now to read it'); load(); } catch (e) { notify(e.message, true); }
  };

  return (
    <div className="trk-glass rounded-3xl p-6">
      <h3 className="md-h2">🌐 Brand websites</h3>
      <p className="md-sub mt-1 max-w-[680px]">Captain Caption and Medium read each brand’s website — products, prices, promises, claims, key ingredients, ratings and reviews, guarantees — and use it with that brand’s ads only. Re-read every week; the team’s approved claims always win over the website.</p>
      {!sites ? <div className="py-6 text-center trk-muted"><Loader2 className="inline animate-spin" size={16} /></div> : (
        <div className="mt-4 grid gap-1">
          {sites.map(s => {
            const stalled = s.status === 'reading' && s.tried_at && Date.now() - new Date(s.tried_at).getTime() > 30 * 60000;
            const [emoji, label] = stalled ? ['⚪', 'Interrupted — read it again'] : STATE[s.status] || ['⚪', 'Not read yet'];
            return (
              <div key={s.brand} className="md-row !cursor-default flex-wrap">
                <span className="font-semibold w-[90px]" style={{ color: 'var(--trk-text)' }}>{s.brand}</span>
                {edit[s.brand] != null
                  ? <span className="flex gap-1.5 flex-1 min-w-[220px]"><input className="trk-input !py-1" value={edit[s.brand]} onChange={(e) => setEdit({ ...edit, [s.brand]: e.target.value })} aria-label={`${s.brand} website`} /><button type="button" className="trk-btn !p-1.5" onClick={() => saveUrl(s.brand)} aria-label="Save"><Check size={13} /></button></span>
                  : <a className="text-[13.5px] trk-muted hover:underline flex-1 min-w-[180px] truncate" href={s.url} target="_blank" rel="noopener noreferrer">{String(s.url).replace(/^https?:\/\//, '')}</a>}
                <span className="text-[13px] min-w-[220px]" title={s.error || ''}>{emoji} {label}{s.products ? ` · ${s.products} products` : ''}{s.read_at ? ` · ${relTime(s.read_at)}` : ''}{s.error ? <span className="trk-dim"> — {s.error}</span> : null}</span>
                {isAdmin && (
                  <span className="flex gap-1.5 ml-auto">
                    {edit[s.brand] == null && <button type="button" className="trk-btn !p-1.5" onClick={() => setEdit({ ...edit, [s.brand]: s.url })} aria-label={`Change the ${s.brand} website`}><Pencil size={12} /></button>}
                    <button type="button" className="trk-btn !py-1 !text-[12.5px]" disabled={busy === s.brand || (s.status === 'reading' && !stalled)} onClick={() => read(s.brand)}>{busy === s.brand ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Read now</button>
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
