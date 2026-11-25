// Notifications (redesigned 25 Nov 2026 — "make the notifications UX/UI nicer in general"): tabs (All · Unread · Tagged ·
// My tasks · Ads), rich rows — a status change shows its colours, an update its words, an ad its picture — one click to
// the task / page, and Settings: what you want to hear about, pop-ups, desktop notifications.
import { useState } from 'react';
import {
  X, Bell, BellOff, Check, Trash2, Pencil, Receipt, AlertTriangle, Star, AtSign, MessageSquare, UserPlus, CheckSquare, FileSignature, Flag,
  Bookmark, Info, Trash, Settings, ChevronLeft, ArrowRight, Film, ExternalLink, Upload,
} from 'lucide-react';
import { useNotifications } from '../../context/NotificationsContext';
import { useAuth } from '../../context/AuthContext';
import { formatIST } from '../../lib/timezone';
import { groupOf, routeOf } from '../../lib/notifyRoute';

// ── Per-type look (icon + soft colour) ─────────────────────────────────────────────────────────────────────────────
const TYPE_CONFIG = {
  casting_alert:   { Icon: AlertTriangle, cls: 'bg-amber-100 text-amber-600' },
  casting:         { Icon: Star,          cls: 'bg-amber-100 text-amber-600' },
  invoice_received:{ Icon: Receipt,       cls: 'bg-green-100 text-green-600' },
  invoice:         { Icon: Receipt,       cls: 'bg-green-100 text-green-600' },
  edit:            { Icon: Pencil,        cls: 'bg-slate-100 text-slate-500' },
  delete:          { Icon: Trash,         cls: 'bg-red-100 text-red-500' },
  stage_change:    { Icon: Flag,          cls: 'bg-violet-100 text-violet-600' },
  contract_sent:   { Icon: FileSignature, cls: 'bg-indigo-100 text-indigo-600' },
  contract_signed: { Icon: FileSignature, cls: 'bg-green-100 text-green-600' },
  mention:         { Icon: AtSign,        cls: 'bg-[#0808f8]/10 text-[#0808f8]' },
  task_mention:    { Icon: AtSign,        cls: 'bg-[#0808f8]/10 text-[#0808f8]' },
  comment:         { Icon: MessageSquare, cls: 'bg-teal-100 text-teal-600' },
  status:          { Icon: ArrowRight,    cls: 'bg-blue-100 text-blue-600' },
  requests:        { Icon: Check,         cls: 'bg-emerald-100 text-emerald-600' },
  assigned:        { Icon: UserPlus,      cls: 'bg-purple-100 text-purple-600' },
  ad_live:         { Icon: Film,          cls: 'bg-orange-100 text-orange-600' },
  task_assigned:   { Icon: UserPlus,      cls: 'bg-blue-100 text-blue-600' },
  task_status:     { Icon: CheckSquare,   cls: 'bg-blue-100 text-blue-600' },
  task_comment:    { Icon: MessageSquare, cls: 'bg-blue-100 text-blue-600' },
  view_save:       { Icon: Bookmark,      cls: 'bg-gray-100 text-gray-500' },
  system:          { Icon: Info,          cls: 'bg-gray-100 text-gray-500' },
};
function configFor(type = '') {
  if (TYPE_CONFIG[type]) return TYPE_CONFIG[type];
  if (type.startsWith('task')) return { Icon: CheckSquare, cls: 'bg-blue-100 text-blue-600' };
  if (type.startsWith('casting')) return { Icon: AlertTriangle, cls: 'bg-amber-100 text-amber-600' };
  if (type.startsWith('invoice')) return { Icon: Receipt, cls: 'bg-green-100 text-green-600' };
  if (type.startsWith('contract')) return { Icon: FileSignature, cls: 'bg-indigo-100 text-indigo-600' };
  return { Icon: Bell, cls: 'bg-gray-100 text-gray-500' };
}

