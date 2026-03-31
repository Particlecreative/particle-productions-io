import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus, Check, X, Shield, Copy, Users2, Plus, Trash2, Pencil, Clock, KeyRound, RotateCcw, Eye, EyeOff } from 'lucide-react';
import { SAMPLE_USERS } from '../lib/mockData';
import { getGroups, createGroup, updateGroup, deleteGroup, getBrands } from '../lib/dataService';
import { apiGet, apiPost, apiPatch, apiDelete } from '../lib/apiClient';
import { useAuth } from '../context/AuthContext';
import clsx from 'clsx';

const IS_DEV = import.meta.env.DEV;

const ROLES = ['Viewer', 'Editor', 'Admin', 'Accounting'];

const ROLE_STYLES = {
  Admin:      'bg-blue-50 border-blue-200 text-blue-700',
  Editor:     'bg-green-50 border-green-200 text-green-700',
  Accounting: 'bg-purple-50 border-purple-200 text-purple-700',
  Viewer:     'bg-gray-100 border-gray-200 text-gray-600',
};

function generateTempPassword() {
  return Math.random().toString(36).slice(-8).padEnd(8, '0');
}

// ─── USERS TAB ───────────────────────────────────────────────────────────────

function UsersTab() {
  const navigate = useNavigate();
  const { user: currentUser, isAdmin } = useAuth();
  const isSuperAdmin = isAdmin || currentUser?.email?.toLowerCase() === 'tomer@particleformen.com';

  const [users, setUsers] = useState([]);
  const [allBrands, setAllBrands] = useState([]);
  const [brandAccessMap, setBrandAccessMap] = useState({});
  const [loading, setLoading] = useState(true);

  const [showCreate, setShowCreate] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createEmail, setCreateEmail] = useState('');
  const [createRole, setCreateRole] = useState('Editor');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);
  const [tempPassword, setTempPassword] = useState('');
  const [copiedPw, setCopiedPw] = useState(false);
  const [resetPwUser, setResetPwUser] = useState(null);
  const [resetPw, setResetPw] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [showDeleted, setShowDeleted] = useState(false);
  const [deletedUsers, setDeletedUsers] = useState([]);
  const [loadingDeleted, setLoadingDeleted] = useState(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [fetchedUsers, brands] = await Promise.all([
          IS_DEV ? Promise.resolve(SAMPLE_USERS) : apiGet('/users'),
          Promise.resolve(getBrands()),
        ]);
        const userList = Array.isArray(fetchedUsers) ? fetchedUsers : [];
        const brandList = Array.isArray(brands) ? brands : [];
        setUsers(userList);
        setAllBrands(brandList);
        const m = {};
        userList.forEach(u => { m[u.id] = Array.isArray(u.brand_ids) ? u.brand_ids : ['particle']; });
        setBrandAccessMap(m);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  async function handleRoleChange(id, role) {
    setUsers(us => us.map(u => u.id === id ? { ...u, role } : u));
    if (!IS_DEV) await apiPatch(`/users/${id}`, { role }).catch(() => {});
  }

  async function handleToggleActive(id, currentlyActive) {
    setUsers(us => us.map(u => u.id === id ? { ...u, active: !currentlyActive } : u));
    if (!IS_DEV) await apiPatch(`/users/${id}`, { active: !currentlyActive }).catch(() => {});
  }

  async function handleBrandToggle(userId, brandId) {
    const current = brandAccessMap[userId] ?? ['particle'];
    const next = current.includes(brandId) ? current.filter(b => b !== brandId) : [...current, brandId];
    setBrandAccessMap(m => ({ ...m, [userId]: next }));
    if (!IS_DEV) await apiPatch(`/users/${userId}`, { brand_ids: next }).catch(() => {});
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!createName.trim()) { setCreateError('Name is required'); return; }
    if (!createEmail.includes('@')) { setCreateError('Invalid email'); return; }
    setCreateError('');
    setCreating(true);
    const pw = generateTempPassword();
    try {
      if (IS_DEV) {
        const newUser = {
          id: `u-${Date.now()}`,
          email: createEmail,
          name: createName.trim(),
          role: createRole,
          brand_id: 'particle',
          brand_ids: ['particle'],
          active: true,
          must_change_password: true,
        };
        setUsers(us => [...us, newUser]);
        setBrandAccessMap(m => ({ ...m, [newUser.id]: ['particle'] }));
      } else {
        const created = await apiPost('/users', {
          email: createEmail,
          name: createName.trim(),
          role: createRole,
          brand_id: 'particle',
          brand_ids: ['particle'],
          password: pw,
          must_change_password: true,
        });
        if (created?.id) {
          setUsers(us => [...us, { ...created, brand_ids: created.brand_ids ?? ['particle'] }]);
          setBrandAccessMap(m => ({ ...m, [created.id]: created.brand_ids ?? ['particle'] }));
        }
      }
      setTempPassword(pw);
      setCopiedPw(false);
      setShowCreate(false);
      setCreateName('');
      setCreateEmail('');
      setCreateRole('Editor');
    } catch (err) {
      setCreateError(err?.message || 'Failed to create user');
    } finally {
      setCreating(false);
    }
  }

  function copyTempPassword() {
    navigator.clipboard?.writeText(tempPassword).catch(() => {});
    setCopiedPw(true);
    setTimeout(() => setCopiedPw(false), 2000);
  }

  function resetCreateForm() {
    setShowCreate(false);
    setCreateName('');
    setCreateEmail('');
    setCreateRole('Editor');
    setCreateError('');
  }

  async function handleResetPassword(user) {
    const pw = generateTempPassword();
    try {
      if (!IS_DEV) {
        await apiPatch(`/users/${user.id}`, { password: pw, must_change_password: true });
      }
      setUsers(us => us.map(u => u.id === user.id ? { ...u, must_change_password: true } : u));
      setResetPwUser(user);
      setResetPw(pw);
    } catch (err) {
      alert('Failed to reset password: ' + (err?.message || 'Unknown error'));
    }
  }

  async function handleDeleteUser(user) {
    try {
      if (!IS_DEV) await apiDelete(`/users/${user.id}`);
      setUsers(us => us.filter(u => u.id !== user.id));
      setConfirmDelete(null);
    } catch (err) {
      alert('Failed to delete user: ' + (err?.message || 'Unknown error'));
    }
  }

  async function handleToggleDeleted() {
    if (showDeleted) {
      setShowDeleted(false);
      setDeletedUsers([]);
      return;
    }
    setShowDeleted(true);
    setLoadingDeleted(true);
    try {
      const all = IS_DEV ? [] : await apiGet('/users?include_deleted=true');
      const deleted = (Array.isArray(all) ? all : []).filter(u => u.deleted_at);
      setDeletedUsers(deleted);
    } catch {
      setDeletedUsers([]);
    } finally {
      setLoadingDeleted(false);
    }
  }

  async function handleRestoreUser(user) {
    try {
      if (!IS_DEV) await apiPatch(`/users/${user.id}`, { restore: true });
      setDeletedUsers(us => us.filter(u => u.id !== user.id));
      setUsers(us => [...us, { ...user, deleted_at: null }]);
    } catch (err) {
      alert('Failed to restore user: ' + (err?.message || 'Unknown error'));
    }
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button className="btn-cta flex items-center gap-2" onClick={() => setShowCreate(true)}>
          <UserPlus size={14} />
          Create User
        </button>
      </div>

      {/* Create User Modal */}
      {showCreate && (
        <div className="modal-overlay" onClick={resetCreateForm}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Create User</h2>
              <button onClick={resetCreateForm}><X size={18} className="text-gray-400" /></button>
            </div>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Full Name</label>
                <input
                  type="text"
                  className="brand-input"
                  value={createName}
                  onChange={e => setCreateName(e.target.value)}
                  placeholder="Jane Smith"
                  required
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Email</label>
                <input
                  type="email"
                  className="brand-input"
                  value={createEmail}
                  onChange={e => setCreateEmail(e.target.value)}
                  placeholder="colleague@example.com"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Role</label>
                <select className="brand-input" value={createRole} onChange={e => setCreateRole(e.target.value)}>
                  {ROLES.map(r => <option key={r}>{r}</option>)}
                </select>
              </div>
              {createError && <div className="text-xs text-red-600 bg-red-50 rounded-lg p-2">{createError}</div>}
              <div className="flex gap-3">
                <button type="button" onClick={resetCreateForm} className="btn-secondary flex-1">Cancel</button>
                <button type="submit" disabled={creating} className="btn-cta flex-1 flex items-center justify-center gap-2">
                  <UserPlus size={13} />
                  {creating ? 'Creating…' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Temp Password Banner */}
      {tempPassword && (
        <div className="brand-card mb-5 border border-orange-200 bg-orange-50">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-bold text-orange-800 mb-1">User created successfully</div>
              <div className="text-xs text-orange-700 mb-2">
                Share this temporary password with the new user. They will be prompted to set a new password on first login.
              </div>
              <div className="flex items-center gap-3">
                <code className="bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-orange-900 tracking-widest">
                  {tempPassword}
                </code>
                <button
                  onClick={copyTempPassword}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 font-semibold transition-all"
                >
                  {copiedPw ? <Check size={12} /> : <Copy size={12} />}
                  {copiedPw ? 'Copied!' : 'Copy'}
                </button>
              </div>
            </div>
            <button onClick={() => setTempPassword('')} className="p-1 rounded hover:bg-orange-100 text-orange-400 flex-shrink-0">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetPwUser && (
        <div className="modal-overlay" onClick={() => { setResetPwUser(null); setResetPw(''); }}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black" style={{ color: 'var(--brand-primary)' }}>Password Reset</h2>
              <button onClick={() => { setResetPwUser(null); setResetPw(''); }}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="text-sm text-gray-600 mb-2">
              New temporary password for <span className="font-bold">{resetPwUser.name}</span>:
            </div>
            <div className="flex items-center gap-3 mb-4">
              <code className="bg-white border border-orange-200 rounded-lg px-3 py-1.5 text-sm font-mono font-bold text-orange-900 tracking-widest">
                {resetPw}
              </code>
              <button
                onClick={() => { navigator.clipboard?.writeText(resetPw).catch(() => {}); }}
                className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-orange-300 text-orange-700 hover:bg-orange-100 font-semibold transition-all"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <div className="text-xs text-gray-400">The user will be prompted to set a new password on next login.</div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-panel" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-black text-red-600">Delete User</h2>
              <button onClick={() => setConfirmDelete(null)}><X size={18} className="text-gray-400" /></button>
            </div>
            <div className="text-sm text-gray-600 mb-4">
              Are you sure you want to delete <span className="font-bold">{confirmDelete.name}</span> ({confirmDelete.email})?
              This can be undone via the "Show Deleted Users" section.
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(null)} className="btn-secondary flex-1">Cancel</button>
              <button
                onClick={() => handleDeleteUser(confirmDelete)}
                className="flex-1 px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-700 transition-all"
              >
                Delete User
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="brand-card p-0 overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-sm text-gray-400">Loading users…</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Email</th>
                <th>Role</th>
                {isSuperAdmin && <th>Brand Access</th>}
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className={!u.active ? 'opacity-40' : ''}>
                  <td>
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                        style={{ background: 'var(--brand-accent)' }}
                      >
                        {u.name?.[0] || '?'}
                      </div>
                      <div>
                        <div className="font-semibold text-sm">{u.name}</div>
                        {u.must_change_password && <div className="text-xs text-orange-500">Must change password</div>}
                      </div>
                    </div>
                  </td>
                  <td className="text-sm text-gray-500">{u.email}</td>
                  <td>
                    <div className="flex items-center gap-1">
                      {u.role === 'Admin' && <Shield size={12} style={{ color: 'var(--brand-accent)' }} />}
                      <select
                        value={u.role}
                        onChange={e => handleRoleChange(u.id, e.target.value)}
                        className={clsx(
                          'text-xs border rounded px-2 py-1.5 outline-none cursor-pointer font-semibold',
                          ROLE_STYLES[u.role] ?? ROLE_STYLES.Viewer,
                        )}
                      >
                        {ROLES.map(r => <option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </td>
                  {isSuperAdmin && (
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {allBrands.map(b => {
                          const access = brandAccessMap[u.id] ?? ['particle'];
                          const has = access.includes(b.id);
                          return (
                            <button
                              key={b.id}
                              onClick={() => handleBrandToggle(u.id, b.id)}
                              className={clsx(
                                'text-[10px] px-1.5 py-0.5 rounded border font-semibold transition-all',
                                has ? 'text-white border-transparent' : 'text-gray-400 border-gray-200 hover:border-gray-400'
                              )}
                              style={has ? { background: b.primary } : {}}
                            >
                              {b.name}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  )}
                  <td>
                    <span className={clsx('badge', u.active ? 'status-done' : 'status-not-started')}>
                      {u.active ? 'Active' : 'Deactivated'}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleActive(u.id, u.active)}
                        className={clsx(
                          'text-xs px-3 py-1.5 rounded-lg border font-semibold transition-all',
                          u.active
                            ? 'border-red-200 text-red-600 hover:bg-red-50'
                            : 'border-green-200 text-green-600 hover:bg-green-50',
                        )}
                      >
                        {u.active ? 'Deactivate' : 'Reactivate'}
                      </button>
                      <button
                        onClick={() => handleResetPassword(u)}
                        title="Reset password"
                        className="p-1.5 rounded text-gray-300 hover:text-orange-500 hover:bg-orange-50 transition-all"
                      >
                        <KeyRound size={13} />
                      </button>
                      {u.id !== currentUser?.id && (
                        <button
                          onClick={() => setConfirmDelete(u)}
                          title="Delete user"
                          className="p-1.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 transition-all"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        onClick={() => navigate(`/history?user=${encodeURIComponent(u.name)}`)}
                        title="View change history"
                        className="p-1.5 rounded text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-all"
                      >
                        <Clock size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Show Deleted Users Toggle */}
      <div className="mt-6">
        <button
          onClick={handleToggleDeleted}
          className="flex items-center gap-2 text-sm font-semibold text-gray-400 hover:text-gray-600 transition-all"
        >
          {showDeleted ? <EyeOff size={14} /> : <Eye size={14} />}
          {showDeleted ? 'Hide Deleted Users' : 'Show Deleted Users'}
        </button>

        {showDeleted && (
          <div className="brand-card p-0 overflow-hidden mt-3 border border-red-100">
            {loadingDeleted ? (
              <div className="py-8 text-center text-sm text-gray-400">Loading deleted users...</div>
            ) : deletedUsers.length === 0 ? (
              <div className="py-8 text-center text-sm text-gray-400">No deleted users found.</div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Email</th>
                    <th>Role</th>
                    <th>Deleted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {deletedUsers.map(u => (
                    <tr key={u.id} className="opacity-50">
                      <td>
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 bg-gray-400"
                          >
                            {u.name?.[0] || '?'}
                          </div>
                          <div className="font-semibold text-sm">{u.name}</div>
                        </div>
                      </td>
                      <td className="text-sm text-gray-500">{u.email}</td>
                      <td>
                        <span className={clsx('badge text-xs border font-semibold', ROLE_STYLES[u.role] ?? ROLE_STYLES.Viewer)}>
                          {u.role}
                        </span>
                      </td>
                      <td className="text-xs text-gray-400">{u.deleted_at ? new Date(u.deleted_at).toLocaleDateString() : ''}</td>
                      <td>
                        <button
                          onClick={() => handleRestoreUser(u)}
                          className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 font-semibold transition-all"
                        >
                          <RotateCcw size={12} />
                          Restore
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── GROUPS TAB ──────────────────────────────────────────────────────────────

const EMPTY_GROUP = { name: '', description: '', role: 'Editor', members: [], page_access: [] };

const ALL_PAGES = [
  { to: '/',               label: 'Productions' },
  { to: '/links',          label: 'Links' },
  { to: '/contracts',      label: 'Contracts' },
  { to: '/suppliers',      label: 'Suppliers' },
  { to: '/studio-tickets', label: 'Studio' },
  { to: '/gantts',         label: 'Gantts' },
  { to: '/call-sheets',    label: 'Call Sheets' },
  { to: '/financial',      label: 'Financial' },
  { to: '/accounting',     label: 'Accounting' },
  { to: '/invoices',       label: 'Invoices' },
  { to: '/history',        label: 'History' },
  { to: '/casting-rights', label: 'Casting' },
  { to: '/scripts',        label: 'Scripts' },
  { to: '/manual',         label: 'Manual' },
];

function GroupsTab() {
  const [groups, setGroups] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [editData, setEditData] = useState(null);
  const [showNew, setShowNew] = useState(false);
  const [newData, setNewData] = useState(EMPTY_GROUP);
  const [allUsers, setAllUsers] = useState([]);

  useEffect(() => {
    refresh();
    if (!IS_DEV) apiGet('/users').then(u => setAllUsers(Array.isArray(u) ? u : [])).catch(() => {});
    else setAllUsers(SAMPLE_USERS);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function refresh() {
    const g = IS_DEV ? await Promise.resolve(getGroups()) : await apiGet('/groups').catch(() => []);
    setGroups(Array.isArray(g) ? g : []);
  }

  async function handleCreate(e) {
    e.preventDefault();
    if (!newData.name.trim()) return;
    if (IS_DEV) createGroup(newData);
    else await apiPost('/groups', newData).catch(() => {});
    await refresh();
    setShowNew(false);
    setNewData(EMPTY_GROUP);
  }

  async function handleEdit(e) {
    e.preventDefault();
    if (IS_DEV) updateGroup(editId, editData);
    else await apiPatch(`/groups/${editId}`, editData).catch(() => {});
    await refresh();
    setEditId(null);
  }

  async function handleDelete(id) {
    if (IS_DEV) deleteGroup(id);
    else await apiDelete(`/groups/${id}`).catch(() => {});
    await refresh();
    if (expandedId === id) setExpandedId(null);
  }

  function toggleMember(data, setData, userId) {
    setData(d => ({
      ...d,
      members: d.members.includes(userId)
        ? d.members.filter(id => id !== userId)
        : [...d.members, userId],
    }));
  }

  function startEdit(group) {
    setEditId(group.id);
    setEditData({ name: group.name, description: group.description ?? '', role: group.role, members: [...(group.members || [])], page_access: [...(group.page_access || [])] });
    setExpandedId(null);
  }

  function memberAvatars(memberIds) {
    return memberIds.map(id => allUsers.find(u => u.id === id)).filter(Boolean);
  }

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button className="btn-cta flex items-center gap-2" onClick={() => { setShowNew(true); setEditId(null); }}>
          <Plus size={14} />
          New Group
        </button>
      </div>

      <div className="brand-card p-0 overflow-hidden">
        <table className="data-table">
          <thead>
            <tr>
              <th>Group</th>
              <th>Role</th>
              <th>Members</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {groups.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center py-8 text-gray-400 text-sm">
                  No groups yet. Create one to assign shared privileges.
                </td>
              </tr>
            )}
            {groups.map(group => (
              <>
                <tr
                  key={group.id}
                  className={clsx('cursor-pointer', expandedId === group.id && 'bg-gray-50')}
                  onClick={() => setExpandedId(id => id === group.id ? null : group.id)}
                >
                  <td>
                    <div>
                      <div className="font-semibold text-sm">{group.name}</div>
                      {group.description && <div className="text-xs text-gray-400">{group.description}</div>}
                    </div>
                  </td>
                  <td>
                    <span className={clsx('badge text-xs border font-semibold', ROLE_STYLES[group.role] ?? ROLE_STYLES.Viewer)}>
                      {group.role}
                    </span>
                  </td>
                  <td>
                    <div className="flex items-center gap-1">
                      {memberAvatars(group.members).slice(0, 4).map(u => (
                        <div
                          key={u.id}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0"
                          style={{ background: 'var(--brand-accent)' }}
                          title={u.name}
                        >
                          {u.name?.[0] || '?'}
                        </div>
                      ))}
                      {group.members.length > 4 && (
                        <span className="text-xs text-gray-400">+{group.members.length - 4}</span>
                      )}
                      {group.members.length === 0 && (
                        <span className="text-xs text-gray-400">No members</span>
                      )}
                    </div>
                  </td>
                  <td onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => startEdit(group)}
                        className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
                        title="Edit"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={() => handleDelete(group.id)}
                        className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-600"
                        title="Delete"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>

                {/* Expanded member list */}
                {expandedId === group.id && (
                  <tr key={`${group.id}-exp`}>
                    <td colSpan={4} className="py-3 px-5 bg-gray-50">
                      <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Members</div>
                      {group.members.length === 0 ? (
                        <p className="text-sm text-gray-400">No members assigned.</p>
                      ) : (
                        <div className="flex flex-wrap gap-2">
                          {memberAvatars(group.members).map(u => (
                            <span
                              key={u.id}
                              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium bg-white border border-gray-200 text-gray-700"
                            >
                              <span
                                className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                                style={{ background: 'var(--brand-accent)' }}
                              >
                                {u.name?.[0]}
                              </span>
                              {u.name}
                            </span>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                )}

                {/* Inline edit row */}
                {editId === group.id && (
                  <tr key={`${group.id}-edit`}>
                    <td colSpan={4} className="p-4 bg-blue-50/40">
                      <GroupForm
                        data={editData}
                        setData={setEditData}
                        allUsers={allUsers}
                        onSubmit={handleEdit}
                        onCancel={() => setEditId(null)}
                        submitLabel="Save Changes"
                        toggleMember={(uid) => toggleMember(editData, setEditData, uid)}
                      />
                    </td>
                  </tr>
                )}
              </>
            ))}

            {/* New group row */}
            {showNew && (
              <tr>
                <td colSpan={4} className="p-4 bg-green-50/30">
                  <GroupForm
                    data={newData}
                    setData={setNewData}
                    allUsers={allUsers}
                    onSubmit={handleCreate}
                    onCancel={() => { setShowNew(false); setNewData(EMPTY_GROUP); }}
                    submitLabel="Create Group"
                    toggleMember={(uid) => toggleMember(newData, setNewData, uid)}
                  />
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GroupForm({ data, setData, allUsers, onSubmit, onCancel, submitLabel, toggleMember }) {
  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Group Name</label>
          <input
            className="brand-input text-sm"
            value={data.name}
            onChange={e => setData(d => ({ ...d, name: e.target.value }))}
            placeholder="e.g. Finance Team"
            required
            autoFocus
          />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Role</label>
          <select
            className="brand-input text-sm"
            value={data.role}
            onChange={e => setData(d => ({ ...d, role: e.target.value }))}
          >
            {ROLES.map(r => <option key={r}>{r}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Description</label>
          <input
            className="brand-input text-sm"
            value={data.description}
            onChange={e => setData(d => ({ ...d, description: e.target.value }))}
            placeholder="Optional"
          />
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Members</label>
        <div className="flex flex-wrap gap-2">
          {allUsers.map(u => {
            const selected = data.members.includes(u.id);
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => toggleMember(u.id)}
                className={clsx(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  selected
                    ? 'bg-blue-100 border-blue-300 text-blue-800'
                    : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300',
                )}
              >
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[9px] font-bold"
                  style={{ background: selected ? '#3b82f6' : 'var(--brand-accent)' }}
                >
                  {u.name?.[0]}
                </span>
                {u.name}
                {selected && <X size={10} />}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
          Page Access
          <span className="ml-1 text-gray-400 normal-case font-normal">(leave all unchecked = full access)</span>
        </label>
        <div className="flex flex-wrap gap-2">
          {ALL_PAGES.map(p => {
            const checked = (data.page_access || []).includes(p.to);
            return (
              <button
                key={p.to}
                type="button"
                onClick={() => setData(d => ({
                  ...d,
                  page_access: checked
                    ? (d.page_access || []).filter(x => x !== p.to)
                    : [...(d.page_access || []), p.to],
                }))}
                className={clsx(
                  'px-2.5 py-1 rounded-full text-xs font-medium border transition-all',
                  checked
                    ? 'bg-indigo-100 border-indigo-300 text-indigo-800'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300',
                )}
              >
                {p.label}
                {checked && <Check size={9} className="inline ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">Cancel</button>
        <button type="submit" className="btn-cta text-sm">{submitLabel}</button>
      </div>
    </form>
  );
}

// ─── PAGE ─────────────────────────────────────────────────────────────────────

export default function Users() {
  const [tab, setTab] = useState('users');

  return (
    <div className="animate-fade-in">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-black brand-title" style={{ color: 'var(--brand-primary)' }}>
          Users
        </h1>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {[
          { id: 'users', label: 'Users', icon: UserPlus },
          { id: 'groups', label: 'Groups', icon: Users2 },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === t.id
                ? 'border-current text-gray-900'
                : 'border-transparent text-gray-400 hover:text-gray-600',
            )}
            style={tab === t.id ? { borderColor: 'var(--brand-primary)', color: 'var(--brand-primary)' } : {}}
          >
            <t.icon size={14} />
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'users' ? <UsersTab /> : <GroupsTab />}
    </div>
  );
}
