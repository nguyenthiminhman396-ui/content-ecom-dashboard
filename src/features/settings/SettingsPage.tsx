import { useState } from 'react';
import { Settings, Database, RefreshCw, User, Moon, Sun, Lock, Eye, EyeOff, Check } from 'lucide-react';
import { useAppStore, initFromDB } from '@/shared/store/appStore';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { isSyncing, lastSyncTime, currentUser, memberAccounts, setMemberAccount } = useAppStore();
  const [darkMode, setDarkMode] = useState(document.documentElement.getAttribute('data-theme') === 'dark');

  // Password change state
  const [showPwForm, setShowPwForm] = useState(false);
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [pwError, setPwError] = useState('');

  // Find current user's account
  const myAccount = currentUser
    ? memberAccounts.find(a => a.memberId === currentUser.id)
    : null;

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

  const handleChangePassword = (e: React.FormEvent) => {
    e.preventDefault();
    setPwError('');

    if (!myAccount) {
      setPwError('Không tìm thấy tài khoản. Liên hệ Manager.');
      return;
    }
    if (currentPw !== myAccount.password) {
      setPwError('Mật khẩu hiện tại không đúng.');
      return;
    }
    if (newPw.length < 4) {
      setPwError('Mật khẩu mới phải có ít nhất 4 ký tự.');
      return;
    }
    if (newPw !== confirmPw) {
      setPwError('Mật khẩu xác nhận không khớp.');
      return;
    }
    if (newPw === currentPw) {
      setPwError('Mật khẩu mới phải khác mật khẩu cũ.');
      return;
    }

    // Update password
    setMemberAccount({ ...myAccount, password: newPw });
    toast.success('Đổi mật khẩu thành công!');
    setCurrentPw('');
    setNewPw('');
    setConfirmPw('');
    setShowPwForm(false);
    setPwError('');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 40px 10px 12px', boxSizing: 'border-box',
    borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)',
    background: 'var(--bg-secondary)', color: 'var(--text-primary)',
    fontSize: '0.88rem',
  };

  const eyeBtnStyle: React.CSSProperties = {
    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
    background: 'none', border: 'none', cursor: 'pointer',
    color: 'var(--text-tertiary)', padding: '4px',
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

        {/* Change Password */}
        {myAccount && (
          <div className="card" style={{ padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: showPwForm ? '16px' : 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)',
                  background: 'var(--warning-bg, #FEF3C7)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Lock size={20} color="var(--warning, #F59E0B)" />
                </div>
                <div>
                  <div style={{ fontWeight: 700 }}>Mật khẩu</div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                    Thay đổi mật khẩu đăng nhập
                  </div>
                </div>
              </div>
              {!showPwForm && (
                <button className="btn btn-secondary" onClick={() => setShowPwForm(true)}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                  <Lock size={14} /> Đổi mật khẩu
                </button>
              )}
            </div>

            {showPwForm && (
              <form onSubmit={handleChangePassword}>
                {pwError && (
                  <div style={{
                    color: '#DC2626', fontSize: '0.82rem', background: '#FEE2E2',
                    padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: '12px',
                  }}>{pwError}</div>
                )}

                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {/* Current password */}
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Mật khẩu hiện tại
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showCurrentPw ? 'text' : 'password'}
                        value={currentPw}
                        onChange={e => setCurrentPw(e.target.value)}
                        placeholder="Nhập mật khẩu hiện tại"
                        style={inputStyle}
                        required
                        autoFocus
                      />
                      <button type="button" style={eyeBtnStyle} onClick={() => setShowCurrentPw(!showCurrentPw)}>
                        {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* New password */}
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Mật khẩu mới
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showNewPw ? 'text' : 'password'}
                        value={newPw}
                        onChange={e => setNewPw(e.target.value)}
                        placeholder="Ít nhất 4 ký tự"
                        style={inputStyle}
                        required
                        minLength={4}
                      />
                      <button type="button" style={eyeBtnStyle} onClick={() => setShowNewPw(!showNewPw)}>
                        {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>

                  {/* Confirm password */}
                  <div>
                    <label style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px', display: 'block' }}>
                      Xác nhận mật khẩu mới
                    </label>
                    <div style={{ position: 'relative' }}>
                      <input
                        type="password"
                        value={confirmPw}
                        onChange={e => setConfirmPw(e.target.value)}
                        placeholder="Nhập lại mật khẩu mới"
                        style={{
                          ...inputStyle,
                          paddingRight: '12px',
                          borderColor: confirmPw && confirmPw === newPw ? 'var(--success)' : confirmPw ? '#DC2626' : 'var(--border-light)',
                        }}
                        required
                      />
                      {confirmPw && confirmPw === newPw && (
                        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--success)' }}>
                          <Check size={16} />
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '16px' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => {
                    setShowPwForm(false); setCurrentPw(''); setNewPw(''); setConfirmPw(''); setPwError('');
                  }}>Hủy</button>
                  <button type="submit" className="btn btn-primary"
                    style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Check size={14} /> Lưu mật khẩu
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Database status — Manager only */}
        {currentUser?.role === 'Manager' && (
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
        )}

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
