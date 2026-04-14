import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, Search, Package, Truck, Check, X, ExternalLink, ChevronDown, Upload, Loader2, RefreshCw } from 'lucide-react';
import { getProductDeliveries, createProductDelivery, updateProductDelivery, deleteProductDelivery } from '../../lib/dataService';
import { apiGet } from '../../lib/apiClient';
import { useAuth } from '../../context/AuthContext';
import FileUploadButton from '../shared/FileUploadButton';
import clsx from 'clsx';

const API = import.meta.env.VITE_API_URL || '';

const STATUSES = ['Pending', 'Shipped', 'In Transit', 'Delivered', 'Failed'];
const STATUS_STYLES = {
  'Pending':    'bg-gray-100 text-gray-600 border-gray-200',
  'Shipped':    'bg-blue-50 text-blue-700 border-blue-200',
  'In Transit': 'bg-amber-50 text-amber-700 border-amber-200',
  'Delivered':  'bg-green-50 text-green-700 border-green-200',
  'Failed':     'bg-red-50 text-red-700 border-red-200',
};

const COUNTRY_CODES = [
  { code: '+1', label: 'US/CA +1' }, { code: '+44', label: 'UK +44' },
  { code: '+972', label: 'IL +972' }, { code: '+61', label: 'AU +61' },
  { code: '+49', label: 'DE +49' }, { code: '+33', label: 'FR +33' },
  { code: '+39', label: 'IT +39' }, { code: '+34', label: 'ES +34' },
  { code: '+81', label: 'JP +81' }, { code: '+86', label: 'CN +86' },
  { code: '+91', label: 'IN +91' }, { code: '+55', label: 'BR +55' },
];

