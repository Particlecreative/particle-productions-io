import { useState, useEffect, useRef, useMemo } from 'react';
import {
  ChevronLeft, ChevronRight, Plus, Settings2, CalendarDays, List, Table2,
  GanttChartSquare, Trash2, Pencil, X, ChevronDown, ChevronUp, GripVertical, Check,
  Layers, LayoutList, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, useSensor, useSensors,
} from '@dnd-kit/core';
import {
  arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  getGanttEvents, getAllGanttEvents, createGanttEvent, updateGanttEvent, deleteGanttEvent,
  getGanttPhases, saveGanttPhases,
} from '../../lib/ganttService';
import { getProductions } from '../../lib/dataService';
import { useBrand } from '../../context/BrandContext';
import { getHolidaysForDate } from '../../lib/holidayData';
import clsx from 'clsx';

// ─── Constants ───────────────────────────────────────────────────────────────

const CELL_W  = { week: 36, month: 18, day: 56 };
const NUM_DAYS = { week: 28, month: 91, day: 21 };
const NAV_STEP = { week: 14, month: 45, day: 7 };
const ROW_H   = 36;
const PHASE_ROW_H = 40;
const LABEL_W = 200;

// Phase accent colors for the left border bars
const PHASE_COLORS = {
  concepts: '#9333ea',
  scripting: '#2563eb',
  'pre production': '#0891b2',
  'pre-production': '#0891b2',
  production: '#16a34a',
  'post production': '#ea580c',
  'post-production': '#ea580c',
  post: '#ea580c',
};
const DEFAULT_PHASE_COLOR = '#6b7280';

function getPhaseAccentColor(phaseName) {
  if (!phaseName) return DEFAULT_PHASE_COLOR;
  const key = phaseName.toLowerCase().trim();
  return PHASE_COLORS[key] || DEFAULT_PHASE_COLOR;
}

const PALETTE = [
  '#7c3aed','#2563eb','#0891b2','#16a34a','#d97706','#dc2626',
  '#db2777','#6366f1','#14b8a6','#f59e0b','#84cc16','#0ea5e9',
];

// Colors for production sections in "Group by Production" mode
const PROD_COLORS = [
  '#6366f1','#0891b2','#16a34a','#d97706','#dc2626','#7c3aed',
  '#db2777','#14b8a6','#f59e0b','#84cc16','#0ea5e9','#2563eb',
];

// ─── Gantt Prefs ─────────────────────────────────────────────────────────────

