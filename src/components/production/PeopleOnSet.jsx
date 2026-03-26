import { useState, useEffect, useMemo } from 'react';
import { Plus, Pencil, Trash2, Check, X, Copy, ExternalLink, SlidersHorizontal, ClipboardList, Search } from 'lucide-react';
import {
  getLineItems, getPeopleOnSet, addPersonOnSet, updatePersonOnSet,
  removePersonOnSet, generateId, getFormConfig, setFormConfig, getSupplierSubmissions,
} from '../../lib/dataService';
import { useAuth } from '../../context/AuthContext';
import clsx from 'clsx';

// ─── Column definitions ─────────────────────────────────────────────────────
const PEOPLE_COLS = [
  { key: 'role',              label: 'Role',          defaultVisible: true  },
  { key: 'phone',             label: 'Phone',         defaultVisible: true  },
  { key: 'email',             label: 'Email',         defaultVisible: true  },
  { key: 'supplier_type',     label: 'Type',          defaultVisible: true  },
  { key: 'source',            label: 'Source',        defaultVisible: true  },
  { key: 'id_number',         label: 'ID / TZ',       defaultVisible: false },
  { key: 'business_type',     label: 'Business',      defaultVisible: false },
  { key: 'company_name',      label: 'Company',       defaultVisible: false },
  { key: 'tax_id',            label: 'Tax / VAT',     defaultVisible: false },
  { key: 'bank_name',         label: 'Bank',          defaultVisible: false },
  { key: 'account_number',    label: 'Account No.',   defaultVisible: false },
  { key: 'branch',            label: 'Branch',        defaultVisible: false },
  { key: 'swift',             label: 'SWIFT',         defaultVisible: false },
  { key: 'food_restrictions', label: 'Food',          defaultVisible: false },
  { key: 'dietary_notes',     label: 'Dietary',       defaultVisible: false },
  { key: 'notes',             label: 'Notes',         defaultVisible: true  },
  { key: 'submitted_at',      label: 'Submitted',     defaultVisible: false },
];

const DEFAULT_HIDDEN = PEOPLE_COLS.filter(c => !c.defaultVisible).map(c => c.key);

const BLANK_PERSON = {
  full_name: '', role: '', phone: '', email: '', id_number: '',
  bank_name: '', account_number: '', branch: '', swift: '',
  business_type: 'individual', company_name: '', tax_id: '',
  supplier_type: '', food_restrictions: '', dietary_notes: '', notes: '',
};

// Normalize a raw record into a unified display row
function toRow(raw, source) {
  return {
    _id:              raw._id ?? raw.id,
    _source:          source,
    full_name:        raw.full_name || '',
    role:             source === 'budget' ? (raw.item || '') : (raw.role || ''),
    phone:            raw.phone || '',
    email:            raw.email || '',
    id_number:        raw.id_number || '',
    bank_name:        raw.bank_name || '',
    account_number:   raw.account_number || '',
    branch:           raw.branch || '',
    swift:            raw.swift || '',
    business_type:    raw.business_type || '',
    company_name:     raw.company_name || '',
    tax_id:           raw.tax_id || '',
    food_restrictions: raw.food_restrictions || '',
    dietary_notes:    raw.dietary_notes || '',
    supplier_type:    raw.supplier_type || '',
    notes:            raw.notes || '',
    submitted_at:     raw.submitted_at || null,
  };
}

