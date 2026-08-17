import { useState, useEffect, useContext, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';
import { API_URL } from '../config';
import { AuthContext } from '../context/AuthContext';
import {
  ShieldAlert,
  Users,
  Activity,
  Loader2,
  LogOut,
  RefreshCw,
  Trash2,
  KeyRound,
  Ban,
  CheckCircle2,
  Monitor,
  Smartphone,
  Tablet,
  Globe,
  ChevronDown,
  ChevronUp,
  Crown,
  FileText,
  Cpu
} from 'lucide-react';

const SYS = `${API_URL}/api/system`;

const formatDate = value => {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

const locationText = location => {
  const parts = [location?.city, location?.region, location?.country]
    .map(part => String(part || '').trim());
  const unique = parts.filter((part, index) => part && parts.indexOf(part) === index);
  return unique.length ? unique.join(', ') : 'Unknown location';
};

const DeviceIcon = ({ type }) => {
  if (type === 'Mobile') return <Smartphone className="w-4 h-4" />;
  if (type === 'Tablet') return <Tablet className="w-4 h-4" />;
  return <Monitor className="w-4 h-4" />;
};

const RoleBadge = ({ role }) => {
  if (role === 'superadmin') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/30">
        <Crown className="w-3 h-3" /> SUPER
      </span>
    );
  }
  if (role === 'admin') {
    return (
      <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-300 border border-amber-500/30">
        ADMIN
      </span>
    );
  }
  return (
    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-700/40 text-slate-300 border border-slate-600/40">
      USER
    </span>
  );
};

// Tailwind only compiles class names it can see literally, so tones map to
// full class strings instead of being interpolated.
const STAT_TONES = {
  cyan: 'p-2.5 rounded-xl bg-cyan-500/10 text-cyan-400',
  emerald: 'p-2.5 rounded-xl bg-emerald-500/10 text-emerald-400',
  indigo: 'p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400',
  fuchsia: 'p-2.5 rounded-xl bg-fuchsia-500/10 text-fuchsia-400'
};

const StatCard = ({ icon: Icon, label, value, tone = 'cyan' }) => (
  <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center gap-4">
    <div className={STAT_TONES[tone] || STAT_TONES.cyan}>
      <Icon className="w-5 h-5" />
    </div>
    <div>
      <p className="text-2xl font-black text-white leading-tight">{value ?? '—'}</p>
      <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">{label}</p>
    </div>
  </div>
);

const SessionRow = ({ session, showUser, onRevoke, busy }) => (
  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 bg-slate-950/60 border border-slate-800/70 rounded-xl px-4 py-3 text-sm">
    <div className="flex items-center gap-2 text-slate-200 min-w-[180px]">
      <span className={session.active ? 'text-emerald-400' : 'text-slate-600'}>
        <DeviceIcon type={session.deviceType} />
      </span>
      <div>
        <p className="font-semibold">
          {session.browser || 'Unknown browser'}
          <span className="text-slate-500 font-normal"> · {session.os || 'Unknown OS'}</span>
        </p>
        {showUser && session.user && (
          <p className="text-xs text-slate-500">{session.user.name} · {session.user.email}</p>
        )}
      </div>
    </div>

    <div className="flex items-center gap-1.5 text-slate-400 min-w-[160px]">
      <Globe className="w-3.5 h-3.5 text-cyan-500" />
      <div>
        <p className="text-slate-300">{locationText(session.location)}</p>
        <p className="text-xs text-slate-500 font-mono">{session.ip || 'unknown IP'}</p>
      </div>
    </div>

    <div className="text-xs text-slate-500 min-w-[150px]">
      <p>Signed in: <span className="text-slate-400">{formatDate(session.createdAt)}</span></p>
      <p>Last seen: <span className="text-slate-400">{formatDate(session.lastSeenAt)}</span></p>
    </div>

    <div className="ml-auto flex items-center gap-3">
      {session.active ? (
        <>
          <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> ACTIVE
          </span>
          <button
            onClick={() => onRevoke(session)}
            disabled={busy}
            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-40"
          >
            Log out device
          </button>
        </>
      ) : (
        <span className="text-[11px] font-bold text-slate-600 uppercase">
          Ended{session.revokedBy ? ` · ${session.revokedBy}` : ''}
        </span>
      )}
    </div>
  </div>
);

