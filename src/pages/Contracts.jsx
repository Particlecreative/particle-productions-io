import { useState, useEffect, useMemo } from 'react';
import { FileSignature, Search, ExternalLink, Download, Trash2 } from 'lucide-react';
import ExportMenu from '../components/ui/ExportMenu';
import { useBrand } from '../context/BrandContext';
import { useAuth } from '../context/AuthContext';
import { getContracts, getProductions } from '../lib/dataService';
import { getDownloadUrl } from '../lib/invoiceUtils';
import { formatIST } from '../lib/timezone';
import ContractModal from '../components/production/ContractModal';
import { CloudLinks, detectCloudUrl } from '../components/shared/FileUploadButton';
import clsx from 'clsx';

const STATUS_OPTIONS = ['All', 'pending', 'sent', 'signed'];

const CONTRACT_STATUS_STYLES = {
  gray:   { border: 'border-gray-400',   ring: 'ring-gray-400',   text: 'text-gray-700'   },
  amber:  { border: 'border-amber-400',  ring: 'ring-amber-400',  text: 'text-amber-700'  },
  orange: { border: 'border-orange-400', ring: 'ring-orange-400', text: 'text-orange-700' },
  green:  { border: 'border-green-400',  ring: 'ring-green-400',  text: 'text-green-700'  },
};

// Left-border color for each status
const STATUS_ROW_BORDER = {
  pending:        '#9ca3af', // gray-400
  awaiting_hocp:  '#fbbf24', // amber-400
  sent:           '#fb923c', // orange-400
  signed:         '#4ade80', // green-400
};

function statusBadge(status) {
  if (status === 'signed') return <span className="badge text-xs bg-green-50 text-green-700 border border-green-200">✓ Signed</span>;
  if (status === 'sent')   return <span className="badge text-xs bg-orange-50 text-orange-700 border border-orange-200">⏳ Sent</span>;
  if (status === 'awaiting_hocp') return <span className="badge text-xs bg-amber-50 text-amber-700 border border-amber-200">🖊️ HOCP</span>;
  return <span className="badge text-xs bg-gray-100 text-gray-500 border border-gray-200">Pending</span>;
}

function formatRelativeDate(iso) {
  if (!iso) return null;
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60000);
  const hours   = Math.floor(diff / 3600000);
  const days    = Math.floor(diff / 86400000);
  if (minutes < 1)   return 'just now';
  if (minutes < 60)  return `${minutes}m ago`;
  if (hours < 24)    return `${hours}h ago`;
  if (days < 30)     return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12)   return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

