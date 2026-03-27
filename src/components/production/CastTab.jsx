import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Pencil, Trash2, ExternalLink, User, X, Search, Upload, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { getCasting, createCastMember, updateCastMember, deleteCastMember, createGanttEvent, generateId, getLineItems, createLineItem } from '../../lib/dataService';
import ContractModal from './ContractModal';
import InvoiceModal from './InvoiceModal';
import FileUploadButton, { CloudLinks, detectCloudUrl, getDriveThumbnail } from '../shared/FileUploadButton';
import clsx from 'clsx';

const ROLES   = ['Model', 'Actor', 'Actress', 'Extra'];
const PERIODS = ['Perpetually', '1 Year', '6 Months', '3 Months'];
const USAGE_OPTIONS = ['Any Use', 'Digital', 'TV', 'Stills', 'OOH'];

const CONTRACT_STATUS_STYLES = {
  'Running':          'bg-green-100 text-green-700 border-green-200',
  'Close to Overdue': 'bg-orange-100 text-orange-700 border-orange-200',
  'Overdue':          'bg-red-100 text-red-700 border-red-200',
  'Done':             'bg-gray-100 text-gray-500 border-gray-200',
};

const USAGE_COLORS = {
  'Any Use': 'bg-purple-100 text-purple-700',
  'Digital': 'bg-blue-100   text-blue-700',
  'TV':      'bg-yellow-100 text-yellow-700',
  'Stills':  'bg-pink-100   text-pink-700',
  'OOH':     'bg-teal-100   text-teal-700',
};

function calcEndDate(startDate, period) {
  if (!startDate || period === 'Perpetually') return '';
  const d = new Date(startDate);
  if (period === '1 Year')   d.setFullYear(d.getFullYear() + 1);
  if (period === '6 Months') d.setMonth(d.getMonth() + 6);
  if (period === '3 Months') d.setMonth(d.getMonth() + 3);
  return d.toISOString().split('T')[0];
}

function calcWarningDate(endDate) {
  if (!endDate) return '';
  const d = new Date(endDate);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().split('T')[0];
}

const BLANK = {
  name: '', photo_url: '', role: 'Model', period: 'Perpetually',
  start_date: '', end_date: '', warning_date: '', contract_status: 'Running',
  usage: [], signed_contract_url: '', contract_manager_name: '', notes: '',
};

