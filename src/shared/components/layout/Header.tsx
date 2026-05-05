import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { Bell, RefreshCw, LogOut, ChevronDown, User as UserIcon, ShieldCheck, X, Clock, AlertTriangle, CheckCircle } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtDate(d?: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate + 'T23:59:59') < new Date();
}

function isDueSoon(dueDate?: string) {
  if (!dueDate) return false;
  const d = new Date(dueDate + 'T23:59:59');
  const now = new Date();
  if (d < now) return false;
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60);
  return diff <= 48; // trong vòng 48 giờ
}

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { sidebarCollapsed, isSyncing, currentUser, setCurrentUser, todos, updateTodo } = useAppStore();

  // ── 1) Nhóm "Được phân công" ─────────────────────────────────────────
  // Các todo mà người khác tạo và gán assigneeName = mình, mình chưa bấm "Đã hiểu"
  const assignedToMe = useMemo(() => {
    if (!currentUser) return [];
    return todos.filter(t =>
      t.assigneeName === currentUser.name &&
      t.ownerName !== currentUser.name &&
      !t.acknowledged
    );
  }, [todos, currentUser]);

  // ── 2) Nhóm "Nhắc nhở deadline" ─────────────────────────────────────
  // Các todo (của mình hoặc được assign) chưa xong, quá hạn hoặc sắp đến hạn
  const deadlineReminders = useMemo(() => {
    if (!currentUser) return [];
    return todos.filter(t => {
      const isMine = t.ownerName === currentUser.name || t.assigneeName === currentUser.name;
      if (!isMine || t.completed || !t.dueDate) return false;
      return isOverdue(t.dueDate) || isDueSoon(t.dueDate);
    });
  }, [todos, currentUser]);

  const totalNoti = assignedToMe.length + deadlineReminders.length;

  const [open, setOpen] = useState(false);
  const [showNotifPopup, setShowNotifPopup] = useState(false);

  const getInitials = (name: string) => {
    return name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
  };

  const handleLogout = () => {
    if (window.confirm('Bạn có chắc muốn đăng xuất?')) {
      setCurrentUser(null);
      toast.success('Đã đăng xuất');
      window.location.href = '/';
    }
  };

  return (
    <header className={`app-header ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <div className="header-left">
        <h1 className="header-title">{title}</h1>
      </div>

      <div className="header-right">
        <div className={`sync-indicator ${isSyncing ? 'syncing' : ''}`}>
          <span className="dot"></span>
          {isSyncing ? (
            <>
              <RefreshCw size={12} style={{ animation: 'spin 1s linear infinite' }} />
              <span>Đang sync...</span>
            </>
          ) : (
            <span>Sẵn sàng</span>
          )}
        </div>

        <button className="notification-btn" title="Thông báo" onClick={() => setShowNotifPopup(true)}>
          <Bell size={18} />
          {totalNoti > 0 && <span className="badge">{totalNoti}</span>}
        </button>

        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setOpen(o => !o)}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '6px 10px', border: '1px solid var(--border-light)',
              borderRadius: 'var(--radius-full)', cursor: 'pointer',
              background: 'var(--bg-card)',
            }}
            title={currentUser?.name}
          >
            <div className="user-avatar" style={{ width: 32, height: 32, fontSize: '0.78rem' }}>
              {currentUser ? getInitials(currentUser.name) : '?'}
            </div>
            <div style={{ textAlign: 'left', lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{currentUser?.name ?? 'Khách'}</div>
              <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>{currentUser?.role ?? '—'}</div>
            </div>
            <ChevronDown size={14} color="var(--text-tertiary)" />
          </button>

          {open && (
            <div
              onMouseLeave={() => setOpen(false)}
              style={{
                position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 50,
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)',
                minWidth: 220, padding: '8px',
              }}
            >
              <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border-light)' }}>
                <div style={{ fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserIcon size={14} color="var(--primary-500)" /> {currentUser?.name}
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginTop: '2px' }}>
                  {currentUser?.email ?? '—'}
                </div>
                <div style={{ marginTop: '6px', display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '2px 8px', background: 'var(--primary-50)', color: 'var(--primary-700)',
                              borderRadius: 'var(--radius-full)', fontSize: '0.72rem', fontWeight: 600 }}>
                  <ShieldCheck size={11} /> {currentUser?.role}
                </div>
              </div>
              <button
                onClick={handleLogout}
                style={{
                  width: '100%', padding: '10px 12px', border: 'none',
                  background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  display: 'flex', alignItems: 'center', gap: '8px',
                  color: 'var(--danger)', fontSize: '0.85rem', borderRadius: 'var(--radius-sm)',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--danger-bg)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={14} /> Đăng xuất
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Notification Popup ───────────────────────────────────────── */}
      {showNotifPopup && (
        <div className="modal-overlay" onClick={() => setShowNotifPopup(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} color="var(--primary-500)" />
                Thông báo {totalNoti > 0 && `(${totalNoti})`}
              </h3>
              <button className="modal-close" onClick={() => setShowNotifPopup(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '460px', overflowY: 'auto' }}>
              {totalNoti === 0 && (
                <div style={{ padding: '30px 20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                  <CheckCircle size={36} style={{ opacity: 0.3, marginBottom: 8 }} />
                  <div>Bạn không có thông báo mới.</div>
                </div>
              )}

              {/* ── Nhóm 1: Được phân công ──────────────────────────── */}
              {assignedToMe.length > 0 && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{
                    fontSize: '0.74rem', fontWeight: 700, color: 'var(--primary-600)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <UserIcon size={13} /> Được phân công ({assignedToMe.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {assignedToMe.map(t => {
                      const overdue = isOverdue(t.dueDate);
                      return (
                        <div key={t.id} style={{
                          padding: '10px 12px',
                          border: '1px solid var(--border-light)',
                          borderLeft: `4px solid var(--primary-500)`,
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-secondary)',
                        }}>
                          <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '3px' }}>{t.title}</div>
                          {t.description && (
                            <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{t.description}</div>
                          )}
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.72rem' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>
                              👤 Giao bởi: <strong>{t.ownerName}</strong>
                            </span>
                            {t.dueDate && (
                              <span style={{
                                color: overdue ? 'var(--danger)' : 'var(--text-tertiary)',
                                fontWeight: overdue ? 600 : 400,
                              }}>
                                <Clock size={11} style={{ verticalAlign: 'middle' }} />{' '}
                                {overdue ? '⚠️ Quá hạn: ' : '📅 '}{fmtDate(t.dueDate)}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* ── Nhóm 2: Nhắc nhở deadline ──────────────────────── */}
              {deadlineReminders.length > 0 && (
                <div>
                  <div style={{
                    fontSize: '0.74rem', fontWeight: 700, color: 'var(--warning)',
                    textTransform: 'uppercase', letterSpacing: '0.05em',
                    marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px',
                  }}>
                    <AlertTriangle size={13} /> Nhắc nhở deadline ({deadlineReminders.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {deadlineReminders.map(t => {
                      const overdue = isOverdue(t.dueDate);
                      const dueSoon = isDueSoon(t.dueDate);
                      const borderColor = overdue ? 'var(--danger)' : 'var(--warning)';
                      return (
                        <div key={t.id} style={{
                          padding: '10px 12px',
                          border: '1px solid var(--border-light)',
                          borderLeft: `4px solid ${borderColor}`,
                          borderRadius: 'var(--radius-md)',
                          background: 'var(--bg-secondary)',
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                            <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.title}</div>
                            <span style={{
                              fontSize: '0.68rem', fontWeight: 700, padding: '1px 8px',
                              borderRadius: 'var(--radius-full)',
                              background: overdue ? '#FEE2E2' : '#FEF3C7',
                              color: overdue ? '#DC2626' : '#D97706',
                              whiteSpace: 'nowrap', marginLeft: '8px',
                            }}>
                              {overdue ? '⚠️ Quá hạn' : dueSoon ? '⏰ Sắp hạn' : ''}
                            </span>
                          </div>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', fontSize: '0.72rem', marginTop: '4px' }}>
                            <span style={{ color: overdue ? 'var(--danger)' : 'var(--text-tertiary)', fontWeight: 600 }}>
                              <Clock size={11} style={{ verticalAlign: 'middle' }} />{' '}
                              Hạn: {fmtDate(t.dueDate)}
                            </span>
                            {t.assigneeName && t.ownerName !== currentUser?.name && (
                              <span style={{ color: 'var(--text-tertiary)' }}>
                                👤 Giao bởi: {t.ownerName}
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer" style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
              {assignedToMe.length > 0 && (
                <button className="btn btn-primary" onClick={() => {
                  assignedToMe.forEach(t => {
                    if (!t.acknowledged) updateTodo(t.id, { acknowledged: true });
                  });
                  setShowNotifPopup(false);
                  toast.success(`Đã xác nhận ${assignedToMe.length} công việc`);
                }}>✅ Đã hiểu ({assignedToMe.length})</button>
              )}
              {assignedToMe.length === 0 && (
                <button className="btn btn-secondary" onClick={() => setShowNotifPopup(false)}>Đóng</button>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