function readGanttPrefs() {
  try { return JSON.parse(localStorage.getItem('cp_gantt_prefs') || '{}'); } catch { return {}; }
}
function writeGanttPref(key, value) {
  try {
    const p = readGanttPrefs(); p[key] = value;
    localStorage.setItem('cp_gantt_prefs', JSON.stringify(p));
  } catch {}
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function startOfDay(d)  { const r = new Date(d); r.setHours(0,0,0,0); return r; }
function addDays(d, n)  { const r = new Date(d); r.setDate(r.getDate() + n); return r; }
function dayDiff(a, b)  { return Math.round((startOfDay(a) - startOfDay(b)) / 86400000); }
function fmtDate(d)     { return new Date(d).toISOString().slice(0, 10); }
function parseDt(s)     { return new Date(s + 'T00:00:00'); }
function fmtShort(d)    { return `${d.getDate()}/${d.getMonth() + 1}`; }
function fmtMonth(d)    { return d.toLocaleString('default', { month: 'short', year: 'numeric' }); }
const DAY_NAMES_3 = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

function isFriSat(dateStr) {
  const day = new Date(dateStr + 'T00:00:00').getDay();
  return day === 5 || day === 6;
}

// Move a date to the nearest preceding Thursday if it lands on Fri/Sat
function toThursday(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDay();
  if (day === 5) d.setDate(d.getDate() - 1); // Fri → Thu
  if (day === 6) d.setDate(d.getDate() - 2); // Sat → Thu
  return fmtDate(d);
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GanttTab({ productionId, allProductions = false }) {
  const { brandId } = useBrand();
  const [view,        setView]       = useState('gantt');
  const [zoom,        setZoom]       = useState('week');
  const [viewStart,   setViewStart]  = useState(() => addDays(startOfDay(new Date()), -7));
  const [events,      setEvents]     = useState([]);
  const [phases,      setPhases]     = useState(() => getGanttPhases());
  const [collapsed,   setCollapsed]  = useState(new Set());
  const [tempDates,   setTempDates]  = useState(null);
  const [editEvt,     setEditEvt]    = useState(null);
  const [addModal,    setAddModal]   = useState(null);
  const [newName,     setNewName]    = useState('');
  const [showTmpl,    setShowTmpl]   = useState(false);
  const [calMonth,    setCalMonth]   = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [sortCol,     setSortCol]    = useState('start_date');
  const [sortDir,     setSortDir]    = useState('asc');
  const [filterProd,  setFilterProd] = useState('all');

  // Holiday toggles — persisted in localStorage
  const [showIL, setShowIL] = useState(() => readGanttPrefs().showIL ?? false);
  const [showUS, setShowUS] = useState(() => readGanttPrefs().showUS ?? false);

  // Master gantt: group by phase (default) or by production
  const [masterGroupBy, setMasterGroupBy] = useState('phase');

  // Fri/Sat drag warning
  const [fridayWarning, setFridayWarning] = useState(null); // { id, start_date, end_date }

  // Productions list for filter dropdown and group-by-production view
  const [allProdsList, setAllProdsList] = useState([]);
  useEffect(() => {
    if (!allProductions) { setAllProdsList([]); return; }
    Promise.resolve(getProductions(brandId)).then(r => setAllProdsList(Array.isArray(r) ? r : []));
  }, [allProductions, brandId]);

  const tempRef = useRef(null);
  const today   = useMemo(() => startOfDay(new Date()), []);
  const cw      = CELL_W[zoom] ?? 36;
  const nDays   = NUM_DAYS[zoom] ?? 28;

  const days = useMemo(
    () => Array.from({ length: nDays }, (_, i) => addDays(viewStart, i)),
    [viewStart, nDays],
  );

  function refresh() {
    setEvents(allProductions ? getAllGanttEvents() : getGanttEvents(productionId));
  }

  useEffect(() => { refresh(); }, [productionId, allProductions]); // eslint-disable-line

  // Navigation — step size varies by zoom mode
  const navStep  = NAV_STEP[zoom] ?? Math.floor(nDays / 2);
  const navPrev  = () => setViewStart(d => addDays(d, -navStep));
  const navNext  = () => setViewStart(d => addDays(d, navStep));
  const navToday = () => setViewStart(addDays(today, -7));

  // Active production filter
  function matchesProdFilter(e) {
    if (!allProductions) return e.production_id === productionId;
    if (filterProd === 'all') return true;
    return e.production_id === filterProd;
  }

  // Events for a phase (with live drag override)
  function phaseEvts(phaseId) {
    return events
      .filter(e => e.phase === phaseId && matchesProdFilter(e))
      .map(e => tempRef.current?.id === e.id
        ? { ...e, start_date: tempRef.current.start_date, end_date: tempRef.current.end_date }
        : e,
      );
  }

  // Events for a production (group-by-production mode, with live drag override)
  function prodEvts(prodId) {
    return events
      .filter(e => e.production_id === prodId)
      .map(e => tempRef.current?.id === e.id
        ? { ...e, start_date: tempRef.current.start_date, end_date: tempRef.current.end_date }
        : e,
      );
  }

  // Drag handler
  function startDrag(e, event, type) {
    e.preventDefault();
    e.stopPropagation();
    const initX = e.clientX;
    const { start_date: os, end_date: oe } = event;

    function onMove(mv) {
      const delta = Math.round((mv.clientX - initX) / cw);
      let nd;
      if (type === 'move') {
        nd = { id: event.id, start_date: fmtDate(addDays(parseDt(os), delta)), end_date: fmtDate(addDays(parseDt(oe), delta)) };
      } else {
        const newEnd = fmtDate(addDays(parseDt(oe), delta));
        if (newEnd >= os) nd = { id: event.id, start_date: os, end_date: newEnd };
      }
      if (nd) { tempRef.current = nd; setTempDates({ ...nd }); }
    }

    function onUp() {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      if (!tempRef.current) return;
      const nd = { ...tempRef.current };
      // Check if result lands on Fri/Sat — warn user
      if (isFriSat(nd.start_date) || isFriSat(nd.end_date)) {
        setFridayWarning(nd);
        setTempDates(null);
        // Keep tempRef until user resolves the warning
      } else {
        updateGanttEvent(nd.id, { start_date: nd.start_date, end_date: nd.end_date });
        tempRef.current = null;
        setTempDates(null);
        refresh();
      }
    }

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  // Resolve Fri/Sat warning
  function resolveFridayWarning(keepFriSat) {
    if (!fridayWarning) return;
    let { id, start_date, end_date } = fridayWarning;
    if (!keepFriSat) {
      if (isFriSat(start_date)) start_date = toThursday(start_date);
      if (isFriSat(end_date))   end_date   = toThursday(end_date);
    }
    updateGanttEvent(id, { start_date, end_date });
    tempRef.current = null;
    setFridayWarning(null);
    refresh();
  }

  // Add event
  function handleAdd(e) {
    e.preventDefault();
    if (!newName.trim() || !addModal) return;
    const phase = phases.find(p => p.id === addModal.phaseId);
    createGanttEvent({
      production_id: productionId || 'all',
      phase: addModal.phaseId,
      name: newName.trim(),
      start_date: addModal.date,
      end_date: addModal.endDate || addModal.date,
      color: phase?.color || '#6366f1',
    });
    refresh();
    setAddModal(null);
    setNewName('');
  }

  function handleDelete(id) {
    deleteGanttEvent(id);
    refresh();
    setEditEvt(null);
  }

  function handleSaveEdit(patch) {
    updateGanttEvent(editEvt.id, patch);
    refresh();
    setEditEvt(null);
  }

  const filteredEvts = events.filter(e => matchesProdFilter(e));

  return (
    <div>
      {/* ── Toolbar ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {/* View selector */}
        <div className="flex border border-gray-200 rounded-lg overflow-hidden">
          {[
            { id: 'gantt',    icon: GanttChartSquare, label: 'Gantt'    },
            { id: 'calendar', icon: CalendarDays,     label: 'Calendar' },
            { id: 'list',     icon: List,             label: 'List'     },
            { id: 'table',    icon: Table2,           label: 'Table'    },
          ].map(v => (
            <button
              key={v.id}
              onClick={() => setView(v.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-r last:border-0 border-gray-200',
                view === v.id ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50',
              )}
            >
              <v.icon size={12} />
              {v.label}
            </button>
          ))}
        </div>

        {/* Gantt nav + zoom */}
        {view === 'gantt' && (
          <>
            <div className="flex items-center gap-1">
              <button onClick={navPrev} className="p-1.5 rounded hover:bg-gray-100"><ChevronLeft size={14} /></button>
              <button onClick={navToday} className="px-2.5 py-1 text-xs rounded border border-gray-200 hover:bg-gray-50 font-medium">Today</button>
              <button onClick={navNext} className="p-1.5 rounded hover:bg-gray-100"><ChevronRight size={14} /></button>
            </div>
            {/* Zoom selector — pill buttons with icons */}
            <div className="flex items-center gap-1">
              <ZoomOut size={13} className="text-gray-400 mr-0.5" />
              {['month', 'week', 'day'].map(z => (
                <button
                  key={z}
                  onClick={() => setZoom(z)}
                  className={clsx('gantt-zoom-btn capitalize', zoom === z && 'active')}
                >
                  {z}
                </button>
              ))}
              <ZoomIn size={13} className="text-gray-400 ml-0.5" />
            </div>
            {/* Holiday toggles */}
            <div className="flex gap-1">
              <button
                title={showIL ? 'Hide Israeli holidays' : 'Show Israeli holidays'}
                onClick={() => { const v = !showIL; setShowIL(v); writeGanttPref('showIL', v); }}
                className={clsx(
                  'px-2 py-1 rounded border text-xs font-medium transition-all',
                  showIL ? 'bg-blue-50 border-blue-300 text-blue-700' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50',
                )}
              >
                🇮🇱
              </button>
              <button
                title={showUS ? 'Hide American holidays' : 'Show American holidays'}
                onClick={() => { const v = !showUS; setShowUS(v); writeGanttPref('showUS', v); }}
                className={clsx(
                  'px-2 py-1 rounded border text-xs font-medium transition-all',
                  showUS ? 'bg-red-50 border-red-300 text-red-700' : 'bg-white border-gray-200 text-gray-400 hover:bg-gray-50',
                )}
              >
                🇺🇸
              </button>
            </div>
          </>
        )}

        {/* Master-Gantt controls */}
        {allProductions && (
          <>
            <select
              value={filterProd}
              onChange={e => setFilterProd(e.target.value)}
              className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white font-medium outline-none hover:bg-gray-50 max-w-[220px]"
            >
              <option value="all">All Productions</option>
              {allProdsList.map(p => (
                <option key={p.id} value={p.id}>{p.id} – {p.project_name}</option>
              ))}
            </select>

            {/* Group by toggle — only in Gantt view */}
            {view === 'gantt' && (
              <div className="flex border border-gray-200 rounded overflow-hidden text-xs">
                <button
                  onClick={() => setMasterGroupBy('phase')}
                  className={clsx('flex items-center gap-1 px-2.5 py-1 font-medium transition-colors', masterGroupBy === 'phase' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50')}
                  title="Group events by phase"
                >
                  <Layers size={11} /> Phase
                </button>
                <button
                  onClick={() => setMasterGroupBy('production')}
                  className={clsx('flex items-center gap-1 px-2.5 py-1 font-medium transition-colors border-l border-gray-200', masterGroupBy === 'production' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-50')}
                  title="Group events by production"
                >
                  <LayoutList size={11} /> Production
                </button>
              </div>
            )}
          </>
        )}

        <div className="flex-1" />
        <button onClick={() => setShowTmpl(true)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 font-medium">
          <Settings2 size={12} /> Template
        </button>
        <button
          onClick={() => { setAddModal({ phaseId: phases[0]?.id, date: fmtDate(today), endDate: fmtDate(today) }); setNewName(''); }}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-gray-900 text-white rounded-lg hover:bg-gray-700 font-medium"
        >
          <Plus size={12} /> Add Event
        </button>
      </div>

      {/* ── Views ───────────────────────────────────────── */}
      {view === 'gantt' && (
        allProductions && masterGroupBy === 'production' ? (
          <ProductionGanttView
            days={days} cw={cw} today={today}
            allProdsList={allProdsList}
            prodEvts={prodEvts}
            phases={phases}
            collapsed={collapsed}
            setCollapsed={setCollapsed}
            onDrag={startDrag}
            onEdit={setEditEvt}
            onAddClick={(phaseId, day) => { setAddModal({ phaseId, date: fmtDate(day), endDate: fmtDate(day) }); setNewName(''); }}
            showIL={showIL} showUS={showUS} zoom={zoom}
          />
        ) : (
          <GanttView
            days={days} phases={phases} cw={cw}
            phaseEvts={phaseEvts} collapsed={collapsed}
            setCollapsed={setCollapsed} today={today}
            onDrag={startDrag}
            onEdit={setEditEvt}
            onAddClick={(phaseId, day) => { setAddModal({ phaseId, date: fmtDate(day), endDate: fmtDate(day) }); setNewName(''); }}
            showIL={showIL} showUS={showUS} zoom={zoom}
          />
        )
      )}
      {view === 'calendar' && (
        <CalendarView
          events={filteredEvts} phases={phases}
          calMonth={calMonth} setCalMonth={setCalMonth}
          today={today} onEdit={setEditEvt}
        />
      )}
      {view === 'list' && (
        <ListView
          events={filteredEvts} phases={phases}
          sortCol={sortCol} sortDir={sortDir}
          setSortCol={setSortCol} setSortDir={setSortDir}
          onEdit={setEditEvt} onDelete={handleDelete}
        />
      )}
      {view === 'table' && (
        <TableView
          events={filteredEvts} phases={phases}
          onUpdate={(id, p) => { updateGanttEvent(id, p); refresh(); }}
          onDelete={handleDelete}
        />
      )}

      {/* ── Add Modal ───────────────────────────────────── */}
      {addModal && (
        <div className="modal-overlay" onClick={() => setAddModal(null)}>
          <div className="modal-panel max-w-sm" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-base" style={{ color: 'var(--brand-primary)' }}>Add Event</h3>
              <button onClick={() => setAddModal(null)}><X size={16} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleAdd} className="space-y-3">
              <div>
                <label className="label-xs">Name</label>
                <input className="brand-input" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Event name" required autoFocus />
              </div>
              <div>
                <label className="label-xs">Phase</label>
                <select className="brand-input" value={addModal.phaseId} onChange={e => setAddModal(m => ({ ...m, phaseId: e.target.value }))}>
                  {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="label-xs">Start</label>
                  <input type="date" className="brand-input" value={addModal.date} onChange={e => setAddModal(m => ({ ...m, date: e.target.value }))} />
                </div>
                <div className="flex-1">
                  <label className="label-xs">End</label>
                  <input type="date" className="brand-input" value={addModal.endDate || addModal.date} onChange={e => setAddModal(m => ({ ...m, endDate: e.target.value }))} />
                </div>
              </div>
              {(isFriSat(addModal.date) || isFriSat(addModal.endDate || addModal.date)) && (
                <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
                  ⚠️ Selected date(s) fall on Friday or Saturday (non-working day in Israeli work week).
                </p>
              )}
              <div className="flex gap-2 pt-1">
                <button type="button" onClick={() => setAddModal(null)} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" className="btn-cta flex-1">Add</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Edit Modal ──────────────────────────────────── */}
      {editEvt && (
        <EventEditModal
          event={editEvt} phases={phases}
          onSave={handleSaveEdit}
          onDelete={() => handleDelete(editEvt.id)}
          onClose={() => setEditEvt(null)}
        />
      )}

      {/* ── Template Manager ────────────────────────────── */}
      {showTmpl && (
        <TemplateManager
          phases={phases}
          onSave={p => { saveGanttPhases(p); setPhases([...p]); setShowTmpl(false); }}
          onClose={() => setShowTmpl(false)}
        />
      )}

      {/* ── Friday/Saturday Warning Dialog ──────────────── */}
      {fridayWarning && (
        <FridayWarningDialog
          start={fridayWarning.start_date}
          end={fridayWarning.end_date}
          onKeep={() => resolveFridayWarning(true)}
          onMoveToThursday={() => resolveFridayWarning(false)}
          onCancel={() => { tempRef.current = null; setFridayWarning(null); refresh(); }}
        />
      )}
    </div>
  );
}

// ─── Shared: date header row renderer ────────────────────────────────────────

function DateHeaderRow({ days, cw, zoom, showIL, showUS, todayStr }) {
  return (
    <div className="flex flex-1 relative">
      {days.map((day, i) => {
        const ds       = fmtDate(day);
        const isToday  = ds === todayStr;
        const dayOfW   = day.getDay(); // 0=Sun … 6=Sat
        const isMon    = dayOfW === 1 || i === 0;
        const isFriSatCell = dayOfW === 5 || dayOfW === 6;
        const show     = cw >= 30 || (cw < 30 && isMon);
        const hols     = (showIL || showUS) ? getHolidaysForDate(ds) : { il: [], us: [] };
        const hasIL    = showIL && hols.il.length > 0;
        const hasUS    = showUS && hols.us.length > 0;
        const holTitle = [...(hasIL ? hols.il : []), ...(hasUS ? hols.us : [])].join(' · ');

        return (
          <div
            key={i}
            className={clsx(
              'flex flex-col items-center justify-center gap-0.5',
              isFriSatCell && 'gantt-weekend-col-header',
              isMon && 'gantt-grid-cell-monday',
            )}
            style={{
              width: cw, flexShrink: 0,
              borderRight: '1px solid rgba(0,0,0,0.06)',
              ...(isToday ? { background: 'rgba(59,130,246,0.06)' } : {}),
            }}
            title={holTitle || undefined}
          >
            {show && (
              <span className={clsx(
                'text-[10px] leading-none',
                isToday ? 'text-blue-600 font-bold' : isFriSatCell ? 'text-gray-300' : 'text-gray-400',
              )}>
                {zoom === 'day'
                  ? `${day.getDate()} ${DAY_NAMES_3[dayOfW]}`
                  : zoom === 'week'
                    ? (cw >= 30 ? `${day.getDate()} ${DAY_NAMES_3[dayOfW]}` : fmtShort(day))
                    : (cw >= 30 ? day.getDate() : fmtShort(day))
                }
              </span>
            )}
            {/* Holiday dot(s) */}
            {(hasIL || hasUS) && (
              <div className="flex gap-0.5 items-center">
                {hasIL && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 inline-block" title={hols.il.join(', ')} />}
                {hasUS && <span className="w-1.5 h-1.5 rounded-full bg-red-500 inline-block" title={hols.us.join(', ')} />}
              </div>
            )}
            {/* Day view: holiday name label */}
            {zoom === 'day' && (hasIL || hasUS) && cw >= 50 && (
              <span className="text-[9px] leading-none text-center px-0.5 truncate max-w-full" style={{ color: hasIL ? '#3b82f6' : '#ef4444' }}>
                {hasIL ? hols.il[0] : hols.us[0]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Shared: grid-cell overlay row (Fri/Sat stripes + today line + click to add)
function GridCellRow({ days, cw, todayOff, onCellClick }) {
  return (
    <div className="flex flex-1">
      {days.map((day, i) => {
        const dayOfW    = day.getDay();
        const isMon     = dayOfW === 1;
        const isFriSatCell = dayOfW === 5 || dayOfW === 6;
        return (
          <div
            key={i}
            className={clsx(
              isFriSatCell ? 'gantt-weekend-col' : 'gantt-grid-cell',
              isMon && 'gantt-grid-cell-monday',
              !isFriSatCell && onCellClick && 'hover:bg-blue-50/40',
            )}
            style={{
              width: cw, flexShrink: 0, height: '100%',
              cursor: onCellClick ? 'pointer' : undefined,
            }}
            onClick={onCellClick ? () => onCellClick(day) : undefined}
          />
        );
      })}
      {todayOff >= 0 && todayOff < days.length && (
        <div className="gantt-today-line" style={{ left: todayOff * cw + cw / 2 }} />
      )}
    </div>
  );
}

// ─── Gantt View (group by phase — default) ────────────────────────────────────

function GanttView({ days, phases, cw, phaseEvts, collapsed, setCollapsed, today, onDrag, onEdit, onAddClick, showIL, showUS, zoom }) {
  const totalW  = LABEL_W + days.length * cw;
  const todayOff = dayDiff(today, days[0]);
  const todayStr = fmtDate(today);

  function togglePhase(id) {
    setCollapsed(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="overflow-x-auto border border-gray-100 rounded-2xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.03)' }}>
      <div style={{ minWidth: totalW }}>
        {/* Date header */}
        <div className="flex border-b border-gray-100 relative" style={{ height: zoom === 'day' ? 50 : 38, background: '#f8f9fb' }}>
          <div
            className="flex items-center px-4 flex-shrink-0 border-r border-gray-100 gantt-label-col-header"
            style={{ width: LABEL_W }}
          >
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phase / Task</span>
          </div>
          <div className="flex flex-1 relative">
            <DateHeaderRow days={days} cw={cw} zoom={zoom} showIL={showIL} showUS={showUS} todayStr={todayStr} />
            {/* Today label above the line */}
            {todayOff >= 0 && todayOff < days.length && (
              <div className="gantt-today-label" style={{ left: todayOff * cw + cw / 2, top: 2 }}>Today</div>
            )}
          </div>
        </div>

        {/* Phase sections */}
        {phases.map(phase => {
          const evts = phaseEvts(phase.id);
          const isCollapsed = collapsed.has(phase.id);
          const accentColor = getPhaseAccentColor(phase.name) || phase.color;

          return (
            <div key={phase.id}>
              {/* Phase header */}
              <div
                className="flex items-center cursor-pointer gantt-phase-header"
                style={{
                  height: PHASE_ROW_H,
                  background: `${accentColor}08`,
                  borderBottom: `1px solid ${accentColor}15`,
                  '--phase-color': accentColor,
                }}
                onClick={() => togglePhase(phase.id)}
              >
                <div
                  className="flex items-center gap-2 flex-shrink-0 px-4 gantt-label-col"
                  style={{ width: LABEL_W, background: `${accentColor}06` }}
                >
                  <ChevronDown
                    size={13}
                    className={clsx('gantt-chevron text-gray-400', isCollapsed && 'gantt-chevron-collapsed')}
                  />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: accentColor }} />
                  <span className="gantt-phase-name" style={{ color: accentColor }}>{phase.name}</span>
                  <span
                    className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold"
                    style={{ background: `${accentColor}12`, color: accentColor }}
                  >
                    {evts.length}
                  </span>
                </div>
                <div className="flex-1 relative" style={{ height: '100%' }}>
                  {todayOff >= 0 && todayOff < days.length && (
                    <div className="gantt-today-line" style={{ left: todayOff * cw + cw / 2 }} />
                  )}
                </div>
              </div>

              {/* Event rows + add row — smooth collapse transition */}
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: isCollapsed ? 0 : (evts.length * ROW_H + 28) * 2,
                  transition: 'max-height 0.25s ease',
                }}
              >
                {evts.map((event, idx) => (
                  <GanttEventRow key={event.id} event={event} phase={phase} days={days} cw={cw} todayOff={todayOff} onDrag={onDrag} onEdit={onEdit} rowIndex={idx} accentColor={accentColor} />
                ))}
                {/* Add row */}
                <div className="flex gantt-add-row" style={{ height: 28, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                  <div
                    className="flex items-center px-4 flex-shrink-0 border-r border-gray-100 cursor-pointer hover:bg-blue-50/50 gantt-label-col"
                    style={{ width: LABEL_W }}
                    onClick={() => onAddClick(phase.id, today)}
                  >
                    <span className="text-[11px] text-gray-400 flex items-center gap-1 hover:text-gray-600 transition-colors">
                      <Plus size={10} /> add event
                    </span>
                  </div>
                  <div className="flex flex-1 relative" style={{ height: '100%' }}>
                    <GridCellRow days={days} cw={cw} todayOff={todayOff} onCellClick={day => onAddClick(phase.id, day)} />
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Gantt View (group by production) ────────────────────────────────────────

function ProductionGanttView({ days, cw, today, allProdsList, prodEvts, phases, collapsed, setCollapsed, onDrag, onEdit, onAddClick, showIL, showUS, zoom }) {
  const totalW   = LABEL_W + days.length * cw;
  const todayOff = dayDiff(today, days[0]);
  const todayStr = fmtDate(today);

  function toggleProd(id) {
    setCollapsed(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  return (
    <div className="overflow-x-auto border border-gray-100 rounded-2xl" style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.04), 0 6px 24px rgba(0,0,0,0.03)' }}>
      <div style={{ minWidth: totalW }}>
        {/* Date header */}
        <div className="flex border-b border-gray-100 relative" style={{ height: zoom === 'day' ? 50 : 38, background: '#f8f9fb' }}>
          <div
            className="flex items-center px-4 flex-shrink-0 border-r border-gray-100 gantt-label-col-header"
            style={{ width: LABEL_W }}
          >
            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Production / Task</span>
          </div>
          <div className="flex flex-1 relative">
            <DateHeaderRow days={days} cw={cw} zoom={zoom} showIL={showIL} showUS={showUS} todayStr={todayStr} />
            {todayOff >= 0 && todayOff < days.length && (
              <div className="gantt-today-label" style={{ left: todayOff * cw + cw / 2, top: 2 }}>Today</div>
            )}
          </div>
        </div>

        {/* Production sections */}
        {allProdsList.map((prod, pIdx) => {
          const evts = prodEvts(prod.id);
          const isCollapsed = collapsed.has(prod.id);
          const color = PROD_COLORS[pIdx % PROD_COLORS.length];

          return (
            <div key={prod.id}>
              {/* Production header */}
              <div
                className="flex items-center cursor-pointer gantt-phase-header"
                style={{
                  height: PHASE_ROW_H,
                  background: `${color}08`,
                  borderBottom: `1px solid ${color}15`,
                  '--phase-color': color,
                }}
                onClick={() => toggleProd(prod.id)}
              >
                <div
                  className="flex items-center gap-2 flex-shrink-0 px-4 gantt-label-col"
                  style={{ width: LABEL_W, background: `${color}06` }}
                >
                  <ChevronDown
                    size={13}
                    className={clsx('gantt-chevron text-gray-400', isCollapsed && 'gantt-chevron-collapsed')}
                  />
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[11px] font-bold leading-tight truncate" style={{ color }}>
                    {prod.id}
                    <span className="font-normal text-gray-500 ml-1">{prod.project_name}</span>
                  </span>
                  <span
                    className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-bold flex-shrink-0"
                    style={{ background: `${color}12`, color }}
                  >
                    {evts.length}
                  </span>
                </div>
                <div className="flex-1 relative" style={{ height: '100%' }}>
                  {todayOff >= 0 && todayOff < days.length && (
                    <div className="gantt-today-line" style={{ left: todayOff * cw + cw / 2 }} />
                  )}
                </div>
              </div>

              {/* Event rows */}
              <div
                style={{
                  overflow: 'hidden',
                  maxHeight: isCollapsed ? 0 : (evts.length * ROW_H + 30) * 2,
                  transition: 'max-height 0.25s ease',
                }}
              >
                {evts.map((event, idx) => {
                  const phase = phases.find(p => p.id === event.phase);
                  return (
                    <GanttEventRow key={event.id} event={event} phase={phase || { color, name: '' }} days={days} cw={cw} todayOff={todayOff} onDrag={onDrag} onEdit={onEdit} rowIndex={idx} accentColor={color} />
                  );
                })}

                {/* Empty state */}
                {evts.length === 0 && (
                  <div className="flex" style={{ height: 32, borderBottom: '1px solid rgba(0,0,0,0.04)' }}>
                    <div className="flex items-center px-4 flex-shrink-0 border-r border-gray-100 gantt-label-col" style={{ width: LABEL_W }}>
                      <span className="text-[11px] text-gray-300 italic">No events</span>
                    </div>
                    <div className="flex-1 relative" style={{ height: '100%' }}>
                      <GridCellRow days={days} cw={cw} todayOff={todayOff} onCellClick={null} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Shared: single Gantt event row ──────────────────────────────────────────

function GanttEventRow({ event, phase, days, cw, todayOff, onDrag, onEdit, rowIndex = 0, accentColor }) {
  const [justDropped, setJustDropped] = useState(false);
  const prevDates = useRef(event.start_date + event.end_date);
  // Flash "just dropped" style when dates change (after drag)
  useEffect(() => {
    const cur = event.start_date + event.end_date;
    if (prevDates.current !== cur) {
      prevDates.current = cur;
      setJustDropped(true);
      setTimeout(() => setJustDropped(false), 500);
    }
  }, [event.start_date, event.end_date]);
  const sOff    = dayDiff(parseDt(event.start_date), days[0]);
  const eOff    = dayDiff(parseDt(event.end_date), days[0]);
  const visStart = Math.max(0, sOff);
  const visEnd   = Math.min(days.length - 1, eOff);
  const visible  = eOff >= 0 && sOff < days.length;
  const barLeft  = visStart * cw;
  const barW     = Math.max(cw, (visEnd - visStart + 1) * cw);

  const barColor = event.color || phase?.color || '#6366f1';
  const phaseAccent = accentColor || getPhaseAccentColor(phase?.name) || barColor;
  const phaseName = phase?.name || '';
  const showLabel = barW > 80;

  return (
    <div
      className="flex gantt-row gantt-phase-row"
      style={{ height: ROW_H, borderBottom: '1px solid rgba(0,0,0,0.04)', '--phase-color': phaseAccent }}
    >
      <div
        className="flex items-center px-4 flex-shrink-0 border-r border-gray-100 gantt-label-col"
        style={{ width: LABEL_W }}
      >
        <span
          className="text-[12px] text-gray-600 truncate hover:text-gray-900 cursor-pointer transition-colors"
          title={event.name}
          onClick={() => onEdit(event)}
        >
          {event.name}
        </span>
      </div>
      <div className="flex-1 relative" style={{ height: ROW_H }}>
        {days.map((day, i) => {
          const dayOfW = day.getDay();
          const isMon  = dayOfW === 1;
          const isFriSatCell = dayOfW === 5 || dayOfW === 6;
          return (
            <div
              key={i}
              className={clsx(
                isFriSatCell ? 'gantt-weekend-col' : 'gantt-grid-cell',
                isMon && 'gantt-grid-cell-monday',
              )}
              style={{
                position: 'absolute', left: i * cw, top: 0, width: cw, height: '100%',
              }}
            />
          );
        })}
        {todayOff >= 0 && todayOff < days.length && (
          <div className="gantt-today-line" style={{ left: todayOff * cw + cw / 2 }} />
        )}
        {visible && (
          <div
            className="gantt-event-bar"
            style={{
              position: 'absolute', left: barLeft, width: barW,
              top: 4, height: ROW_H - 8,
              background: `linear-gradient(135deg, ${barColor}, ${barColor}b3)`,
              zIndex: 3,
              transform: justDropped ? 'scaleY(1.05)' : 'scaleY(1)',
              boxShadow: justDropped
                ? `0 4px 16px ${barColor}50`
                : `0 2px 8px ${barColor}40`,
            }}
            onMouseDown={e => onDrag(e, event, 'move')}
            onClick={e => { e.stopPropagation(); onEdit(event); }}
          >
            {/* Bar label — only show when bar is wide enough */}
            {showLabel ? (
              <span
                className="gantt-bar-label"
                style={{ lineHeight: `${ROW_H - 8}px` }}
              >
                {event.name}
              </span>
            ) : (
              <span style={{ display: 'block', height: '100%' }} />
            )}
            {/* Tooltip on hover */}
            <div className="gantt-tooltip">
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{event.name}</div>
              <div style={{ opacity: 0.7, fontSize: 10 }}>{event.start_date} - {event.end_date}</div>
              {phaseName && <div style={{ opacity: 0.6, fontSize: 10, marginTop: 1 }}>{phaseName}</div>}
            </div>
            {/* Resize handle */}
            <div
              className="gantt-resize-handle"
              onMouseDown={e => { e.stopPropagation(); onDrag(e, event, 'resize'); }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Calendar View ────────────────────────────────────────────────────────────

function CalendarView({ events, phases, calMonth, setCalMonth, today, onEdit }) {
  const year  = calMonth.getFullYear();
  const month = calMonth.getMonth();

  const firstDay = new Date(year, month, 1);
  const lastDay  = new Date(year, month + 1, 0);
  const startPad = (firstDay.getDay() + 6) % 7;
  const cells    = startPad + lastDay.getDate();
  const totalWeeks = Math.ceil(cells / 7);

  function dayCells() {
    const days = [];
    for (let w = 0; w < totalWeeks; w++) {
      for (let d = 0; d < 7; d++) {
        const dayNum = w * 7 + d - startPad + 1;
        days.push(dayNum >= 1 && dayNum <= lastDay.getDate() ? new Date(year, month, dayNum) : null);
      }
    }
    return days;
  }

  function eventsOnDay(day) {
    if (!day) return [];
    const ds = fmtDate(day);
    return events.filter(e => e.start_date <= ds && e.end_date >= ds);
  }

  const cells2 = dayCells();

  return (
    <div className="brand-card p-0 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <button onClick={() => setCalMonth(new Date(year, month - 1, 1))} className="p-1 rounded hover:bg-gray-100">
          <ChevronLeft size={16} />
        </button>
        <span className="font-bold text-sm">{fmtMonth(calMonth)}</span>
        <button onClick={() => setCalMonth(new Date(year, month + 1, 1))} className="p-1 rounded hover:bg-gray-100">
          <ChevronRight size={16} />
        </button>
      </div>
      <div className="grid grid-cols-7 border-b border-gray-100 bg-gray-50">
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold text-gray-400">{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells2.map((day, i) => {
          const isToday = day && fmtDate(day) === fmtDate(today);
          const dayEvts = eventsOnDay(day);
          return (
            <div
              key={i}
              className={clsx('border-r border-b border-gray-100 min-h-[80px] p-1', !day && 'bg-gray-50/50')}
            >
              {day && (
                <>
                  <div className={clsx(
                    'w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold mb-1',
                    isToday ? 'bg-blue-600 text-white' : 'text-gray-600',
                  )}>
                    {day.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayEvts.slice(0, 3).map(e => {
                      const phase = phases.find(p => p.id === e.phase);
                      return (
                        <div
                          key={e.id}
                          className="truncate text-[10px] font-medium text-white rounded px-1 cursor-pointer"
                          style={{ background: e.color || phase?.color || '#6366f1' }}
                          onClick={() => onEdit(e)}
                        >
                          {e.name}
                        </div>
                      );
                    })}
                    {dayEvts.length > 3 && (
                      <div className="text-[10px] text-gray-400">+{dayEvts.length - 3} more</div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── List View ────────────────────────────────────────────────────────────────

function ListView({ events, phases, sortCol, sortDir, setSortCol, setSortDir, onEdit, onDelete }) {
  function setSort(col) {
    if (col === sortCol) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  }

  const sorted = [...events].sort((a, b) => {
    const av = sortCol === 'phase' ? (phases.find(p => p.id === a.phase)?.name ?? '') : a[sortCol] ?? '';
    const bv = sortCol === 'phase' ? (phases.find(p => p.id === b.phase)?.name ?? '') : b[sortCol] ?? '';
    const r = String(av).localeCompare(String(bv));
    return sortDir === 'asc' ? r : -r;
  });

  function SortBtn({ col, label }) {
    const active = sortCol === col;
    return (
      <button onClick={() => setSort(col)} className={clsx('flex items-center gap-0.5', active ? 'text-gray-900 font-bold' : 'text-gray-500 hover:text-gray-700')}>
        {label}
        {active && <span className="text-[10px]">{sortDir === 'asc' ? ' ↑' : ' ↓'}</span>}
      </button>
    );
  }

  return (
    <div className="brand-card p-0 overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th><SortBtn col="phase" label="Phase" /></th>
            <th><SortBtn col="name" label="Name" /></th>
            <th><SortBtn col="start_date" label="Start" /></th>
            <th><SortBtn col="end_date" label="End" /></th>
            <th>Days</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {sorted.length === 0 && (
            <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No events yet. Click "+ Add Event" to get started.</td></tr>
          )}
          {sorted.map(e => {
            const phase = phases.find(p => p.id === e.phase);
            const dur   = dayDiff(parseDt(e.end_date), parseDt(e.start_date)) + 1;
            return (
              <tr key={e.id}>
                <td>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: phase?.color }} />
                    <span className="text-xs">{phase?.name ?? e.phase}</span>
                  </span>
                </td>
                <td className="font-medium text-sm">{e.name}</td>
                <td className="text-sm text-gray-500 font-mono">{e.start_date}</td>
                <td className="text-sm text-gray-500 font-mono">{e.end_date}</td>
                <td className="text-sm text-gray-500">{dur}</td>
                <td>
                  <div className="flex gap-1">
                    <button onClick={() => onEdit(e)} className="p-1.5 rounded hover:bg-gray-100 text-gray-400"><Pencil size={13} /></button>
                    <button onClick={() => onDelete(e.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Table View (inline editable) ────────────────────────────────────────────

function TableView({ events, phases, onUpdate, onDelete }) {
  const [editing, setEditing] = useState({});

  function startEdit(id, field, val) {
    setEditing(e => ({ ...e, [id]: { ...(e[id] ?? {}), field, value: val } }));
  }

  function commitEdit(id, field, value) {
    onUpdate(id, { [field]: value });
    setEditing(e => { const n = { ...e }; delete n[id]; return n; });
  }

  function EditCell({ event, field, type = 'text' }) {
    const ed = editing[event.id];
    const isEditing = ed?.field === field;
    const val = isEditing ? ed.value : event[field] ?? '';

    if (isEditing) {
      return type === 'select' ? (
        <select
          className="brand-input text-xs py-0.5"
          value={val}
          onChange={e => commitEdit(event.id, field, e.target.value)}
          onBlur={() => commitEdit(event.id, field, val)}
          autoFocus
        >
          {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ) : (
        <input
          type={type}
          className="brand-input text-xs py-0.5"
          value={val}
          onChange={e => setEditing(ed => ({ ...ed, [event.id]: { field, value: e.target.value } }))}
          onBlur={e => commitEdit(event.id, field, e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitEdit(event.id, field, val); if (e.key === 'Escape') setEditing(x => { const n = { ...x }; delete n[event.id]; return n; }); }}
          autoFocus
        />
      );
    }

    const display = type === 'select' ? phases.find(p => p.id === val)?.name ?? val : val;
    return (
      <span
        className="cursor-pointer hover:underline hover:text-blue-600"
        onClick={() => startEdit(event.id, field, event[field])}
      >
        {display || <span className="text-gray-300 italic">click to edit</span>}
      </span>
    );
  }

  return (
    <div className="brand-card p-0 overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Phase</th>
            <th>Name</th>
            <th>Start</th>
            <th>End</th>
            <th>Days</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {events.length === 0 && (
            <tr><td colSpan={6} className="text-center py-8 text-gray-400 text-sm">No events yet.</td></tr>
          )}
          {events.map(e => {
            const dur = dayDiff(parseDt(e.end_date), parseDt(e.start_date)) + 1;
            return (
              <tr key={e.id}>
                <td><EditCell event={e} field="phase" type="select" /></td>
                <td className="font-medium text-sm"><EditCell event={e} field="name" /></td>
                <td className="font-mono text-sm"><EditCell event={e} field="start_date" type="date" /></td>
                <td className="font-mono text-sm"><EditCell event={e} field="end_date" type="date" /></td>
                <td className="text-sm text-gray-500">{dur}</td>
                <td>
                  <button onClick={() => onDelete(e.id)} className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"><Trash2 size={13} /></button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Event Edit Modal ─────────────────────────────────────────────────────────

function EventEditModal({ event, phases, onSave, onDelete, onClose }) {
  const [form, setForm] = useState({
    name: event.name,
    phase: event.phase,
    start_date: event.start_date,
    end_date: event.end_date,
    color: event.color || (phases.find(p => p.id === event.phase)?.color ?? '#6366f1'),
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base" style={{ color: 'var(--brand-primary)' }}>Edit Event</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="label-xs">Name</label>
            <input className="brand-input" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
          <div>
            <label className="label-xs">Phase</label>
            <select className="brand-input" value={form.phase} onChange={e => setForm(f => ({ ...f, phase: e.target.value }))}>
              {phases.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="label-xs">Start</label>
              <input type="date" className="brand-input" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
            </div>
            <div className="flex-1">
              <label className="label-xs">End</label>
              <input type="date" className="brand-input" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
            </div>
          </div>
          {(isFriSat(form.start_date) || isFriSat(form.end_date)) && (
            <p className="text-xs text-orange-600 bg-orange-50 rounded-lg px-3 py-2 border border-orange-200">
              ⚠️ Selected date(s) fall on Friday or Saturday (non-working day in Israeli work week).
            </p>
          )}
          <div>
            <label className="label-xs">Color</label>
            <div className="flex gap-1.5 flex-wrap mt-1">
              {PALETTE.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(f => ({ ...f, color: c }))}
                  className={clsx('w-6 h-6 rounded-full border-2', form.color === c ? 'border-gray-700' : 'border-transparent')}
                  style={{ background: c }}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-2 mt-5">
          <button onClick={onDelete} className="p-2 rounded-lg border border-red-200 text-red-500 hover:bg-red-50">
            <Trash2 size={14} />
          </button>
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(form)} className="btn-cta flex-1">Save</button>
        </div>
      </div>
    </div>
  );
}

// ─── Friday/Saturday Warning Dialog ──────────────────────────────────────────

function FridayWarningDialog({ start, end, onKeep, onMoveToThursday, onCancel }) {
  const landsFri = isFriSat(start) || isFriSat(end);
  return (
    <div className="modal-overlay" onClick={onCancel}>
      <div className="modal-panel max-w-sm" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-xl flex-shrink-0">⚠️</div>
          <div>
            <h3 className="font-bold text-base text-gray-800">Non-Working Day</h3>
            <p className="text-sm text-gray-500">This event lands on Friday or Saturday.</p>
          </div>
        </div>
        <p className="text-sm text-gray-600 mb-5">
          In the Israeli work week, Friday and Saturday are non-working days.
          Would you like to move the event to Thursday, or keep it as-is?
        </p>
        <div className="flex gap-2">
          <button onClick={onCancel} className="btn-secondary flex-1 text-sm">Cancel</button>
          <button onClick={onKeep} className="px-3 py-2 rounded-lg border border-orange-300 text-orange-700 bg-orange-50 hover:bg-orange-100 text-sm font-medium flex-1 transition-colors">
            Keep Fri/Sat
          </button>
          <button onClick={onMoveToThursday} className="btn-cta flex-1 text-sm">
            → Thursday
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Template Manager Modal ───────────────────────────────────────────────────

function SortablePhaseRow({ phase, onRename, onDelete, onColorChange }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: phase.id });
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(phase.name);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}
      className="flex items-center gap-2 py-2 px-2 rounded group hover:bg-gray-50"
    >
      <button {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500 p-0.5 flex-shrink-0" tabIndex={-1}>
        <GripVertical size={14} />
      </button>

      <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: phase.color }} />

      {editing ? (
        <input
          className="brand-input text-sm flex-1 py-0.5"
          value={name}
          onChange={e => setName(e.target.value)}
          onBlur={() => { onRename(phase.id, name); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter') { onRename(phase.id, name); setEditing(false); } if (e.key === 'Escape') setEditing(false); }}
          autoFocus
        />
      ) : (
        <span className="text-sm flex-1 cursor-pointer" onClick={() => setEditing(true)}>{phase.name}</span>
      )}

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {PALETTE.slice(0, 6).map(c => (
          <button
            key={c}
            type="button"
            onClick={() => onColorChange(phase.id, c)}
            className={clsx('w-4 h-4 rounded-full border', phase.color === c ? 'border-gray-700' : 'border-transparent')}
            style={{ background: c }}
          />
        ))}
      </div>

      <button onClick={() => onDelete(phase.id)} className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 flex-shrink-0 opacity-0 group-hover:opacity-100">
        <Trash2 size={13} />
      </button>
    </div>
  );
}

function TemplateManager({ phases: initPhases, onSave, onClose }) {
  const [phases, setPhases] = useState(initPhases.map(p => ({ ...p })));
  const [newName, setNewName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd({ active, over }) {
    if (!over || active.id === over.id) return;
    const oi = phases.findIndex(p => p.id === active.id);
    const ni = phases.findIndex(p => p.id === over.id);
    setPhases(p => arrayMove(p, oi, ni).map((ph, i) => ({ ...ph, order: i })));
  }

  function addPhase(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setPhases(p => [...p, {
      id: `phase-${Date.now()}`,
      name: newName.trim(),
      color: PALETTE[p.length % PALETTE.length],
      order: p.length,
    }]);
    setNewName('');
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel max-w-md" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-bold text-base" style={{ color: 'var(--brand-primary)' }}>Phase Template</h3>
          <button onClick={onClose}><X size={16} className="text-gray-400" /></button>
        </div>

        <p className="text-xs text-gray-400 mb-3">Drag to reorder, click name to rename, hover for color options.</p>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={phases.map(p => p.id)} strategy={verticalListSortingStrategy}>
            {phases.map(phase => (
              <SortablePhaseRow
                key={phase.id}
                phase={phase}
                onRename={(id, name) => setPhases(ps => ps.map(p => p.id === id ? { ...p, name } : p))}
                onDelete={id => setPhases(ps => ps.filter(p => p.id !== id))}
                onColorChange={(id, color) => setPhases(ps => ps.map(p => p.id === id ? { ...p, color } : p))}
              />
            ))}
          </SortableContext>
        </DndContext>

        <form onSubmit={addPhase} className="flex gap-2 mt-3">
          <input
            className="brand-input text-sm flex-1"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="New phase name"
          />
          <button type="submit" className="btn-cta text-sm px-3">Add</button>
        </form>

        <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={() => onSave(phases)} className="btn-cta flex-1 flex items-center justify-center gap-1.5">
            <Check size={13} /> Apply to All Productions
          </button>
        </div>
      </div>
    </div>
  );
}
