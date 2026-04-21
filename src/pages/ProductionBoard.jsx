import { useState, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Upload, Calendar, DollarSign, Clock, Film, Tag, MapPin,
  Truck, Clapperboard, ChevronDown, Pencil, FileSpreadsheet, Settings2, GripVertical, Eye, EyeOff,
} from 'lucide-react';
import { getTabOrder, saveTabOrder, resetTabOrder } from '../lib/tabPrefs';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { getProduction, updateProduction, getPeopleOnSet, getLineItems, getCasting } from '../lib/dataService';
import { fetchHistoricalRate } from '../lib/currency';
import { useLists } from '../context/ListsContext';
import StageBadge from '../components/ui/StageBadge';
import BudgetTable from '../components/production/BudgetTable';
import LedgerTab from '../components/production/LedgerTab';
import LinksTab from '../components/production/LinksTab';
import UpdatesPanel from '../components/updates/UpdatesPanel';
import HistorySection from '../components/production/HistorySection';
import ContractModal from '../components/production/ContractModal';
import CrewBar from '../components/production/CrewBar';
import ProductionFinancialTab from '../components/production/ProductionFinancialTab';
import PeopleOnSet from '../components/production/PeopleOnSet';
import GanttTab from '../components/production/GanttTab';
import ImportModal from '../components/production/ImportModal';
import CCPaymentsTab from '../components/production/CCPaymentsTab';
import ImportAccountingModal from '../components/production/ImportAccountingModal';
import CastTab from '../components/production/CastTab';
import ProductDeliveryTab from '../components/production/ProductDeliveryTab';
import CallSheetTab from '../components/production/CallSheetTab';
import TaxiWizard from '../components/production/TaxiWizard';
import ScriptsTab from '../components/production/ScriptsTab';
import StudioTab from '../components/production/StudioTab';
import clsx from 'clsx';

const SHOOT_TYPES = ['Shoot', 'Remote Shoot'];

function fmtDate(d) {
  if (!d) return '—';
  try { return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); }
  catch { return d; }
}

function InfoPill({ icon: Icon, label, value, className = '' }) {
  if (!value || value === '—') return null;
  return (
    <div className={`flex items-center gap-1.5 text-xs ${className}`}>
      <Icon size={12} className="text-gray-400 shrink-0" />
      <span className="text-gray-400">{label}</span>
      <span className="font-semibold text-gray-700 dark:text-gray-200">{value}</span>
    </div>
  );
}

