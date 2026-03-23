import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Upload } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { useCurrency } from '../context/CurrencyContext';
import { getProduction, updateProduction } from '../lib/dataService';
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
import CastTab from '../components/production/CastTab';
import CallSheetTab from '../components/production/CallSheetTab';
import clsx from 'clsx';

const SHOOT_TYPES = ['Shoot', 'Remote Shoot'];

export default function ProductionBoard() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { brandId } = useBrand();
  const { user, isEditor, isAdmin } = useAuth();

  const { lists } = useLists();
  const { rate: globalRate } = useCurrency();
  const [production, setProduction] = useState(null);
  const [activeTab, setActiveTab] = useState('Budget Table');
  const [editingName, setEditingName] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [showContract, setShowContract] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [prodRate, setProdRate] = useState(null);

  // Build tab list based on production type
  const isShootType = production && SHOOT_TYPES.includes(production.production_type);
  const tabs = isShootType
    ? ['Budget Table', 'People on Set', 'Credit Card', 'Cast', 'Accounting', 'Financial', 'Links', 'Updates', 'History', 'Gantt', 'Call Sheet']
    : ['Budget Table', 'Credit Card', 'Accounting', 'Financial', 'Links', 'Updates', 'History', 'Gantt'];

  useEffect(() => {
    const p = getProduction(id);
    if (p) {
      setProduction(p);
      setNameValue(p.project_name);
    }
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

  function refresh() {
    const p = getProduction(id);
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
      <div className="flex items-center justify-center py-20 text-gray-400">
        Production not found.
        <button onClick={() => navigate('/')} className="ml-2 text-blue-500 underline">Back</button>
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <div
        className="flex items-start gap-4 mb-6 flex-wrap"
        style={{ borderBottom: '1px solid var(--brand-border)', paddingBottom: 20 }}
      >
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-1 text-sm text-white/60 hover:text-white mt-1 flex-shrink-0 transition-colors"
        >
          <ArrowLeft size={14} />
          Productions
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap justify-between">
            {editingName && isEditor ? (
              <input
                className="brand-input text-xl font-black"
                style={{ color: 'var(--brand-primary)' }}
                value={nameValue}
                onChange={e => setNameValue(e.target.value)}
                onBlur={handleNameSave}
                onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setEditingName(false); }}
                autoFocus
              />
            ) : (
              <h1
                className="text-2xl font-black brand-title cursor-pointer hover:opacity-70 transition-opacity"
                style={{ color: 'var(--brand-primary)' }}
                onClick={() => isEditor && setEditingName(true)}
                title={isEditor ? 'Click to edit' : ''}
              >
                {production.project_name}
              </h1>
            )}
            <span className="text-sm text-white/50 font-mono">{production.id}</span>
            {prodRate && (
              <span className="text-xs text-gray-400 ml-1">
                Rate {production.planned_end}: ₪{prodRate.toFixed(2)}/$1
                {Math.abs(prodRate - (globalRate || 3.7)) > 0.1 && (
                  <span className="ml-1 text-orange-400">(live: ₪{(globalRate || 3.7).toFixed(2)})</span>
                )}
              </span>
            )}
            {/* Stage badge/dropdown next to PRD number */}
            <span className="ml-1">
              {isEditor ? (
                <select
                  value={production.stage}
                  onChange={e => handleStageChange(e.target.value)}
                  className="text-xs font-semibold border rounded-lg px-2 py-1 outline-none cursor-pointer"
                  style={{
                    borderColor: 'var(--brand-border)',
                    color: production.stage === 'Completed' ? '#2E7D32' : 'inherit',
                    background: production.stage === 'Completed' ? '#E8F5E9' : undefined,
                  }}
                >
                  {lists.stages.map(s => <option key={s}>{s}</option>)}
                </select>
              ) : (
                <StageBadge stage={production.stage} />
              )}
            </span>

            {isEditor && (
              <button
                onClick={() => setShowImport(true)}
                className="btn-secondary text-xs flex items-center gap-1.5 px-3 py-1.5 flex-shrink-0"
              >
                <Upload size={13} /> Import
              </button>
            )}
          </div>

        </div>

      </div>

      {/* Crew Bar — Producer + crew from budget table */}
      <CrewBar production={production} onRefresh={refresh} />

      {/* Tabs */}
      <div className="brand-tabs mb-6">
        {tabs.map(tab => (
          <button
            key={tab}
            className={clsx('brand-tab', activeTab === tab && 'active')}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'Budget Table' && (
        <BudgetTable productionId={id} production={production} onRefresh={refresh} />
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

      {/* Import Modal */}
      {showImport && (
        <ImportModal
          productionId={id}
          onClose={() => setShowImport(false)}
          onImported={() => { setShowImport(false); refresh(); }}
        />
      )}

      {/* Contract Modal */}
      {showContract && (
        <ContractModal
          production={production}
          onClose={() => setShowContract(false)}
        />
      )}
    </div>
  );
}
