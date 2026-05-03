import { useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { Bell, RefreshCw, LogOut, ChevronDown, User as UserIcon, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';

interface HeaderProps {
  title: string;
}

export default function Header({ title }: HeaderProps) {
  const { sidebarCollapsed, isSyncing, currentUser, setCurrentUser, contents } = useAppStore();
  const pendingCount = contents.filter(c => c.status === 'Chờ duyệt').length;
  const [open, setOpen] = useState(false);

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

        <button className="notification-btn" title="Thông báo">
          <Bell size={18} />
          {pendingCount > 0 && <span className="badge">{pendingCount}</span>}
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
    </header>
  );
}
