import { useState, useEffect } from 'react';
import { Plus, X, Check } from 'lucide-react';
import {
  getLineItems,
  updateLineItem,
  deleteLineItem,
  createLineItem,
  generateId,
  updateProduction,
} from '../../lib/dataService';
import { useAuth } from '../../context/AuthContext';
import { useLists } from '../../context/ListsContext';

/* ── Role → emoji mapping ────────────────────────────────────────────────── */
const ROLE_ICONS = {
  'director':                '🎬',
  'technical photographer':  '📷',
  'photographer':            '📷',
  'dop':                     '🎥',
  'director of photography': '🎥',
  'offline editor':          '🖥',
  'online editor':           '✨',
  'sound designer':          '🎙',
  'sound':                   '🎙',
  'stylist':                 '💅',
  'makeup':                  '💄',
  'talent':                  '⭐',
  'actor':                   '🎭',
  'actress':                 '🎭',
  'gaffer':                  '💡',
  'grip':                    '🔧',
  'art director':            '🎨',
};


function getRoleIcon(role) {
  if (!role) return '👤';
  const key = role.toLowerCase().trim();
  if (ROLE_ICONS[key]) return ROLE_ICONS[key];
  for (const [k, emoji] of Object.entries(ROLE_ICONS)) {
    if (key.includes(k) || k.includes(key)) return emoji;
  }
  return '👤';
}

