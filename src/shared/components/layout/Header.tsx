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

  // ── 1) Tất cả task được giao bởi người khác (cả đã đọc và chưa đọc) ──
  const allAssigned = useMemo(() => {
    if (!currentUser) return [];
    return todos.filter(t =>
      t.assigneeName === currentUser.name &&
      t.ownerName !== currentUser.name &&
      !t.completed
    );
  }, [todos, currentUser]);

  const unreadAssigned = allAssigned.filter(t => !t.acknowledged);

  // ── 2) Nhắc nhở deadline ─────────────────────────────────────
  const deadlineReminders = useMemo(() => {
    if (!currentUser) return [];
    return todos.filter(t => {
      const isMine = t.ownerName === currentUser.name || t.assigneeName === currentUser.name;
      if (!isMine || t.completed || !t.dueDate) return false;
      return isOverdue(t.dueDate) || isDueSoon(t.dueDate);
    });
  }, [todos, currentUser]);

  // Badge chỉ đếm chưa đọc
  const totalUnread = unreadAssigned.length + deadlineReminders.length;

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

        <div style={{ position: 'relative' }}>
          <button className="notification-btn" title="Thông báo" onClick={() => setShowNotifPopup(p => !p)}>
            <Bell size={18} />
            {totalUnread > 0 && <span className="badge">{totalUnread}</span>}
          </button>

          {/* ── Notification Dropdown ──────────────────────────────── */}
          {showNotifPopup && (
            <>
              {/* Backdrop ẩn để bấm ra ngoài đóng popup */}
              <div onClick={() => setShowNotifPopup(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 90 }} />

              <div style={{
                position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 100,
                width: '380px', maxHeight: '480px',
                background: 'var(--bg-card)', border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
                display: 'flex', flexDirection: 'column',
                overflow: 'hidden',
              }}>
                {/* Header */}
                <div style={{
                  padding: '12px 16px', borderBottom: '1px solid var(--border-light)',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Bell size={15} color="var(--primary-500)" />
                    Thông báo {totalUnread > 0 && <span style={{
                      fontSize: '0.68rem', background: 'var(--danger)', color: '#fff',
                      borderRadius: '50%', width: 18, height: 18,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800,
                    }}>{totalUnread}</span>}
                  </span>
                  <button onClick={() => setShowNotifPopup(false)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--text-tertiary)' }}>
                    <X size={14} />
                  </button>
                </div>

                {/* Body */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
                  {allAssigned.length === 0 && deadlineReminders.length === 0 && (
                    <div style={{ padding: '24px 12px', textAlign: 'center', color: 'var(--text-tertiary)' }}>
                      <CheckCircle size={30} style={{ opacity: 0.3, marginBottom: 6 }} />
                      <div style={{ fontSize: '0.85rem' }}>Không có thông báo nào</div>
                    </div>
                  )}

                  {/* ── Nhóm 1: Được phân công ──────────────── */}
                  {allAssigned.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{
                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--primary-600)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px',
                      }}>
                        <UserIcon size={11} /> Được phân công ({allAssigned.length})
                        {unreadAssigned.length > 0 && (
                          <span style={{ fontSize: '0.64rem', color: 'var(--danger)', fontWeight: 700 }}>
                            · {unreadAssigned.length} chưa đọc
                          </span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {allAssigned.map(t => {
                          const overdue = isOverdue(t.dueDate);
                          const isUnread = !t.acknowledged;
                          return (
                            <div key={t.id}
                              onClick={() => { if (isUnread) updateTodo(t.id, { acknowledged: true }); }}
                              style={{
                                padding: '8px 10px',
                                borderLeft: `3px solid ${isUnread ? 'var(--primary-500)' : 'var(--border-light)'}`,
                                borderRadius: 'var(--radius-sm)',
                                background: isUnread ? 'var(--primary-50)' : 'var(--bg-secondary)',
                                opacity: isUnread ? 1 : 0.7,
                                cursor: isUnread ? 'pointer' : 'default',
                                transition: 'all 0.15s ease',
                                position: 'relative',
                              }}>
                              {/* Chấm xanh cho chưa đọc */}
                              {isUnread && <div style={{
                                position: 'absolute', top: 10, right: 10,
                                width: 8, height: 8, borderRadius: '50%',
                                background: 'var(--primary-500)',
                              }} />}
                              <div style={{ fontWeight: isUnread ? 700 : 500, fontSize: '0.82rem', marginBottom: '2px',
                                paddingRight: isUnread ? '18px' : 0 }}>{t.title}</div>
                              {t.description && (
                                <div style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)', marginBottom: '3px',
                                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.description}</div>
                              )}
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.68rem', color: 'var(--text-tertiary)' }}>
                                <span>👤 {t.ownerName}</span>
                                {t.dueDate && (
                                  <span style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: overdue ? 600 : 400 }}>
                                    <Clock size={10} style={{ verticalAlign: 'middle' }} /> {overdue ? '⚠️ ' : ''}{fmtDate(t.dueDate)}
                                  </span>
                                )}
                                {!isUnread && <span style={{ fontSize: '0.64rem', color: 'var(--success)' }}>✓ Đã đọc</span>}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* ── Nhóm 2: Nhắc nhở deadline ─────────────── */}
                  {deadlineReminders.length > 0 && (
                    <div>
                      <div style={{
                        fontSize: '0.7rem', fontWeight: 700, color: 'var(--warning)',
                        textTransform: 'uppercase', letterSpacing: '0.04em',
                        marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '5px',
                      }}>
                        <AlertTriangle size={11} /> Nhắc nhở deadline ({deadlineReminders.length})
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {deadlineReminders.map(t => {
                          const overdue = isOverdue(t.dueDate);
                          const borderColor = overdue ? 'var(--danger)' : 'var(--warning)';
                          return (
                            <div key={t.id} style={{
                              padding: '8px 10px',
                              borderLeft: `3px solid ${borderColor}`,
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--bg-secondary)',
                            }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <div style={{ fontWeight: 700, fontSize: '0.82rem' }}>{t.title}</div>
                                <span style={{
                                  fontSize: '0.64rem', fontWeight: 700, padding: '1px 6px',
                                  borderRadius: 'var(--radius-full)',
                                  background: overdue ? '#FEE2E2' : '#FEF3C7',
                                  color: overdue ? '#DC2626' : '#D97706',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {overdue ? 'Quá hạn' : 'Sắp hạn'}
                                </span>
                              </div>
                              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '0.68rem', marginTop: '3px', color: 'var(--text-tertiary)' }}>
                                <span style={{ color: overdue ? 'var(--danger)' : undefined, fontWeight: 600 }}>
                                  <Clock size={10} style={{ verticalAlign: 'middle' }} /> {fmtDate(t.dueDate)}
                                </span>
                                {t.assigneeName && t.ownerName !== currentUser?.name && (
                                  <span>👤 {t.ownerName}</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {unreadAssigned.length > 0 && (
                  <div style={{
                    padding: '10px 12px', borderTop: '1px solid var(--border-light)',
                    display: 'flex', justifyContent: 'flex-end',
                  }}>
                    <button className="btn btn-primary" style={{ fontSize: '0.82rem', padding: '6px 14px' }} onClick={() => {
                      unreadAssigned.forEach(t => {
                        updateTodo(t.id, { acknowledged: true });
                      });
                      toast.success(`Đã đánh dấu đọc ${unreadAssigned.length} thông báo`);
                    }}>Đánh dấu đã đọc tất cả ({unreadAssigned.length})</button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

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
    </header>
  );
}