function detectCarrier(tracking) {
  if (!tracking) return null;
  const t = tracking.trim();
  if (/^1Z/i.test(t)) return { name: 'UPS', url: `https://www.ups.com/track?tracknum=${t}` };
  if (/^\d{12,15}$/.test(t)) return { name: 'FedEx', url: `https://www.fedex.com/fedextrack/?trknbr=${t}` };
  if (/^\d{20,}$/.test(t)) return { name: 'USPS', url: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${t}` };
  if (/^\d{10,11}$/.test(t)) return { name: 'DHL', url: `https://www.dhl.com/en/express/tracking.html?AWB=${t}` };
  return null;
}

function fmtDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function fmtAddress(r) {
  return [r.address_street, r.address_apt, r.address_city, r.address_state, r.address_zip, r.address_country].filter(Boolean).join(', ');
}

export default function ProductDeliveryTab({ productionId, production }) {
  const { isEditor } = useAuth();
  const [deliveries, setDeliveries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState(null); // delivery id being edited
  const [editData, setEditData] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [selected, setSelected] = useState(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    const data = await getProductDeliveries(productionId);
    setDeliveries(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [productionId]);

  useEffect(() => { load(); }, [load]);

  // Auto-populate from casting on first load
  useEffect(() => {
    if (loading || deliveries.length > 0) return;
    (async () => {
      try {
        const casting = await apiGet(`/casting?production_id=${productionId}`);
        if (!Array.isArray(casting) || casting.length === 0) return;
        // Also try to get contract emails
        const contracts = await apiGet(`/contracts?production_id=${productionId}`).catch(() => []);
        const contractMap = {};
        (Array.isArray(contracts) ? contracts : []).forEach(c => {
          if (c.provider_name && c.provider_email) contractMap[c.provider_name.toLowerCase().trim()] = c.provider_email;
        });
        for (const cast of casting) {
          const email = contractMap[cast.name?.toLowerCase().trim()] || '';
          await createProductDelivery({
            production_id: productionId,
            casting_id: cast.id,
            recipient_name: cast.name,
            recipient_email: email,
            product_name: production?.project_name || '',
          });
        }
        load();
      } catch (e) { console.error('Auto-populate failed:', e); }
    })();
  }, [loading, deliveries.length, productionId, production, load]);

  async function handleAdd() {
    await createProductDelivery({
      production_id: productionId,
      recipient_name: 'New Recipient',
      product_name: production?.project_name || '',
    });
    load();
    setShowAdd(false);
  }

  async function handleUpdate(id, field, value) {
    const oldRow = deliveries.find(d => d.id === id);
    await updateProductDelivery(id, { [field]: value, _old_status: oldRow?.delivery_status });
    load();
  }

  async function handleDelete(id) {
    if (!confirm('Delete this delivery record?')) return;
    await deleteProductDelivery(id);
    load();
  }

  async function handleBulkStatus(status) {
    if (selected.size === 0) return;
    const jwt = localStorage.getItem('cp_auth_token');
    await fetch(`${API}/api/product-deliveries/bulk-status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
      body: JSON.stringify({ ids: [...selected], delivery_status: status }),
    });
    setSelected(new Set());
    load();
  }

  function startEdit(row) {
    setEditing(row.id);
    setEditData({ ...row });
  }

  async function saveEdit() {
    if (!editing) return;
    await updateProductDelivery(editing, editData);
    setEditing(null);
    load();
  }

  const filtered = deliveries.filter(d => {
    if (!search) return true;
    const s = search.toLowerCase();
    return (d.recipient_name || '').toLowerCase().includes(s) ||
           (d.recipient_email || '').toLowerCase().includes(s) ||
           (d.tracking_number || '').toLowerCase().includes(s) ||
           (d.delivery_status || '').toLowerCase().includes(s);
  });

  const summary = {
    total: deliveries.length,
    delivered: deliveries.filter(d => d.delivery_status === 'Delivered').length,
    shipped: deliveries.filter(d => ['Shipped', 'In Transit'].includes(d.delivery_status)).length,
    pending: deliveries.filter(d => d.delivery_status === 'Pending').length,
  };

  if (loading) return <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading deliveries...</div>;

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <Package size={16} className="text-indigo-500" />
          <span className="text-sm font-bold text-gray-800">Product Delivery</span>
          <span className="text-xs text-gray-400">{summary.total} recipient{summary.total !== 1 ? 's' : ''}</span>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          {summary.total > 0 && (
            <div className="flex items-center gap-1.5 text-[10px]">
              <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 font-semibold">{summary.delivered} delivered</span>
              <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-semibold">{summary.shipped} shipped</span>
              <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-semibold">{summary.pending} pending</span>
            </div>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search recipients, tracking..."
            className="w-full pl-8 pr-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-indigo-300" />
        </div>
        {selected.size > 0 && (
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-gray-500">{selected.size} selected:</span>
            {STATUSES.map(s => (
              <button key={s} onClick={() => handleBulkStatus(s)}
                className={`text-[10px] px-2 py-1 rounded-lg border font-semibold ${STATUS_STYLES[s]}`}>{s}</button>
            ))}
          </div>
        )}
        {isEditor && (
          <button onClick={handleAdd} className="flex items-center gap-1 text-xs px-3 py-2 bg-indigo-600 text-white rounded-xl font-semibold hover:bg-indigo-700">
            <Plus size={12} /> Add Recipient
          </button>
        )}
        <button onClick={load} className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100" title="Refresh">
          <RefreshCw size={13} />
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 brand-card">
          <Package size={32} className="mx-auto mb-3 text-gray-200" />
          <p className="text-sm text-gray-400 font-medium">No delivery records yet</p>
          <p className="text-xs text-gray-300 mt-1">Cast members will auto-populate when added, or click "Add Recipient"</p>
        </div>
      ) : (
        <div className="brand-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[900px]">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-widest text-gray-400 font-bold">
                <tr>
                  {isEditor && <th className="w-8 px-2 py-2"><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={e => setSelected(e.target.checked ? new Set(filtered.map(d => d.id)) : new Set())} className="accent-indigo-600" /></th>}
                  <th className="px-3 py-2 text-left">Recipient</th>
                  <th className="px-3 py-2 text-left">Phone</th>
                  <th className="px-3 py-2 text-left">Address</th>
                  <th className="px-3 py-2 text-left">Product</th>
                  <th className="px-3 py-2 text-left">Shipping</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  {isEditor && <th className="w-16 px-2 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map(d => {
                  const carrier = detectCarrier(d.tracking_number);
                  const isEditing = editing === d.id;
                  return (
                    <tr key={d.id} className="hover:bg-gray-50/50 group align-top">
                      {isEditor && (
                        <td className="px-2 py-3"><input type="checkbox" checked={selected.has(d.id)} onChange={e => {
                          const next = new Set(selected);
                          e.target.checked ? next.add(d.id) : next.delete(d.id);
                          setSelected(next);
                        }} className="accent-indigo-600" /></td>
                      )}
                      {/* Recipient */}
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input value={editData.recipient_name || ''} onChange={e => setEditData(p => ({ ...p, recipient_name: e.target.value }))}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none" placeholder="Name" />
                            <input value={editData.recipient_email || ''} onChange={e => setEditData(p => ({ ...p, recipient_email: e.target.value }))}
                              className="w-full border border-gray-200 rounded px-2 py-1 text-xs outline-none" placeholder="Email" />
                          </div>
                        ) : (
                          <div>
                            <p className="font-semibold text-gray-800">{d.recipient_name || '—'}</p>
                            {d.recipient_email && <p className="text-[10px] text-gray-400">{d.recipient_email}</p>}
                          </div>
                        )}
                      </td>
                      {/* Phone */}
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <div className="flex gap-1">
                            <select value={editData.phone_country_code || '+1'} onChange={e => setEditData(p => ({ ...p, phone_country_code: e.target.value }))}
                              className="w-20 border border-gray-200 rounded px-1 py-1 text-[10px]">
                              {COUNTRY_CODES.map(c => <option key={c.code} value={c.code}>{c.label}</option>)}
                            </select>
                            <input value={editData.recipient_phone || ''} onChange={e => setEditData(p => ({ ...p, recipient_phone: e.target.value }))}
                              className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs outline-none" placeholder="Phone" />
                          </div>
                        ) : (
                          <span className="text-gray-600">{d.recipient_phone ? `${d.phone_country_code || ''} ${d.recipient_phone}` : '—'}</span>
                        )}
                      </td>
                      {/* Address */}
                      <td className="px-3 py-3 max-w-[200px]">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input value={editData.address_street || ''} onChange={e => setEditData(p => ({ ...p, address_street: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Street" />
                            <input value={editData.address_apt || ''} onChange={e => setEditData(p => ({ ...p, address_apt: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Apt/Suite" />
                            <div className="flex gap-1">
                              <input value={editData.address_city || ''} onChange={e => setEditData(p => ({ ...p, address_city: e.target.value }))} className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="City" />
                              <input value={editData.address_state || ''} onChange={e => setEditData(p => ({ ...p, address_state: e.target.value }))} className="w-12 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="State" />
                            </div>
                            <div className="flex gap-1">
                              <input value={editData.address_zip || ''} onChange={e => setEditData(p => ({ ...p, address_zip: e.target.value }))} className="w-20 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="ZIP" />
                              <input value={editData.address_country || ''} onChange={e => setEditData(p => ({ ...p, address_country: e.target.value }))} className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Country" />
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-600 text-[11px] line-clamp-2">{fmtAddress(d) || <span className="text-gray-300">No address</span>}</span>
                        )}
                      </td>
                      {/* Product */}
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input value={editData.product_name || ''} onChange={e => setEditData(p => ({ ...p, product_name: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Product name" />
                            <input type="number" value={editData.product_quantity || 1} onChange={e => setEditData(p => ({ ...p, product_quantity: parseInt(e.target.value) || 1 }))} className="w-16 border border-gray-200 rounded px-2 py-1 text-xs" min={1} />
                          </div>
                        ) : (
                          <div>
                            <span className="text-gray-700">{d.product_name || '—'}</span>
                            {d.product_quantity > 1 && <span className="text-[10px] text-gray-400 ml-1">x{d.product_quantity}</span>}
                          </div>
                        )}
                      </td>
                      {/* Shipping */}
                      <td className="px-3 py-3">
                        {isEditing ? (
                          <div className="space-y-1">
                            <input value={editData.shipping_company || ''} onChange={e => setEditData(p => ({ ...p, shipping_company: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Carrier" />
                            <input value={editData.tracking_number || ''} onChange={e => setEditData(p => ({ ...p, tracking_number: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" placeholder="Tracking #" />
                            <input type="date" value={editData.shipping_date || ''} onChange={e => setEditData(p => ({ ...p, shipping_date: e.target.value }))} className="w-full border border-gray-200 rounded px-2 py-1 text-xs" />
                          </div>
                        ) : (
                          <div>
                            {d.shipping_company && <p className="text-gray-600 font-medium">{d.shipping_company}</p>}
                            {d.tracking_number && (
                              carrier ? (
                                <a href={carrier.url} target="_blank" rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-[10px] flex items-center gap-0.5">
                                  <ExternalLink size={8} /> {carrier.name}: {d.tracking_number.slice(0, 12)}...
                                </a>
                              ) : <p className="text-[10px] text-gray-400 font-mono">{d.tracking_number}</p>
                            )}
                            {d.shipping_date && <p className="text-[10px] text-gray-400">Shipped {fmtDate(d.shipping_date)}</p>}
                            {d.expected_delivery && <p className="text-[10px] text-gray-400">ETA {fmtDate(d.expected_delivery)}</p>}
                          </div>
                        )}
                      </td>
                      {/* Status */}
                      <td className="px-3 py-3">
                        {isEditor ? (
                          <select value={d.delivery_status} onChange={e => handleUpdate(d.id, 'delivery_status', e.target.value)}
                            className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border cursor-pointer ${STATUS_STYLES[d.delivery_status] || STATUS_STYLES.Pending}`}>
                            {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        ) : (
                          <span className={`text-[10px] font-semibold px-2.5 py-1 rounded-full border ${STATUS_STYLES[d.delivery_status] || STATUS_STYLES.Pending}`}>
                            {d.delivery_status}
                          </span>
                        )}
                        {d.delivery_status === 'Delivered' && d.confirmation_photo_url && (
                          <a href={d.confirmation_photo_url} target="_blank" rel="noopener noreferrer"
                            className="block mt-1 text-[9px] text-green-600 hover:underline">View confirmation</a>
                        )}
                      </td>
                      {/* Actions */}
                      {isEditor && (
                        <td className="px-2 py-3">
                          {isEditing ? (
                            <div className="flex gap-1">
                              <button onClick={saveEdit} className="p-1 text-green-500 hover:bg-green-50 rounded"><Check size={12} /></button>
                              <button onClick={() => setEditing(null)} className="p-1 text-gray-400 hover:bg-gray-100 rounded"><X size={12} /></button>
                            </div>
                          ) : (
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button onClick={() => startEdit(d)} className="p-1 text-gray-400 hover:text-blue-500 rounded" title="Edit">
                                <Truck size={11} />
                              </button>
                              <button onClick={() => handleDelete(d.id)} className="p-1 text-gray-400 hover:text-red-500 rounded" title="Delete">
                                <Trash2 size={11} />
                              </button>
                            </div>
                          )}
                        </td>
                      )}
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
}