export default function CastTab({ productionId, production }) {
  const { isEditor, isAdmin } = useAuth();
  const [cast, setCast]         = useState([]);
  const [search, setSearch]     = useState('');
  const [editing, setEditing]   = useState(null);   // null | 'new' | cast member object
  const [delConfirm, setDelConfirm] = useState(null);
  const [photoFullscreen, setPhotoFullscreen] = useState(null);
  const [renewingMember, setRenewingMember] = useState(null);   // cast member to renew
  const [contractFor, setContractFor] = useState(null);          // { lineItem }
  const [invoiceFor, setInvoiceFor] = useState(null);            // { id, step }

  const isShootType = ['Shoot', 'Remote Shoot'].includes(production?.production_type);

  useEffect(() => {
    async function load() {
      const result = await Promise.resolve(getCasting(productionId));
      setCast(Array.isArray(result) ? result : []);
    }
    load();
  }, [productionId]);

  async function refresh() {
    const result = await Promise.resolve(getCasting(productionId));
    setCast(Array.isArray(result) ? result : []);
  }

  function openNew()   { setEditing({ ...BLANK }); }
  function openEdit(m) { setEditing({ ...m }); }
  function closeModal(){ setEditing(null); }

  async function handleSave(data) {
    if (data.id) {
      await Promise.resolve(updateCastMember(data.id, data));
    } else {
      const newId = generateId('cm');
      await Promise.resolve(createCastMember({
        ...data,
        id: newId,
        production_id: productionId,
        project_name:  production?.project_name || '',
        brand_id:      production?.brand_id || 'particle',
        created_at:    new Date().toISOString(),
      }));
      // Create Gantt warning event if non-Perpetually
      if (data.warning_date && data.period !== 'Perpetually') {
        await Promise.resolve(createGanttEvent({
          production_id: productionId,
          phase: 'post_production',
          name: `⚠️ Rights renewal: ${data.name} (${(data.usage || []).join(', ')}) — 1 month remaining`,
          start_date: data.warning_date,
          end_date: data.warning_date,
          color: '#f97316',
        }));
      }
    }
    await refresh();
    closeModal();
  }

  async function handleDelete(id) {
    await Promise.resolve(deleteCastMember(id));
    setDelConfirm(null);
    await refresh();
  }

  const filtered = useMemo(() => {
    if (!search.trim()) return cast;
    const q = search.trim().toLowerCase();
    return cast.filter(m =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.role || '').toLowerCase().includes(q) ||
      (m.contract_status || '').toLowerCase().includes(q)
    );
  }, [cast, search]);

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search cast…"
              className="pl-10 pr-3 py-1.5 border rounded-lg text-xs outline-none focus:ring-2 focus:ring-blue-300 w-40"
            />
            {search && <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500"><X size={11} /></button>}
          </div>
          <span className="text-xs text-gray-400">{cast.length} cast member{cast.length !== 1 ? 's' : ''}</span>
        </div>
        {(isEditor || isAdmin) && (
          <button
            onClick={openNew}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-semibold hover:bg-gray-700 transition-colors"
          >
            <Plus size={14} /> Add Cast Member
          </button>
        )}
      </div>

      {/* Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 1100 }}>
            <thead>
              <tr>
                <th style={{ minWidth: 50 }}>Photo</th>
                <th style={{ minWidth: 160 }}>Cast Member</th>
                <th style={{ minWidth: 90 }}>Role</th>
                <th style={{ minWidth: 120 }}>Period</th>
                <th style={{ minWidth: 110 }}>Start Date</th>
                <th style={{ minWidth: 110 }}>End Date</th>
                <th style={{ minWidth: 120 }}>Warning Date</th>
                <th style={{ minWidth: 150 }}>Contract Status</th>
                <th style={{ minWidth: 170 }}>Usage</th>
                <th style={{ minWidth: 100 }}>Signed Contract</th>
                <th style={{ minWidth: 130 }}>Contract Manager</th>
                <th style={{ minWidth: 150 }}>Notes</th>
                {isShootType && <th style={{ minWidth: 90 }}>Renew</th>}
                {(isEditor || isAdmin) && <th style={{ minWidth: 80 }}></th>}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={(isEditor || isAdmin ? 13 : 12) + (isShootType ? 1 : 0)} className="text-center py-12 text-gray-400 text-sm">
                    <User size={32} className="mx-auto mb-2 opacity-20" />
                    {search ? 'No cast members match your search.' : 'No cast members yet.'}
                    {!search && (isEditor || isAdmin) && (
                      <div className="mt-2">
                        <button onClick={openNew} className="text-blue-500 hover:underline text-sm">+ Add first cast member</button>
                      </div>
                    )}
                  </td>
                </tr>
              ) : filtered.map(m => (
                <tr key={m.id}>
                  {/* Photo */}
                  <td>
                    <div className="flex items-center gap-1.5">
                      {m.photo_url ? (
                        <img
                          src={getDriveThumbnail(m.photo_url, 200) || m.photo_url}
                          alt={m.name}
                          className="w-9 h-9 rounded-full object-cover border border-gray-200 cursor-pointer hover:opacity-80 transition-opacity"
                          style={{ maxHeight: 80 }}
                          onClick={() => setPhotoFullscreen(m.photo_url)}
                          onError={e => { if (e.target.src !== m.photo_url) e.target.src = m.photo_url; else e.target.style.display='none'; }}
                          title="Click to view full size"
                        />
                      ) : (
                        <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                          <User size={16} className="text-gray-400" />
                        </div>
                      )}
                      {(isEditor || isAdmin) && (
                        <FileUploadButton
                          category="cast-photos"
                          subfolder={`${new Date().getFullYear()}/${productionId}${production?.project_name ? ' ' + production.project_name : ''}`}
                          fileName={`${m.name || 'Cast'} - Headshot.jpg`}
                          accept="image/*"
                          label=""
                          size="sm"
                          className="opacity-40 hover:opacity-100 transition-opacity"
                          onUploaded={async (data) => {
                            const link = data?.drive?.viewLink || data?.dropbox?.link || '';
                            if (link) {
                              await Promise.resolve(updateCastMember(m.id, { photo_url: link }));
                              refresh();
                            }
                          }}
                        />
                      )}
                    </div>
                  </td>
                  <td className="font-semibold text-sm">{m.name || '—'}</td>
                  <td>
                    <span className="text-xs font-medium text-gray-600 bg-gray-100 px-2 py-0.5 rounded">{m.role}</span>
                  </td>
                  <td className="text-sm text-gray-600">{m.period}</td>
                  <td className="text-xs text-gray-500">{m.start_date || '—'}</td>
                  <td className="text-xs text-gray-500">{m.end_date || <span className="text-gray-300">Ongoing</span>}</td>
                  <td className="text-xs">
                    {m.warning_date ? (
                      <span className="text-orange-600 font-medium">⚠️ {m.warning_date}</span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td>
                    <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full border', CONTRACT_STATUS_STYLES[m.contract_status] || CONTRACT_STATUS_STYLES['Running'])}>
                      {m.contract_status}
                    </span>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {(m.usage || []).map(u => (
                        <span key={u} className={clsx('text-[10px] font-semibold px-1.5 py-0.5 rounded', USAGE_COLORS[u] || 'bg-gray-100 text-gray-600')}>
                          {u}
                        </span>
                      ))}
                      {(!m.usage || m.usage.length === 0) && <span className="text-gray-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td>
                    {m.signed_contract_url ? (
                      <CloudLinks {...detectCloudUrl(m.signed_contract_url)} />
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="text-sm text-gray-600">{m.contract_manager_name || <span className="text-gray-300">—</span>}</td>
                  <td className="text-xs text-gray-500">{m.notes || <span className="text-gray-300">—</span>}</td>
                  {isShootType && (
                    <td>
                      {m.period !== 'Perpetually' ? (
                        <button
                          onClick={() => setRenewingMember(m)}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 hover:bg-blue-100 font-semibold transition-colors"
                          title="Renew commercial rights"
                        >
                          <RefreshCw size={11} /> Renew
                        </button>
                      ) : <span className="text-gray-300 text-xs">—</span>}
                    </td>
                  )}
                  {(isEditor || isAdmin) && (
                    <td>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEdit(m)}
                          className="p-1.5 rounded hover:bg-blue-50 text-gray-400 hover:text-blue-500 transition-colors"
                          title="Edit"
                        >
                          <Pencil size={13} />
                        </button>
                        {delConfirm === m.id ? (
                          <button
                            onClick={() => handleDelete(m.id)}
                            className="text-[10px] text-red-600 font-semibold px-1.5 py-0.5 bg-red-50 rounded border border-red-200 hover:bg-red-100"
                          >
                            Confirm
                          </button>
                        ) : (
                          <button
                            onClick={() => setDelConfirm(m.id)}
                            className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                            title="Delete"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {editing && (
        <CastMemberModal
          initial={editing}
          onSave={handleSave}
          onClose={closeModal}
          productionId={productionId}
          production={production}
        />
      )}

      {/* Renew Rights Modal */}
      {renewingMember && (
        <RenewRightsModal
          member={renewingMember}
          productionId={productionId}
          production={production}
          onClose={() => setRenewingMember(null)}
          onOpenContract={li => { setRenewingMember(null); setContractFor(li); }}
          onRequestInvoice={li => { setRenewingMember(null); setInvoiceFor({ id: li.id, step: 'send' }); }}
          onRefresh={refresh}
        />
      )}

      {contractFor && (
        <ContractModal
          production={production}
          lineItem={contractFor}
          onClose={() => setContractFor(null)}
        />
      )}

      {invoiceFor && (
        <InvoiceModal
          lineItemId={invoiceFor.id}
          productionId={productionId}
          initialStep={invoiceFor.step}
          onClose={() => setInvoiceFor(null)}
        />
      )}

      {/* Fullscreen photo overlay */}
      {photoFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center cursor-pointer"
          onClick={() => setPhotoFullscreen(null)}
        >
          <img
            src={getDriveThumbnail(photoFullscreen, 1200) || photoFullscreen}
            alt="Cast member"
            className="max-w-2xl max-h-screen rounded-xl shadow-2xl object-contain"
            onClick={e => e.stopPropagation()}
            onError={e => { if (e.target.src !== photoFullscreen) e.target.src = photoFullscreen; }}
          />
          <button className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl" onClick={() => setPhotoFullscreen(null)}>✕</button>
        </div>
      )}
    </div>
  );
}

// ─── Renew Rights Modal ───────────────────────────────────────────────────────
function RenewRightsModal({ member, productionId, production, onClose, onOpenContract, onRequestInvoice, onRefresh }) {
  const [period, setPeriod] = useState('1 Year');
  const [cost, setCost] = useState('');
  const [newStart, setNewStart] = useState(member.end_date || new Date().toISOString().split('T')[0]);
  const [savedLi, setSavedLi] = useState(null);

  const newEnd = calcEndDate(newStart, period);
  const newWarning = calcWarningDate(newEnd);

  async function handleSave() {
    const liCost = parseFloat(cost) || 0;
    const allItems = await Promise.resolve(getLineItems(productionId));
    const castLineItem = (Array.isArray(allItems) ? allItems : []).find(li => li.cast_member_id === member.id);
    const newLiId = generateId('li');
    await Promise.resolve(createLineItem({
      id: newLiId,
      production_id: productionId,
      item: `Rights Renewal – ${member.name}`,
      full_name: member.name,
      type: 'Cast',
      currency_code: 'ILS',
      planned_budget: liCost,
      actual_spent: 0,
      payment_status: 'Not Paid',
      status: 'Not Started',
      parent_line_item_id: castLineItem?.id || '',
      cast_member_id: member.id,
    }));
    await Promise.resolve(updateCastMember(member.id, { period, start_date: newStart, end_date: newEnd, warning_date: newWarning }));
    if (newWarning) {
      await Promise.resolve(createGanttEvent({
        production_id: productionId,
        phase: 'post_production',
        name: `⚠️ Rights renewal: ${member.name} — 1 month remaining`,
        start_date: newWarning,
        end_date: newWarning,
        color: '#f97316',
      }));
    }
    if (newEnd) {
      await Promise.resolve(createGanttEvent({
        production_id: productionId,
        phase: 'post_production',
        name: `🔄 Rights end: ${member.name}`,
        start_date: newEnd,
        end_date: newEnd,
        color: '#ef4444',
      }));
    }
    onRefresh();
    setSavedLi({ id: newLiId, production_id: productionId, item: `Rights Renewal – ${member.name}` });
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h3 className="text-base font-black text-gray-900">🔄 Renew Commercial Rights</h3>
            <p className="text-xs text-gray-500 mt-0.5">{member.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"><X size={16} /></button>
        </div>

        {!savedLi ? (
          <div className="p-6 space-y-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Renewal Period</label>
              <div className="flex gap-2 flex-wrap">
                {['3 Months', '6 Months', '1 Year'].map(p => (
                  <button key={p} onClick={() => setPeriod(p)}
                    className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors',
                      period === p ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400')}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Cost ₪</label>
              <input
                type="number" min="0" step="0.01"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="0.00"
                value={cost}
                onChange={e => setCost(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">New Start Date</label>
              <input type="date"
                className="w-full border rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                value={newStart}
                onChange={e => setNewStart(e.target.value)}
              />
            </div>
            {newEnd && (
              <div className="bg-blue-50 rounded-lg p-3 text-xs text-gray-600 space-y-1">
                <div>New end date: <strong>{newEnd}</strong></div>
                {newWarning && <div className="text-orange-600">⚠ Warning: <strong>{newWarning}</strong></div>}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
              <button onClick={handleSave} className="flex-1 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700">
                Save Renewal
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="text-green-500 text-2xl mb-3">✓</div>
            <p className="text-sm font-semibold text-gray-800 mb-1">Rights renewed for {member.name}</p>
            <p className="text-xs text-gray-500 mb-4">Budget line item created. What would you like to do next?</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onOpenContract(savedLi)}
                className="w-full py-2 rounded-xl border border-purple-200 bg-purple-50 text-purple-700 text-sm font-semibold hover:bg-purple-100"
              >
                📄 Open Contract
              </button>
              <button
                onClick={() => onRequestInvoice(savedLi)}
                className="w-full py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold hover:bg-blue-100"
              >
                🧾 Request Invoice
              </button>
              <button
                onClick={onClose}
                className="w-full py-2 rounded-xl border border-gray-200 text-gray-500 text-sm hover:bg-gray-50"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Cast Member Modal ────────────────────────────────────────────────────────
function CastMemberModal({ initial, onSave, onClose, productionId, production }) {
  const [form, setForm] = useState({ ...initial });
  const [photoPreview, setPhotoPreview] = useState(initial.photo_url || '');
  const fileInputRef = useRef(null);

  function set(field, value) {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Auto-calc end_date + warning_date when period or start_date change
      if (field === 'period' || field === 'start_date') {
        const end = calcEndDate(next.start_date, next.period);
        next.end_date = end;
        next.warning_date = calcWarningDate(end);
      }
      if (field === 'end_date') {
        next.warning_date = calcWarningDate(value);
      }
      return next;
    });
  }

  function toggleUsage(u) {
    setForm(prev => ({
      ...prev,
      usage: prev.usage.includes(u)
        ? prev.usage.filter(x => x !== u)
        : [...prev.usage, u],
    }));
  }

  function handlePhotoFile(file) {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert('Photo must be under 2MB'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      setPhotoPreview(e.target.result);
      setForm(prev => ({ ...prev, photo_url: e.target.result }));
    };
    reader.readAsDataURL(file);
  }

  function handlePhotoUrlChange(url) {
    setForm(prev => ({ ...prev, photo_url: url }));
    setPhotoPreview(url);
  }

  function handleSubmit(e) {
    e.preventDefault();
    onSave(form);
  }

  const isEdit = !!form.id;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h3 className="text-base font-bold">{isEdit ? 'Edit Cast Member' : 'Add Cast Member'}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Name */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Full Name *</label>
            <input
              required
              className="brand-input w-full"
              placeholder="e.g. Savanna Chilchik"
              value={form.name}
              onChange={e => set('name', e.target.value)}
            />
          </div>

          {/* Photo: upload + URL + preview */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Photo</label>
            <div className="flex items-center gap-4">
              {photoPreview ? (
                <img
                  src={photoPreview}
                  alt="preview"
                  className="w-16 h-16 rounded-full object-cover border-2 border-gray-200 shrink-0"
                  onError={e => { e.target.style.display='none'; }}
                />
              ) : (
                <div className="w-16 h-16 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center shrink-0">
                  <User size={20} className="text-gray-400" />
                </div>
              )}
              <div className="flex-1 space-y-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 font-medium"
                >
                  <Upload size={11} /> Local Photo (≤2MB)
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => handlePhotoFile(e.target.files?.[0])}
                />
                <FileUploadButton
                  category="cast-photos"
                  subfolder={productionId ? `${new Date().getFullYear()}/${productionId}${production?.project_name ? ' ' + production.project_name : ''}` : ''}
                  fileName={form.name ? `${form.name} - Headshot.jpg` : 'Cast-Headshot.jpg'}
                  accept="image/*"
                  label="Upload to Cloud"
                  size="sm"
                  onUploaded={(data) => {
                    const link = data?.drive?.viewLink || data?.dropbox?.link || '';
                    if (link) {
                      setForm(prev => ({ ...prev, photo_url: link }));
                      setPhotoPreview(link);
                    }
                  }}
                />
                <input
                  type="url"
                  className="brand-input w-full text-xs"
                  placeholder="Or paste image URL…"
                  value={form.photo_url?.startsWith('data:') ? '' : (form.photo_url || '')}
                  onChange={e => handlePhotoUrlChange(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Role + Period */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Role</label>
              <select className="brand-input w-full" value={form.role} onChange={e => set('role', e.target.value)}>
                {ROLES.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Period</label>
              <select className="brand-input w-full" value={form.period} onChange={e => set('period', e.target.value)}>
                {PERIODS.map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>

          {/* Dates — auto-calculated when period ≠ Perpetually */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Start Date</label>
              <input type="date" className="brand-input w-full" value={form.start_date} onChange={e => set('start_date', e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">
                End Date
                {form.period !== 'Perpetually' && <span className="ml-1 text-[10px] text-blue-400 font-normal">auto-calc</span>}
              </label>
              <input
                type="date"
                className="brand-input w-full"
                value={form.end_date}
                onChange={e => set('end_date', e.target.value)}
                placeholder="Leave empty for perpetual"
              />
            </div>
          </div>

          {/* Warning date — read-only computed */}
          {form.end_date && (
            <div className="flex items-center gap-2 bg-orange-50 border border-orange-200 rounded-lg px-3 py-2">
              <span className="text-xs font-semibold text-orange-700">⚠️ Warning Date</span>
              <span className="text-xs text-orange-600 font-mono">{form.warning_date || '—'}</span>
              <span className="text-[10px] text-orange-400 ml-auto">1 month before end · Gantt event added on save</span>
            </div>
          )}

          {/* Contract Status */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Contract Status</label>
            <select className="brand-input w-full" value={form.contract_status} onChange={e => set('contract_status', e.target.value)}>
              <option>Running</option>
              <option>Close to Overdue</option>
              <option>Overdue</option>
              <option>Done</option>
            </select>
          </div>

          {/* Usage */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-2">Usage Rights</label>
            <div className="flex flex-wrap gap-2">
              {USAGE_OPTIONS.map(u => (
                <label key={u} className={clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-lg border cursor-pointer text-xs font-medium transition-all',
                  form.usage.includes(u)
                    ? (USAGE_COLORS[u] || 'bg-gray-100 text-gray-700') + ' border-transparent'
                    : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                )}>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={form.usage.includes(u)}
                    onChange={() => toggleUsage(u)}
                  />
                  {u}
                </label>
              ))}
            </div>
          </div>

          {/* Signed contract + manager */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Signed Contract URL</label>
              <input
                type="url"
                className="brand-input w-full"
                placeholder="Drive link to signed PDF"
                value={form.signed_contract_url}
                onChange={e => set('signed_contract_url', e.target.value)}
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-gray-600 block mb-1">Contract Manager</label>
              <input
                className="brand-input w-full"
                placeholder="e.g. Yuli Group"
                value={form.contract_manager_name}
                onChange={e => set('contract_manager_name', e.target.value)}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="text-xs font-semibold text-gray-600 block mb-1">Notes</label>
            <textarea
              rows={2}
              className="brand-input w-full resize-none"
              placeholder="Any additional notes…"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
            />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm rounded-xl border text-gray-500 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-sm rounded-xl bg-gray-900 text-white hover:bg-gray-700 font-semibold">
              {isEdit ? 'Save Changes' : 'Add to Cast'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
