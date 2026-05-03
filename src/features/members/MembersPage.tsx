import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  Users, Mail, Briefcase, Edit3, Trash2, Save, X,
  ShieldCheck, Key, UserPlus, Search
} from 'lucide-react';
import type { Member, MemberRole, KpiRole, TeamGroup, MemberAccount } from '@/shared/types';
import toast from 'react-hot-toast';

const ROLES: MemberRole[] = ['Manager', 'Leader', 'Member', 'Client'];
const TEAM_GROUPS: TeamGroup[] = ['Bài viết', 'Sản phẩm', 'Multimedia - Tin nhanh'];

function generateId(prefix = 'M'): string {
  return `${prefix}_${Date.now().toString(36).toUpperCase()}`;
}

export default function MembersPage() {
  const { members, currentUser, addMember, updateMember, deleteMember,
          memberAccounts, setMemberAccount, removeMemberAccount, submissions } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Member | null>(null);
  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState<MemberRole | ''>('');

  const isManager = currentUser?.role === 'Manager';

  // ── Member stats from submissions ──
  const memberStats = useMemo(() => {
    return members.map(m => {
      const subs = submissions.filter(s => s.employeeName === m.name);
      const links = subs.reduce((s, x) => s + x.links.length, 0);
      const points = subs.reduce((s, x) => s + x.totalPoints, 0);
      const account = memberAccounts.find(a => a.memberId === m.id);
      return { ...m, totalLinks: links, totalPoints: points, account };
    });
  }, [members, submissions, memberAccounts]);

  const filtered = useMemo(() => {
    return memberStats.filter(m => {
      if (filterRole && m.role !== filterRole) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.name.toLowerCase().includes(q) ||
               (m.email ?? '').toLowerCase().includes(q) ||
               (m.expertise ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  }, [memberStats, search, filterRole]);

  const getInitials = (name: string) => {
    const parts = name.split(' ');
    return parts.length >= 2
      ? (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase()
      : name.substring(0, 2).toUpperCase();
  };

  const getRoleBadge = (role: MemberRole) => {
    const map: Record<MemberRole, { bg: string; color: string }> = {
      'Manager': { bg: 'var(--danger-bg)', color: 'var(--danger)' },
      'Leader':  { bg: 'var(--blue-100)',  color: 'var(--blue-500)' },
      'Member':  { bg: 'var(--primary-50)', color: 'var(--primary-600)' },
      'Client':  { bg: 'var(--orange-100)', color: 'var(--orange-500)' },
    };
    return map[role];
  };

  const handleDelete = (m: Member) => {
    if (m.id === currentUser?.id) { toast.error('Không thể xóa chính bạn'); return; }
    if (window.confirm(`Xóa nhân viên "${m.name}"? (Submissions cũ vẫn giữ)`)) {
      deleteMember(m.id);
      toast.success('Đã xóa');
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><Users size={20} /></span>
            Thành viên & Tài khoản
          </h2>
          <p className="page-subtitle">
            {members.length} thành viên · {memberAccounts.filter(a => a.active).length} account active
          </p>
        </div>
        {isManager && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <UserPlus size={16} /> Thêm thành viên
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="card" style={{ padding: '14px', marginBottom: '16px',
                                     display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-tertiary)' }} />
          <input className="form-input" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Tìm theo tên, email, chuyên môn..."
            style={{ paddingLeft: 30 }} />
        </div>
        <select className="form-select" value={filterRole} onChange={e => setFilterRole(e.target.value as MemberRole | '')}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="">Tất cả role</option>
          {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
      </div>

      {/* Members Grid */}
      <div className="members-grid">
        {filtered.map(m => {
          const badge = getRoleBadge(m.role);
          return (
            <div key={m.id} className="member-card animate-in" style={{ position: 'relative' }}>
              <div className="member-avatar-lg">
                {getInitials(m.name)}
              </div>
              <div className="member-name">{m.name}</div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '2px 10px', borderRadius: 'var(--radius-full)',
                  fontSize: '0.72rem', fontWeight: 600,
                  background: badge.bg, color: badge.color,
                }}>
                  <ShieldCheck size={10} style={{ verticalAlign: 'middle', marginRight: 3 }} />
                  {m.role}
                </span>
                {m.teamGroup && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    fontSize: '0.7rem', background: 'var(--accent-100)', color: 'var(--primary-700)',
                  }}>{m.teamGroup}</span>
                )}
                {m.account?.active && (
                  <span style={{
                    padding: '2px 8px', borderRadius: 'var(--radius-full)',
                    fontSize: '0.7rem', background: 'var(--success-bg)', color: 'var(--success)',
                  }}>
                    <Key size={10} style={{ verticalAlign: 'middle', marginRight: 2 }} />
                    Có account
                  </span>
                )}
              </div>

              <span className="member-expertise" style={{ marginTop: '8px' }}>
                <Briefcase size={11} style={{ marginRight: 4 }} /> {m.expertise || '—'}
              </span>
              {m.email && (
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: '8px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Mail size={12} /> {m.email}
                </div>
              )}

              <div className="member-stats">
                <div>
                  <div className="stat-value" style={{ fontSize: '1rem' }}>{m.totalLinks}</div>
                  <div className="stat-label">Link</div>
                </div>
                <div>
                  <div className="stat-value" style={{ fontSize: '1rem', color: 'var(--success)' }}>
                    {m.totalPoints.toLocaleString('vi-VN', { maximumFractionDigits: 0 })}
                  </div>
                  <div className="stat-label">Điểm</div>
                </div>
              </div>

              {isManager && (
                <div style={{ marginTop: '12px', display: 'flex', gap: '6px', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                    onClick={() => { setEditItem(m); setShowForm(true); }}>
                    <Edit3 size={11} /> Sửa
                  </button>
                  <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px', color: 'var(--danger)' }}
                    onClick={() => handleDelete(m)}>
                    <Trash2 size={11} /> Xóa
                  </button>
                </div>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
            Không tìm thấy nhân viên nào.
          </div>
        )}
      </div>

      {showForm && isManager && (
        <MemberFormModal
          item={editItem}
          existingAccount={editItem ? memberAccounts.find(a => a.memberId === editItem.id) : undefined}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(member, account) => {
            if (editItem) {
              updateMember(editItem.id, member);
              if (account && account.email) {
                setMemberAccount({
                  memberId: editItem.id,
                  email: account.email,
                  password: account.password ?? '',
                  active: account.active ?? true,
                });
              } else if (!account?.email) {
                removeMemberAccount(editItem.id);
              }
              toast.success('Đã cập nhật');
            } else {
              const id = generateId();
              const fullMember: Member = { id, name: '', role: 'Member', expertise: '', ...member } as Member;
              const fullAccount: MemberAccount | undefined = account?.email
                ? { memberId: id, email: account.email, password: account.password ?? '', active: account.active ?? true }
                : undefined;
              addMember(fullMember, fullAccount);
              toast.success('Đã thêm thành viên');
            }
            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

// ── Form modal ──────────────────────────────────────────────────────────
function MemberFormModal({ item, existingAccount, onClose, onSave }: {
  item: Member | null;
  existingAccount?: MemberAccount;
  onClose: () => void;
  onSave: (member: Partial<Member>, account?: Partial<MemberAccount>) => void;
}) {
  const [form, setForm] = useState<Partial<Member>>(item || {
    name: '', role: 'Member' as MemberRole, expertise: '', email: '',
    kpiRole: 'member' as KpiRole, teamGroup: 'Bài viết' as TeamGroup,
    productivityFactor: 1.0,
  });
  const [createAccount, setCreateAccount] = useState(!!existingAccount);
  const [accEmail, setAccEmail] = useState(existingAccount?.email ?? '');
  const [accPass, setAccPass] = useState(existingAccount?.password ?? '');
  const [accActive, setAccActive] = useState(existingAccount?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error('Cần tên'); return; }
    if (createAccount) {
      if (!accEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accEmail)) { toast.error('Email không hợp lệ'); return; }
      if (!accPass || accPass.length < 4) { toast.error('Mật khẩu tối thiểu 4 ký tự'); return; }
    }
    onSave(form, createAccount ? { email: accEmail, password: accPass, active: accActive } : undefined);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '600px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa thành viên' : 'Thêm thành viên mới'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Họ tên *</label>
                <input className="form-input" value={form.name ?? ''}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="VD: Nguyễn Văn A" />
              </div>
              <div className="form-group">
                <label className="form-label">Email liên hệ</label>
                <input className="form-input" type="email" value={form.email ?? ''}
                  onChange={e => setForm({ ...form, email: e.target.value })}
                  placeholder="user@longchau.com" />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Role *</label>
                <select className="form-select" value={form.role ?? 'Member'}
                  onChange={e => setForm({ ...form, role: e.target.value as MemberRole })}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">KPI Role</label>
                <select className="form-select" value={form.kpiRole ?? ''}
                  onChange={e => setForm({ ...form, kpiRole: (e.target.value || undefined) as KpiRole | undefined })}>
                  <option value="">— (không tính KPI)</option>
                  <option value="member">member</option>
                  <option value="leader">leader</option>
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Nhóm team</label>
                <select className="form-select" value={form.teamGroup ?? ''}
                  onChange={e => setForm({ ...form, teamGroup: (e.target.value || '') as TeamGroup })}>
                  <option value="">—</option>
                  {TEAM_GROUPS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Chuyên môn</label>
                <input className="form-input" value={form.expertise ?? ''}
                  onChange={e => setForm({ ...form, expertise: e.target.value })}
                  placeholder="VD: Bài viết SEO, Tối ưu sản phẩm..." />
              </div>
              <div className="form-group">
                <label className="form-label">Hệ số sản xuất</label>
                <input className="form-input" type="number" step="0.05" min="0" max="2"
                  value={form.productivityFactor ?? 1.0}
                  onChange={e => setForm({ ...form, productivityFactor: parseFloat(e.target.value) || 1.0 })} />
              </div>
            </div>

            {/* Account login */}
            <div style={{ marginTop: '14px', padding: '14px', background: 'var(--bg-secondary)',
                          borderRadius: 'var(--radius-md)', border: '1px solid var(--border-light)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '0.9rem',
                              cursor: 'pointer', marginBottom: '10px' }}>
                <input type="checkbox" checked={createAccount} onChange={e => setCreateAccount(e.target.checked)}
                  style={{ accentColor: 'var(--primary-500)', width: 16, height: 16 }} />
                <Key size={14} color="var(--primary-500)" />
                {existingAccount ? 'Account đăng nhập' : 'Cấp account đăng nhập'}
              </label>

              {createAccount && (
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Email login *</label>
                    <input className="form-input" type="email" value={accEmail}
                      onChange={e => setAccEmail(e.target.value)}
                      placeholder="user@longchau.com" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Mật khẩu * (≥4 ký tự)</label>
                    <input className="form-input" type="text" value={accPass}
                      onChange={e => setAccPass(e.target.value)}
                      placeholder="Mật khẩu" />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>Trạng thái</label>
                    <select className="form-select" value={accActive ? 'active' : 'inactive'}
                      onChange={e => setAccActive(e.target.value === 'active')}>
                      <option value="active">Active</option>
                      <option value="inactive">Vô hiệu hóa</option>
                    </select>
                  </div>
                </div>
              )}
              <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                Account lưu local + Sheet. Cấp/đổi mật khẩu cho member ở đây.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary"><Save size={14} /> Lưu</button>
          </div>
        </form>
      </div>
    </div>
  );
}
