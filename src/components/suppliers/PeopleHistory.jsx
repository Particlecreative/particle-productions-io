import { useState, useMemo, useEffect } from 'react';
import {
  Search, ChevronDown, ChevronRight, Users, Clock, CreditCard, Layers,
  CheckCircle2, AlertCircle, Repeat, Loader2, Building2, User,
} from 'lucide-react';
import { getAllLineItems, getSuppliers } from '../../lib/dataService';
import { useCurrency } from '../../context/CurrencyContext';
import { clusterByName, nameScore } from '../../lib/nameMatch';
import clsx from 'clsx';

// Everyone we pay who isn't cast. (Cast lives in Casting.)
const NON_PERSON_EXCLUDE = new Set(['cast']);
const TYPE_FILTERS = ['Crew', 'Post', 'Office', 'Equipment', 'Catering & Transport'];

const TYPE_STYLE = {
  crew: 'bg-blue-50 text-blue-700 border-blue-200',
  post: 'bg-violet-50 text-violet-700 border-violet-200',
  office: 'bg-slate-100 text-slate-600 border-slate-200',
  equipment: 'bg-amber-50 text-amber-700 border-amber-200',
  'catering & transport': 'bg-emerald-50 text-emerald-700 border-emerald-200',
};
function typeStyle(t = '') { return TYPE_STYLE[t.toLowerCase()] || 'bg-gray-100 text-gray-500 border-gray-200'; }

function avatarColor(name = 'A') {
  return `hsl(${(name || 'A').charCodeAt(0) * 41 % 360}, 55%, 52%)`;
}

function fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  if (isNaN(dt)) return null;
  return dt.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

const STATUS = {
  Paid:        { label: 'Paid',     cls: 'bg-green-100 text-green-700', Icon: CheckCircle2 },
  Pending:     { label: 'Pending',  cls: 'bg-amber-100 text-amber-700', Icon: Clock },
  'Not Paid':  { label: 'Not paid', cls: 'bg-red-100 text-red-600',     Icon: AlertCircle },
};
function statusOf(li) {
  if (li.payment_status === 'Paid') return 'Paid';
  if (li.payment_status === 'Pending') return 'Pending';
  return 'Not Paid';
}

