import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  CheckSquare, Plus, Trash2, X, Save, AlertTriangle,
  ChevronDown, ChevronUp, Clock, Flag, Edit3, UserPlus, Eye
} from 'lucide-react';
import type { TodoItem, TodoPriority } from '@/shared/types';
import toast from 'react-hot-toast';

function genId() { return `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`; }
function fmtDate(d: string) { try { return new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }); } catch { return d; } }

function isOverdue(dueDate?: string) {
  if (!dueDate) return false;
  return new Date(dueDate + 'T23:59:59') < new Date();
}
function isDueSoon(dueDate?: string) {
  if (!dueDate) return false;
  const due = new Date(dueDate + 'T23:59:59').getTime();
  const now = Date.now();
  return due > now && due - now < 2 * 86400_000; // trong 2 ngày
}

const PRIORITY_META: Record<TodoPriority, { label: string; color: string; bg: string; icon: string }> = {
  high:   { label: 'Cao',       color: '#DC2626', bg: '#FEE2E2', icon: '🔴' },
  medium: { label: 'Trung bình', color: '#F59E0B', bg: '#FEF3C7', icon: '🟡' },
  low:    { label: 'Thấp',      color: '#6B7280', bg: '#F3F4F6', icon: '⚪' },
};

export default function TodoPage() {
  const { currentUser, todos, members, addTodo, updateTodo, deleteTodo } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<TodoItem | null>(null);
  const [showCompleted, setShowCompleted] = useState(false);
  const [filterPriority, setFilterPriority] = useState<TodoPriority | ''>('');
  // Chỉ hiện: (1) todo mình tạo cho mình (không assign hoặc tự assign), (2) todo được giao cho mình
  const myTodos = useMemo(() => {
    if (!currentUser) return [];
    let list = todos.filter(t => {
      const isMyOwn = t.ownerName === currentUser.name && (!t.assigneeName || t.assigneeName === currentUser.name);
      const isAssignedToMe = t.assigneeName === currentUser.name && t.ownerName !== currentUser.name;
      return isMyOwn || isAssignedToMe;
    });
    if (filterPriority) list = list.filter(t => t.priority === filterPriority);
    return list;
  }, [todos, currentUser, filterPriority]);

  const pending = myTodos.filter(t => !t.completed);
  const completed = myTodos.filter(t => t.completed);
  const overdueCount = pending.filter(t => isOverdue(t.dueDate)).length;
  const dueSoonCount = pending.filter(t => isDueSoon(t.dueDate)).length;

  // Sort: overdue first → due soon → by dueDate → no date last
  const sortedPending = [...pending].sort((a, b) => {
    const aOv = isOverdue(a.dueDate) ? 0 : isDueSoon(a.dueDate) ? 1 : 2;
    const bOv = isOverdue(b.dueDate) ? 0 : isDueSoon(b.dueDate) ? 1 : 2;
    if (aOv !== bOv) return aOv - bOv;
    if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate);
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    const pOrder = { high: 0, medium: 1, low: 2 };
    return pOrder[a.priority] - pOrder[b.priority];
  });

  const handleToggle = (t: TodoItem) => {
    updateTodo(t.id, {
      completed: !t.completed,
      completedAt: !t.completed ? new Date().toISOString() : undefined,
    });
  };

  const handleDelete = (t: TodoItem) => {
    if (window.confirm(`Xóa "${t.title}"?`)) {
      deleteTodo(t.id);
      toast.success('Đã xóa');
    }
  };

  // Available members for assignment
  const availableMembers = useMemo(() => {
    if (!currentUser) return [];
    return members
      .filter(m => m.name !== currentUser.name)
      .map(m => m.name)
      .sort();
  }, [members, currentUser]);

  if (!currentUser) {
    return <div className="card" style={{ padding: '40px', textAlign: 'center' }}>Cần đăng nhập</div>;
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <CheckSquare size={20} style={{ color: 'var(--primary-500)' }} />
            To-do list công việc
          </h2>
          <p className="page-subtitle">
            Quản lý công việc cá nhân — nhắc nhở deadline, ưu tiên đầu việc, assign cho đồng nghiệp.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          {/* Notification bell removed - moved to Header */}
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} /> Thêm việc
          </button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Cần làm</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--primary-600)' }}>{pending.length}</div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Đã hoàn thành</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: 'var(--success)' }}>{completed.length}</div>
        </div>
        <div className="stat-card" style={overdueCount > 0 ? { borderLeft: '4px solid var(--danger)' } : {}}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Trễ hạn</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: overdueCount > 0 ? 'var(--danger)' : 'var(--text-tertiary)' }}>
            {overdueCount}
          </div>
        </div>
        <div className="stat-card" style={dueSoonCount > 0 ? { borderLeft: '4px solid var(--warning)' } : {}}>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Sắp đến hạn</div>
          <div style={{ fontWeight: 800, fontSize: '1.6rem', color: dueSoonCount > 0 ? 'var(--warning)' : 'var(--text-tertiary)' }}>
            {dueSoonCount}
          </div>
        </div>
      </div>

      {/* Overdue alert */}
      {overdueCount > 0 && (
        <div className="card" style={{
          padding: '12px 16px', marginBottom: '16px',
          background: '#FEE2E2', border: '1px solid #FECACA',
          display: 'flex', alignItems: 'center', gap: '8px',
        }}>
          <AlertTriangle size={16} color="#DC2626" />
          <span style={{ fontWeight: 600, color: '#991B1B', fontSize: '0.88rem' }}>
            Bạn có {overdueCount} công việc đã quá hạn!
          </span>
        </div>
      )}

      {/* Filter */}
      <div className="card" style={{ padding: '10px 14px', marginBottom: '16px',
                                     display: 'flex', gap: '8px', alignItems: 'center' }}>
        <Flag size={14} color="var(--primary-500)" />
        <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>Ưu tiên:</span>
        <select className="form-select" value={filterPriority}
          onChange={e => setFilterPriority(e.target.value as TodoPriority | '')}
          style={{ width: 'auto', fontSize: '0.85rem' }}>
          <option value="">Tất cả</option>
          <option value="high">🔴 Cao</option>
          <option value="medium">🟡 Trung bình</option>
          <option value="low">⚪ Thấp</option>
        </select>
        <span style={{ marginLeft: 'auto', fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
          {pending.length} chưa xong · {completed.length} đã xong
        </span>
      </div>

      {/* Pending tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {sortedPending.length === 0 && (
          <div className="card" style={{ padding: '40px', textAlign: 'center' }}>
            <CheckSquare size={40} style={{ color: 'var(--text-tertiary)', opacity: 0.4, marginBottom: 8 }} />
            <h3 style={{ fontWeight: 700, marginBottom: 6 }}>Không có việc cần làm 🎉</h3>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.85rem' }}>
              Bấm "Thêm việc" để tạo to-do list.
            </p>
          </div>
        )}
        {sortedPending.map(t => <TodoCard key={t.id} item={t} currentUserName={currentUser.name} onToggle={handleToggle} onEdit={i => { setEditItem(i); setShowForm(true); }} onDelete={handleDelete} />)}
      </div>

      {/* Completed toggle */}
      {completed.length > 0 && (
        <div style={{ marginTop: '20px' }}>
          <button onClick={() => setShowCompleted(!showCompleted)}
            style={{ width: '100%', padding: '10px', background: 'var(--bg-secondary)',
                     border: 'none', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                     display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                     fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
            <span>✅ Đã hoàn thành ({completed.length})</span>
            {showCompleted ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
          </button>
          {showCompleted && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginTop: '8px' }}>
              {completed.sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).map(t =>
                <TodoCard key={t.id} item={t} currentUserName={currentUser.name} onToggle={handleToggle} onEdit={i => { setEditItem(i); setShowForm(true); }} onDelete={handleDelete} />
              )}
            </div>
          )}
        </div>
      )}

      {/* Form modal */}
      {showForm && (
        <TodoFormModal
          item={editItem}
          availableMembers={availableMembers}
          readOnly={!!editItem && editItem.ownerName !== currentUser.name}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={data => {
            if (editItem) {
              updateTodo(editItem.id, data);
              toast.success('Đã cập nhật');
            } else {
              addTodo({ id: genId(), ownerName: currentUser.name, completed: false, createdAt: new Date().toISOString(), ...data } as TodoItem);
              if (data.assigneeName) {
                toast.success(`Đã thêm việc và assign cho ${data.assigneeName}`);
              } else {
                toast.success('Đã thêm việc mới');
              }
            }
            setShowForm(false); setEditItem(null);
          }}
        />
      )}


    </div>
  );
}

