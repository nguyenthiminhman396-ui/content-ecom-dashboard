import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  Users, Mail, Briefcase, Edit3, Trash2, Save, X,
  ShieldCheck, Key, UserPlus, Search, LogOut, RotateCcw, CalendarDays
} from 'lucide-react';
import type { Member, MemberRole, KpiRole, TeamGroup, MemberAccount } from '@/shared/types';
import toast from 'react-hot-toast';
import { nextRoleHistory, toDayKey } from '@/shared/selectors/teamKpi';

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
  const [filterStatus, setFilterStatus] = useState<'active' | 'left' | ''>('active');
  const today = toDayKey(new Date());
  const hasLeft = (m: Member) => !!m.leftAt && m.leftAt < today;

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
      if (filterStatus === 'active' && hasLeft(m)) return false;
      if (filterStatus === 'left' && !hasLeft(m)) return false;
      if (search) {
        const q = search.toLowerCase();
        return m.name.toLowerCase().includes(q) ||
               (m.email ?? '').toLowerCase().includes(q) ||
               (m.expertise ?? '').toLowerCase().includes(q);
      }
      return true;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- hasLeft chỉ phụ thuộc today
  }, [memberStats, search, filterRole, filterStatus, today]);

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

  // Bớt member: người đã có submission → "cho nghỉ" (giữ lịch sử để target các tháng cũ vẫn đúng,
  // tháng hiện tại chỉ tính target tới ngày làm việc cuối). Chưa có submission nào → xoá hẳn như cũ.
  const handleDelete = (m: Member) => {
    if (m.id === currentUser?.id) { toast.error('Không thể xóa chính bạn'); return; }
    const hasHistory = submissions.some(s => s.employeeName === m.name);
    if (!hasHistory || m.leftAt) {
      const msg = m.leftAt
        ? `Xoá hẳn "${m.name}"? Target KPI các tháng cũ của team sẽ không còn tính người này.`
        : `Xóa nhân viên "${m.name}"? (Chưa có submission nào)`;
      if (window.confirm(msg)) {
        deleteMember(m.id);
        toast.success('Đã xóa');
      }
      return;
    }
    const input = window.prompt(
      `Cho "${m.name}" nghỉ — nhập NGÀY LÀM VIỆC CUỐI (YYYY-MM-DD).\n` +
      'Target KPI chỉ tính tới ngày này; điểm và lịch sử vẫn giữ. Account đăng nhập sẽ bị vô hiệu hoá.',
      today,
    );
    if (input === null) return;
    const leftAt = input.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(leftAt) || isNaN(new Date(leftAt).getTime())) {
      toast.error('Ngày không hợp lệ (định dạng YYYY-MM-DD)'); return;
    }
    if (m.joinedAt && leftAt < m.joinedAt) { toast.error('Ngày nghỉ trước ngày vào team'); return; }
    updateMember(m.id, { leftAt });
    const acc = memberAccounts.find(a => a.memberId === m.id);
    if (acc?.active) {
      setMemberAccount({ ...acc, active: false })
        .catch(e => toast.error(`Chưa khoá được account: ${(e as Error).message}`));
    }
    toast.success(`Đã cho ${m.name} nghỉ từ sau ${leftAt}`);
  };

  const handleRestore = (m: Member) => {
    // Dùng '' thay vì undefined: API update merge JSON, key undefined bị bỏ → DB vẫn giữ leftAt cũ
    updateMember(m.id, { leftAt: '' });
    toast.success(`Đã khôi phục ${m.name} — nhớ bật lại account nếu cần`);
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
        <select className="form-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as 'active' | 'left' | '')}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="active">Đang làm</option>
          <option value="left">Đã nghỉ</option>
          <option value="">Tất cả</option>
        </select>
      </div>

      {/* Members Grid */}
      <div className="members-grid">
        {filtered.map(m => {
          const badge = getRoleBadge(m.role);
          return (
            <div key={m.id} className="member-card animate-in" style={{ position: 'relative', opacity: hasLeft(m) ? 0.6 : 1 }}>
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

              {(m.joinedAt || m.leftAt) && (
                <div style={{ fontSize: '0.72rem', color: m.leftAt ? 'var(--danger)' : 'var(--text-tertiary)', marginTop: '6px',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <CalendarDays size={11} />
                  {m.joinedAt && <>Vào {m.joinedAt}</>}
                  {m.joinedAt && m.leftAt && ' · '}
                  {m.leftAt && <>Ngày làm cuối {m.leftAt}</>}
                </div>
              )}
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
                  {m.leftAt && (
                    <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px' }}
                      onClick={() => handleRestore(m)}>
                      <RotateCcw size={11} /> Khôi phục
                    </button>
                  )}
                  <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '4px 10px', color: 'var(--danger)' }}
                    onClick={() => handleDelete(m)}>
                    {m.leftAt || !submissions.some(s => s.employeeName === m.name)
                      ? <><Trash2 size={11} /> Xóa</>
                      : <><LogOut size={11} /> Cho nghỉ</>}
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
              const accountOp = account && account.email
                ? setMemberAccount({
                    memberId: editItem.id,
                    email: account.email,
                    password: account.password || undefined, // rỗng = giữ mật khẩu cũ
                    active: account.active ?? true,
                  })
                : removeMemberAccount(editItem.id);
              accountOp.catch(e => toast.error(`Lỗi account: ${(e as Error).message}`));
              toast.success('Đã cập nhật');
            } else {
              const id = generateId();
              const fullMember: Member = { id, name: '', role: 'Member', expertise: '', ...member } as Member;
              const fullAccount: MemberAccount | undefined = account?.email
                ? { memberId: id, email: account.email, password: account.password || undefined, active: account.active ?? true }
                : undefined;
              addMember(fullMember);
              toast.success('Đã thêm thành viên');
              if (fullAccount) {
                setMemberAccount(fullAccount)
                  .catch(e => toast.error(`Chưa tạo được account: ${(e as Error).message}`));
              }
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
    productivityFactor: 1.0, joinedAt: toDayKey(new Date()),
  });
  // Ngày áp dụng khi đổi vai trò KPI / hệ số (VD Member → Leader giữa tháng)
  const [effectiveFrom, setEffectiveFrom] = useState(toDayKey(new Date()));
  const roleChanged = !!item && nextRoleHistory(item, form, effectiveFrom) !== undefined;
  const [createAccount, setCreateAccount] = useState(!!existingAccount);
  const [accEmail, setAccEmail] = useState(existingAccount?.email ?? '');
  // Server không trả mật khẩu về → để trống = giữ mật khẩu cũ
  const [accPass, setAccPass] = useState('');
  const [accActive, setAccActive] = useState(existingAccount?.active ?? true);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name?.trim()) { toast.error('Cần tên'); return; }
    if (createAccount) {
      if (!accEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accEmail)) { toast.error('Email không hợp lệ'); return; }
      if (!existingAccount && !accPass) { toast.error('Cần đặt mật khẩu cho account mới'); return; }
      if (accPass && accPass.length < 4) { toast.error('Mật khẩu tối thiểu 4 ký tự'); return; }
    }
    let toSave = form;
    if (item) {
      const roleHistory = nextRoleHistory(item, form, effectiveFrom);
      if (roleHistory) {
        if (item.joinedAt && effectiveFrom < item.joinedAt) { toast.error('Ngày áp dụng trước ngày vào team'); return; }
        toSave = { ...form, roleHistory };
      }
    }
    onSave(toSave, createAccount ? { email: accEmail, password: accPass, active: accActive } : undefined);
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
                  onChange={e => {
                    const newRole = e.target.value as MemberRole;
                    setForm(prev => {
                      const next = { ...prev, role: newRole };
                      if (newRole === 'Leader') {
                        next.kpiRole = 'leader';
                        if (prev.productivityFactor === undefined || prev.productivityFactor === 1.0) {
                          next.productivityFactor = 0.6;
                        }
                      } else if (newRole === 'Member') {
                        next.kpiRole = 'member';
                        if ((prev.productivityFactor ?? 1.0) <= 0.6) {
                          next.productivityFactor = 1.0;
                        }
                      }
                      return next;
                    });
                  }}>
                  {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">KPI Role</label>
                <select className="form-select" value={form.kpiRole ?? ''}
                  onChange={e => {
                    const newKpi = (e.target.value || undefined) as KpiRole | undefined;
                    setForm(prev => {
                      const next = { ...prev, kpiRole: newKpi };
                      if (newKpi === 'leader' && prev.role !== 'Leader' && prev.role !== 'Manager') {
                        next.role = 'Leader';
                      }
                      return next;
                    });
                  }}>
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
            <div style={{ fontSize: '11px', color: '#64748b', marginTop: '-6px', marginBottom: '12px', lineHeight: 1.5, background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              💡 <b>Role:</b> Quyền truy cập menu & chức năng hệ thống (Leader: duyệt bài, xem chi phí, điểm thưởng...).<br />
              💡 <b>KPI Role:</b> Phân loại tính điểm & đánh giá hiệu suất (Leader: hệ số sản xuất 0.6, tính vào đánh giá Lead của team).
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

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ngày vào team</label>
                <input className="form-input" type="date" value={form.joinedAt ?? ''}
                  onChange={e => setForm({ ...form, joinedAt: e.target.value })} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Target KPI tháng vào team chỉ tính từ ngày này.
                </p>
              </div>
              {roleChanged ? (
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--primary-600)' }}>Áp dụng vai trò / hệ số mới từ *</label>
                  <input className="form-input" type="date" value={effectiveFrom}
                    onChange={e => setEffectiveFrom(e.target.value || toDayKey(new Date()))} />
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Target tháng này chia theo ngày: trước ngày này tính vai trò cũ, từ ngày này tính vai trò mới.
                  </p>
                </div>
              ) : <div className="form-group" />}
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
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>
                      {existingAccount ? 'Mật khẩu mới (≥4 ký tự)' : 'Mật khẩu * (≥4 ký tự)'}
                    </label>
                    <input className="form-input" type="password" value={accPass} autoComplete="new-password"
                      onChange={e => setAccPass(e.target.value)}
                      placeholder={existingAccount ? 'Để trống = giữ mật khẩu cũ' : 'Mật khẩu'} />
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
