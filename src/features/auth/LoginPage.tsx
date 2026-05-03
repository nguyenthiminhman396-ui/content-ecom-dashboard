import { useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { Heart, LogIn } from 'lucide-react';
import type { MemberRole, Member } from '@/shared/types';

interface LoginProps {
  onLogin: () => void;
}

const env = import.meta.env;

// VITE_ACCOUNT_ADMIN_* được giữ tên env để tương thích .env cũ — role đã đổi sang 'Manager'
const ENV_ACCOUNTS = [
  { email: env.VITE_ACCOUNT_ADMIN_EMAIL,  pass: env.VITE_ACCOUNT_ADMIN_PASS,  role: 'Manager' as MemberRole, name: env.VITE_ACCOUNT_ADMIN_NAME  || 'manager', id: 'M_MANAGER' },
  { email: env.VITE_ACCOUNT_LEADER_EMAIL, pass: env.VITE_ACCOUNT_LEADER_PASS, role: 'Leader'  as MemberRole, name: env.VITE_ACCOUNT_LEADER_NAME || 'leader',  id: 'M_LEAD' },
  { email: env.VITE_ACCOUNT_MEMBER_EMAIL, pass: env.VITE_ACCOUNT_MEMBER_PASS, role: 'Member'  as MemberRole, name: env.VITE_ACCOUNT_MEMBER_NAME || 'member',  id: 'M_MEM' },
  { email: env.VITE_ACCOUNT_CLIENT_EMAIL, pass: '',                            role: 'Client'  as MemberRole, name: env.VITE_ACCOUNT_CLIENT_NAME || 'khach',   id: 'M_CLIENT' },
].filter((a) => a.email);

export default function Login({ onLogin }: LoginProps) {
  const { setCurrentUser, members, memberAccounts } = useAppStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // 1. Try Manager-created account first
    const acc = memberAccounts.find(a => a.email.toLowerCase() === email.toLowerCase() && a.active);
    if (acc) {
      if (acc.password !== password) {
        setError('Mật khẩu không chính xác.');
        return;
      }
      const member = members.find(m => m.id === acc.memberId);
      if (!member) { setError('Account không liên kết được member.'); return; }
      setCurrentUser(member);
      onLogin();
      return;
    }

    // 2. Fallback to .env account
    const envAcc = ENV_ACCOUNTS.find((a) => a.email === email);
    if (!envAcc) {
      setError('Tài khoản không tồn tại.');
      return;
    }
    if (envAcc.role !== 'Client' && envAcc.pass !== password) {
      setError('Mật khẩu không chính xác.');
      return;
    }
    const memberToSet: Member = {
      id: envAcc.id,
      name: envAcc.name,
      role: envAcc.role,
      expertise: '',
      email: envAcc.email,
    };
    setCurrentUser(memberToSet);
    onLogin();
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

          <button type="submit" style={{
            width: '100%', background: 'linear-gradient(135deg, #2453d6, #1a3fa0)',
            color: 'white', padding: '14px 16px', borderRadius: '8px',
            fontWeight: 700, fontSize: '0.95rem', marginTop: '12px',
            border: 'none', cursor: 'pointer', transition: 'all 0.2s',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
            boxShadow: '0 4px 14px rgba(36, 83, 214, 0.35)',
          }}>
            <LogIn size={18} /> Đăng nhập
          </button>
        </form>
      </div>
    </div>
  );
}