// ── Todo Card ────────────────────────────────────────────────────────────────
function TodoCard({ item, currentUserName, onToggle, onEdit, onDelete }: {
  item: TodoItem;
  currentUserName: string;
  onToggle: (t: TodoItem) => void;
  onEdit: (t: TodoItem) => void;
  onDelete: (t: TodoItem) => void;
}) {
  const overdue = !item.completed && isOverdue(item.dueDate);
  const dueSoon = !item.completed && isDueSoon(item.dueDate);
  const pm = PRIORITY_META[item.priority];
  const isAssignedToMe = item.assigneeName === currentUserName && item.ownerName !== currentUserName;
  const isMyTask = item.ownerName === currentUserName;

  return (
    <div className="card" style={{
      padding: '12px 16px',
      opacity: item.completed ? 0.65 : 1,
      borderLeft: overdue ? '4px solid var(--danger)' : dueSoon ? '4px solid var(--warning)' : `4px solid ${pm.color}`,
      transition: 'all 0.2s ease',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
        {/* Checkbox */}
        <button onClick={() => onToggle(item)} style={{
          width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 2,
          border: item.completed ? 'none' : '2px solid var(--border-medium)',
          background: item.completed ? 'var(--success)' : 'transparent',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: '0.7rem', fontWeight: 700,
        }}>
          {item.completed && '✓'}
        </button>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontWeight: 600, fontSize: '0.92rem',
            textDecoration: item.completed ? 'line-through' : 'none',
            color: item.completed ? 'var(--text-tertiary)' : 'var(--text-primary)',
          }}>
            {item.title}
          </div>
          {item.description && (
            <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)', marginTop: 2,
                          whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>
              {item.description}
            </div>
          )}
          <div style={{ display: 'flex', gap: '10px', marginTop: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Priority badge */}
            <span style={{
              fontSize: '0.68rem', padding: '1px 8px', borderRadius: 'var(--radius-full)',
              background: pm.bg, color: pm.color, fontWeight: 600,
            }}>
              {pm.icon} {pm.label}
            </span>
            {/* Assignee badge */}
            {item.assigneeName && (
              <span style={{
                fontSize: '0.68rem', padding: '1px 8px', borderRadius: 'var(--radius-full)',
                background: 'var(--primary-50)', color: 'var(--primary-700)', fontWeight: 600,
                display: 'inline-flex', alignItems: 'center', gap: '3px',
              }}>
                <UserPlus size={10} />
                {isAssignedToMe ? `Giao bởi ${item.ownerName}` : `→ ${item.assigneeName}`}
              </span>
            )}
            {/* Due date */}
            {item.dueDate && (
              <span style={{
                fontSize: '0.74rem', display: 'flex', alignItems: 'center', gap: '4px',
                color: overdue ? 'var(--danger)' : dueSoon ? '#D97706' : 'var(--text-tertiary)',
                fontWeight: overdue || dueSoon ? 600 : 400,
              }}>
                <Clock size={11} />
                {overdue ? '⚠️ Quá hạn: ' : dueSoon ? '⏰ Sắp hạn: ' : ''}
                {fmtDate(item.dueDate)}
              </span>
            )}
            {item.completed && item.completedAt && (
              <span style={{ fontSize: '0.72rem', color: 'var(--success)' }}>
                ✅ {fmtDate(item.completedAt.slice(0, 10))}
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          {isMyTask ? (
            /* Owner: full edit */
            <button className="btn btn-icon btn-ghost" onClick={() => onEdit(item)} title="Sửa" style={{ padding: 4 }}>
              <Edit3 size={13} />
            </button>
          ) : (
            /* Assignee: view-only */
            <button className="btn btn-icon btn-ghost" onClick={() => onEdit(item)} title="Xem chi tiết" style={{ padding: 4 }}>
              <Eye size={13} />
            </button>
          )}
          {/* Only owner can delete */}
          {isMyTask && (
            <button className="btn btn-icon btn-ghost" onClick={() => onDelete(item)}
              style={{ padding: 4, color: 'var(--danger)' }} title="Xóa">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Form Modal ───────────────────────────────────────────────────────────────
function TodoFormModal({ item, availableMembers, readOnly, onClose, onSave }: {
  item: TodoItem | null;
  availableMembers: string[];
  readOnly?: boolean;
  onClose: () => void;
  onSave: (data: Partial<TodoItem>) => void;
}) {
  const [form, setForm] = useState<Partial<TodoItem>>(item || {
    title: '', description: '', dueDate: '', priority: 'medium' as TodoPriority, assigneeName: '',
  });

  const pm = PRIORITY_META[(form.priority || 'medium') as TodoPriority];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3 className="modal-title">
            {readOnly ? '📋 Chi tiết công việc' : item ? 'Chỉnh sửa công việc' : 'Thêm công việc mới'}
          </h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        {readOnly ? (
          /* ── Read-only view for assignees ── */
          <div>
            <div className="modal-body">
              {/* Info banner */}
              <div style={{
                padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '16px',
                background: 'var(--primary-50)', border: '1px solid var(--primary-100)',
                display: 'flex', alignItems: 'center', gap: '8px',
                fontSize: '0.8rem', color: 'var(--primary-700)',
              }}>
                <Eye size={14} />
                Bạn được assign task này — chỉ người tạo ({item?.ownerName}) mới có thể chỉnh sửa.
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Tiêu đề</label>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{form.title || '—'}</div>
              </div>

              {form.description && (
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Mô tả</label>
                  <div style={{
                    fontSize: '0.88rem', color: 'var(--text-secondary)',
                    whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    padding: '10px 12px', background: 'var(--bg-secondary)',
                    borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
                  }}>{form.description}</div>
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Hạn hoàn thành</label>
                  <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Clock size={13} color="var(--text-tertiary)" />
                    {form.dueDate ? new Date(form.dueDate).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : 'Không có'}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Ưu tiên</label>
                  <span style={{
                    fontSize: '0.82rem', padding: '3px 12px', borderRadius: 'var(--radius-full)',
                    background: pm.bg, color: pm.color, fontWeight: 600, display: 'inline-block',
                  }}>
                    {pm.icon} {pm.label}
                  </span>
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ color: 'var(--text-tertiary)', fontSize: '0.78rem' }}>Người giao</label>
                <div style={{ fontSize: '0.88rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={13} color="var(--primary-500)" />
                  {item?.ownerName || '—'}
                </div>
              </div>

              {item?.createdAt && (
                <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
                  Tạo lúc: {new Date(item.createdAt).toLocaleString('vi-VN')}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Đóng</button>
            </div>
          </div>
        ) : (
          /* ── Editable form for owner ── */
          <form onSubmit={e => {
            e.preventDefault();
            if (!form.title?.trim()) { toast.error('Cần nhập tiêu đề'); return; }
            onSave(form);
          }}>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Tiêu đề *</label>
                <input className="form-input" value={form.title ?? ''} placeholder="VD: Viết 10 bài SEO nhà thuốc..."
                  onChange={e => setForm({ ...form, title: e.target.value })} autoFocus />
              </div>
              <div className="form-group">
                <label className="form-label">Mô tả chi tiết</label>
                <textarea className="form-textarea" value={form.description ?? ''} rows={2}
                  placeholder="Ghi chú thêm..."
                  onChange={e => setForm({ ...form, description: e.target.value })} />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Hạn hoàn thành</label>
                  <input className="form-input" type="date" value={form.dueDate ?? ''}
                    onChange={e => setForm({ ...form, dueDate: e.target.value || undefined })} />
                </div>
                <div className="form-group">
                  <label className="form-label">Ưu tiên</label>
                  <select className="form-select" value={form.priority ?? 'medium'}
                    onChange={e => setForm({ ...form, priority: e.target.value as TodoPriority })}>
                    <option value="high">🔴 Cao</option>
                    <option value="medium">🟡 Trung bình</option>
                    <option value="low">⚪ Thấp</option>
                  </select>
                </div>
              </div>
              {/* Assign task */}
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <UserPlus size={14} color="var(--primary-500)" />
                  Assign cho (tùy chọn)
                </label>
                <select className="form-select" value={form.assigneeName ?? ''}
                  onChange={e => setForm({ ...form, assigneeName: e.target.value || undefined })}>
                  <option value="">— Không assign (chỉ mình thấy) —</option>
                  {availableMembers.map(n => <option key={n} value={n}>{n}</option>)}
                </select>
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  💡 Chỉ bạn và người được assign mới thấy task này. Người được assign sẽ nhận thông báo.
                </p>
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
              <button type="submit" className="btn btn-primary"><Save size={14} /> {item ? 'Cập nhật' : 'Thêm việc'}</button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