export default function ProductionBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { brandId } = useBrand();
  const { user, isEditor, isAdmin } = useAuth();

  const { lists } = useLists();
  const { fmt, rate: globalRate } = useCurrency();
  const [production, setProduction] = useState(null);
  const [activeTab, setActiveTab] = useState('Budget Table');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showContract, setShowContract] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  // Auto-open contract modal from Slack deep link (?contract=true)
  useEffect(() => {
    if (searchParams.get('contract') === 'true') {
      setShowContract(true);
      searchParams.delete('contract');
      setSearchParams(searchParams, { replace: true });
    }
  }, []);
  const [showImport, setShowImport] = useState(false);
  const [showAccountingImport, setShowAccountingImport] = useState(false);
  const [prodRate, setProdRate] = useState(null);
  const [showBudget, setShowBudget] = useState(false);
  const [showTaxiWizard, setShowTaxiWizard] = useState(false);
  const [taxiPeople, setTaxiPeople] = useState([]);
  const [taxiCast, setTaxiCast] = useState([]);

  // Build tab list based on production type
  const isShootType = production && SHOOT_TYPES.includes(production.production_type);
  const isRemoteShoot = production?.production_type === 'Remote Shoot';
  const deliveryTab = isRemoteShoot ? ['Product Delivery'] : [];
  const defaultTabs = isShootType
    ? ['Budget Table', ...(!isRemoteShoot ? ['People on Set'] : []), 'Credit Card', 'Cast', ...deliveryTab, 'Accounting', 'Financial', 'Links', 'Scripts', 'Updates', 'History', 'Gantt', 'Call Sheet']
    : ['Budget Table', 'Credit Card', 'Accounting', 'Financial', 'Links', 'Scripts', 'Updates', 'History', 'Gantt'];

  const [tabConfig, setTabConfig] = useState(() => {
    const saved = getTabOrder(user?.id || 'anon', production?.id, defaultTabs);
    // Inject any new default tabs not in saved config (e.g. Product Delivery added after first visit)
    const savedIds = new Set(saved.map(t => t.id));
    const missing = defaultTabs.filter(t => !savedIds.has(t));
    return missing.length > 0 ? [...saved, ...missing.map(t => ({ id: t, visible: true }))] : saved;
  });
  const [showTabModal, setShowTabModal] = useState(false);
  const [tabModalScope, setTabModalScope] = useState({ who: 'me', where: 'all' });

  // Recalculate tab config when production loads (production_type determines available tabs)
  useEffect(() => {
    if (!production) return;
    const freshDefaults = SHOOT_TYPES.includes(production.production_type)
      ? ['Budget Table',
         ...(production.production_type !== 'Remote Shoot' ? ['People on Set'] : []),
         'Credit Card', 'Cast',
         ...(production.production_type === 'Remote Shoot' ? ['Product Delivery'] : []),
         'Accounting', 'Financial', 'Links', 'Scripts', 'Updates', 'History', 'Gantt', 'Call Sheet']
      : ['Budget Table', 'Credit Card', 'Accounting', 'Financial', 'Links', 'Scripts', 'Updates', 'History', 'Gantt'];
    const saved = getTabOrder(user?.id || 'anon', production.id, freshDefaults);
    const savedIds = new Set(saved.map(t => t.id));
    const missing = freshDefaults.filter(t => !savedIds.has(t));
    setTabConfig(missing.length > 0 ? [...saved, ...missing.map(t => ({ id: t, visible: true }))] : saved);
  }, [production?.id, production?.production_type]);

  // Filter out Studio tab; force-show tabs that should always appear for this production type
  const forceVisible = new Set(isShootType ? [...(!isRemoteShoot ? ['People on Set'] : []), 'Cast', 'Call Sheet'] : []);
  if (isRemoteShoot) forceVisible.add('Product Delivery');
  const visibleTabs = tabConfig.filter(t => (t.visible || forceVisible.has(t.id)) && t.id !== 'Studio').map(t => t.id);

  useEffect(() => {
    async function load() {
      const p = await Promise.resolve(getProduction(id));
      if (p) { setProduction(p); setNameValue(p.project_name); }
    }
    load();
  }, [id]);

  // Fetch historical USD→ILS rate for the delivery date
  useEffect(() => {
    if (!production?.planned_end) return;
    if (production.delivery_date_rate && production.delivery_date_rate_for === production.planned_end) {
      setProdRate(production.delivery_date_rate);
      return;
    }
    fetchHistoricalRate(production.planned_end).then(r => {
      if (r) {
        setProdRate(r);
        updateProduction(production.id, { delivery_date_rate: r, delivery_date_rate_for: production.planned_end }, user?.id, user?.name);
      }
    });
  }, [production?.planned_end]); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    const p = await Promise.resolve(getProduction(id));
    if (p) setProduction(p);
  }

  function handleNameSave() {
    if (nameValue.trim() && nameValue !== production.project_name) {
      updateProduction(id, { project_name: nameValue }, user?.id, user?.name);
      refresh();
    }
    setEditingName(false);
  }

  function handleStageChange(stage) {
    updateProduction(id, { stage }, user?.id, user?.name);
    refresh();
  }

  if (!production) {
    return (
      <div className="flex items-center justify-center py-20 animate-fade-in">
        <div className="text-center">
          <div className="flex justify-center mb-4">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-200" style={{ borderTopColor: 'var(--brand-accent)' }} />
          </div>
          <p className="text-gray-400 text-sm">Loading production...</p>
          <button onClick={() => navigate('/')} className="mt-3 text-xs text-blue-500 hover:underline">Back to Productions</button>
        </div>
      </div>
    );
  }

  const planned = parseFloat(production.planned_budget_2026) || 0;
  const estimated = parseFloat(production.estimated_budget) || 0;
  const spent = parseFloat(production.actual_spent) || 0;
  const remaining = planned - spent;
  const pct = planned > 0 ? Math.round((spent / planned) * 100) : 0;
  const productTypes = Array.isArray(production.product_type) ? production.product_type : [];
  const timeline = production.planned_start && production.planned_end
    ? `${fmtDate(production.planned_start)} → ${fmtDate(production.planned_end)}`
    : null;

  return (
    <div className="animate-fade-in">

      {/* ── Hero Header Card ─────────────────────────────────────────── */}
      <div
        className="brand-card mb-5 overflow-hidden relative page-enter"
        style={{ borderTop: 'none', padding: '28px 32px' }}
      >
        {/* Subtle gradient background overlay */}
        <div className="absolute inset-0 opacity-[0.025] pointer-events-none" style={{ background: 'var(--brand-gradient)' }} />
        {/* Left accent bar */}
        <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-[18px]" style={{ background: 'var(--brand-gradient)' }} />

        <div className="relative z-10">
          {/* Top row: back */}
          <div className="flex items-center justify-between mb-4">
            {/* Breadcrumb navigation */}
            <nav className="flex items-center gap-1 text-xs text-gray-400" aria-label="Breadcrumb">
              <button onClick={() => navigate('/')} className="hover:text-gray-700 transition-colors flex items-center gap-1">
                <ArrowLeft size={11} /> Productions
              </button>
              <span className="mx-1">/</span>
              <span className="text-gray-600 font-semibold truncate max-w-[200px]">{production.project_name || production.id}</span>
            </nav>
            {/* Stage */}
            {isEditor ? (
              <select
                value={production.stage}
                onChange={e => handleStageChange(e.target.value)}
                className="text-xs font-bold border-0 rounded-full px-4 py-1.5 outline-none cursor-pointer shrink-0 transition-all"
                style={{
                  color: production.stage === 'Completed' ? '#16a34a' : 'var(--brand-primary)',
                  background: production.stage === 'Completed' ? '#dcfce7' : 'rgba(0,0,0,0.04)',
                }}
              >
                {lists.stages.map(s => <option key={s}>{s}</option>)}
              </select>
            ) : (
              <StageBadge stage={production.stage} />
            )}
          </div>

          {/* Project name + ID + type tags */}
          <div className="mb-4">
            <div className="flex items-center gap-3 flex-wrap">
              {editingName && isEditor ? (
                <input
                  className="brand-input text-3xl font-black w-full"
                  style={{ color: 'var(--brand-primary)' }}
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onBlur={handleNameSave}
                  onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                />
              ) : (
                <h1
                  className="text-3xl font-black brand-title leading-tight cursor-pointer hover:opacity-70 transition-opacity"
                  style={{ color: 'var(--brand-primary)', letterSpacing: '-0.03em' }}
                  onClick={() => isEditor && setEditingName(true)}
                  title={isEditor ? 'Click to edit' : ''}
                >
                  {production.project_name}
                </h1>
              )}
              <span className="text-[10px] font-mono text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                {production.id}
              </span>
              {productTypes.map(pt => (
                <span key={pt} className="px-3 py-1 text-[11px] font-bold rounded-full"
                  style={{ background: 'rgba(8,8,248,0.08)', color: 'var(--brand-accent)' }}>
                  {pt}
                </span>
              ))}
            </div>
          </div>

          {/* Metadata grid — clean bento pills */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-3">
            {production.production_type && (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5">
                <Film size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Type</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{production.production_type}</div>
                </div>
              </div>
            )}
            {production.producer && (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5">
                <Tag size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Producer</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{production.producer}</div>
                </div>
              </div>
            )}
            {timeline && (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5 col-span-2 sm:col-span-1">
                <Calendar size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Timeline</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{timeline}</div>
                </div>
              </div>
            )}
            {production.shoot_dates?.length > 0 && (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5">
                <Clapperboard size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Shoot</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200">
                    {Array.isArray(production.shoot_dates) ? production.shoot_dates.map(fmtDate).join(', ') : fmtDate(production.shoot_dates)}
                  </div>
                </div>
              </div>
            )}
            {production.delivery_date && (
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800/50 rounded-xl px-3 py-2.5">
                <Truck size={14} className="text-gray-400 shrink-0" />
                <div>
                  <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold">Delivery</div>
                  <div className="text-xs font-bold text-gray-700 dark:text-gray-200">{fmtDate(production.delivery_date)}</div>
                </div>
              </div>
            )}
          </div>

          {/* Budget overview — collapsible */}
          <button
            onClick={() => setShowBudget(!showBudget)}
            className="flex items-center gap-3 w-full text-left px-4 py-2.5 rounded-xl bg-gray-50 dark:bg-gray-800/50 hover:bg-gray-100 transition-all group"
          >
            <DollarSign size={14} className="text-gray-400 shrink-0" />
            <div className="flex items-center gap-4 flex-1 flex-wrap text-sm">
              <span className="font-black" style={{ color: 'var(--brand-primary)' }}>{fmt(planned)}</span>
              <span className="text-gray-300">|</span>
              <span className="text-green-600 font-bold">{fmt(spent)} spent</span>
              <span className="text-gray-300">|</span>
              <span className={clsx('font-bold', remaining >= 0 ? 'text-blue-600' : 'text-red-500')}>{fmt(remaining)} left</span>
            </div>
            <ChevronDown size={14} className={clsx('text-gray-400 transition-transform duration-300 group-hover:text-gray-600', showBudget && 'rotate-180')} />
          </button>

          {/* Collapsible budget detail */}
          <div
            className="overflow-hidden transition-all duration-300 ease-out"
            style={{ maxHeight: showBudget ? 200 : 0, opacity: showBudget ? 1 : 0 }}
          >
            <div className="mt-3 pt-3 border-t grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm" style={{ borderColor: 'rgba(0,0,0,0.06)' }}>
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Planned</div>
                <div className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>{fmt(planned)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Estimated</div>
                <div className="text-lg font-bold text-gray-700">{fmt(estimated)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Spent</div>
                <div className="text-lg font-bold text-green-600">{fmt(spent)}</div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-800/30 rounded-xl p-3">
                <div className="text-[9px] text-gray-400 uppercase tracking-wide font-semibold mb-1">Remaining</div>
                <div className={clsx('text-lg font-black', remaining >= 0 ? 'text-green-600' : 'text-red-500')}>{remaining >= 0 ? '+' : ''}{fmt(remaining)}</div>
              </div>
            </div>
            {planned > 0 && (
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-1000 ease-out"
                    style={{ width: `${Math.min(pct, 100)}%`, background: pct > 100 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : pct > 80 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'var(--brand-gradient)' }} />
                </div>
                <span className="text-xs font-bold text-gray-500 w-10">{pct}%</span>
                {prodRate && (
                  <span className="text-[10px] text-gray-400 ml-2">Rate: ₪{prodRate.toFixed(2)}/$1</span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Crew Bar ─────────────────────────────────────────── */}
      <CrewBar production={production} onRefresh={refresh} />

      {/* ── Tabs ─────────────────────────────────────────────── */}
      <div className="brand-tabs mb-6 flex items-center">
        {visibleTabs.map(tab => (
          <button
            key={tab}
            className={clsx('brand-tab', activeTab === tab && 'active')}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
        {isEditor && (
          <button
            onClick={() => setShowTabModal(true)}
            className="ml-1 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Arrange tabs"
          >
            <Settings2 size={14} />
          </button>
        )}
        {isShootType && !isRemoteShoot && (
          <button
            onClick={async () => {
              const [p, items, c] = await Promise.all([
                Promise.resolve(getPeopleOnSet(id)),
                Promise.resolve(getLineItems(id)),
                Promise.resolve(getCasting(id)),
              ]);
              const peopleArr = Array.isArray(p) ? p : [];
              const crewFromBudget = (Array.isArray(items) ? items : []).filter(i => i.full_name?.trim());
              setTaxiPeople([...peopleArr, ...crewFromBudget]);
              setTaxiCast(Array.isArray(c) ? c : []);
              setShowTaxiWizard(true);
            }}
            className="ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100 transition-all shrink-0"
            title="Open Taxi Wizard"
          >
            <MapPin size={12} />
            Taxi Wizard
          </button>
        )}
      </div>

      {/* ── Tab Content ──────────────────────────────────────── */}
      {activeTab === 'Budget Table' && (
        <BudgetTable productionId={id} production={production} onRefresh={refresh} prodRate={prodRate} onImport={() => setShowImport(true)} onAccountingImport={() => setShowAccountingImport(true)} />
      )}
      {activeTab === 'People on Set' && (
        <PeopleOnSet production={production} />
      )}
      {activeTab === 'Accounting' && (
        <LedgerTab productionId={id} production={production} />
      )}
      {activeTab === 'Financial' && (
        <ProductionFinancialTab productionId={id} production={production} />
      )}
      {activeTab === 'Credit Card' && (
        <CCPaymentsTab productionId={id} production={production} />
      )}
      {activeTab === 'Cast' && (
        <CastTab productionId={id} production={production} />
      )}
      {activeTab === 'Product Delivery' && (
        <ProductDeliveryTab productionId={id} production={production} />
      )}
      {activeTab === 'Links' && (
        <LinksTab productionId={id} />
      )}
      {activeTab === 'Updates' && (
        <div style={{ maxWidth: 700 }}>
          <UpdatesPanel productionId={id} inline />
        </div>
      )}
      {activeTab === 'History' && (
        <HistorySection productionId={id} />
      )}
      {activeTab === 'Gantt' && (
        <GanttTab productionId={id} />
      )}
      {activeTab === 'Call Sheet' && (
        <CallSheetTab productionId={id} production={production} />
      )}
      {activeTab === 'Scripts' && (
        <ScriptsTab productionId={id} production={production} />
      )}
      {activeTab === 'Studio' && (
        <StudioTab productionId={id} production={production} />
      )}

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          productionId={id}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refresh(); }}
        />
      )}

      {/* Accounting Import Modal */}
      {showAccountingImport && (
        <ImportAccountingModal
          productionId={id}
          onClose={() => setShowAccountingImport(false)}
          onImported={() => { setShowAccountingImport(false); refresh(); }}
        />
      )}

      {/* Contract Modal */}
      {showContract && (
        <ContractModal
          production={production}
          onClose={() => { setShowContract(false); refresh(); }}
        />
      )}

      {/* Taxi Wizard Modal */}
      {showTaxiWizard && (
        <TaxiWizard
          production={production}
          people={taxiPeople}
          cast={taxiCast}
          onClose={() => setShowTaxiWizard(false)}
        />
      )}

      {/* Tab Arrangement Modal */}
      {showTabModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowTabModal(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="bg-gray-50 px-6 py-4 border-b">
              <h3 className="font-bold text-gray-800">Arrange Tabs</h3>
              <p className="text-xs text-gray-400 mt-0.5">Drag to reorder, toggle visibility</p>
            </div>
            <div className="px-6 py-4 max-h-80 overflow-y-auto">
              {tabConfig.map((tab, idx) => (
                <div key={tab.id} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="flex gap-1">
                    <button
                      disabled={idx === 0}
                      onClick={() => {
                        const next = [...tabConfig];
                        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                        setTabConfig(next);
                      }}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs"
                    >&#9650;</button>
                    <button
                      disabled={idx === tabConfig.length - 1}
                      onClick={() => {
                        const next = [...tabConfig];
                        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                        setTabConfig(next);
                      }}
                      className="text-gray-300 hover:text-gray-500 disabled:opacity-20 text-xs"
                    >&#9660;</button>
                  </div>
                  <span className={`text-sm flex-1 ${tab.visible ? 'text-gray-800' : 'text-gray-400 line-through'}`}>{tab.id}</span>
                  <button
                    onClick={() => {
                      const next = tabConfig.map((t, i) => i === idx ? { ...t, visible: !t.visible } : t);
                      setTabConfig(next);
                    }}
                    className={`p-1 rounded ${tab.visible ? 'text-blue-600' : 'text-gray-300'}`}
                  >
                    {tab.visible ? <Eye size={14} /> : <EyeOff size={14} />}
                  </button>
                </div>
              ))}
            </div>
            <div className="px-6 py-3 bg-gray-50 border-t">
              <div className="flex gap-4 mb-3 text-xs">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tabWho" checked={tabModalScope.who === 'me'} onChange={() => setTabModalScope(s => ({ ...s, who: 'me' }))} className="accent-blue-600" />
                  Only me
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tabWho" checked={tabModalScope.who === 'all'} onChange={() => setTabModalScope(s => ({ ...s, who: 'all' }))} className="accent-blue-600" />
                  All users
                </label>
                <span className="text-gray-300">|</span>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tabWhere" checked={tabModalScope.where === 'this'} onChange={() => setTabModalScope(s => ({ ...s, where: 'this' }))} className="accent-blue-600" />
                  This production
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" name="tabWhere" checked={tabModalScope.where === 'all'} onChange={() => setTabModalScope(s => ({ ...s, where: 'all' }))} className="accent-blue-600" />
                  All productions
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => { setTabConfig(defaultTabs.map(t => ({ id: t, visible: true }))); }}
                  className="text-xs px-3 py-1.5 rounded-lg border text-gray-500 hover:bg-gray-100"
                >Reset</button>
                <div className="flex-1" />
                <button onClick={() => setShowTabModal(false)} className="text-xs px-3 py-1.5 rounded-lg border text-gray-500 hover:bg-gray-100">Cancel</button>
                <button
                  onClick={() => {
                    const scope = `${tabModalScope.who === 'me' ? 'user' : 'all'}_${tabModalScope.where === 'this' ? 'production_' + production?.id : 'global'}${tabModalScope.who === 'me' ? '_' + (user?.id || 'anon') : ''}`;
                    saveTabOrder(scope, tabConfig);
                    setShowTabModal(false);
                  }}
                  className="text-xs px-4 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
                >Save</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