export default function SystemConsole() {
  const { user, loading, logout } = useContext(AuthContext);

  const [tab, setTab] = useState('users');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [userSessions, setUserSessions] = useState({});
  const [expandedUser, setExpandedUser] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [passwordTarget, setPasswordTarget] = useState(null);
  const [newPassword, setNewPassword] = useState('');

  const isSuperAdmin = user?.role === 'superadmin';

  const flash = (text, isError = false) => {
    setNotice({ text, isError });
    setTimeout(() => setNotice(null), 5000);
  };

  const refresh = useCallback(async () => {
    setFetching(true);
    try {
      const [overviewRes, usersRes, sessionsRes] = await Promise.all([
        axios.get(`${SYS}/overview`),
        axios.get(`${SYS}/users`),
        axios.get(`${SYS}/sessions`)
      ]);
      setOverview(overviewRes.data);
      setUsers(usersRes.data);
      setActiveSessions(sessionsRes.data);
    } catch (error) {
      flash(error.response?.data?.message || 'Failed to load system data.', true);
    } finally {
      setFetching(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) refresh();
  }, [isSuperAdmin, refresh]);

  const loadUserSessions = async userId => {
    try {
      const { data } = await axios.get(`${SYS}/users/${userId}/sessions`);
      setUserSessions(prev => ({ ...prev, [userId]: data }));
    } catch (error) {
      flash(error.response?.data?.message || 'Failed to load sessions.', true);
    }
  };

  const toggleExpand = userId => {
    if (expandedUser === userId) {
      setExpandedUser(null);
      return;
    }
    setExpandedUser(userId);
    loadUserSessions(userId);
  };

  const runAction = async (action, successRefreshUser = null) => {
    setBusy(true);
    try {
      const { data } = await action();
      if (data?.message) flash(data.message);
      await refresh();
      if (successRefreshUser) await loadUserSessions(successRefreshUser);
    } catch (error) {
      flash(error.response?.data?.message || 'Action failed.', true);
    } finally {
      setBusy(false);
    }
  };

  const revokeSession = session => {
    runAction(
      () => axios.delete(`${SYS}/sessions/${session._id}`),
      expandedUser
    );
  };

  const logoutEverywhere = target => {
    if (!window.confirm(`Log ${target.email} out of ALL devices?`)) return;
    runAction(() => axios.post(`${SYS}/users/${target._id}/logout`), target._id);
  };

  const toggleStatus = target => {
    const disabling = target.status !== 'disabled';
    if (
      disabling &&
      !window.confirm(`Disable ${target.email}? They will be logged out everywhere and unable to log in.`)
    ) return;
    runAction(() =>
      axios.patch(`${SYS}/users/${target._id}/status`, {
        status: disabling ? 'disabled' : 'active'
      })
    );
  };

  const toggleRole = target => {
    const promote = target.role !== 'admin';
    if (!window.confirm(`Make ${target.email} ${promote ? 'an ADMIN' : 'a regular USER'}?`)) return;
    runAction(() =>
      axios.patch(`${SYS}/users/${target._id}/role`, {
        role: promote ? 'admin' : 'user'
      })
    );
  };

  const deleteUser = target => {
    if (!window.confirm(`PERMANENTLY delete ${target.email} and ALL their data (profile, applications, logs)? This cannot be undone.`)) return;
    runAction(() => axios.delete(`${SYS}/users/${target._id}`));
  };

  const submitPassword = () => {
    if (newPassword.length < 6) {
      flash('Password must be at least 6 characters.', true);
      return;
    }
    const target = passwordTarget;
    setPasswordTarget(null);
    setNewPassword('');
    runAction(() =>
      axios.patch(`${SYS}/users/${target._id}/password`, { password: newPassword })
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-10 h-10 text-fuchsia-500 animate-spin" />
      </div>
    );
  }

  // Anyone who is not the super admin gets silently bounced to the normal app.
  if (!user || !isSuperAdmin) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans pb-16">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/60 backdrop-blur sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-fuchsia-500/15 text-fuchsia-400 border border-fuchsia-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-lg font-black text-white leading-tight">System Console</h1>
              <p className="text-[11px] uppercase tracking-widest text-slate-500 font-semibold">
                Restricted · {user.email}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              disabled={fetching}
              className="p-2.5 rounded-xl bg-slate-800/70 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-40"
              title="Refresh"
            >
              <RefreshCw className={`w-4 h-4 ${fetching ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={logout}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/70 hover:bg-red-500/20 hover:text-red-400 text-slate-300 text-sm font-bold transition-colors"
            >
              <LogOut className="w-4 h-4" /> Exit
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-4 mt-6 space-y-6">
        {notice && (
          <div
            className={`px-4 py-3 rounded-xl text-sm font-semibold border ${
              notice.isError
                ? 'bg-red-500/10 border-red-500/30 text-red-400'
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
            }`}
          >
            {notice.text}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard icon={Users} label="Accounts" value={overview?.totals?.users} tone="cyan" />
          <StatCard icon={Activity} label="Live sessions" value={overview?.totals?.activeSessions} tone="emerald" />
          <StatCard icon={FileText} label="Applications" value={overview?.totals?.applications} tone="indigo" />
          <StatCard icon={Cpu} label="AI calls" value={overview?.totals?.aiCalls} tone="fuchsia" />
        </div>

        {/* Tabs */}
        <div className="flex gap-2">
          {[
            ['users', 'Users & control'],
            ['sessions', 'Live sessions'],
            ['logins', 'Recent logins']
          ].map(([key, label]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-colors ${
                tab === key
                  ? 'bg-fuchsia-500/15 text-fuchsia-300 border border-fuchsia-500/40'
                  : 'bg-slate-900/60 text-slate-400 border border-slate-800 hover:text-slate-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* USERS TAB */}
        {tab === 'users' && (
          <div className="space-y-3">
            {users.map(item => {
              const isSelf = String(item._id) === String(user._id);
              const disabled = item.status === 'disabled';
              const expanded = expandedUser === item._id;
              const isTargetSuper = item.role === 'superadmin';

              return (
                <div
                  key={item._id}
                  className={`rounded-2xl border ${
                    disabled
                      ? 'border-red-500/30 bg-red-500/[0.03]'
                      : 'border-slate-800 bg-slate-900/40'
                  }`}
                >
                  <div className="p-4 flex flex-wrap items-center gap-x-4 gap-y-3">
                    <div className="min-w-[220px]">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-white">{item.name}</p>
                        <RoleBadge role={item.role} />
                        {disabled && (
                          <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/15 text-red-400 border border-red-500/30">
                            DISABLED
                          </span>
                        )}
                        {isSelf && (
                          <span className="text-[11px] text-slate-500 font-bold">(you)</span>
                        )}
                      </div>
                      <p className="text-sm text-slate-400">{item.email}</p>
                    </div>

                    <div className="text-xs text-slate-500">
                      <p>Joined: <span className="text-slate-400">{formatDate(item.createdAt)}</span></p>
                      <p>Last login: <span className="text-slate-400">{formatDate(item.lastLoginAt)}</span></p>
                    </div>

                    <button
                      onClick={() => toggleExpand(item._id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-cyan-300 hover:bg-slate-700 transition-colors"
                    >
                      <Activity className="w-3.5 h-3.5" />
                      {item.activeSessions} device{item.activeSessions === 1 ? '' : 's'}
                      {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                    </button>

                    <div className="ml-auto flex flex-wrap items-center gap-2">
                      <button
                        onClick={() => logoutEverywhere(item)}
                        disabled={busy || item.activeSessions === 0}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-slate-300 hover:bg-slate-700 transition-colors disabled:opacity-30"
                        title="Log out of all devices"
                      >
                        <LogOut className="w-3.5 h-3.5 inline mr-1" />Logout all
                      </button>

                      <button
                        onClick={() => setPasswordTarget(item)}
                        disabled={busy || (isTargetSuper && !isSelf)}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-amber-300 hover:bg-slate-700 transition-colors disabled:opacity-30"
                        title="Set a new password"
                      >
                        <KeyRound className="w-3.5 h-3.5 inline mr-1" />Password
                      </button>

                      {!isTargetSuper && (
                        <>
                          <button
                            onClick={() => toggleRole(item)}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-800/70 text-indigo-300 hover:bg-slate-700 transition-colors disabled:opacity-30"
                          >
                            <Crown className="w-3.5 h-3.5 inline mr-1" />
                            {item.role === 'admin' ? 'Demote' : 'Make admin'}
                          </button>

                          <button
                            onClick={() => toggleStatus(item)}
                            disabled={busy}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors disabled:opacity-30 ${
                              disabled
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/20'
                                : 'bg-slate-800/70 text-orange-300 hover:bg-slate-700'
                            }`}
                          >
                            {disabled ? (
                              <><CheckCircle2 className="w-3.5 h-3.5 inline mr-1" />Enable</>
                            ) : (
                              <><Ban className="w-3.5 h-3.5 inline mr-1" />Disable</>
                            )}
                          </button>

                          <button
                            onClick={() => deleteUser(item)}
                            disabled={busy}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 transition-colors disabled:opacity-30"
                          >
                            <Trash2 className="w-3.5 h-3.5 inline mr-1" />Delete
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {expanded && (
                    <div className="px-4 pb-4 space-y-2">
                      <p className="text-[11px] uppercase tracking-widest text-slate-500 font-bold">
                        Login history (newest first)
                      </p>
                      {(userSessions[item._id] || []).length === 0 ? (
                        <p className="text-sm text-slate-500">No sessions recorded yet.</p>
                      ) : (
                        userSessions[item._id].map(session => (
                          <SessionRow
                            key={session._id}
                            session={session}
                            showUser={false}
                            onRevoke={revokeSession}
                            busy={busy}
                          />
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {!fetching && users.length === 0 && (
              <p className="text-slate-500 text-sm">No users found.</p>
            )}
          </div>
        )}

        {/* LIVE SESSIONS TAB */}
        {tab === 'sessions' && (
          <div className="space-y-2">
            {activeSessions.length === 0 ? (
              <p className="text-slate-500 text-sm">No live sessions right now.</p>
            ) : (
              activeSessions.map(session => (
                <SessionRow
                  key={session._id}
                  session={session}
                  showUser
                  onRevoke={revokeSession}
                  busy={busy}
                />
              ))
            )}
          </div>
        )}

        {/* RECENT LOGINS TAB */}
        {tab === 'logins' && (
          <div className="space-y-2">
            {(overview?.recentLogins || []).length === 0 ? (
              <p className="text-slate-500 text-sm">No logins recorded yet.</p>
            ) : (
              overview.recentLogins.map(session => (
                <SessionRow
                  key={session._id}
                  session={session}
                  showUser
                  onRevoke={revokeSession}
                  busy={busy}
                />
              ))
            )}
          </div>
        )}
      </div>

      {/* PASSWORD MODAL */}
      {passwordTarget && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-4">
            <div className="flex items-center gap-3">
              <KeyRound className="w-5 h-5 text-amber-400" />
              <h3 className="font-bold text-white">Set new password</h3>
            </div>
            <p className="text-sm text-slate-400">
              {passwordTarget.email} will be logged out of every device.
            </p>
            <input
              type="text"
              value={newPassword}
              onChange={event => setNewPassword(event.target.value)}
              placeholder="New password (min 6 characters)"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-4 py-3 text-slate-100 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => { setPasswordTarget(null); setNewPassword(''); }}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={submitPassword}
                disabled={busy}
                className="px-4 py-2 rounded-xl text-sm font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors disabled:opacity-40"
              >
                Update password
              </button>
            </div>
          </div>
        </div>
      )}

      {fetching && (
        <div className="fixed bottom-6 right-6 bg-slate-900 border border-slate-700 rounded-full p-3">
          <Loader2 className="w-5 h-5 text-fuchsia-400 animate-spin" />
        </div>
      )}

    </div>
  );
}