function relTime(iso) {
  if (!iso) return '';
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

function dayBucket(iso) {
  const d = new Date(iso); const now = new Date();
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOf(now) - startOf(d)) / 86400000);
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 7) return 'This week';
  return 'Earlier';
}

// Collapse repeated notifications (same type + message) into one row with a count
function collapse(notifs) {
  const sorted = [...notifs].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  const map = new Map();
  for (const n of sorted) {
    const sig = `${n.type}|${(n.message || '').trim()}`;
    if (!map.has(sig)) map.set(sig, { ...n, count: 1, ids: [n.id], anyUnread: !n.read });
    else { const g = map.get(sig); g.count += 1; g.ids.push(n.id); g.anyUnread = g.anyUnread || !n.read; }
  }
  return [...map.values()];
}

const TABS = [['all', 'All'], ['unread', 'Unread'], ['mentions', 'Tagged'], ['tasks', 'My tasks'], ['ads', 'Ads'], ['team', 'Team moves']];

const quietHint = (q) => (q?.on ? `No pop-ups or desktop notifications ${q.from || '20:00'}–${q.to || '08:00'}${q.weekend ? ' and all weekend' : ''} (Israel time). They still wait in the 🔔.` : 'Mute pop-ups at night — or all weekend.');

function SettingsView({ onBack }) {
  const { settings, saveSettings, types } = useNotifications();
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'unsupported');
  const Toggle = ({ on, onChange, label, hint }) => (
    <label className="flex items-start justify-between gap-4 py-3 border-b border-gray-100 cursor-pointer">
      <span><span className="block text-[13.5px] text-gray-800">{label}</span>{hint && <span className="block text-[11.5px] text-gray-400 mt-0.5">{hint}</span>}</span>
      <span className={`relative flex-none w-10 h-6 rounded-full transition-colors ${on ? 'bg-[#0808f8]' : 'bg-gray-200'}`}>
        <input type="checkbox" className="sr-only" checked={on} onChange={(e) => onChange(e.target.checked)} />
        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${on ? 'left-[18px]' : 'left-0.5'}`} />
      </span>
    </label>
  );
  const desktop = async (on) => {
    if (on && typeof Notification !== 'undefined' && Notification.permission !== 'granted') {
      const p = await Notification.requestPermission();
      setPerm(p);
      if (p !== 'granted') return;
    }
    saveSettings({ desktop: on });
  };
  return (
    <div className="flex-1 overflow-y-auto px-5 py-3">
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-[12.5px] font-semibold text-gray-500 hover:text-gray-800 mb-2"><ChevronLeft size={14} /> Back</button>
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-2">Tell me when</div>
      {Object.entries(types || {}).map(([k, t]) => (
        <Toggle key={k} label={t.label} on={settings?.types?.[k] !== false} onChange={(v) => saveSettings({ types: { [k]: v } })} />
      ))}
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-5">How</div>
      <Toggle label="Pop-up in the corner" hint="A quiet card bottom-right when something new arrives — gone after a few seconds." on={settings?.toast !== false} onChange={(v) => saveSettings({ toast: v })} />
      <Toggle label="Desktop notifications" hint={perm === 'denied' ? 'Your browser blocks them for CP — allow notifications in the browser’s site settings.' : 'When CP is open in another tab or behind other windows.'} on={!!settings?.desktop && perm === 'granted'} onChange={desktop} />
      <div className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mt-5">Quiet hours</div>
      <Toggle label="Quiet hours" hint={quietHint(settings?.quiet_hours)} on={!!settings?.quiet_hours?.on} onChange={(v) => saveSettings({ quiet_hours: { ...(settings?.quiet_hours || {}), from: settings?.quiet_hours?.from || '20:00', to: settings?.quiet_hours?.to || '08:00', on: v } })} />
      {settings?.quiet_hours?.on && (
        <div className="py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 text-[13px] text-gray-700">
          From <input type="time" value={settings.quiet_hours.from || '20:00'} onChange={(e) => saveSettings({ quiet_hours: { ...settings.quiet_hours, from: e.target.value } })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[13px]" />
          to <input type="time" value={settings.quiet_hours.to || '08:00'} onChange={(e) => saveSettings({ quiet_hours: { ...settings.quiet_hours, to: e.target.value } })} className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-[13px]" />
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer"><input type="checkbox" checked={!!settings.quiet_hours.weekend} onChange={(e) => saveSettings({ quiet_hours: { ...settings.quiet_hours, weekend: e.target.checked } })} className="w-4 h-4 accent-[#0808f8]" /> All Fri–Sat</label>
        </div>
      )}
      <p className="text-[11.5px] text-gray-400 mt-4">Saved for you. CP checks for new ones every 30 seconds while it’s open. In quiet hours nothing pops up — they wait in the 🔔.</p>
    </div>
  );
}

function Detail({ n }) {
  const m = n.meta || {};
  if (m.from && m.to) {
    return (
      <div className="flex items-center gap-1.5 mt-1.5 text-[11px] font-semibold">
        <span className="px-1.5 py-0.5 rounded text-white" style={{ background: m.from_color || '#c4c4c4' }}>{m.from}</span>
        <ArrowRight size={11} className="text-gray-400" />
        <span className="px-1.5 py-0.5 rounded text-white" style={{ background: m.to_color || '#579bfc' }}>{m.to}</span>
      </div>
    );
  }
  if (m.snippet && (n.type === 'comment' || n.type === 'mention')) return <div className="mt-1.5 text-[12px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 line-clamp-2">“{m.snippet}”</div>;
  if (m.meta_status) return <div className="mt-1 flex items-center gap-1 text-[11.5px] text-orange-600"><Upload size={11} /> Meta: {m.meta_status}</div>;
  return null;
}

export default function NotificationsPanel({ onClose }) {
  const { notifications, unreadCount, markRead, markAllRead, clearAll, open } = useNotifications();
  const { user } = useAuth();
  const [tab, setTab] = useState('all');
  const [view, setView] = useState('list');

  // the team's moves (super admins) live in their own tab — they don't flood All / Unread
  const filtered = notifications.filter(n => (tab === 'all' ? groupOf(n) !== 'team' : tab === 'unread' ? !n.read && groupOf(n) !== 'team' : groupOf(n) === tab));
  const groups = collapse(filtered);
  const buckets = { Today: [], Yesterday: [], 'This week': [], Earlier: [] };
  for (const g of groups) buckets[dayBucket(g.created_at)]?.push(g);
  const countOf = (k) => (k === 'all' ? 0 : k === 'unread' ? unreadCount : notifications.filter(n => !n.read && groupOf(n) === k).length);
  const tabs = TABS.filter(([k]) => ['all', 'unread'].includes(k) || notifications.some(n => groupOf(n) === k));

  function handleClick(group) {
    group.ids.forEach(id => markRead(id));
    const r = routeOf(group, user?.role);
    if (r) { open(group); onClose(); }
  }

  let rowIdx = 0;
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer-panel flex flex-col" style={{ width: 420, maxWidth: '100vw' }}>
        <div className="px-5 pt-4 pb-2 shrink-0" style={{ borderBottom: '1px solid var(--brand-border)' }}>
          <div className="flex items-center gap-2">
            <h2 className="font-black text-[17px]" style={{ color: 'var(--brand-primary)' }}>{view === 'settings' ? 'Notification settings' : 'Notifications'}</h2>
            {view === 'list' && unreadCount > 0 && <span className="px-2 py-0.5 text-[11px] font-bold text-white rounded-full" style={{ background: 'var(--brand-accent)' }}>{unreadCount}</span>}
            <span className="ml-auto flex items-center gap-1">
              {view === 'list' && unreadCount > 0 && <button onClick={markAllRead} className="text-xs text-gray-500 hover:text-gray-800 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-gray-100"><Check size={12} /> Mark all read</button>}
              {view === 'list' && <button onClick={() => setView('settings')} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" title="Settings" aria-label="Notification settings"><Settings size={16} /></button>}
              <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100" aria-label="Close"><X size={17} /></button>
            </span>
          </div>
          {view === 'list' && (
            <div className="flex gap-1 mt-3 overflow-x-auto" role="tablist">
              {tabs.map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={`flex items-center gap-1 text-[12.5px] font-semibold px-3 py-1.5 rounded-full whitespace-nowrap ${tab === k ? 'bg-[#030b2e] text-white' : 'text-gray-500 hover:bg-gray-100'}`}>
                  {l}{countOf(k) > 0 && <span className={`text-[10.5px] px-1.5 rounded-full ${tab === k ? 'bg-white/20' : 'bg-[#0808f8]/10 text-[#0808f8]'}`}>{countOf(k)}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {view === 'settings' ? <SettingsView onBack={() => setView('list')} /> : (
          <div className="overflow-y-auto flex-1">
            {groups.length === 0 ? (
              <div className="text-center py-20 px-6">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-gray-50 flex items-center justify-center"><BellOff size={24} className="text-gray-300" /></div>
                <p className="text-sm font-semibold text-gray-500">You’re all caught up</p>
                <p className="text-xs text-gray-400 mt-0.5">When your tasks move, someone writes or tags you, or your ad goes live — it shows here.</p>
              </div>
            ) : (
              Object.keys(buckets).map(bucket => buckets[bucket].length > 0 && (
                <div key={bucket}>
                  <div className="sticky top-0 z-10 px-5 py-1.5 bg-gray-50/95 backdrop-blur-sm border-b border-gray-100">
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{bucket}</span>
                  </div>
                  {buckets[bucket].map(group => {
                    const { Icon, cls } = configFor(group.type);
                    const r = routeOf(group, user?.role);
                    return (
                      <button key={group.ids[0]} onClick={() => handleClick(group)} style={{ animationDelay: `${Math.min(rowIdx++, 12) * 30}ms` }}
                        className={`fs-card-in w-full flex items-start gap-3 px-5 py-3.5 border-b border-gray-100 text-left transition-colors relative hover:bg-gray-50 ${group.anyUnread ? 'bg-[#0808f8]/[0.035]' : ''}`}>
                        {group.anyUnread && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--brand-accent)]" />}
                        {group.meta?.thumb
                          ? <img src={group.meta.thumb} alt="" className="w-10 h-10 rounded-xl object-cover shrink-0 mt-0.5" />
                          : <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${cls}`}><Icon size={17} /></span>}
                        <div className="flex-1 min-w-0">
                          <p className={`text-[13px] leading-snug ${group.anyUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>{group.message}</p>
                          <Detail n={group} />
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            {group.production_id && !group.type?.startsWith('task') && <span className="text-[10px] font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">{group.production_id}</span>}
                            {group.count > 1 && <span className="text-[10px] font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded-full" title={`${group.count} times`}>×{group.count}</span>}
                            <span className="text-[11px] text-gray-400" title={formatIST(group.created_at)}>{relTime(group.created_at)}</span>
                            {r?.href && <span className="text-[11px] text-gray-400 flex items-center gap-0.5"><ExternalLink size={10} /> Monday</span>}
                          </div>
                        </div>
                        {group.anyUnread && <span className="w-2 h-2 rounded-full bg-[var(--brand-accent)] shrink-0 mt-1.5" />}
                      </button>
                    );
                  })}
                </div>
              ))
            )}
            {notifications.length > 0 && (
              <div className="px-5 py-4 text-center">
                <button onClick={clearAll} className="text-xs text-gray-400 hover:text-red-500 inline-flex items-center gap-1"><Trash2 size={12} /> Clear all</button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