// ─── Main component ──────────────────────────────────────────────────────────
export default function PeopleOnSet({ production }) {
  const { isEditor } = useAuth();
  const productionId = production.id;

  // Data sources
  const [people, setPeople]         = useState([]);
  const [budgetCrew, setBudgetCrew] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    async function load() {
      const [p, items, subs] = await Promise.all([
        Promise.resolve(getPeopleOnSet(productionId)),
        Promise.resolve(getLineItems(productionId)),
        Promise.resolve(getSupplierSubmissions(productionId)),
      ]);
      setPeople(Array.isArray(p) ? p : []);
      setBudgetCrew((Array.isArray(items) ? items : []).filter(i => i.full_name?.trim()));
      setSubmissions(Array.isArray(subs) ? subs : []);
    }
    load();
  }, [productionId]);

  async function refresh() {
    const p = await Promise.resolve(getPeopleOnSet(productionId));
    setPeople(Array.isArray(p) ? p : []);
  }

  // Unified rows: budget → added → form submissions
  const allRows = useMemo(() => [
    ...budgetCrew.map(i   => toRow({ ...i, _id: `budget-${i.id}` }, 'budget')),
    ...people.map(p       => toRow(p, 'added')),
    ...submissions.map(s  => toRow(s, 'form')),
  ], [budgetCrew, people, submissions]);

  // Counter & dupe detection (across all sources)
  const allNames = useMemo(() => allRows.map(r => r.full_name), [allRows]);
  const uniqueCount = useMemo(() =>
    new Set(allNames.map(n => n.trim().toLowerCase()).filter(Boolean)).size,
  [allNames]);
  const dupes = useMemo(() => {
    const seen = {};
    const found = [];
    allNames.forEach(n => {
      const key = n.trim().toLowerCase();
      if (!key) return;
      if (seen[key] && !found.includes(key)) found.push(key);
      else seen[key] = true;
    });
    return found;
  }, [allNames]);

  // Filters
  const [search, setSearch]             = useState('');
  const [filterSource, setFilterSource] = useState('all');
  const [filterType, setFilterType]     = useState('all');

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return allRows.filter(r => {
      if (filterSource !== 'all' && r._source !== filterSource) return false;
      if (filterType === 'production'      && r.supplier_type !== 'production')      return false;
      if (filterType === 'post_production' && r.supplier_type !== 'post_production') return false;
      if (q && !r.full_name.toLowerCase().includes(q)
             && !r.email.toLowerCase().includes(q)
             && !r.role.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [allRows, search, filterSource, filterType]);

  const hasFilters = !!(search || filterSource !== 'all' || filterType !== 'all');

  // Column visibility
  const [hiddenCols, setHiddenCols]     = useState(DEFAULT_HIDDEN);
  const [showColPanel, setShowColPanel] = useState(false);
  const vis = key => !hiddenCols.includes(key);
  const visColCount = 1 + PEOPLE_COLS.filter(c => vis(c.key)).length + (isEditor ? 1 : 0);

  // Person modal (add / edit)
  const [modal, setModal]       = useState(null);   // null | 'add' | row-object
  const [modalForm, setModalForm] = useState(BLANK_PERSON);
  function setField(f, v) { setModalForm(p => ({ ...p, [f]: v })); }

  function openAdd() {
    setModalForm({ ...BLANK_PERSON });
    setModal('add');
  }
  function openEdit(row) {
    setModalForm({
      full_name: row.full_name, role: row.role, phone: row.phone, email: row.email,
      id_number: row.id_number, bank_name: row.bank_name, account_number: row.account_number,
      branch: row.branch, swift: row.swift,
      business_type: row.business_type || 'individual',
      company_name: row.company_name, tax_id: row.tax_id, supplier_type: row.supplier_type,
      food_restrictions: row.food_restrictions, dietary_notes: row.dietary_notes, notes: row.notes,
    });
    setModal(row);
  }
  function handleModalSave() {
    if (!modalForm.full_name.trim()) return;
    if (modal === 'add') {
      addPersonOnSet({ id: generateId('pos'), production_id: productionId, ...modalForm, full_name: modalForm.full_name.trim() });
    } else {
      updatePersonOnSet(modal._id, { ...modalForm, full_name: modalForm.full_name.trim() });
    }
    setModal(null);
    refresh();
  }
  function handleDelete(id) {
    if (!confirm('Remove this person?')) return;
    removePersonOnSet(id);
    refresh();
  }

  // Form config
  const [formConfig, setFormConfigState] = useState(() => getFormConfig(productionId));
  const [showFormConfig, setShowFormConfig] = useState(false);
  function handleFormConfigSave(patch) {
    setFormConfig(productionId, patch);
    setFormConfigState(fc => ({ ...fc, ...patch }));
  }

  // Copy link
  const [copied, setCopied] = useState(false);
  const shareUrl = `${window.location.origin}/supplier-form/${production.production_id || production.id}`;
  function handleCopyLink() {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="space-y-5">

      {/* ── Top cards ──────────────────────────────────────────────────── */}
      <div className="flex items-start gap-4 flex-wrap">

        {/* People counter */}
        <div className="brand-card flex-shrink-0 min-w-[190px]">
          <div className="text-4xl font-black mb-1" style={{ color: 'var(--brand-primary)' }}>
            👥 {uniqueCount}
          </div>
          <div className="text-sm text-gray-500 font-medium">
            {uniqueCount === 1 ? 'Person on Set' : 'People on Set'}
          </div>
          {dupes.length > 0 && (
            <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              ⚠ <strong>{dupes.map(d => d.charAt(0).toUpperCase() + d.slice(1)).join(', ')}</strong>{' '}
              appear{dupes.length === 1 ? 's' : ''} twice — counted once
            </div>
          )}
        </div>

        {/* Supplier form share */}
        <div className="brand-card flex-1 min-w-[280px]">
          <div className="flex items-center gap-2 mb-3">
            <ClipboardList size={15} style={{ color: 'var(--brand-primary)' }} />
            <span className="text-sm font-bold" style={{ color: 'var(--brand-primary)' }}>Supplier Sign-up Form</span>
            {isEditor && (
              <button onClick={() => setShowFormConfig(true)} className="ml-auto p-1 rounded hover:bg-gray-100 text-gray-400" title="Edit form settings">
                <Pencil size={12} />
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <input readOnly value={shareUrl} className="brand-input flex-1 text-xs font-mono bg-gray-50" />
            <button
              onClick={handleCopyLink}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all flex-shrink-0',
                copied ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
              )}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer"
              className="flex items-center justify-center w-9 h-9 rounded-lg border border-gray-200 bg-white text-gray-500 hover:border-gray-300 flex-shrink-0">
              <ExternalLink size={13} />
            </a>
          </div>
        </div>
      </div>

      {/* ── Toolbar ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Search */}
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          <input
            className="brand-input pl-10 text-sm"
            placeholder="Search name, email, role…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        {/* Source filter */}
        <select className="brand-input text-sm" style={{ width: 130 }} value={filterSource} onChange={e => setFilterSource(e.target.value)}>
          <option value="all">All sources</option>
          <option value="budget">Budget</option>
          <option value="added">Added</option>
          <option value="form">Form</option>
        </select>

        {/* Type filter */}
        <select className="brand-input text-sm" style={{ width: 155 }} value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="all">All types</option>
          <option value="production">On-Set</option>
          <option value="post_production">Post-Production</option>
        </select>

        {hasFilters && (
          <button onClick={() => { setSearch(''); setFilterSource('all'); setFilterType('all'); }}
            className="text-xs text-blue-500 hover:underline">
            Clear
          </button>
        )}

        <div className="ml-auto flex items-center gap-2">

          {/* Column toggle */}
          <div className="relative">
            {showColPanel && <div className="fixed inset-0 z-10" onClick={() => setShowColPanel(false)} />}
            <button
              onClick={() => setShowColPanel(p => !p)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-all',
                showColPanel ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-gray-200 text-gray-500 hover:text-gray-700'
              )}
            >
              <SlidersHorizontal size={12} /> Columns
            </button>
            {showColPanel && (
              <div className="absolute z-20 right-0 top-full mt-1 bg-white rounded-xl shadow-xl border border-gray-200 p-2 min-w-[165px] max-h-80 overflow-y-auto">
                {PEOPLE_COLS.map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 py-1.5 px-2 hover:bg-gray-50 rounded cursor-pointer">
                    <input
                      type="checkbox"
                      checked={vis(key)}
                      onChange={() => setHiddenCols(h => h.includes(key) ? h.filter(x => x !== key) : [...h, key])}
                      className="rounded accent-blue-600"
                    />
                    <span className="text-sm text-gray-700">{label}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Add person */}
          {isEditor && (
            <button onClick={openAdd} className="btn-cta flex items-center gap-1.5 text-xs px-3 py-2">
              <Plus size={13} /> Add Person
            </button>
          )}
        </div>
      </div>

      {/* ── Unified table ──────────────────────────────────────────────── */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 600 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 160 }}>Name</th>
                {vis('role')              && <th style={{ minWidth: 120 }}>Role</th>}
                {vis('phone')             && <th style={{ minWidth: 120 }}>Phone</th>}
                {vis('email')             && <th style={{ minWidth: 170 }}>Email</th>}
                {vis('supplier_type')     && <th style={{ minWidth: 85  }}>Type</th>}
                {vis('source')            && <th style={{ minWidth: 75  }}>Source</th>}
                {vis('id_number')         && <th style={{ minWidth: 100 }}>ID / TZ</th>}
                {vis('business_type')     && <th style={{ minWidth: 90  }}>Business</th>}
                {vis('company_name')      && <th style={{ minWidth: 130 }}>Company</th>}
                {vis('tax_id')            && <th style={{ minWidth: 95  }}>Tax / VAT</th>}
                {vis('bank_name')         && <th style={{ minWidth: 130 }}>Bank</th>}
                {vis('account_number')    && <th style={{ minWidth: 115 }}>Account No.</th>}
                {vis('branch')            && <th style={{ minWidth: 80  }}>Branch</th>}
                {vis('swift')             && <th style={{ minWidth: 100 }}>SWIFT</th>}
                {vis('food_restrictions') && <th style={{ minWidth: 130 }}>Food</th>}
                {vis('dietary_notes')     && <th style={{ minWidth: 130 }}>Dietary</th>}
                {vis('notes')             && <th style={{ minWidth: 150 }}>Notes</th>}
                {vis('submitted_at')      && <th style={{ minWidth: 95  }}>Submitted</th>}
                {isEditor                 && <th style={{ width: 64 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filteredRows.map(row => (
                <PersonRow
                  key={row._id}
                  row={row}
                  vis={vis}
                  isEditor={isEditor}
                  onEdit={() => openEdit(row)}
                  onDelete={() => handleDelete(row._id)}
                />
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={visColCount} className="text-center py-12 text-gray-300 text-sm">
                    {hasFilters
                      ? 'No people match your filters.'
                      : 'No crew yet. Add names or populate the Full Name column in the Budget Table.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Person modal (Add / Edit) ───────────────────────────────────── */}
      {modal && (
        <PersonModal
          mode={modal === 'add' ? 'add' : 'edit'}
          form={modalForm}
          setField={setField}
          onSave={handleModalSave}
          onClose={() => setModal(null)}
        />
      )}

      {/* ── Form config modal ───────────────────────────────────────────── */}
      {showFormConfig && (
        <div className="modal-overlay" onClick={() => setShowFormConfig(false)}>
          <div className="modal-panel" style={{ maxWidth: 420 }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Form Settings</h2>
              <button onClick={() => setShowFormConfig(false)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logo URL</label>
                <input className="brand-input" value={formConfig.logoUrl || ''} onChange={e => handleFormConfigSave({ logoUrl: e.target.value })} placeholder="https://example.com/logo.png" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Background Color</label>
                <div className="flex items-center gap-2">
                  <input type="color" value={formConfig.bgColor || '#f9fafb'} onChange={e => handleFormConfigSave({ bgColor: e.target.value })} className="h-9 w-16 rounded border border-gray-200 cursor-pointer p-0.5" />
                  <input className="brand-input flex-1" value={formConfig.bgColor || ''} onChange={e => handleFormConfigSave({ bgColor: e.target.value })} placeholder="#f9fafb" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Background Image URL</label>
                <input className="brand-input" value={formConfig.bgImageUrl || ''} onChange={e => handleFormConfigSave({ bgImageUrl: e.target.value })} placeholder="https://example.com/bg.jpg" />
              </div>
            </div>
            <div className="flex justify-end mt-5">
              <button onClick={() => setShowFormConfig(false)} className="btn-secondary">Done</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Table row ───────────────────────────────────────────────────────────────
function PersonRow({ row, vis, isEditor, onEdit, onDelete }) {
  const canEdit = row._source === 'added';

  const typeLabel = row.supplier_type === 'post_production' ? 'Post'
                  : row.supplier_type === 'production'      ? 'On-Set'
                  : null;

  const sourceMeta = {
    budget: { label: 'Budget', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    added:  { label: 'Added',  cls: 'bg-gray-100 text-gray-600 border-gray-200' },
    form:   { label: 'Form',   cls: 'bg-purple-50 text-purple-700 border-purple-200' },
  }[row._source];

  return (
    <tr className="group">
      <td className="font-medium text-sm">{row.full_name}</td>
      {vis('role')              && <td className="text-sm text-gray-500">{row.role || '—'}</td>}
      {vis('phone')             && <td className="text-xs text-gray-500">{row.phone || '—'}</td>}
      {vis('email')             && <td className="text-xs text-gray-500">{row.email || '—'}</td>}
      {vis('supplier_type')     && (
        <td>
          {typeLabel
            ? <span className={clsx('badge text-xs border', row.supplier_type === 'post_production' ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-blue-50 text-blue-700 border-blue-200')}>{typeLabel}</span>
            : <span className="text-gray-300">—</span>}
        </td>
      )}
      {vis('source')            && <td><span className={clsx('badge text-xs border', sourceMeta.cls)}>{sourceMeta.label}</span></td>}
      {vis('id_number')         && <td className="text-xs text-gray-500 font-mono">{row.id_number || '—'}</td>}
      {vis('business_type')     && <td className="text-xs text-gray-500 capitalize">{row.business_type || '—'}</td>}
      {vis('company_name')      && <td className="text-xs text-gray-500">{row.company_name || '—'}</td>}
      {vis('tax_id')            && <td className="text-xs text-gray-500 font-mono">{row.tax_id || '—'}</td>}
      {vis('bank_name')         && <td className="text-xs text-gray-500">{row.bank_name || '—'}</td>}
      {vis('account_number')    && <td className="text-xs text-gray-500 font-mono">{row.account_number || '—'}</td>}
      {vis('branch')            && <td className="text-xs text-gray-500">{row.branch || '—'}</td>}
      {vis('swift')             && <td className="text-xs text-gray-500 font-mono">{row.swift || '—'}</td>}
      {vis('food_restrictions') && <td className="text-xs text-gray-500">{row.food_restrictions || '—'}</td>}
      {vis('dietary_notes')     && <td className="text-xs text-gray-500">{row.dietary_notes || '—'}</td>}
      {vis('notes')             && <td className="text-xs text-gray-400">{row.notes || '—'}</td>}
      {vis('submitted_at')      && (
        <td className="text-xs text-gray-400">
          {row.submitted_at ? new Date(row.submitted_at).toLocaleDateString() : '—'}
        </td>
      )}
      {isEditor && (
        <td>
          {canEdit && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button onClick={onEdit}   className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Pencil size={12} /></button>
              <button onClick={onDelete} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"><Trash2 size={12} /></button>
            </div>
          )}
        </td>
      )}
    </tr>
  );
}

// ─── Person modal (Add / Edit) ───────────────────────────────────────────────
function PersonModal({ mode, form, setField, onSave, onClose }) {
  const isAdd = mode === 'add';
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
            {isAdd ? 'Add Person' : 'Edit Person'}
          </h2>
          <button onClick={onClose}><X size={18} className="text-gray-400" /></button>
        </div>

        <div className="space-y-5 max-h-[68vh] overflow-y-auto pr-1">

          {/* Personal info */}
          <section>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Personal Info</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="field-label">Full Name *</label>
                <input className="brand-input" required value={form.full_name} onChange={e => setField('full_name', e.target.value)} placeholder="Full name" autoFocus />
              </div>
              <div>
                <label className="field-label">Role / Position</label>
                <input className="brand-input" value={form.role} onChange={e => setField('role', e.target.value)} placeholder="e.g. Camera Operator" />
              </div>
              <div>
                <label className="field-label">Supplier Type</label>
                <select className="brand-input" value={form.supplier_type} onChange={e => setField('supplier_type', e.target.value)}>
                  <option value="">— Select —</option>
                  <option value="production">Production (On-Set)</option>
                  <option value="post_production">Post-Production</option>
                </select>
              </div>
              <div>
                <label className="field-label">Phone</label>
                <input className="brand-input" value={form.phone} onChange={e => setField('phone', e.target.value)} placeholder="+972 50 000 0000" />
              </div>
              <div>
                <label className="field-label">Email</label>
                <input className="brand-input" type="email" value={form.email} onChange={e => setField('email', e.target.value)} placeholder="you@example.com" />
              </div>
              <div>
                <label className="field-label">ID Number / TZ</label>
                <input className="brand-input" value={form.id_number} onChange={e => setField('id_number', e.target.value)} placeholder="000000000" />
              </div>
            </div>
          </section>

          {/* Bank details */}
          <section>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Bank Details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Bank Name</label>
                <input className="brand-input" value={form.bank_name} onChange={e => setField('bank_name', e.target.value)} placeholder="e.g. Bank Hapoalim" />
              </div>
              <div>
                <label className="field-label">Account Number</label>
                <input className="brand-input" value={form.account_number} onChange={e => setField('account_number', e.target.value)} placeholder="000-000000" />
              </div>
              <div>
                <label className="field-label">Branch</label>
                <input className="brand-input" value={form.branch} onChange={e => setField('branch', e.target.value)} placeholder="Branch code" />
              </div>
              <div>
                <label className="field-label">SWIFT</label>
                <input className="brand-input" value={form.swift} onChange={e => setField('swift', e.target.value)} placeholder="XXXXXXXXXX" />
              </div>
            </div>
          </section>

          {/* Business type */}
          <section>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Business Type</div>
            <div className="flex gap-3 mb-3">
              {['individual', 'company'].map(bt => (
                <label key={bt} className={clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-xl border-2 cursor-pointer transition-all text-sm font-medium',
                  form.business_type === bt ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                )}>
                  <input type="radio" name="modal_business_type" value={bt} checked={form.business_type === bt}
                    onChange={() => setField('business_type', bt)} className="accent-blue-600" />
                  {bt === 'individual' ? 'Individual' : 'Company'}
                </label>
              ))}
            </div>
            {form.business_type === 'company' && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Company Name</label>
                  <input className="brand-input" value={form.company_name} onChange={e => setField('company_name', e.target.value)} placeholder="Company Ltd." />
                </div>
                <div>
                  <label className="field-label">VAT / Tax Number</label>
                  <input className="brand-input" value={form.tax_id} onChange={e => setField('tax_id', e.target.value)} placeholder="000000000" />
                </div>
              </div>
            )}
          </section>

          {/* Food preferences */}
          <section>
            <div className="text-xs font-bold text-gray-400 uppercase tracking-wide mb-3">Food Preferences</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="field-label">Food Restrictions</label>
                <input className="brand-input" value={form.food_restrictions} onChange={e => setField('food_restrictions', e.target.value)} placeholder="e.g. Vegetarian, Gluten-free…" />
              </div>
              <div>
                <label className="field-label">Dietary Notes</label>
                <input className="brand-input" value={form.dietary_notes} onChange={e => setField('dietary_notes', e.target.value)} placeholder="Any other dietary info…" />
              </div>
            </div>
          </section>

          {/* Additional notes */}
          <section>
            <label className="field-label">Additional Notes</label>
            <textarea className="brand-input resize-none" rows={3} value={form.notes}
              onChange={e => setField('notes', e.target.value)} placeholder="Anything else…" />
          </section>
        </div>

        <div className="flex gap-3 mt-5 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={onSave} disabled={!form.full_name.trim()} className="btn-cta flex-1 disabled:opacity-50">
            {isAdd ? 'Add Person' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
