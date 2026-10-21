import { useMemo, useState } from 'react';
import { ExternalLink, Tv, Inbox, ArrowUpDown, Plane } from 'lucide-react';
import { Avatar, Card, StatusPill, ProductTag, StackBar, Empty, hrs, CATEGORY, DIVISION } from './Bits';

const BOARD_LABEL = { video: 'Video', design: 'Design' };
const isNew = (it) => /form requests|ready for assign/i.test(it.group || '') || it.status.category === 'queued' && !it.people.length;

/** Monday-style battery: share of each status, % done. Click a status to filter. */
function Battery({ board, items, onStatus, active }) {
  const counts = new Map();
  for (const it of items) counts.set(it.status.label, (counts.get(it.status.label) || 0) + 1);
  const parts = board.statuses.filter(s => counts.get(s.label)).map(s => ({ key: s.label, label: s.label, value: counts.get(s.label), color: s.color, category: s.category }));
  const total = items.length;
  const done = parts.filter(p => p.category === 'delivered').reduce((a, p) => a + p.value, 0);
  const pct = total ? Math.round((done / total) * 1000) / 10 : 0;
  return (
    <Card title={`${board.label} battery`} subtitle={`${total} tasks · open now + delivered in this period`}>
      <div className="flex items-center gap-5">
        <div className="flex-1 min-w-0">
          <StackBar parts={parts} height={44} rounded={false} onPart={(p) => onStatus({ board: board.key, label: p.label })} />
        </div>
        <div className="flex-none text-right">
          <div className="text-4xl font-black text-[#030b2e] leading-none tabular-nums" style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{pct}%</div>
          <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 mt-1">Done</div>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2 mt-4">
        {parts.map(p => {
          const on = active?.board === board.key && active?.label === p.label;
          return (
            <button key={p.key} type="button" onClick={() => onStatus(on ? null : { board: board.key, label: p.label })}
              className={`flex items-center gap-1.5 text-xs ${on ? 'font-bold text-[#030b2e]' : 'text-gray-600 hover:text-gray-900'}`}>
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: p.color }} />{p.label}<span className="text-gray-400 tabular-nums">{p.value}</span>
            </button>
          );
        })}
        {!parts.length && <span className="text-xs text-gray-400">No tasks match these filters.</span>}
      </div>
    </Card>
  );
}

function Donut({ parts, size = 92, stroke = 16 }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let off = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-none -rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#eef0f5" strokeWidth={stroke} />
      {total > 0 && parts.filter(p => p.value).map(p => {
        const len = (p.value / total) * c;
        const el = <circle key={p.key} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke} strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-off} />;
        off += len;
        return el;
      })}
    </svg>
  );
}

