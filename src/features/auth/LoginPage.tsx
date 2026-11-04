import { useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { Heart, LogIn } from 'lucide-react';
import { login } from '@/shared/services/authApi';

interface LoginProps {
  /** Tải dữ liệu sau khi server đã cấp cookie phiên */
  onLogin: () => Promise<void>;
}

export default function Login({ onLogin }: LoginProps) {
  const { setCurrentUser } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Mật khẩu chỉ được kiểm tra ở server (/api/auth); trình duyệt không còn giữ danh sách tài khoản
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const user = await login(email.trim(), password);
      await onLogin(); // tải dữ liệu thật trước khi vào app (tránh nháy dữ liệu mẫu)
      setCurrentUser(user);
    } catch (err) {
      setError((err as Error).message || 'Đăng nhập thất bại.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-logo">
          <Heart size={28} />
        </div>
        <h1 className="login-title">Content Ecom LC Dashboard</h1>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '24px' }}>
          {error && <div style={{ color: '#ef4444', fontSize: '0.85rem', background: '#fee2e2', padding: '8px', borderRadius: '4px' }}>{error}</div>}

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Nhập email"
              style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
              required
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', textAlign: 'left' }}>
            <label style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              style={{ width: '100%', padding: '10px 12px', boxSizing: 'border-box', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
            />
          </div>

          <button type="submit" disabled={loading} style={{
            width: '100%', background: 'linear-gradient(135deg, #2453d6, #1a3fa0)',
            color: 'white', padding: '14px 16px', borderRadius: '8px',
            fontWeight: 700, fontSize: '0.95rem', marginTop: '12px',
            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: '0 4px 14px rgba(36, 83, 214, 0.35)',
          }}>
            <LogIn size={18} /> {loading ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
        </form>
      </div>
    </div>
  );
}
