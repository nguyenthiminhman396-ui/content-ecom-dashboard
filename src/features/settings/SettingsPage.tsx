import { useState } from 'react';
import { Settings, Database, RefreshCw, User, Moon, Sun } from 'lucide-react';
import { useAppStore, initFromDB } from '@/shared/store/appStore';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { isSyncing, lastSyncTime, currentUser } = useAppStore();
  const [darkMode, setDarkMode] = useState(document.documentElement.getAttribute('data-theme') === 'dark');

  const handleSync = async () => {
    useAppStore.getState().setSyncing(true);
    try {
      await initFromDB();
      toast.success('Đồng bộ dữ liệu thành công!');
    } catch (err) {
      toast.error((err as Error).message ?? 'Lỗi đồng bộ');
    } finally {
      useAppStore.getState().setSyncing(false);
    }
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    useAppStore.getState().toggleTheme();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title"><span className="icon"><Settings size={20} /></span>Cài đặt</h2>
          <p className="page-subtitle">Quản lý tài khoản & dữ liệu</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px', maxWidth: '700px' }}>

        {/* Profile */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-100)', color: 'var(--primary-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
              {currentUser?.name?.charAt(0).toUpperCase() || <User size={22} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{currentUser?.name || 'Chưa đăng nhập'}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                {currentUser?.role || ''} {currentUser?.email ? `· ${currentUser.email}` : ''}
              </div>
            </div>
            <button onClick={toggleDarkMode} className="btn btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? 'Sáng' : 'Tối'}
            </button>
          </div>
        </div>

        {/* Database status */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)',
                background: 'var(--success-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Database size={20} color="var(--success)" />
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>Postgres Database</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  {lastSyncTime ? `Sync lúc ${lastSyncTime.toLocaleTimeString('vi-VN')}` : 'Chưa đồng bộ'}
                </div>
              </div>
            </div>
            <button className="btn btn-secondary" onClick={handleSync} disabled={isSyncing}
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
              <RefreshCw size={14} className={isSyncing ? 'spin' : ''} /> {isSyncing ? 'Đang sync...' : 'Sync từ DB'}
            </button>
          </div>
        </div>

        {/* Logout */}
        <div className="card" style={{ padding: '16px' }}>
          <button className="btn btn-danger-outline" style={{ width: '100%' }}
            onClick={() => { useAppStore.getState().setCurrentUser(null); toast.success('Đã đăng xuất'); }}>
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
