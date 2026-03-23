import { useState, useEffect, useRef } from 'react';
import { Save, Upload, Palette, Type, Globe, List, Plus, X, Check, ChevronUp, ChevronDown, RotateCcw, Clock, Wrench, Trash2, Building2, Pencil, ServerCog } from 'lucide-react';
import { useBrand } from '../context/BrandContext';
import { useLists } from '../context/ListsContext';
import { useAuth } from '../context/AuthContext';
import { getSettings, updateSettings, getImprovementTickets, createImprovementTicket, updateImprovementTicket, deleteImprovementTicket, generateId, getBrands, createBrand, updateBrand, deleteBrand, getProductions, bulkCreateLineItems, bulkCreateCastMembers } from '../lib/dataService';
import { LIST_META } from '../lib/listService';
import clsx from 'clsx';

/* ─────────────────────────────────────────────────────────────────────────────
   Single editable list card
───────────────────────────────────────────────────────────────────────────── */
function ListEditor({ listKey, items, onUpdate, onReset }) {
  const meta = LIST_META[listKey];
  const [editingIdx, setEditingIdx] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addValue, setAddValue] = useState('');

  function moveUp(idx) {
    if (idx === 0) return;
    const next = [...items];
    [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
    onUpdate(next);
  }

  function moveDown(idx) {
    if (idx === items.length - 1) return;
    const next = [...items];
    [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
    onUpdate(next);
  }

  function startEdit(idx) {
    setEditingIdx(idx);
    setEditValue(items[idx]);
    setShowAdd(false);
  }

  function saveEdit() {
    if (editValue.trim() && editingIdx !== null) {
      const next = [...items];
      next[editingIdx] = editValue.trim();
      onUpdate(next);
    }
    setEditingIdx(null);
  }

  function deleteItem(idx) {
    onUpdate(items.filter((_, i) => i !== idx));
  }

  function handleAdd() {
    const v = addValue.trim();
    if (!v) return;
    if (!items.map(i => i.toLowerCase()).includes(v.toLowerCase())) {
      onUpdate([...items, v]);
    }
    setAddValue('');
    setShowAdd(false);
  }

  function handleReset() {
    if (window.confirm(`Reset "${meta.label}" to defaults?`)) onReset();
  }

  return (
    <div className="brand-card flex flex-col gap-0">
      {/* Header */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-bold text-sm text-gray-800">{meta.label}</h3>
          <p className="text-[11px] text-gray-400 mt-0.5">{meta.description}</p>
        </div>
        <button
          onClick={handleReset}
          className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-orange-500 transition-colors mt-0.5"
          title="Reset to defaults"
        >
          <RotateCcw size={10} /> Reset
        </button>
      </div>

      {/* Items */}
      <div className="space-y-0.5">
        {items.map((item, idx) => (
          <div key={idx} className="flex items-center gap-1 group rounded hover:bg-gray-50 px-1 py-0.5">

            {/* Up / Down arrows */}
            <div className="flex flex-col flex-shrink-0">
              <button
                onClick={() => moveUp(idx)}
                disabled={idx === 0}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none leading-none"
              >
                <ChevronUp size={11} />
              </button>
              <button
                onClick={() => moveDown(idx)}
                disabled={idx === items.length - 1}
                className="text-gray-300 hover:text-gray-600 disabled:opacity-0 disabled:pointer-events-none leading-none"
              >
                <ChevronDown size={11} />
              </button>
            </div>

            {/* Item label / inline edit */}
            {editingIdx === idx ? (
              <input
                className="brand-input text-sm flex-1 py-0.5"
                value={editValue}
                onChange={e => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveEdit();
                  if (e.key === 'Escape') setEditingIdx(null);
                }}
                autoFocus
              />
            ) : (
              <span
                className="flex-1 text-sm text-gray-700 cursor-pointer hover:text-gray-900 select-none"
                onClick={() => startEdit(idx)}
                title="Click to edit"
              >
                {item}
              </span>
            )}

            {/* Delete — visible on hover */}
            {editingIdx !== idx && (
              <button
                onClick={() => deleteItem(idx)}
                className="text-transparent group-hover:text-gray-300 hover:!text-red-500 transition-colors flex-shrink-0"
                title="Delete"
              >
                <X size={13} />
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Add item */}
      <div className="mt-2 pt-2 border-t border-gray-100">
        {showAdd ? (
          <div className="flex items-center gap-1.5">
            <input
              className="brand-input text-sm flex-1"
              value={addValue}
              onChange={e => setAddValue(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') { setShowAdd(false); setAddValue(''); }
              }}
              placeholder="New item…"
              autoFocus
            />
            <button onClick={handleAdd} className="text-green-500 hover:text-green-700 transition-colors">
              <Check size={15} />
            </button>
            <button onClick={() => { setShowAdd(false); setAddValue(''); }} className="text-gray-400 hover:text-gray-600 transition-colors">
              <X size={15} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors"
          >
            <Plus size={12} /> Add item
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   Version Changelog
───────────────────────────────────────────────────────────────────────────── */
const CHANGELOG = [
  {
    version: '1.8', date: '2026-03-12', label: 'Brand Management, Budget Columns, Gantt Day View, Invoice Receipts, UX Redesign',
    changes: [
      'Brand Management (Super Admin): full CRUD for brands with custom colors/logos; per-user brand access control; brand switcher shows only accessible brands',
      'Budget Table: timeline column hidden by default (data preserved, still accessible via column toggle); custom column builder — Text / Number / Date / Checkbox, scoped to this production or as global template',
      'Gantt Day View: third zoom level showing individual days (~56px/cell); Prev/Next navigates by 7 days in day mode',
      'Gantt Israeli work week: Fri/Sat cells styled with grey/striped background; drag or resize onto Fri/Sat triggers warning toast with "Move to Thursday" or "Keep" options',
      'Gantt Holiday Calendars: toggleable Israeli 🇮🇱 and American 🇺🇸 overlays (2026 hardcoded); colored dots in date header + day-view cell labels; informational only — does not block scheduling',
      'Master Gantt: Group by Phase toggle — merges all production events under shared phase names; vs default Group by Production view',
      'Invoice Receipt Lifecycle: חשבון עסקה + Paid triggers חשבונית מס/קבלה follow-up; receipt records stored in cp_receipts; 48h reminder banner with WhatsApp/Email quick-request; Receipts sub-tab in Invoices page with URL input per record',
      'Removed "Add Invoice Link" input from Accounting panels and LedgerTab — Invoice URL is now only settable via InvoiceModal',
      'Invoices page: Received rows sink to bottom of each production group with 60% opacity',
      'Business type list updated: עוסק פטור, עוסק מורשה, חברה בע״מ, שכר אומנים, Company LTD, Self Employed',
      'Dashboard Timeline: per-row sync toggle — "Sync with Gantt 🔄" derives planned_start/end from min/max of production\'s Gantt event dates (read-only, auto-updates)',
      'Productions Dashboard: three new optional columns — Shoot Date (multi-date, Shoot types only), Delivery Date (auto-synced or manual), On-Air Date — all hidden by default',
      'Renamed "Dashboard" nav item and page heading → "Productions"',
      'UX polish — Links: category pill filters + gradient left borders by category color + card-pop animation on copy + friendly empty state',
      'UX polish — Contracts: status-colored left border stripe on rows + relative dates ("3d ago") + row flash animation after modal close',
      'UX polish — Suppliers: column visibility persisted to localStorage; supplier modal split into Info / Banking / Productions tabs; type badge glow; add-options always visible; dashboard counter fade-in animation',
      'UX polish — Gantt: today line pulse animation; smooth phase collapse (max-height transition); event count badge on collapsed phases; drag/drop scale+shadow feedback on event bar',
    ],
  },
  {
    version: '1.7', date: '2026-03-12', label: 'Improvements Ticket System',
    changes: [
      'Settings → Improvements tab: submit internal bug fix / improvement / upgrade tickets',
      'Tickets auto-assigned to Tomer Wilf Lezmy (super admin)',
      'Ticket statuses: Open → In Progress → Resolved / Fixed / Completed',
      'Admins can update status inline and delete tickets',
      'Filter tickets by status — per-user submission history visible to all',
    ],
  },
  {
    version: '1.6', date: '2026-03-12', label: 'Export / Import, Israeli Invoice Types, QC Fixes',
    changes: [
      'Export CSV, Excel (.xlsx), and PDF from every table: Suppliers, Accounting, Invoices, Contracts, Links — respects active filters',
      'Production board: Import button (editors only) — drag-and-drop CSV/Excel with auto column mapping and preview',
      'Israeli invoice type system: Osek Patur (receipt only), Osek Murshe / Ltd (חשבונית מס or combined חשבונית מס/קבלה based on payment timing)',
      'Dealer Type field on Suppliers — Osek Patur / Osek Murshe / Ltd / Foreign with badge in InvoiceModal',
      'Hebrew invoice labels (קבלה, חשבונית מס, חשבונית מס/קבלה) in Invoices page',
      'Financial page stage chart fixed — now matches real production stages (Production, Post Production, Pending, Completed)',
      'Dashboard year label is now dynamic',
      'Login: click-to-fill demo credential buttons',
      'Suppliers page filtered by active brand',
      'InvoiceModal: timezone-safe payment due date calculation',
    ],
  },
  {
    version: '1.5', date: '2026-03-11', label: 'Crew Tracking, Supplier Form, Per-Production Financials',
    changes: [
      'People On Set panel — track crew members present each shooting day',
      'Crew Bar component — visual crew roster per production day',
      'Supplier self-submission form (public URL) — suppliers fill their own details',
      'Per-production Financial tab — KPI cards, pie chart by status, bar chart by type per production',
      'Gantt view improvements — milestone markers, zoom level',
    ],
  },
  {
    version: '1.4', date: '2026-03-11', label: 'Suppliers, Contracts, Studio Tickets, History',
    changes: [
      'Suppliers directory — full supplier profiles with contact info, rates, payment terms, bank details',
      'Supplier column visibility controls — show/hide per-column with preferences saved',
      'Contracts page — track contract status (Pending / Sent / Signed) per supplier per production',
      'Studio Tickets — embedded Monday.com video/design request forms + studio overview iframe',
      'History page — global activity log across all productions with search and filters',
      'Accounting page — dedicated full-page accounting with By Line Item and By Date tabs',
    ],
  },
  {
    version: '1.3', date: '2026-03-11', label: 'Links Hub, Invoice Net+, Accounting Priority',
    changes: [
      'Links tab: card/list view toggle, drag-reorder within category (↑↓ arrows)',
      'Global Links master page — sidebar nav, all productions, filter by category/production/search',
      'Settings → Changelog tab (you are here!)',
      'Invoices page: filter by PRD number',
      'InvoiceModal: Net+ days, Israeli/American/Other invoice type, auto-calculated payment due date',
      'Paid rows appear green with opacity in Accounting & LedgerTab, sorted to bottom',
      'Accounting: new "By Date" tab — upcoming payments sorted by due date with overdue/due-soon badges',
      'Payment Proof column in Accounting & LedgerTab — paste URL to bank confirmation screenshot',
      'date_paid auto-set when payment is confirmed',
    ],
  },
  {
    version: '1.2', date: '2026-03-11', label: 'Invoice & Financial Upgrade',
    changes: [
      'Per-production Financial tab with KPI cards, pie chart (by status), bar chart (by type)',
      'Invoice template redesign: formal language, reference number, brand-aware sender name',
      'Print / Save as PDF from invoice modal — no library, uses browser print with @media print isolation',
      'Accounting tab: invoice status badge, amount mismatch warning, Send/Re-request button inline',
      'Removed separate ⚠ warning column — merged into invoice column',
    ],
  },
  {
    version: '1.1', date: '2026-03-10', label: 'Global List Manager',
    changes: [
      'Settings → Lists tab: edit line item types, stages, product types, production types, payment methods, business types, crew roles',
      'All dropdowns across app now pull from live editable lists',
      'Crew roles auto-saved to lists when new custom role is typed',
      'Reset to defaults button per list',
    ],
  },
  {
    version: '1.0', date: '2026-01-01', label: 'Initial Release',
    changes: [
      'Dashboard with production grid, search, stage filter',
      'Per-production board: Budget Table, Accounting/Ledger, Links, Updates, History',
      'Master Financial page with donut chart and bar chart',
      'Invoices page with By Status / By Production views',
      'Accounting page with payment confirmation modal',
      'Brand switcher: Particle For Men ↔ Blurr Creative',
      'Role-based auth: Admin / Editor / Viewer',
      'Currency toggle (USD / ILS)',
      'Notifications bell',
      'History log per production and global',
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────────
   Main Settings page
───────────────────────────────────────────────────────────────────────────── */
const STATUS_STYLES = {
  open:        'bg-yellow-50 text-yellow-700 border-yellow-200',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  resolved:    'bg-green-50 text-green-700 border-green-200',
  fixed:       'bg-emerald-50 text-emerald-700 border-emerald-200',
  completed:   'bg-gray-100 text-gray-500 border-gray-200',
};
const STATUS_LABELS = {
  open: 'Open', in_progress: 'In Progress', resolved: 'Resolved', fixed: 'Fixed', completed: 'Completed',
};
const CATEGORY_LABELS = {
  improvement: 'Improvement', bug: 'Bug Fix', upgrade: 'Upgrade', other: 'Other',
};
const PRIORITY_STYLES = {
  low:    'text-gray-400',
  medium: 'text-yellow-600',
  high:   'text-red-600 font-semibold',
};

export default function Settings() {
  const { brandId, brand, refreshBrands } = useBrand();
  const { lists, updateList, resetListKey } = useLists();
  const { user, isAdmin } = useAuth();
  const [tab, setTab] = useState('branding');
  const isSuperAdmin = user?.super_admin === true;
  const [settings, setSettings] = useState({ colors: {}, fonts: {}, logo_url: null });
  const [saved, setSaved] = useState(false);
  const [tickets, setTickets] = useState([]);
  const [ticketForm, setTicketForm] = useState({ title: '', description: '', category: 'improvement', priority: 'medium' });
  const [ticketFilter, setTicketFilter] = useState('all');
  const [ticketSubmitted, setTicketSubmitted] = useState(false);

  // System Update state
  const [sysVersion, setSysVersion]   = useState(null);
  const [sysFile, setSysFile]         = useState(null);
  const [sysUploading, setSysUploading] = useState(false);
  const [sysProgress, setSysProgress] = useState(0);
  const [sysMsg, setSysMsg]           = useState(null); // { type: 'success'|'error', text }
  const sysInputRef = useRef(null);

  useEffect(() => {
    Promise.resolve(getSettings(brandId)).then(s => { if (s) setSettings(s); }).catch(() => {});
  }, [brandId]);

  useEffect(() => {
    Promise.resolve(getImprovementTickets()).then(t => setTickets(t || [])).catch(() => {});
  }, []);

  // Fetch current app version for super admin
  useEffect(() => {
    if (!isSuperAdmin) return;
    fetch('/api/admin/version')
      .then(r => r.json())
      .then(d => setSysVersion(d.version))
      .catch(() => {});
  }, [isSuperAdmin]);

  function handleColorChange(key, value) {
    setSettings(s => ({ ...s, colors: { ...s.colors, [key]: value } }));
    document.documentElement.style.setProperty(`--brand-${key}`, value);
  }

  async function handleSave() {
    await updateSettings(brandId, settings);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleSubmitTicket(e) {
    e.preventDefault();
    const ticket = {
      ...ticketForm,
      status: 'open',
      submitted_by: { id: user.id, name: user.name, email: user.email },
      assigned_to: { name: 'Tomer Wilf Lezmy', email: 'Tomer@particleformen.com' },
      admin_notes: '',
    };
    await createImprovementTicket(ticket);
    const updated = await getImprovementTickets();
    setTickets(updated || []);
    setTicketForm({ title: '', description: '', category: 'improvement', priority: 'medium' });
    setTicketSubmitted(true);
    setTimeout(() => setTicketSubmitted(false), 2000);
  }

  async function handleTicketStatus(id, status) {
    await updateImprovementTicket(id, { status });
    const updated = await getImprovementTickets();
    setTickets(updated || []);
  }

  async function handleDeleteTicket(id) {
    await deleteImprovementTicket(id);
    const updated = await getImprovementTickets();
    setTickets(updated || []);
  }

  // ── System Update upload ─────────────────────────────────────────────────
  async function handleSysUpload() {
    if (!sysFile) return;
    setSysUploading(true);
    setSysProgress(0);
    setSysMsg(null);

    const formData = new FormData();
    formData.append('update', sysFile);

    try {
      const token = localStorage.getItem('cp_auth_token');
      await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/admin/update');
        if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
        xhr.upload.onprogress = e => {
          if (e.lengthComputable) setSysProgress(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const data = JSON.parse(xhr.responseText);
            setSysVersion(data.version);
            setSysMsg({ type: 'success', text: `✅ Updated to v${data.version} — ${data.files_updated} files replaced. Reloading…` });
            setSysFile(null);
            if (sysInputRef.current) sysInputRef.current.value = '';
            setTimeout(() => window.location.reload(), 2000);
            resolve();
          } else {
            let msg = xhr.responseText;
            try { msg = JSON.parse(msg).error || msg; } catch {}
            reject(new Error(msg));
          }
        };
        xhr.onerror = () => reject(new Error('Network error'));
        xhr.send(formData);
      });
    } catch (err) {
      setSysMsg({ type: 'error', text: `❌ ${err.message}` });
    } finally {
      setSysUploading(false);
      setSysProgress(0);
    }
  }

  const COLORS = [
    { key: 'bg',        label: 'Background' },
    { key: 'primary',   label: 'Primary / Titles' },
    { key: 'secondary', label: 'Secondary' },
    { key: 'accent',    label: 'Accent / CTA' },
  ];

  const FONT_OPTIONS = [
    'Sofia Sans Extra Condensed', 'Sofia Sans', 'Neue Haas Grotesk',
    'Helvetica Neue', 'Avenir Next Condensed', 'Proxima Nova ExtraBold',
    'Avenir', 'Inter', 'Arial',
  ];

  return (
    <div>
      {/* Page header */}
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-3xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Settings
        </h1>
        <span className="text-sm text-gray-400">Brand: {brand.name}</span>
      </div>

      {/* Tab bar */}
      <div className="brand-tabs mb-6">
        {[
          { key: 'branding',      label: 'Branding',       icon: <Palette size={13} />,    show: true },
          { key: 'lists',         label: 'Lists',          icon: <List size={13} />,        show: true },
          { key: 'brands',        label: 'Brands',         icon: <Building2 size={13} />,   show: isSuperAdmin },
          { key: 'improvements',  label: 'Improvements',   icon: <Wrench size={13} />,      show: true },
          { key: 'data-import',   label: 'Data Import',    icon: <Upload size={13} />,      show: isAdmin || isSuperAdmin },
          { key: 'changelog',     label: 'Changelog',      icon: <Clock size={13} />,       show: true },
          { key: 'system',        label: 'System Update',  icon: <ServerCog size={13} />,   show: isSuperAdmin },
        ].filter(t => t.show).map(({ key, label, icon }) => (
          <button
            key={key}
            className={clsx('brand-tab flex items-center gap-1.5', tab === key && 'active')}
            onClick={() => setTab(key)}
          >
            {icon}{label}
          </button>
        ))}
      </div>

      {/* ── Branding tab ─────────────────────────────────────────────────────── */}
      {tab === 'branding' && (
        <div className="max-w-2xl space-y-6">
          {/* Logo */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-4">
              <Upload size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>Logo</h2>
            </div>
            <div className="flex items-center gap-4">
              <div
                className="w-32 h-12 rounded-xl flex items-center justify-center text-white font-black text-xl"
                style={{ background: 'var(--brand-primary)' }}
              >
                {brand.name[0]}
              </div>
              <div className="flex-1">
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Logo URL</label>
                <input
                  className="brand-input"
                  value={settings.logo_url || ''}
                  onChange={e => setSettings(s => ({ ...s, logo_url: e.target.value }))}
                  placeholder="https://… or /assets/logo.png"
                />
                <p className="text-xs text-gray-400 mt-1">250×50px recommended</p>
              </div>
            </div>
          </section>

          {/* Colors */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-4">
              <Palette size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>Brand Colors</h2>
            </div>
            <div className="space-y-3">
              {COLORS.map(({ key, label }) => {
                const defaultColor = brand[key] || '#000000';
                const currentColor = settings.colors?.[key] || defaultColor;
                return (
                  <div key={key} className="flex items-center gap-3">
                    <input
                      type="color"
                      value={currentColor}
                      onChange={e => handleColorChange(key, e.target.value)}
                      className="w-10 h-10 rounded-lg cursor-pointer border border-gray-200"
                      style={{ padding: 2 }}
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-700">{label}</div>
                      <input
                        type="text"
                        value={currentColor}
                        onChange={e => handleColorChange(key, e.target.value)}
                        className="text-xs font-mono border rounded px-2 py-1 w-28 outline-none mt-0.5"
                        style={{ borderColor: 'var(--brand-border)' }}
                        placeholder="#000000"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Fonts */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-4">
              <Type size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>Typography</h2>
            </div>
            <div className="space-y-3">
              {[
                { key: 'title',     label: 'Title Font',     desc: 'Used for large headlines' },
                { key: 'secondary', label: 'Secondary Font', desc: 'Used for subheadings' },
                { key: 'body',      label: 'Body Font',      desc: 'Used for running text and UI' },
              ].map(({ key, label, desc }) => (
                <div key={key}>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">{label}</label>
                  <select
                    className="brand-input"
                    value={settings.fonts?.[key] || ''}
                    onChange={e => setSettings(s => ({ ...s, fonts: { ...s.fonts, [key]: e.target.value } }))}
                  >
                    <option value="">Default</option>
                    {FONT_OPTIONS.map(f => <option key={f} value={f}>{f}</option>)}
                  </select>
                  <p className="text-xs text-gray-400 mt-0.5">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Currency */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-4">
              <Globe size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>Currency</h2>
            </div>
            <p className="text-sm text-gray-600">
              Exchange rates are fetched live from{' '}
              <a href="https://open.er-api.com" target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                open.er-api.com
              </a>{' '}
              on app load and cached for the session.
            </p>
            <p className="text-xs text-gray-400 mt-1">Historical rates for past productions, live rate for future.</p>
          </section>

          <button onClick={handleSave} className="btn-cta flex items-center gap-2 px-6 py-3">
            <Save size={14} />
            {saved ? 'Saved ✓' : 'Save Settings'}
          </button>
        </div>
      )}

      {/* ── Lists tab ────────────────────────────────────────────────────────── */}
      {tab === 'lists' && (
        <div>
          <p className="text-sm text-gray-500 mb-5">
            Edit any dropdown list used across the platform. Changes apply immediately.
            Click an item to rename it, use the arrows to reorder, or add/remove items freely.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Object.keys(LIST_META).map(key => (
              <ListEditor
                key={key}
                listKey={key}
                items={lists[key] ?? []}
                onUpdate={items => updateList(key, items)}
                onReset={() => resetListKey(key)}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Improvements tab ─────────────────────────────────────────────────── */}
      {tab === 'improvements' && (
        <div className="max-w-3xl space-y-6">

          {/* Submit form */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-4">
              <Wrench size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>Submit a Request</h2>
            </div>
            <form onSubmit={handleSubmitTicket} className="space-y-3">
              <div>
                <label className="field-label">Title *</label>
                <input
                  className="brand-input"
                  placeholder="Short summary of the improvement or issue"
                  value={ticketForm.title}
                  onChange={e => setTicketForm(f => ({ ...f, title: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="field-label">Description</label>
                <textarea
                  className="brand-input"
                  rows={3}
                  placeholder="Detailed description, steps to reproduce, expected behavior…"
                  value={ticketForm.description}
                  onChange={e => setTicketForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="field-label">Category</label>
                  <select className="brand-input" value={ticketForm.category} onChange={e => setTicketForm(f => ({ ...f, category: e.target.value }))}>
                    <option value="improvement">Improvement</option>
                    <option value="bug">Bug Fix</option>
                    <option value="upgrade">Upgrade</option>
                    <option value="other">Other</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="field-label">Priority</label>
                  <select className="brand-input" value={ticketForm.priority} onChange={e => setTicketForm(f => ({ ...f, priority: e.target.value }))}>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-1">
                <button type="submit" className="btn-primary text-sm px-4 py-1.5">
                  Submit Request
                </button>
                {ticketSubmitted && (
                  <span className="text-sm text-emerald-600 flex items-center gap-1">
                    <Check size={13} /> Submitted!
                  </span>
                )}
                <span className="text-xs text-gray-400 ml-auto">
                  Assigned to: <span className="font-medium text-gray-600">Tomer Wilf Lezmy</span>
                </span>
              </div>
            </form>
          </section>

          {/* Ticket list */}
          <section className="brand-card">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>
                All Tickets
                {tickets.length > 0 && (
                  <span className="ml-2 text-xs font-normal text-gray-400">{tickets.length} total</span>
                )}
              </h2>
              {/* Filter pills */}
              <div className="flex flex-wrap gap-1.5">
                {['all', 'open', 'in_progress', 'resolved', 'fixed', 'completed'].map(s => (
                  <button
                    key={s}
                    onClick={() => setTicketFilter(s)}
                    className={clsx(
                      'text-xs px-2.5 py-0.5 rounded-full border transition-colors',
                      ticketFilter === s
                        ? 'bg-gray-800 text-white border-gray-800'
                        : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                    )}
                  >
                    {s === 'all' ? 'All' : STATUS_LABELS[s]}
                    {s === 'open' && tickets.filter(t => t.status === 'open').length > 0 && (
                      <span className="ml-1 bg-yellow-100 text-yellow-700 rounded-full px-1">
                        {tickets.filter(t => t.status === 'open').length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {(() => {
              const filtered = ticketFilter === 'all' ? tickets : tickets.filter(t => t.status === ticketFilter);
              if (filtered.length === 0) {
                return (
                  <p className="text-sm text-gray-400 py-6 text-center">
                    {tickets.length === 0 ? 'No tickets yet. Submit one above.' : 'No tickets match this filter.'}
                  </p>
                );
              }
              return (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-gray-100 text-left text-xs text-gray-400 uppercase tracking-wide">
                        <th className="pb-2 pr-3 font-medium">Title</th>
                        <th className="pb-2 pr-3 font-medium">Category</th>
                        <th className="pb-2 pr-3 font-medium">Priority</th>
                        <th className="pb-2 pr-3 font-medium">From</th>
                        <th className="pb-2 pr-3 font-medium">Date</th>
                        <th className="pb-2 pr-3 font-medium">Assigned To</th>
                        <th className="pb-2 pr-3 font-medium">Status</th>
                        {isAdmin && <th className="pb-2 font-medium">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filtered.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50/50">
                          <td className="py-2.5 pr-3 max-w-[200px]">
                            <span className="font-medium text-gray-800 line-clamp-2">{t.title}</span>
                            {t.description && (
                              <p className="text-xs text-gray-400 mt-0.5 line-clamp-1">{t.description}</p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap text-gray-500">
                            {CATEGORY_LABELS[t.category] || t.category}
                          </td>
                          <td className={clsx('py-2.5 pr-3 whitespace-nowrap capitalize text-xs', PRIORITY_STYLES[t.priority])}>
                            {t.priority}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap text-gray-500 text-xs">
                            {t.submitted_by?.name || '—'}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap text-gray-400 text-xs">
                            {new Date(t.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })}
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            <span className="inline-flex items-center gap-1 text-xs font-semibold w-6 h-6 rounded-full bg-gray-800 text-white justify-center">T</span>
                            <span className="text-xs text-gray-500 ml-1">Tomer</span>
                          </td>
                          <td className="py-2.5 pr-3 whitespace-nowrap">
                            {isAdmin ? (
                              <select
                                className={clsx('text-xs border rounded px-1.5 py-0.5 font-medium', STATUS_STYLES[t.status])}
                                value={t.status}
                                onChange={e => handleTicketStatus(t.id, e.target.value)}
                              >
                                {Object.entries(STATUS_LABELS).map(([v, l]) => (
                                  <option key={v} value={v}>{l}</option>
                                ))}
                              </select>
                            ) : (
                              <span className={clsx('text-xs border rounded px-1.5 py-0.5 font-medium', STATUS_STYLES[t.status])}>
                                {STATUS_LABELS[t.status]}
                              </span>
                            )}
                          </td>
                          {isAdmin && (
                            <td className="py-2.5 whitespace-nowrap">
                              <button
                                onClick={() => handleDeleteTicket(t.id)}
                                className="text-gray-300 hover:text-red-500 transition-colors"
                                title="Delete ticket"
                              >
                                <Trash2 size={13} />
                              </button>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })()}
          </section>
        </div>
      )}

      {/* ── Data Import tab ──────────────────────────────────────────────────── */}
      {tab === 'data-import' && (isAdmin || isSuperAdmin) && (
        <DataImportTab />
      )}

      {/* ── Brands tab ───────────────────────────────────────────────────────── */}
      {tab === 'brands' && isSuperAdmin && (
        <BrandsTab refreshBrands={refreshBrands} />
      )}

      {/* ── Changelog tab ────────────────────────────────────────────────────── */}
      {tab === 'changelog' && (
        <div className="max-w-2xl space-y-4">
          {CHANGELOG.map(entry => (
            <div key={entry.version} className="brand-card">
              <div className="flex items-start justify-between gap-3 mb-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="text-xs font-black px-2 py-0.5 rounded-full text-white"
                      style={{ background: 'var(--brand-primary)' }}
                    >
                      v{entry.version}
                    </span>
                    <span className="font-bold text-sm text-gray-800">{entry.label}</span>
                  </div>
                </div>
                <span className="text-xs text-gray-400 flex-shrink-0">{entry.date}</span>
              </div>
              <ul className="space-y-1">
                {entry.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-600">
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: 'var(--brand-accent)' }} />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* ── System Update tab (super admin only) ─────────────────────────────── */}
      {tab === 'system' && isSuperAdmin && (
        <div className="max-w-xl space-y-5">

          {/* Current version */}
          <section className="brand-card">
            <div className="flex items-center gap-2 mb-1">
              <ServerCog size={16} style={{ color: 'var(--brand-primary)' }} />
              <h2 className="font-bold" style={{ color: 'var(--brand-primary)' }}>System Update</h2>
            </div>
            <p className="text-xs text-gray-400 mb-4">
              Upload a pre-built <code className="bg-gray-100 rounded px-1">dist.zip</code> to deploy a new frontend version.
              The archive must contain <code className="bg-gray-100 rounded px-1">index.html</code> at its root.
              The page will reload automatically after a successful update.
            </p>

            {/* Version badge */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-gray-50 rounded-xl">
              <div className="text-xs text-gray-500 font-medium">Current version</div>
              <span
                className="text-xs font-black px-2.5 py-1 rounded-full text-white"
                style={{ background: 'var(--brand-primary)' }}
              >
                {sysVersion ? `v${sysVersion}` : '…'}
              </span>
              <span className="text-xs text-gray-400 ml-auto">Next update → v{sysVersion ? (Math.round((parseFloat(sysVersion) + 0.1) * 10) / 10).toFixed(1) : '…'}</span>
            </div>

            {/* Drop zone */}
            <div
              className={clsx(
                'relative border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer',
                sysFile ? 'border-green-400 bg-green-50' : 'border-gray-200 hover:border-gray-400 bg-gray-50'
              )}
              onClick={() => !sysUploading && sysInputRef.current?.click()}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files[0];
                if (f && f.name.endsWith('.zip')) setSysFile(f);
              }}
            >
              <input
                ref={sysInputRef}
                type="file"
                accept=".zip"
                className="hidden"
                onChange={e => { if (e.target.files[0]) setSysFile(e.target.files[0]); }}
              />
              {sysFile ? (
                <div className="flex flex-col items-center gap-2">
                  <Check size={28} className="text-green-500" />
                  <p className="text-sm font-semibold text-green-700">{sysFile.name}</p>
                  <p className="text-xs text-gray-400">{(sysFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  <button
                    type="button"
                    className="text-xs text-gray-400 hover:text-red-500 flex items-center gap-1 mt-1"
                    onClick={e => { e.stopPropagation(); setSysFile(null); if (sysInputRef.current) sysInputRef.current.value = ''; }}
                  >
                    <X size={11} /> Remove
                  </button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-2 text-gray-400">
                  <Upload size={24} />
                  <p className="text-sm font-medium">Drop <code>dist.zip</code> here or click to browse</p>
                  <p className="text-xs">ZIP must contain index.html at root — max 100 MB</p>
                </div>
              )}
            </div>

            {/* Progress bar */}
            {sysUploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Uploading…</span>
                  <span>{sysProgress}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-200 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-200"
                    style={{ width: `${sysProgress}%`, background: 'var(--brand-accent)' }}
                  />
                </div>
              </div>
            )}

            {/* Result message */}
            {sysMsg && (
              <div className={clsx(
                'mt-4 rounded-xl px-4 py-3 text-sm font-medium',
                sysMsg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
              )}>
                {sysMsg.text}
              </div>
            )}

            {/* Upload button */}
            <div className="mt-4 flex items-center gap-3">
              <button
                onClick={handleSysUpload}
                disabled={!sysFile || sysUploading}
                className="btn-cta flex items-center gap-2 px-6 py-2.5 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Upload size={14} />
                {sysUploading ? 'Uploading…' : 'Deploy Update'}
              </button>
              {sysFile && !sysUploading && (
                <span className="text-xs text-gray-400">Ready to deploy — this will replace the current frontend</span>
              )}
            </div>
          </section>

          {/* Warning box */}
          <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 space-y-1">
            <p className="font-semibold">⚠️ Important</p>
            <p>The update replaces all frontend files. The database and backend are not affected.</p>
            <p>Build the new version locally with <code className="bg-amber-100 rounded px-1">npm run build</code>, then zip the <code className="bg-amber-100 rounded px-1">dist/</code> folder as <code className="bg-amber-100 rounded px-1">dist.zip</code>.</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Brands Tab ───────────────────────────────────────────────────────────────

const EMPTY_BRAND = { name: '', tagline: '', primary: '#030b2e', secondary: '#0808f8', accent: '#0808f8', bg: '#F5F5F5' };
const BRAND_COLOR_FIELDS = [
  { key: 'primary',   label: 'Primary / Titles' },
  { key: 'secondary', label: 'Secondary' },
  { key: 'accent',    label: 'Accent / CTA' },
  { key: 'bg',        label: 'Background' },
];

// ─── Data Import Tab ──────────────────────────────────────────────────────────
function DataImportTab() {
  const [importType, setImportType] = useState('lineItems');
  const [productionId, setProductionId] = useState('');
  const [preview, setPreview] = useState([]);
  const [status, setStatus] = useState('');


  function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = evt => {
      try {
        const text = evt.target.result;
        let rows = [];
        if (file.name.endsWith('.json')) {
          rows = JSON.parse(text);
        } else {
          // CSV parsing (simple)
          const lines = text.split('\n').filter(l => l.trim());
          const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
          rows = lines.slice(1).map(line => {
            const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
            const obj = {};
            headers.forEach((h, i) => { obj[h] = vals[i] || ''; });
            return obj;
          });
        }
        setPreview(rows.slice(0, 5));
        setStatus(`Parsed ${rows.length} rows. Review preview below.`);
      } catch (err) {
        setStatus('Error parsing file: ' + err.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="brand-card">
        <h2 className="font-bold text-gray-800 mb-1">Data Import</h2>
        <p className="text-xs text-gray-500 mb-4">Import budget line items or cast members from a CSV or JSON file.</p>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Import Type</label>
            <select
              className="brand-input w-full"
              value={importType}
              onChange={e => setImportType(e.target.value)}
            >
              <option value="lineItems">Budget Line Items</option>
              <option value="castMembers">Cast Members</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Production ID</label>
            <input
              className="brand-input w-full"
              placeholder="e.g. PRD26-01"
              value={productionId}
              onChange={e => setProductionId(e.target.value)}
            />
            <p className="text-[10px] text-gray-400 mt-0.5">All imported rows will be linked to this production.</p>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">File (.csv or .json)</label>
            <input type="file" accept=".csv,.json" onChange={handleFile} className="text-sm" />
          </div>
          {preview.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-600 mb-1">Preview (first 5 rows):</p>
              <div className="overflow-x-auto">
                <table className="data-table text-xs" style={{ minWidth: 400 }}>
                  <thead>
                    <tr>
                      {Object.keys(preview[0]).map(k => <th key={k}>{k}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {preview.map((row, i) => (
                      <tr key={i}>
                        {Object.values(row).map((v, j) => <td key={j}>{String(v)}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {status && (
            <p className="text-xs text-blue-600 bg-blue-50 px-3 py-2 rounded-lg">{status}</p>
          )}
          <p className="text-xs text-gray-400 bg-gray-50 px-3 py-2 rounded-lg border">
            ⚠ Upload your PRD26-1 to PRD26-8 data files above. After parsing, actual import will be available in a future update. For now, use this to preview your data structure.
          </p>
        </div>
      </div>
    </div>
  );
}

function BrandsTab({ refreshBrands }) {
  const [brands, setLocalBrands] = useState([]);
  const [editId, setEditId]   = useState(null); // null = closed, 'new' = create, else = brand id
  const [form, setForm]        = useState(EMPTY_BRAND);
  const [slugVal, setSlugVal]  = useState('');

  async function reload() {
    try {
      const b = await Promise.resolve(getBrands());
      setLocalBrands(b || []);
    } catch { setLocalBrands([]); }
    refreshBrands();
  }

  useEffect(() => { reload(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setForm(EMPTY_BRAND);
    setSlugVal('');
    setEditId('new');
  }

  function openEdit(brand) {
    setForm({ name: brand.name, tagline: brand.tagline || '', primary: brand.primary, secondary: brand.secondary, accent: brand.accent, bg: brand.bg });
    setEditId(brand.id);
  }

  async function handleSave(e) {
    e.preventDefault();
    if (editId === 'new') {
      const id = slugVal.trim().toLowerCase().replace(/\s+/g, '-') || generateId('brand');
      await createBrand({ id, ...form });
    } else {
      await updateBrand(editId, form);
    }
    await reload();
    setEditId(null);
  }

  async function handleDelete(id) {
    const allProds = await Promise.resolve(getProductions(id)).catch(() => []);
    if ((allProds || []).length > 0) {
      alert(`Cannot delete — ${allProds.length} production(s) belong to this brand. Reassign them first.`);
      return;
    }
    if (!window.confirm('Delete this brand? This cannot be undone.')) return;
    await deleteBrand(id);
    await reload();
  }

  return (
    <div className="max-w-2xl space-y-5">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500">Manage brands visible in the app. Super admin only.</p>
        <button onClick={openNew} className="btn-cta flex items-center gap-1.5 text-sm">
          <Plus size={13} /> Add Brand
        </button>
      </div>

      {/* Brand list */}
      <div className="space-y-3">
        {brands.map(b => (
          <div key={b.id} className="brand-card flex items-center gap-4">
            {/* Color swatch */}
            <div
              className="w-10 h-10 rounded-lg flex-shrink-0 flex items-center justify-center text-white font-black text-lg"
              style={{ background: b.primary }}
            >
              {b.name[0]}
            </div>
            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="font-bold text-sm">{b.name}</div>
              {b.tagline && <div className="text-xs text-gray-400">{b.tagline}</div>}
              <div className="flex gap-2 mt-1">
                {[b.primary, b.secondary, b.accent, b.bg].map((c, i) => (
                  <span key={i} className="inline-block w-4 h-4 rounded-sm border border-white/30" style={{ background: c }} title={c} />
                ))}
              </div>
            </div>
            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => openEdit(b)}
                className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                title="Edit"
              >
                <Pencil size={13} />
              </button>
              <button
                onClick={() => handleDelete(b.id)}
                className="p-1.5 rounded hover:bg-red-50 text-gray-300 hover:text-red-500"
                title="Delete"
              >
                <Trash2 size={13} />
              </button>
            </div>
          </div>
        ))}
        {brands.length === 0 && (
          <div className="brand-card text-center text-gray-400 py-8 text-sm">No brands yet.</div>
        )}
      </div>

      {/* Add / Edit modal */}
      {editId !== null && (
        <div className="modal-overlay" onClick={() => setEditId(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>
                {editId === 'new' ? 'Add Brand' : 'Edit Brand'}
              </h2>
              <button onClick={() => setEditId(null)}><X size={18} className="text-gray-400" /></button>
            </div>

            <form onSubmit={handleSave} className="space-y-4">
              {editId === 'new' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">ID (slug)</label>
                  <input
                    className="brand-input"
                    value={slugVal}
                    onChange={e => setSlugVal(e.target.value.toLowerCase().replace(/\s+/g, '-'))}
                    placeholder="e.g. my-brand"
                    required
                    autoFocus
                  />
                  <p className="text-xs text-gray-400 mt-1">Lowercase, hyphens only. Used internally.</p>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Name</label>
                <input
                  className="brand-input"
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="Brand name"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Tagline</label>
                <input
                  className="brand-input"
                  value={form.tagline}
                  onChange={e => setForm(f => ({ ...f, tagline: e.target.value }))}
                  placeholder="Optional tagline"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Colors</label>
                <div className="space-y-2">
                  {BRAND_COLOR_FIELDS.map(({ key, label }) => (
                    <div key={key} className="flex items-center gap-3">
                      <input
                        type="color"
                        value={form[key]}
                        onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                        className="w-9 h-9 rounded-lg cursor-pointer border border-gray-200"
                        style={{ padding: 2 }}
                      />
                      <div className="flex-1">
                        <div className="text-xs text-gray-500">{label}</div>
                        <input
                          type="text"
                          value={form[key]}
                          onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                          className="text-xs font-mono border rounded px-2 py-0.5 w-24 outline-none mt-0.5"
                          style={{ borderColor: 'var(--brand-border)' }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setEditId(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-cta flex-1 flex items-center justify-center gap-2">
                  <Check size={13} /> {editId === 'new' ? 'Create Brand' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
