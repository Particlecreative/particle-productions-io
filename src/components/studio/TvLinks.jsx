import { useState } from 'react';
import { Check, Sparkles, HelpCircle, Link2, ExternalLink } from 'lucide-react';
import { Avatar, Card, StatusPill, Empty } from './Bits';
import { studioApi } from '../../lib/studioService';

/**
 * TV tickets ↔ CP productions. Confident name matches link themselves; anything unsure is asked here.
 * Decisions are saved in the CP (Monday is never changed).
 */
export default function TvLinks({ data, items, onChanged }) {
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const tv = items.filter(i => i.division === 'tv' && i.tv);
  const ask = tv.filter(i => i.tv.source === 'ask');
  const linked = tv.filter(i => i.tv.production_id);
  const none = tv.filter(i => i.tv.source === 'none');
  const byProd = new Map();
  for (const it of linked) {
    if (!byProd.has(it.tv.production_id)) byProd.set(it.tv.production_id, []);
    byProd.get(it.tv.production_id).push(it);
  }
  const decide = async (it, body) => {
    setBusy(it.id); setErr(null);
    try { await studioApi.setTvLink(it.id, { ...body, board: it.board }); await onChanged(); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  };

  return (
    <div className="flex flex-col gap-5">
      {err && <div className="px-4 py-2.5 rounded-xl bg-red-50 text-red-700 text-sm">{err}</div>}
      <Card title={<span className="flex items-center gap-2"><HelpCircle size={15} className="text-[#ff7a1a]" /> Needs you · {ask.length}</span>}
        subtitle="I wasn’t sure which production these TV tickets belong to — pick one, or mark it as not a production.">
        {ask.length ? (
          <div className="flex flex-col gap-3">
            {ask.map(it => (
              <AskRow key={it.id} it={it} data={data} busy={busy === it.id} onPick={(pid) => decide(it, { production_id: pid })} onNone={() => decide(it, { decision: 'none' })} />
            ))}
          </div>
        ) : <Empty>Every TV ticket is matched. 🎬</Empty>}
      </Card>

      <Card title={<span className="flex items-center gap-2"><Link2 size={15} className="text-[#0808f8]" /> Productions · {byProd.size}</span>} subtitle="TV tickets grouped under their CP production">
        {byProd.size ? (
          <div className="grid md:grid-cols-2 gap-3">
            {[...byProd.entries()].map(([pid, list]) => {
              const p = data.productions.find(x => x.id === pid) || { id: pid, name: list[0].tv.name };
              return (
                <div key={pid} className="rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[10px] font-mono text-gray-400">{p.id}</span>
                    <span className="text-sm font-bold text-[#030b2e] truncate">{p.name}</span>
                    {p.stage && <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">{p.stage}</span>}
                  </div>
                  <div className="flex flex-col gap-1.5">
                    {list.map(it => (
                      <div key={it.id} className="flex items-center gap-2 text-xs">
                        {it.tv.source === 'auto'
                          ? <span title={`Matched automatically: ${it.tv.why || ''}`}><Sparkles size={12} className="text-[#0808f8]" /></span>
                          : <span title={`Confirmed${it.tv.decided_by ? ` by ${it.tv.decided_by}` : ''}`}><Check size={12} className="text-emerald-600" /></span>}
                        <span className="truncate flex-1 text-gray-800" title={it.name}>{it.name}</span>
                        <StatusPill status={it.status} small />
                        {it.tv.source === 'auto' && (
                          <button type="button" disabled={busy === it.id} onClick={() => decide(it, { production_id: pid })} className="text-[11px] font-semibold text-emerald-700 hover:underline">Confirm</button>
                        )}
                        <select value="" disabled={busy === it.id} title="Move to another production"
                          onChange={(e) => { const v = e.target.value; if (v === '__none') decide(it, { decision: 'none' }); else if (v === '__clear') decide(it, { decision: 'clear' }); else if (v) decide(it, { production_id: v }); }}
                          className="text-[11px] w-6 bg-transparent text-gray-400 hover:text-gray-700 cursor-pointer appearance-none text-center">
                          <option value="">⋯</option>
                          {data.productions.filter(x => x.id !== pid).map(x => <option key={x.id} value={x.id}>Move to {x.id} · {x.name}</option>)}
                          <option value="__none">Not a production</option>
                          {it.tv.source !== 'auto' && <option value="__clear">Undo my choice</option>}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : <Empty>No TV tickets linked yet.</Empty>}
      </Card>

      {none.length > 0 && (
        <Card title={`Not a production · ${none.length}`}>
          <div className="flex flex-col gap-1.5">
            {none.map(it => (
              <div key={it.id} className="flex items-center gap-2 text-xs text-gray-600">
                <span className="truncate flex-1">{it.name}</span>
                <button type="button" onClick={() => decide(it, { decision: 'clear' })} className="text-[11px] font-semibold text-gray-500 hover:text-gray-800">Ask again</button>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

function AskRow({ it, data, busy, onPick, onNone }) {
  const [manual, setManual] = useState('');
  const sugg = it.tv.suggestions || [];
  return (
    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-sm font-semibold text-gray-900 truncate flex-1" title={it.name}>{it.name}</span>
        <div className="flex -space-x-1.5">{it.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={22} ring="#fff" />)}</div>
        <StatusPill status={it.status} small />
        {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={13} /></a>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {sugg.map(s => (
          <button key={s.id} type="button" disabled={busy} onClick={() => onPick(s.id)} title={s.why}
            className="text-xs font-semibold px-3 py-1.5 rounded-full bg-white border border-gray-200 hover:border-[#0808f8] hover:text-[#0808f8] flex items-center gap-1.5">
            <Check size={12} /> {s.name} <span className="text-[10px] text-gray-400 font-mono">{s.id}</span>
          </button>
        ))}
        <select value={manual} disabled={busy} onChange={(e) => { setManual(e.target.value); if (e.target.value) onPick(e.target.value); }}
          className="text-xs px-2 py-1.5 rounded-full border border-gray-200 bg-white max-w-[260px]">
          <option value="">{sugg.length ? 'Another production…' : 'Pick a production…'}</option>
          {data.productions.map(p => <option key={p.id} value={p.id}>{p.id} · {p.name}</option>)}
        </select>
        <button type="button" disabled={busy} onClick={onNone} className="text-xs font-semibold px-3 py-1.5 rounded-full text-gray-500 hover:bg-white">Not a production</button>
      </div>
    </div>
  );
}