/* ── Main component ──────────────────────────────────────────────────────── */
export default function CrewBar({ production, onRefresh }) {
  const { user, isEditor } = useAuth();
  const { lists, updateList } = useLists();
  const [crewItems, setCrewItems] = useState([]);

  // Inline-edit state
  const [editingId, setEditingId] = useState(null); // li.id or 'producer'
  const [editRole, setEditRole] = useState('');
  const [editName, setEditName] = useState('');

  // Add-new state
  const [adding, setAdding] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [newName, setNewName] = useState('');

  async function loadCrew() {
    if (!production?.id) return;
    const items = await Promise.resolve(getLineItems(production.id));
    setCrewItems((Array.isArray(items) ? items : []).filter(li => li.type === 'Crew'));
  }

  useEffect(() => { loadCrew(); }, [production?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  /* ── edit helpers ─────────────────────────────────── */
  function startEdit(id, role, name) {
    setEditingId(id);
    setEditRole(role || '');
    setEditName(name || '');
    setAdding(false);
  }

  async function saveEdit() {
    if (!editingId) return;
    if (editingId === 'producer') {
      await Promise.resolve(updateProduction(production.id, { producer: editName.trim() }, user?.id, user?.name));
      onRefresh?.();
    } else {
      await Promise.resolve(updateLineItem(editingId, { item: editRole.trim(), full_name: editName.trim() }));
      const role = editRole.trim();
      if (role && !lists.crewRoles.some(r => r.toLowerCase() === role.toLowerCase())) {
        updateList('crewRoles', [...lists.crewRoles, role]);
      }
      await loadCrew();
      onRefresh?.();
    }
    setEditingId(null);
  }

  function cancelEdit() { setEditingId(null); }

  /* ── delete ───────────────────────────────────────── */
  async function handleDelete(id) {
    await Promise.resolve(deleteLineItem(id));
    await loadCrew();
    onRefresh?.();
  }

  /* ── add new ──────────────────────────────────────── */
  async function handleAdd() {
    if (!newRole.trim()) return;
    await Promise.resolve(createLineItem({
      id: generateId('li'),
      production_id: production.id,
      item: newRole.trim(),
      full_name: newName.trim(),
      type: 'Crew',
      supplier: '',
      status: 'Not Started',
      planned_budget: 0,
      actual_spent: 0,
      notes: '',
      invoice_url: '',
      invoice_status: '',
      payment_status: 'Not Paid',
      created_at: new Date().toISOString(),
    }));
    const role = newRole.trim();
    if (role && !lists.crewRoles.some(r => r.toLowerCase() === role.toLowerCase())) {
      updateList('crewRoles', [...lists.crewRoles, role]);
    }
    setNewRole('');
    setNewName('');
    setAdding(false);
    await loadCrew();
    onRefresh?.();
  }

  function cancelAdd() {
    setAdding(false);
    setNewRole('');
    setNewName('');
  }

  const hasProducer = Boolean(production?.producer);
  const hasCrew = crewItems.length > 0;

  // Hide entirely for viewers when nothing to show
  if (!hasProducer && !hasCrew && !isEditor) return null;

  return (
    <div
      className="brand-card mb-5"
      style={{ borderTop: '3px solid var(--brand-primary)', paddingTop: 14, paddingBottom: 14 }}
    >
      {/* Shared datalist — built-in roles + any custom ones saved previously */}
      <datalist id="crew-roles-datalist">
        {lists.crewRoles.map(r => <option key={r} value={r} />)}
      </datalist>

      <div className="flex flex-wrap items-center gap-0">

        {/* Producer chip — always present */}
        <ProducerChip
          name={production?.producer}
          editing={editingId === 'producer'}
          editName={editName}
          onEditName={setEditName}
          onStartEdit={() => isEditor && startEdit('producer', '', production?.producer || '')}
          onSave={saveEdit}
          onCancel={cancelEdit}
          isEditor={isEditor}
        />

        {/* Divider — producer / crew */}
        {hasCrew && (
          <div
            className="self-stretch mx-5 my-1"
            style={{ width: 1, background: 'var(--brand-border)', minHeight: 36 }}
          />
        )}

        {/* Crew chips */}
        {crewItems.map((li, idx) => (
          <div key={li.id} className="flex items-center gap-0">
            <CrewChip
              id={li.id}
              role={li.item}
              name={li.full_name}
              editing={editingId === li.id}
              editRole={editRole}
              editName={editName}
              onEditRole={setEditRole}
              onEditName={setEditName}
              onStartEdit={() => isEditor && startEdit(li.id, li.item, li.full_name)}
              onSave={saveEdit}
              onCancel={cancelEdit}
              onDelete={() => handleDelete(li.id)}
              isEditor={isEditor}
            />
            {idx < crewItems.length - 1 && (
              <div
                className="self-stretch mx-4 my-1"
                style={{ width: 1, background: 'var(--brand-border)', minHeight: 30 }}
              />
            )}
          </div>
        ))}

        {/* ── Add crew ─────────────────────────────────── */}
        {isEditor && !adding && (
          <button
            onClick={() => { setAdding(true); setEditingId(null); }}
            className="flex items-center gap-1 ml-4 text-xs text-gray-400 hover:text-gray-700 px-2.5 py-1.5 rounded-lg border border-dashed border-gray-300 hover:border-gray-500 transition-colors"
          >
            <Plus size={12} /> Add Crew
          </button>
        )}

        {/* Inline add form */}
        {isEditor && adding && (
          <div className="flex flex-col gap-1 ml-4">
            <div className="flex items-center gap-2 flex-wrap">
            <input
              className="brand-input text-xs"
              style={{ width: 160 }}
              placeholder="Role — type or pick…"
              value={newRole}
              onChange={e => setNewRole(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') cancelAdd();
              }}
              autoFocus
              list="crew-roles-datalist"
            />
            <input
              className="brand-input text-xs"
              style={{ width: 140 }}
              placeholder="Full name"
              value={newName}
              onChange={e => setNewName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') cancelAdd();
              }}
            />
            <button
              onClick={handleAdd}
              className="text-green-500 hover:text-green-700 transition-colors"
              title="Save"
            >
              <Check size={16} />
            </button>
            <button
              onClick={cancelAdd}
              className="text-gray-400 hover:text-gray-600 transition-colors"
              title="Cancel"
            >
              <X size={16} />
            </button>
          </div>
            <p className="text-[10px] text-gray-400 pl-0.5">
              Pick a suggestion or type any custom role
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

/* ── Producer chip ─────────────────────────────────────────────────────────── */
function ProducerChip({ name, editing, editName, onEditName, onStartEdit, onSave, onCancel, isEditor }) {
  return (
    <div className="flex items-center gap-2.5 px-1 py-0.5">
      {/* Icon circle */}
      <div
        className="flex items-center justify-center rounded-full text-white flex-shrink-0"
        style={{ width: 36, height: 36, background: 'var(--brand-primary)', fontSize: 16 }}
      >
        ★
      </div>

      {/* Label + name */}
      <div>
        <div
          className="text-[10px] font-bold tracking-widest uppercase"
          style={{ color: 'var(--brand-primary)', letterSpacing: '0.12em' }}
        >
          Producer
        </div>

        {editing ? (
          <input
            className="brand-input text-sm font-bold"
            style={{ width: 140 }}
            value={editName}
            onChange={e => onEditName(e.target.value)}
            onBlur={onSave}
            onKeyDown={e => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
            autoFocus
          />
        ) : (
          <div
            className={`text-sm font-bold leading-tight mt-0.5
              ${name ? 'text-gray-800' : 'text-gray-300'}
              ${isEditor ? 'cursor-pointer hover:opacity-60 transition-opacity' : ''}`}
            onClick={onStartEdit}
            title={isEditor ? 'Click to edit' : ''}
          >
            {name || '—'}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Crew chip ─────────────────────────────────────────────────────────────── */
function CrewChip({ id, role, name, editing, editRole, editName, onEditRole, onEditName, onStartEdit, onSave, onCancel, onDelete, isEditor }) {
  const icon = getRoleIcon(editing ? editRole : role);
  const isEmpty = !name;

  return (
    <div className="group relative flex items-center gap-2.5 px-1 py-0.5">

      {/* Delete button — appears on hover */}
      {isEditor && !editing && (
        <button
          onClick={onDelete}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-red-50 border border-red-200 text-red-400
                     hover:bg-red-500 hover:text-white hover:border-red-500
                     items-center justify-center hidden group-hover:flex transition-all z-10"
          title="Remove"
        >
          <X size={9} />
        </button>
      )}

      {/* Icon circle */}
      <div
        className="flex items-center justify-center rounded-full bg-gray-100 flex-shrink-0"
        style={{ width: 36, height: 36, fontSize: 16 }}
      >
        {icon}
      </div>

      {/* Edit mode */}
      {editing ? (
        <div className="flex flex-col gap-1">
          <input
            className="brand-input"
            style={{ width: 120, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase' }}
            value={editRole}
            onChange={e => onEditRole(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
            placeholder="Type or pick role…"
            autoFocus
            list="crew-roles-datalist"
          />
          <input
            className="brand-input text-sm font-bold"
            style={{ width: 120 }}
            value={editName}
            onChange={e => onEditName(e.target.value)}
            onBlur={onSave}
            onKeyDown={e => {
              if (e.key === 'Enter') onSave();
              if (e.key === 'Escape') onCancel();
            }}
            placeholder="Full name"
          />
        </div>
      ) : (
        /* View mode */
        <div>
          <div
            className="text-[10px] font-bold tracking-widest uppercase text-gray-400"
            style={{ letterSpacing: '0.12em' }}
          >
            {role || 'Crew'}
          </div>
          <div
            className={`text-sm font-bold leading-tight mt-0.5
              ${isEmpty ? 'text-gray-300' : 'text-gray-800'}
              ${isEditor ? 'cursor-pointer hover:opacity-60 transition-opacity' : ''}`}
            onClick={onStartEdit}
            title={isEditor ? 'Click to edit' : ''}
          >
            {name || '—'}
          </div>
        </div>
      )}
    </div>
  );
}