export default function Contracts() {
  const { brandId } = useBrand();
  const { isEditor } = useAuth();

  const [productions, setProductions] = useState([]);
  const [contracts, setContracts] = useState([]);

  const [search, setSearch] = useState('');
  const [filterProd, setFilterProd] = useState('');
  const [filterStatus, setFilterStatus] = useState('All');
  const [openContract, setOpenContract] = useState(null); // { production, contract }
  const [flashedId, setFlashedId] = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null); // contract object
  const [deleteDrive, setDeleteDrive] = useState(true);
  const [deleting, setDeleting] = useState(false);

  async function handleDeleteContract() {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const token = localStorage.getItem('cp_auth_token');
      await fetch(`/api/contracts/${deleteConfirm.id}?deleteDrive=${deleteDrive}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      refreshContracts();
    } catch (e) {
      console.error('Delete contract failed:', e);
    }
    setDeleteConfirm(null);
    setDeleting(false);
    setDeleteDrive(true);
  }

  useEffect(() => {
    async function load() {
      const [prods, ctrs] = await Promise.all([
        Promise.resolve(getProductions(brandId)),
        Promise.resolve(getContracts()),
      ]);
      setProductions(Array.isArray(prods) ? prods : []);
      setContracts(Array.isArray(ctrs) ? ctrs : []);
    }
    load();
  }, [brandId]);

  async function refreshContracts() {
    const ctrs = await Promise.resolve(getContracts());
    setContracts(Array.isArray(ctrs) ? ctrs : []);
  }

  // Build a map: productionId → production
  const prodMap = useMemo(() => {
    const map = {};
    productions.forEach(p => { map[p.id] = p; });
    return map;
  }, [productions]);

  const filtered = useMemo(() => {
    let list = contracts.map(c => {
      const prodId = c.production_id.includes('_li_') ? c.production_id.split('_li_')[0] : c.production_id;
      return { ...c, _prodId: prodId, _prod: prodMap[prodId] };
    });

    if (filterProd) list = list.filter(c => c._prodId === filterProd);
    if (filterStatus !== 'All') list = list.filter(c => (c.status || 'pending') === filterStatus);
    if (search) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        (c.provider_name || '').toLowerCase().includes(q) ||
        (c.provider_email || '').toLowerCase().includes(q) ||
        (c._prod?.project_name || '').toLowerCase().includes(q) ||
        c._prodId.toLowerCase().includes(q)
      );
    }

    return list.sort((a, b) => {
      if ((a.status === 'signed') !== (b.status === 'signed')) return a.status === 'signed' ? 1 : -1;
      return (b.sent_at || '').localeCompare(a.sent_at || '');
    });
  }, [contracts, filterProd, filterStatus, search, prodMap]);

  const hasFilters = search || filterProd || filterStatus !== 'All';

  function handleRowClick(c) {
    const prod = c._prod;
    if (!prod) return;
    const lineItemId = c.production_id.includes('_li_') ? c.production_id.split('_li_')[1] : null;
    setOpenContract({ production: prod, lineItemId, contractKey: c.production_id });
  }

  function handleModalClose() {
    // Flash the row that was open
    if (openContract?.contractKey) {
      setFlashedId(openContract.contractKey);
      setTimeout(() => setFlashedId(null), 800);
    }
    refreshContracts();
    setOpenContract(null);
  }

  const CONTRACTS_EXPORT_COLS = [
    { key: '_prodId', label: 'Production ID' },
    { key: 'provider_name', label: 'Supplier' },
    { key: 'provider_email', label: 'Email' },
    { key: 'status', label: 'Status' },
    { key: 'sent_at', label: 'Sent' },
    { key: 'signed_at', label: 'Signed' },
    { key: 'pdf_url', label: 'Contract URL' },
  ];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Contracts
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-400">{filtered.length} contract{filtered.length !== 1 ? 's' : ''}</span>
          <ExportMenu rows={filtered} columns={CONTRACTS_EXPORT_COLS} filename="contracts" title="Contracts" />
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Pending', status: 'pending', color: 'gray' },
          { label: 'HOCP',    status: 'awaiting_hocp', color: 'amber' },
          { label: 'Sent',    status: 'sent',    color: 'orange' },
          { label: 'Signed',  status: 'signed',  color: 'green' },
        ].map(({ label, status, color }) => {
          const count = contracts.filter(c => (c.status || 'pending') === status).length;
          const styles = CONTRACT_STATUS_STYLES[color];
          return (
            <div
              key={status}
              className={clsx(
                'brand-card border-l-4 cursor-pointer transition-all hover:scale-[1.01]',
                styles.border,
                filterStatus === status && `ring-2 ${styles.ring}`
              )}
              onClick={() => setFilterStatus(s => s === status ? 'All' : status)}
            >
              <div className="text-xs text-gray-400 mb-1">{label}</div>
              <div className={clsx('text-2xl font-black', styles.text)}>{count}</div>
            </div>
          );
        })}
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-3 mb-5 flex-wrap">
        <div className="relative flex-1 sm:flex-none">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            className="brand-input pl-10 w-full sm:w-[220px]"
            placeholder="Search supplier…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <select
          className="brand-input flex-1 sm:flex-none sm:w-[180px]"
          value={filterProd}
          onChange={e => setFilterProd(e.target.value)}
        >
          <option value="">All Productions</option>
          {productions.map(p => (
            <option key={p.id} value={p.id}>{p.id} — {p.project_name}</option>
          ))}
        </select>

        <select
          className="brand-input flex-1 sm:flex-none sm:w-[140px]"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          {STATUS_OPTIONS.map(s => <option key={s}>{s === 'All' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
        </select>

        {hasFilters && (
          <button
            className="text-xs text-blue-500 hover:underline"
            onClick={() => { setSearch(''); setFilterProd(''); setFilterStatus('All'); }}
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="brand-card p-0 overflow-hidden">
        <div className="table-scroll-wrapper">
          <table className="data-table" style={{ minWidth: 900 }}>
            <thead>
              <tr>
                <th>Production</th>
                <th>PRD</th>
                <th>Supplier</th>
                <th>Email</th>
                <th>Status</th>
                <th>Sent</th>
                <th>Signed</th>
                <th>Contract</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-gray-400 text-sm">
                    {hasFilters ? 'No contracts match your filters.' : 'No contracts yet.'}
                  </td>
                </tr>
              ) : filtered.map((c, i) => {
                const dl = getDownloadUrl(c.pdf_url);
                const status = c.status || 'pending';
                const borderColor = STATUS_ROW_BORDER[status] || '#9ca3af';
                const isFlashing = flashedId === c.production_id;
                return (
                  <tr
                    key={i}
                    className={clsx(
                      'cursor-pointer hover:bg-blue-50 transition-colors',
                      isFlashing && 'row-flash'
                    )}
                    style={{ borderLeft: `3px solid ${borderColor}` }}
                    onClick={() => handleRowClick(c)}
                  >
                    <td className="font-medium text-sm">{c._prod?.project_name || c._prodId}</td>
                    <td className="font-mono text-xs font-semibold" style={{ color: 'var(--brand-secondary)' }}>
                      {c._prod?.production_id || c._prodId}
                    </td>
                    <td className="text-sm">{c.provider_name || '—'}</td>
                    <td className="text-xs text-gray-500">{c.provider_email || '—'}</td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        {statusBadge(status)}
                        <CloudLinks driveUrl={c.drive_url} dropboxUrl={c.dropbox_url} />
                      </div>
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {c.sent_at ? (
                        <span title={formatIST(c.sent_at)} className="text-gray-500">
                          {formatIST(c.sent_at)}
                          <span className="text-gray-300 ml-1">· {formatRelativeDate(c.sent_at)}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td className="text-xs whitespace-nowrap">
                      {c.signed_at ? (
                        <span title={formatIST(c.signed_at)} className="text-gray-500">
                          {formatIST(c.signed_at)}
                          <span className="text-gray-300 ml-1">· {formatRelativeDate(c.signed_at)}</span>
                        </span>
                      ) : '—'}
                    </td>
                    <td onClick={e => e.stopPropagation()}>
                      {c.pdf_url ? (
                        <div className="flex items-center gap-2">
                          <a
                            href={c.pdf_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-0.5 text-xs text-blue-600 hover:underline"
                          >
                            <ExternalLink size={10} /> View
                          </a>
                          <CloudLinks {...detectCloudUrl(c.pdf_url, c.drive_url, c.dropbox_url)} />
                        </div>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td onClick={e => e.stopPropagation()} className="text-center">
                      {isEditor && (
                        <button
                          onClick={() => setDeleteConfirm(c)}
                          className="p-1 rounded hover:bg-red-50 text-gray-300 hover:text-red-500 transition-colors"
                          title="Delete contract"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Contract Modal */}
      {openContract && (
        <ContractModal
          production={openContract.production}
          lineItem={openContract.lineItemId ? { id: openContract.lineItemId } : null}
          onClose={handleModalClose}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => !deleting && setDeleteConfirm(null)}>
          <div className="modal-panel max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="text-center mb-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-50 text-red-500 mb-3">
                <Trash2 size={22} />
              </div>
              <h3 className="text-lg font-bold text-gray-800">Delete Contract?</h3>
              <p className="text-sm text-gray-500 mt-1">
                Contract for <strong>{deleteConfirm.provider_name || 'Unknown'}</strong> will be permanently deleted.
              </p>
            </div>
            <label className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg mb-4 cursor-pointer">
              <input
                type="checkbox"
                checked={deleteDrive}
                onChange={e => setDeleteDrive(e.target.checked)}
                className="rounded"
              />
              <span className="text-sm text-gray-600">Also delete files from Google Drive</span>
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => { setDeleteConfirm(null); setDeleteDrive(true); }}
                className="flex-1 btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteContract}
                disabled={deleting}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
