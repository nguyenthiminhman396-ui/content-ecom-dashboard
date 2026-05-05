import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { Bell, RefreshCw, LogOut, ChevronDown, User as UserIcon, ShieldCheck, X, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

function fmtDate(d?: string) {
  if (!d) return '';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

const PRIORITY_META = {
  high:   { label: 'Cao',     color: '#DC2626', bg: '#FEE2E2', icon: '🔴' },
  medium: { label: 'Vừa',     color: '#D97706', bg: '#FEF3C7', icon: '🟡' },
  low:    { label: 'Thấp',    color: '#059669', bg: '#D1FAE5', icon: '⚪' },
};

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate + 'T23:59:59') < new Date();
}

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { sidebarCollapsed, isSyncing, currentUser, setCurrentUser, contents, todos, updateTodo } = useAppStore();
  const pendingCount = (currentUser?.role === 'Manager' || currentUser?.role === 'Leader') 
    ? contents.filter(c => c.status === 'Chờ duyệt').length : 0;
  
  const assignedToMe = useMemo(() => {
    if (!currentUser) return [];
    return todos.filter(t =>
      t.assigneeName === currentUser.name &&
      t.ownerName !== currentUser.name &&
      !t.acknowledged
    );
  }, [todos, currentUser]);

  const totalNoti = pendingCount + assignedToMe.length;

  const [open, setOpen] = useState(false);
  const [showNotifPopup, setShowNotifPopup] = useState(false);

  const getInitials = (name: string) => {
    return name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase();
  };

  const handleLogout = () => {
    if (window.confirm('Bạn có chắc muốn đăng xuất?')) {
      setCurrentUser(null);
      toast.success('Đã đăng xuất');
      // Reload để quay về Login
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

      {/* Thông báo Popup */}
      {showNotifPopup && (
        <div className="modal-overlay" onClick={() => setShowNotifPopup(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Bell size={18} color="var(--primary-500)" />
                Thông báo ({totalNoti})
              </h3>
              <button className="modal-close" onClick={() => setShowNotifPopup(false)}><X size={16} /></button>
            </div>
            <div className="modal-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {pendingCount > 0 && (
                  <div style={{
                    padding: '12px 14px', border: '1px solid var(--warning)',
                    borderLeft: `4px solid var(--warning)`, borderRadius: 'var(--radius-md)',
                    background: 'var(--bg-secondary)',
                  }}>
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px' }}>Sản phẩm chờ duyệt</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Có {pendingCount} sản phẩm đang chờ duyệt. Vui lòng kiểm tra trang Sản phẩm.</div>
                  </div>
                )}
                {totalNoti === 0 && (
                   <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-tertiary)' }}>Bạn không có thông báo mới.</div>
                )}
                {assignedToMe.map(t => {
                  const pm = PRIORITY_META[t.priority];
                  const overdue = isOverdue(t.dueDate);
                  return (
                    <div key={t.id} style={{
                      padding: '12px 14px',
                      border: '1px solid var(--border-light)',
                      borderLeft: `4px solid ${overdue ? 'var(--danger)' : pm.color}`,
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--bg-secondary)',
                    }}>
                      <div style={{ fontWeight: 700, fontSize: '0.92rem', marginBottom: '4px' }}>{t.title}</div>
                      {t.description && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginBottom: '4px' }}>{t.description}</div>
                      )}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', fontSize: '0.74rem' }}>
                        <span style={{ color: 'var(--text-secondary)' }}>
                          👤 Giao bởi: <strong>{t.ownerName}</strong>
                        </span>
                        <span style={{
                          padding: '1px 8px', borderRadius: 'var(--radius-full)',
                          background: pm.bg, color: pm.color, fontWeight: 600,
                        }}>
                          {pm.icon} {pm.label}
                        </span>
                        {t.dueDate && (
                          <span style={{
                            color: overdue ? 'var(--danger)' : 'var(--text-tertiary)',
                            fontWeight: overdue ? 600 : 400,
                          }}>
                            <Clock size={11} style={{ verticalAlign: 'middle' }} />{' '}
                            {overdue ? '⚠️ Quá hạn: ' : ''}{fmtDate(t.dueDate)}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-primary" onClick={() => {
                assignedToMe.forEach(t => {
                  if (!t.acknowledged) updateTodo(t.id, { acknowledged: true });
                });
                setShowNotifPopup(false);
              }}>Đã hiểu</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