/** "Yael's work" — one card per person: status mix, active now, effort this period, out-of-office. */
function PersonCard({ person, items, boards, onPick, picked, today }) {
  const counts = new Map();
  for (const it of items) {
    const st = boards[it.board]?.statuses.find(s => s.label === it.status.label);
    const k = it.status.label;
    const e = counts.get(k) || { key: k, label: k, value: 0, color: st?.color || it.status.color || '#c4c4c4', order: st ? boards[it.board].statuses.indexOf(st) : 99 };
    e.value++;
    counts.set(k, e);
  }
  const parts = [...counts.values()].sort((a, b) => a.order - b.order);
  const active = items.filter(i => i.active_now).length;
  const out = (person.out || []).find(o => o.start <= today && o.end >= today);
  return (
    <button type="button" onClick={() => onPick(person.id)}
      className={`text-left bg-white rounded-2xl border p-4 transition-shadow hover:shadow-md ${picked ? 'border-[#0808f8] ring-2 ring-[#0808f8]/15' : 'border-gray-200'}`}>
      <div className="flex items-center gap-2.5 mb-3">
        <Avatar person={person} size={34} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-bold text-[#030b2e] truncate">{person.name.split(' ')[0]}’s work</div>
          <div className="text-[11px] text-gray-500">{person.role === 'video' ? 'Video editor' : 'Designer'}</div>
        </div>
        {out && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 flex items-center gap-1" title={out.name || 'Out'}><Plane size={10} /> Out</span>}
      </div>
      <div className="flex items-center gap-3">
        <Donut parts={parts} />
        <div className="flex-1 min-w-0 grid grid-cols-1 gap-1">
          {parts.slice(0, 5).map(p => (
            <div key={p.key} className="flex items-center gap-1.5 text-[11px] text-gray-600 min-w-0">
              <span className="w-2 h-2 rounded-full flex-none" style={{ background: p.color }} />
              <span className="truncate flex-1">{p.label}</span>
              <span className="tabular-nums text-gray-900 font-semibold">{p.value}</span>
            </div>
          ))}
          {parts.length > 5 && <div className="text-[10px] text-gray-400">+{parts.length - 5} more</div>}
          {!parts.length && <div className="text-[11px] text-gray-400">No tasks</div>}
        </div>
      </div>
      <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100 text-[11px] text-gray-500">
        <span><b className="text-gray-900 tabular-nums">{items.length}</b> tasks</span>
        <span><b className="text-gray-900 tabular-nums">{active}</b> active</span>
        <span className="ml-auto" title="Time on active tasks this period"><b className="text-gray-900 tabular-nums">{hrs(person.effort_s)}</b> worked</span>
      </div>
    </button>
  );
}

function BarList({ rows, onPick, picked, color = '#0808f8', empty = 'Nothing here' }) {
  const max = Math.max(1, ...rows.map(r => r.value));
  if (!rows.length) return <Empty>{empty}</Empty>;
  return (
    <div className="flex flex-col gap-2">
      {rows.map(r => (
        <button key={r.key} type="button" onClick={onPick ? () => onPick(r.key) : undefined}
          className={`grid grid-cols-[minmax(0,140px)_1fr_36px] items-center gap-3 text-left rounded-lg px-1 py-0.5 ${onPick ? 'hover:bg-gray-50' : ''} ${picked?.includes?.(r.key) || picked === r.key ? 'bg-[#0808f8]/5' : ''}`}>
          <span className="flex items-center gap-2 min-w-0 text-xs text-gray-700">
            {r.person ? <Avatar person={r.person} size={20} /> : <span className="w-2.5 h-2.5 rounded-full flex-none" style={{ background: r.color || color }} />}
            <span className="truncate">{r.label}</span>
          </span>
          <span className="h-2.5 rounded-full bg-gray-100 overflow-hidden flex">
            {(r.parts || [{ value: r.value, color: r.color || color }]).map((p, i) => (
              <span key={i} style={{ width: `${(p.value / max) * 100}%`, background: p.color }} />
            ))}
          </span>
          <span className="text-xs font-bold text-gray-900 tabular-nums text-right">{r.value}</span>
        </button>
      ))}
    </div>
  );
}

const TABLE_COLS = [
  ['name', 'Task'], ['people', 'Who'], ['requested_by', 'Requested by'], ['status', 'Status'], ['deadline', 'Deadline'], ['effort_s', 'Worked'], ['effort_total_s', 'Total'],
];

function TaskTable({ items, data, sort, setSort }) {
  const [limit, setLimit] = useState(60);
  const today = data.today;
  const sorted = useMemo(() => {
    const [k, dir] = sort;
    const val = (it) => k === 'name' ? it.name.toLowerCase()
      : k === 'people' ? (data.people[it.people[0]]?.name || '~')
        : k === 'requested_by' ? (data.requesters[it.requested_by[0]]?.name || '~')
          : k === 'status' ? it.status.label
            : k === 'deadline' ? (it.deadline || '9999')
              : it[k] || 0;
    return [...items].sort((a, b) => { const x = val(a); const y = val(b); return (x > y ? 1 : x < y ? -1 : 0) * dir; });
  }, [items, sort, data]);
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-gray-400 border-b border-gray-100">
            {TABLE_COLS.map(([k, label]) => (
              <th key={k} className="py-2 px-2 font-semibold whitespace-nowrap">
                <button type="button" onClick={() => setSort([k, sort[0] === k ? -sort[1] : (k === 'name' || k === 'deadline' ? 1 : -1)])} className="inline-flex items-center gap-1 hover:text-gray-700">
                  {label}{sort[0] === k && <ArrowUpDown size={11} />}
                </button>
              </th>
            ))}
            <th />
          </tr>
        </thead>
        <tbody>
          {sorted.slice(0, limit).map(it => {
            const late = it.open && it.deadline && it.deadline < today;
            return (
              <tr key={it.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                <td className="py-2 px-2 max-w-[420px]">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded flex-none text-white" style={{ background: DIVISION[it.division]?.color || '#888' }}>{it.division === 'tv' ? 'TV' : BOARD_LABEL[it.board]}</span>
                    <span className="truncate text-gray-900" title={it.name}>{it.name}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 pl-0.5">
                    <ProductTag product={it.product} />
                    {it.tv?.name && <span className="text-[11px] text-[#ff7a1a] flex items-center gap-1 truncate"><Tv size={10} /> {it.tv.name}</span>}
                  </div>
                </td>
                <td className="py-2 px-2"><div className="flex -space-x-1.5">{it.people.map(p => data.people[p] && <Avatar key={p} person={data.people[p]} size={24} ring="#fff" />)}</div></td>
                <td className="py-2 px-2 text-xs text-gray-600 whitespace-nowrap">{it.requested_by.map(r => data.requesters[r]?.name.split(' ')[0]).filter(Boolean).join(', ') || '–'}</td>
                <td className="py-2 px-2"><StatusPill status={it.status} small /></td>
                <td className={`py-2 px-2 text-xs whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-gray-600'}`}>{it.deadline ? new Date(`${it.deadline}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–'}</td>
                <td className="py-2 px-2 text-xs tabular-nums text-gray-900 font-semibold">{hrs(it.effort_s)}</td>
                <td className="py-2 px-2 text-xs tabular-nums text-gray-500">{hrs(it.effort_total_s)}</td>
                <td className="py-2 px-2">{it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]" title="Open in Monday"><ExternalLink size={14} /></a>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {sorted.length > limit && (
        <button type="button" onClick={() => setLimit(l => l + 100)} className="w-full text-xs font-semibold text-gray-500 hover:text-gray-800 py-3">Show more ({sorted.length - limit})</button>
      )}
      {!sorted.length && <Empty>No tasks match these filters.</Empty>}
    </div>
  );
}

export default function Overview({ data, items, f, setF }) {
  const [sort, setSort] = useState(['deadline', 1]);
  const today = data.today;
  const people = Object.values(data.people);
  const byRole = (role) => people.filter(p => p.role === role && items.some(i => i.people.includes(p.id)))
    .sort((a, b) => items.filter(i => i.people.includes(b.id)).length - items.filter(i => i.people.includes(a.id)).length);
  const delivered = items.filter(i => i.delivered_in_period);
  const open = items.filter(i => i.open);
  const kpis = [
    ['Open', open.length, 'text-[#030b2e]'],
    ['Delivered', delivered.length, 'text-emerald-600'],
    ['In review', open.filter(i => i.status.category === 'review').length, 'text-violet-600'],
    ['Fixes', open.filter(i => i.status.category === 'fixes').length, 'text-amber-600'],
    ['Overdue', open.filter(i => i.deadline && i.deadline < today).length, 'text-red-600'],
    ['Worked', hrs(people.reduce((a, p) => a + (p.effort_s || 0), 0)), 'text-[#0808f8]'],
  ];
  const requesterRows = Object.values(data.requesters).map(r => {
    const mine = items.filter(i => i.requested_by.includes(r.id));
    return { key: r.id, label: r.name, person: r, value: mine.length, parts: [
      { value: mine.filter(i => !i.open).length, color: '#00c875' }, { value: mine.filter(i => i.open).length, color: '#579bfc' },
    ] };
  }).filter(r => r.value).sort((a, b) => b.value - a.value).slice(0, 10);
  const productRows = [...items.reduce((m, i) => {
    if (!i.product?.label || i.product.label === '-') return m;
    const e = m.get(i.product.label) || { key: i.product.label, label: i.product.label, color: i.product.color, value: 0 };
    e.value++;
    return m.set(i.product.label, e);
  }, new Map()).values()].sort((a, b) => b.value - a.value).slice(0, 10);
  const newRequests = open.filter(isNew).sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const togglePerson = (uid) => setF({ ...f, people: f.people.includes(uid) ? f.people.filter(x => x !== uid) : [uid] });
  const toggleReq = (uid) => setF({ ...f, requesters: f.requesters.includes(uid) ? f.requesters.filter(x => x !== uid) : [uid] });
  const doneBy = ['video', 'design'].map(b => ({ b, n: delivered.filter(i => i.board === b).length }));
  const doneMax = Math.max(1, ...doneBy.map(d => d.n));
  const outToday = people.filter(p => (p.out || []).some(o => o.start <= today && o.end >= today));

  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {kpis.map(([label, v, cls]) => (
          <div key={label} className="bg-white rounded-2xl border border-gray-200 px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{label}</div>
            <div className={`text-3xl font-black tabular-nums leading-tight ${cls}`} style={{ fontFamily: '"Sofia Sans Extra Condensed", sans-serif' }}>{v}</div>
          </div>
        ))}
      </div>

      {outToday.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-gray-600 bg-white rounded-2xl border border-gray-200 px-4 py-2.5">
          <Plane size={14} className="text-gray-400" /> Out today:
          {outToday.map(p => <span key={p.id} className="flex items-center gap-1.5 font-semibold text-gray-800"><Avatar person={p} size={20} />{p.name.split(' ')[0]}</span>)}
        </div>
      )}

      <div className="grid md:grid-cols-2 gap-5">
        {['video', 'design'].filter(b => data.boards[b] && (f.division === 'all' || f.division === b || (f.division === 'tv' && b === 'video'))).map(b => (
          <Battery key={b} board={data.boards[b]} items={items.filter(i => i.board === b)} active={f.status} onStatus={(s) => setF({ ...f, status: s })} />
        ))}
      </div>

      {['video', 'design'].map(role => {
        const list = byRole(role);
        if (!list.length) return null;
        return (
          <div key={role}>
            <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">{role === 'video' ? 'Video editors' : 'Designers'}</div>
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
              {list.map(p => <PersonCard key={p.id} person={p} items={items.filter(i => i.people.includes(p.id))} boards={data.boards} onPick={togglePerson} picked={f.people.includes(p.id)} today={today} />)}
            </div>
          </div>
        );
      })}

      <div className="grid lg:grid-cols-3 gap-5">
        <Card title="Completed" subtitle="Delivered in this period">
          <div className="flex flex-col gap-4 pt-2">
            {doneBy.map(({ b, n }) => (
              <div key={b}>
                <div className="flex justify-between text-xs text-gray-600 mb-1"><span>{BOARD_LABEL[b]} projects</span><b className="text-gray-900 tabular-nums">{n}</b></div>
                <div className="h-7 rounded-lg bg-gray-100 overflow-hidden">
                  <div className="h-full rounded-lg" style={{ width: `${(n / doneMax) * 100}%`, background: b === 'video' ? '#579bfc' : '#a25ddc', transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="By requester" subtitle="Done vs open · click to filter">
          <BarList rows={requesterRows} onPick={toggleReq} picked={f.requesters} />
        </Card>
        <Card title="By product">
          <BarList rows={productRows} onPick={(p) => setF({ ...f, product: f.product === p ? '' : p })} picked={f.product} />
        </Card>
      </div>

      <Card title={<span className="flex items-center gap-2"><Inbox size={15} className="text-[#0808f8]" /> New requests</span>} subtitle="Form requests and tasks waiting for someone">
        {newRequests.length ? (
          <div className="divide-y divide-gray-100">
            {newRequests.slice(0, 15).map(it => (
              <div key={it.id} className="flex items-center gap-3 py-2">
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white flex-none" style={{ background: DIVISION[it.division]?.color }}>{it.division === 'tv' ? 'TV' : BOARD_LABEL[it.board]}</span>
                <span className="flex-1 min-w-0 truncate text-sm text-gray-900" title={it.name}>{it.name}</span>
                <span className="text-xs text-gray-500 flex-none">{it.requested_by.map(r => data.requesters[r]?.name.split(' ')[0]).filter(Boolean).join(', ')}</span>
                <span className={`text-xs flex-none w-16 text-right ${it.deadline && it.deadline < today ? 'text-red-600 font-semibold' : 'text-gray-500'}`}>{it.deadline ? new Date(`${it.deadline}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '–'}</span>
                {it.monday_url && <a href={it.monday_url} target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-[#0808f8]"><ExternalLink size={14} /></a>}
              </div>
            ))}
            {newRequests.length > 15 && <div className="text-xs text-gray-400 pt-2">+{newRequests.length - 15} more</div>}
          </div>
        ) : <Empty>No new requests waiting.</Empty>}
      </Card>

      <Card title="All tasks" subtitle={`${items.length} matching · “Worked” = time active in this period, “Total” = across the task’s life`} pad={false}>
        <div className="px-3 pb-3"><TaskTable items={items} data={data} sort={sort} setSort={setSort} /></div>
      </Card>
    </div>
  );
}

export { CATEGORY };