export default function PeopleHistory({ productions = [], brandId }) {
  const { fmt, rate } = useCurrency();
  const [lineItems, setLineItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [prodFilter, setProdFilter] = useState('');
  const [sortBy, setSortBy] = useState('productions'); // productions | paid | outstanding | recent
  const [onlyOutstanding, setOnlyOutstanding] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    let alive = true;
    async function load() {
      setLoading(true);
      const [items, supp] = await Promise.all([
        Promise.resolve(getAllLineItems()),
        Promise.resolve(getSuppliers(brandId)),
      ]);
      if (!alive) return;
      setLineItems(Array.isArray(items) ? items : []);
      setSuppliers(Array.isArray(supp) ? supp : []);
      setLoading(false);
    }
    load();
    return () => { alive = false; };
  }, [brandId]);

  const prodById = useMemo(() => {
    const m = {}; productions.forEach(p => { m[p.id] = p; }); return m;
  }, [productions]);

  const toUSD = (li) => {
    const amt = parseFloat(li.actual_spent) || parseFloat(li.planned_budget) || 0;
    return (li.currency_code === 'ILS') ? amt / (rate || 3.7) : amt;
  };

  // Build people from non-cast line items in this brand's productions.
  const people = useMemo(() => {
    const brandProdIds = new Set(productions.map(p => p.id));
    const relevant = lineItems.filter(li =>
      brandProdIds.has(li.production_id) &&
      (li.full_name || '').trim() &&
      !NON_PERSON_EXCLUDE.has((li.type || '').toLowerCase())
    );
    const clusters = clusterByName(relevant, li => li.full_name);

    return clusters.map(c => {
      const engagements = c.items
        .map(li => ({
          li,
          productionId: li.production_id,
          productionName: prodById[li.production_id]?.project_name || li.production_id,
          role: li.item || '—',
          type: li.type || '',
          date: li.timeline_start || li.paid_at || li.timeline_end || li.created_at || null,
          usd: toUSD(li),
          currency: li.currency_code || 'USD',
          nativeAmount: parseFloat(li.actual_spent) || parseFloat(li.planned_budget) || 0,
          status: statusOf(li),
        }))
        .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

      const prodIds = new Set(engagements.map(e => e.productionId));
      const paidUSD = engagements.filter(e => e.status === 'Paid').reduce((s, e) => s + e.usd, 0);
      const outstandingUSD = engagements.filter(e => e.status !== 'Paid').reduce((s, e) => s + e.usd, 0);
      const types = [...new Set(engagements.map(e => e.type).filter(Boolean))];
      const roles = [...new Set(engagements.map(e => e.role).filter(r => r && r !== '—'))];
      const lastDate = engagements.map(e => e.date).filter(Boolean).sort((a, b) => new Date(b) - new Date(a))[0] || null;

      // Cross-link to the contact directory (bank details) by fuzzy name.
      let directory = null, best = 0;
      for (const s of suppliers) {
        const sc = nameScore(c.canonical, s.full_name);
        if (sc > best && sc >= 0.85) { best = sc; directory = s; }
      }

      return {
        key: c.key, name: c.canonical, aliases: c.aliases,
        engagements, prodCount: prodIds.size, jobCount: engagements.length,
        paidUSD, outstandingUSD, totalUSD: paidUSD + outstandingUSD,
        types, roles, lastDate, directory,
      };
    });
  }, [lineItems, suppliers, productions, prodById, rate]);

  const filtered = useMemo(() => {
    let list = people;
    if (typeFilter) list = list.filter(p => p.types.some(t => t.toLowerCase() === typeFilter.toLowerCase()));
    if (prodFilter) list = list.filter(p => p.engagements.some(e => e.productionId === prodFilter));
    if (onlyOutstanding) list = list.filter(p => p.outstandingUSD > 0.5);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.aliases.some(a => a.toLowerCase().includes(q)) ||
        p.roles.some(r => r.toLowerCase().includes(q))
      );
    }
    const sorters = {
      productions: (a, b) => b.prodCount - a.prodCount || b.totalUSD - a.totalUSD,
      paid:        (a, b) => b.paidUSD - a.paidUSD,
      outstanding: (a, b) => b.outstandingUSD - a.outstandingUSD,
      recent:      (a, b) => new Date(b.lastDate || 0) - new Date(a.lastDate || 0),
    };
    return [...list].sort(sorters[sortBy] || sorters.productions);
  }, [people, typeFilter, prodFilter, onlyOutstanding, search, sortBy]);

  // Summary
  const totalPaid = people.reduce((s, p) => s + p.paidUSD, 0);
  const totalOutstanding = people.reduce((s, p) => s + p.outstandingUSD, 0);
  const repeatCollaborators = people.filter(p => p.prodCount > 1).length;

  if (loading) {
    return <div className="py-20 text-center text-gray-400"><Loader2 size={22} className="animate-spin mx-auto" /></div>;
  }

  return (
    <div className="space-y-5">
      {/* Summary strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatTile icon={Users}   tint="blue"   label="People" value={people.length} sub="non-cast suppliers" />
        <StatTile icon={Repeat}  tint="violet" label="Repeat collaborators" value={repeatCollaborators} sub="worked 2+ productions" />
        <StatTile icon={CheckCircle2} tint="green" label="Paid out" value={fmt(totalPaid)} sub="all time" />
        <StatTile icon={AlertCircle}  tint="amber" label="Outstanding" value={fmt(totalOutstanding)} sub="pending / not paid" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2.5 flex-wrap">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="brand-input pl-9 w-full sm:w-60" placeholder="Search name, alias, or role…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select className="brand-input w-auto" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
          <option value="">All types</option>
          {TYPE_FILTERS.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="brand-input w-auto max-w-[220px]" value={prodFilter} onChange={e => setProdFilter(e.target.value)}>
          <option value="">All productions</option>
          {productions.map(p => <option key={p.id} value={p.id}>{p.id} — {p.project_name}</option>)}
        </select>
        <select className="brand-input w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="productions">Most productions</option>
          <option value="paid">Highest paid</option>
          <option value="outstanding">Most outstanding</option>
          <option value="recent">Most recent</option>
        </select>
        <button
          onClick={() => setOnlyOutstanding(v => !v)}
          className={clsx('flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all',
            onlyOutstanding ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-gray-200 text-gray-500 hover:border-gray-300')}
        >
          <AlertCircle size={13} /> Owed money
        </button>
        {(search || typeFilter || prodFilter || onlyOutstanding) && (
          <button className="text-xs text-blue-500 hover:underline"
            onClick={() => { setSearch(''); setTypeFilter(''); setProdFilter(''); setOnlyOutstanding(false); }}>
            Clear
          </button>
        )}
        <div className="text-sm text-gray-400 ml-auto">{filtered.length} {filtered.length === 1 ? 'person' : 'people'}</div>
      </div>

      {/* People list */}
      {filtered.length === 0 ? (
        <div className="brand-card text-center py-16 text-gray-400">
          <Users size={30} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm font-medium text-gray-500">No people match</p>
          <p className="text-xs text-gray-400 mt-0.5">People appear here from budget line items across your productions.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p, i) => {
            const isOpen = expanded === p.key;
            return (
              <div key={p.key}
                className="fs-card-in brand-card p-0 overflow-hidden"
                style={{ animationDelay: `${Math.min(i, 16) * 25}ms` }}>
                {/* Row */}
                <button onClick={() => setExpanded(isOpen ? null : p.key)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50/70 transition-colors">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                    style={{ background: avatarColor(p.name) }}>
                    {p.name[0]?.toUpperCase() || '?'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-sm text-gray-800 truncate">{p.name}</span>
                      {p.aliases.length > 0 && (
                        <span className="text-[10px] text-gray-400" title={`Also seen as: ${p.aliases.join(', ')}`}>
                          +{p.aliases.length} alias{p.aliases.length > 1 ? 'es' : ''}
                        </span>
                      )}
                      {p.directory && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5" title="Has a contact/bank record in the directory">
                          <CreditCard size={9} /> directory
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {p.types.slice(0, 3).map(t => (
                        <span key={t} className={clsx('text-[9px] font-semibold border rounded-full px-1.5 py-0.5', typeStyle(t))}>{t}</span>
                      ))}
                      <span className="text-[10px] text-gray-400 flex items-center gap-1">
                        <Layers size={10} /> {p.prodCount} production{p.prodCount > 1 ? 's' : ''} · {p.jobCount} job{p.jobCount > 1 ? 's' : ''}
                      </span>
                      {p.lastDate && <span className="text-[10px] text-gray-300">· last {fmtDate(p.lastDate)}</span>}
                    </div>
                  </div>
                  {/* Money */}
                  <div className="text-right shrink-0 hidden sm:block">
                    <div className="text-sm font-black text-green-600 leading-tight">{fmt(p.paidUSD)}<span className="text-[9px] font-medium text-gray-400"> paid</span></div>
                    {p.outstandingUSD > 0.5 && (
                      <div className="text-xs font-bold text-amber-600 leading-tight">{fmt(p.outstandingUSD)}<span className="text-[9px] font-medium text-gray-400"> owed</span></div>
                    )}
                  </div>
                  <span className="shrink-0 text-gray-300">{isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</span>
                </button>

                {/* Detail */}
                {isOpen && (
                  <div className="border-t border-gray-100 bg-gray-50/40 px-4 py-3">
                    {p.aliases.length > 0 && (
                      <div className="mb-2 text-[11px] text-gray-500">
                        <span className="font-semibold">Also seen as:</span> {p.aliases.join(' · ')}
                      </div>
                    )}
                    {/* mobile money */}
                    <div className="sm:hidden flex gap-4 mb-2 text-xs">
                      <span className="font-bold text-green-600">{fmt(p.paidUSD)} paid</span>
                      {p.outstandingUSD > 0.5 && <span className="font-bold text-amber-600">{fmt(p.outstandingUSD)} owed</span>}
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="text-gray-400 text-[10px] uppercase tracking-wide">
                            <th className="text-left font-semibold py-1 pr-3">Production</th>
                            <th className="text-left font-semibold py-1 pr-3">Role</th>
                            <th className="text-left font-semibold py-1 pr-3">When</th>
                            <th className="text-right font-semibold py-1 pr-3">Amount</th>
                            <th className="text-left font-semibold py-1">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {p.engagements.map((e, idx) => {
                            const st = STATUS[e.status];
                            return (
                              <tr key={idx} className="border-t border-gray-100">
                                <td className="py-1.5 pr-3">
                                  <span className="font-mono text-[10px] text-gray-400">{e.productionId}</span>
                                  <span className="text-gray-700 ml-1.5">{e.productionName}</span>
                                </td>
                                <td className="py-1.5 pr-3 text-gray-500">{e.role}</td>
                                <td className="py-1.5 pr-3 text-gray-400">{fmtDate(e.date) || '—'}</td>
                                <td className="py-1.5 pr-3 text-right font-semibold text-gray-700">{fmt(e.usd)}</td>
                                <td className="py-1.5">
                                  <span className={clsx('inline-flex items-center gap-1 text-[10px] font-semibold rounded-full px-1.5 py-0.5', st.cls)}>
                                    <st.Icon size={9} /> {st.label}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatTile({ icon: Icon, tint, label, value, sub }) {
  const tints = {
    blue: 'text-blue-600 bg-blue-50', violet: 'text-violet-600 bg-violet-50',
    green: 'text-green-600 bg-green-50', amber: 'text-amber-600 bg-amber-50',
  };
  return (
    <div className="brand-card flex items-center gap-3 py-3">
      <div className={clsx('w-9 h-9 rounded-xl flex items-center justify-center shrink-0', tints[tint])}>
        <Icon size={17} />
      </div>
      <div className="min-w-0">
        <div className="text-xl font-black text-gray-800 leading-tight truncate">{value}</div>
        <div className="text-[10px] text-gray-400 leading-tight">{label}{sub ? ` · ${sub}` : ''}</div>
      </div>
    </div>
  );
}
