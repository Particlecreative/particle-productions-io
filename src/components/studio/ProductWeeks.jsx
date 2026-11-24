// By product (Tomer, 24 Nov 2026): every product, week by week — how many video and design tickets are due, how far
// along they are, and which ones are for Meta. For the growth team (Creative Studio) and the Studio (Creative Control's
// neighbour tab). Read-only: a click opens the task.
import { Fragment, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Film, PenTool, ExternalLink, AlertTriangle } from 'lucide-react';
import { studioApi } from '../../lib/studioService';
import { useStudio } from './writes';
import { CATEGORY, CATEGORY_ORDER, NAVY, ELECTRIC, Seg, StackBar, StatusPill } from './Bits';
import { ymd, sundayOf, addDays } from './Filters';
import { productWeeks, isMeta, dueOf } from './byProduct';

const WEEKS = 4;
const BOARD = { video: { label: 'Video', Icon: Film }, design: { label: 'Design', Icon: PenTool } };
const day = (s) => new Date(`${s}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const parts = (list) => CATEGORY_ORDER.map(k => ({ key: k, label: CATEGORY[k].label, color: CATEGORY[k].color, value: list.filter(it => (it.status?.category || 'other') === k).length }));
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

export default function ProductWeeks() {
  const thisWeek = sundayOf(ymd(new Date()));
  const [start, setStart] = useState(thisWeek);
  const [board, setBoard] = useState('all');
  const [platform, setPlatform] = useState('all');
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(null);   // `${product}|${col}`
  const { openTask } = useStudio() || {};

  useEffect(() => {
    let on = true;
    setLoading(true); setError(null);
    studioApi.dashboard({ from: start, to: addDays(start, WEEKS * 7 - 1), lite: true })
      .then(d => { if (on) setData(d); })
      .catch(e => { if (on) setError(e.message); })
      .finally(() => { if (on) setLoading(false); });
    return () => { on = false; };
  }, [start]);

  const view = useMemo(() => (data ? productWeeks(data.items, { start, weeks: WEEKS, board, platform }) : null), [data, start, board, platform]);
  const boards = board === 'all' ? ['video', 'design'] : [board];
  const head = (c) => {
    if (c.kind === 'late') return ['Overdue', 'still open'];
    if (c.kind === 'none') return ['No date', 'open, not scheduled'];
    const label = c.from === thisWeek ? 'This week' : c.from === addDays(thisWeek, 7) ? 'Next week' : c.from === addDays(thisWeek, -7) ? 'Last week' : `Week of ${day(c.from)}`;
    return [label, `${day(c.from)} – ${day(addDays(c.from, 6))}`];
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center rounded-xl bg-white border border-gray-200">
          <button type="button" aria-label="Earlier weeks" onClick={() => { setStart(addDays(start, -7)); setOpen(null); }} className="p-2 text-gray-500 hover:text-gray-900"><ChevronLeft size={16} /></button>
          <button type="button" onClick={() => { setStart(thisWeek); setOpen(null); }} disabled={start === thisWeek}
            className="text-xs font-semibold px-2 text-gray-700 disabled:text-gray-400 whitespace-nowrap">{day(start)} – {day(addDays(start, WEEKS * 7 - 1))}</button>
          <button type="button" aria-label="Later weeks" onClick={() => { setStart(addDays(start, 7)); setOpen(null); }} className="p-2 text-gray-500 hover:text-gray-900"><ChevronRight size={16} /></button>
        </div>
        <Seg value={board} onChange={setBoard} options={[['all', 'Video + Design'], ['video', 'Video'], ['design', 'Design']]} />
        <Seg value={platform} onChange={setPlatform} options={[['all', 'All platforms'], ['meta', 'Meta'], ['other', 'Not Meta']]} />
        {loading && data && <Loader2 size={15} className="animate-spin text-gray-400" />}
      </div>

      <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-gray-500">
        {boards.map(b => { const { Icon, label } = BOARD[b]; return <span key={b} className="inline-flex items-center gap-1 font-semibold text-gray-600"><Icon size={12} /> {label}</span>; })}
        <span className="text-gray-300">|</span>
        {CATEGORY_ORDER.filter(k => k !== 'other').map(k => (
          <span key={k} className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: CATEGORY[k].color }} />{k === 'delivered' ? 'Done (ready to go live)' : CATEGORY[k].label}</span>
        ))}
        <span className="text-gray-400">· By delivery date: the end of the ticket’s timeline on Monday, else its deadline.</span>
      </div>

      {error && <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 flex items-center gap-2"><AlertTriangle size={15} /> {error}</div>}
      {!view && !error && <div className="py-16 text-center text-gray-400"><Loader2 className="inline animate-spin" /></div>}

      {view && (view.rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 py-12 text-center text-sm text-gray-500">No tickets due in these weeks{platform !== 'all' || board !== 'all' ? ' with these filters' : ''}.</div>
      ) : (
        <div className={`bg-white rounded-2xl border border-gray-200 overflow-x-auto ${loading ? 'opacity-60' : ''}`}>
          <table className="w-full border-collapse text-sm" style={{ minWidth: 180 + view.cols.length * 150 }}>
            <thead>
              <tr className="border-b border-gray-100">
                <th scope="col" className="sticky left-0 z-10 bg-white text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-3 w-[180px]">Product</th>
                {view.cols.map(c => {
                  const [a, b] = head(c);
                  return (
                    <th key={c.key} scope="col" className="text-left px-3 py-3 align-bottom">
                      <div className={`text-[12px] font-bold ${c.kind === 'late' ? 'text-[#e2445c]' : c.from === thisWeek ? 'text-[#0808f8]' : 'text-[#030b2e]'}`}>{a}</div>
                      <div className="text-[11px] font-normal text-gray-400 whitespace-nowrap">{b}</div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {view.rows.map(r => {
                const openCol = open?.startsWith(`${r.label}|`) ? open.slice(r.label.length + 1) : null;
                return (
                  <Fragment key={r.label}>
                    <tr className="border-b border-gray-100 last:border-0">
                      <th scope="row" className="sticky left-0 z-10 bg-white text-left px-4 py-2.5 font-semibold text-[#030b2e] align-top">
                        <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: r.color }} /><span className="truncate">{r.label}</span></span>
                        <span className="block text-[11px] font-normal text-gray-400 pl-[18px]">{plural(r.total, 'ticket')}</span>
                      </th>
                      {view.cols.map(c => {
                        const cell = r.cells[c.key];
                        const n = cell ? cell.video.length + cell.design.length : 0;
                        const key = `${r.label}|${c.key}`;
                        return (
                          <td key={c.key} className="px-2 py-1.5 align-top">
                            {n === 0 ? <span className="block px-2 py-2 text-gray-300">—</span> : (
                              <button type="button" onClick={() => setOpen(open === key ? null : key)} aria-expanded={open === key}
                                className={`w-full text-left rounded-xl px-2 py-1.5 flex flex-col gap-1 transition-colors ${open === key ? 'bg-[#eef0ff] ring-1 ring-[#0808f8]/30' : 'hover:bg-[#f5f6ff]'}`}>
                                {boards.map(b => {
                                  const list = cell[b];
                                  if (!list.length) return null;
                                  const { Icon } = BOARD[b];
                                  const meta = list.filter(it => isMeta(it.platform)).length;
                                  return (
                                    <span key={b} className="flex items-center gap-2" title={`${BOARD[b].label}: ${list.length}${meta ? ` · ${meta} for Meta` : ''}`}>
                                      <Icon size={12} className="flex-none text-gray-400" />
                                      <span className="w-5 text-right font-bold tabular-nums text-[#030b2e]">{list.length}</span>
                                      <span className="flex-1 min-w-[48px]"><StackBar parts={parts(list)} height={8} /></span>
                                    </span>
                                  );
                                })}
                              </button>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                    {openCol && r.cells[openCol] && (
                      <tr className="border-b border-gray-100 bg-[#fafbff]">
                        <td colSpan={view.cols.length + 1} className="px-4 py-3">
                          <TicketList cell={r.cells[openCol]} boards={boards} data={data} openTask={openTask} title={`${r.label} · ${head(view.cols.find(c => c.key === openCol))[0]}`} onClose={() => setOpen(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50/60">
                <th scope="row" className="sticky left-0 z-10 bg-gray-50 text-left text-[11px] font-semibold uppercase tracking-wider text-gray-500 px-4 py-2.5">Total</th>
                {view.cols.map(c => {
                  const t = view.totals[c.key];
                  return (
                    <td key={c.key} className="px-3 py-2.5 text-[11px] text-gray-600 align-top tabular-nums">
                      {!t ? '—' : (
                        <>
                          <div className="font-semibold text-[#030b2e]">{boards.map(b => `${t[b]} ${b}`).join(' · ')}</div>
                          {platform !== 'other' && <div>{t.meta} for Meta</div>}
                          {c.kind !== 'late' && c.kind !== 'none' && <div className="text-[#00a35c]">{t.done} done</div>}
                        </>
                      )}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          </table>
        </div>
      ))}
      {view?.noPlatform > 0 && platform !== 'meta' && (
        <div className="text-[11px] text-gray-400">{plural(view.noPlatform, 'ticket')} here {view.noPlatform === 1 ? 'has' : 'have'} no Platform on Monday, so {view.noPlatform === 1 ? 'it counts' : 'they count'} as “Not Meta”.</div>
      )}
    </div>
  );
}

function TicketList({ cell, boards, data, openTask, title, onClose }) {
  const names = (it) => (it.people || []).map(id => data?.people?.[id]?.name?.split(' ')[0]).filter(Boolean).join(', ');
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs font-bold text-[#030b2e]">{title}</span>
        <button type="button" onClick={onClose} className="ml-auto text-[11px] font-semibold text-gray-500 hover:text-gray-900">Close</button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {boards.filter(b => cell[b].length).map(b => {
          const { Icon, label } = BOARD[b];
          return (
            <div key={b}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-gray-500 mb-1"><Icon size={12} /> {label} · {cell[b].length}</div>
              <ul className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
                {cell[b].map(it => {
                  const due = dueOf(it);
                  const meta = isMeta(it.platform);
                  return (
                    <li key={it.id} className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => openTask?.(it, data)} className="min-w-0 flex-1 text-left group">
                        <span className="block text-[13px] font-medium truncate text-[#030b2e] group-hover:text-[#0808f8]" title={it.name}>{it.title || it.name}</span>
                        <span className="block text-[11px] text-gray-400 truncate">{[due && `Due ${day(due)}`, names(it)].filter(Boolean).join(' · ') || 'No date'}</span>
                      </button>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap ${meta ? 'text-white' : 'text-gray-500 bg-gray-100'}`} style={meta ? { background: ELECTRIC } : undefined}>{it.platform || 'No platform'}</span>
                      <StatusPill status={it.status} small />
                      {it.monday_url && (
                        <a href={it.monday_url} target="_blank" rel="noopener noreferrer" title="Open in Monday" aria-label="Open in Monday" className="p-1 text-gray-300 hover:text-gray-700"><ExternalLink size={12} /></a>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
      <div className="text-[11px] mt-2" style={{ color: NAVY, opacity: 0.5 }}>Click a ticket for its brief, files and updates.</div>
    </div>
  );
}
