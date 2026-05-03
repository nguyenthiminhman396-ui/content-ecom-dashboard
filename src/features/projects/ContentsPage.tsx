import { useState, useMemo } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import {
  Package, Filter, Edit3, Trash2, Plus, X, ExternalLink, CheckCircle, XCircle, Send
} from 'lucide-react';
import toast from 'react-hot-toast';
import type { Content, ContentStatus, ContentType, HealthTopic } from '@/shared/types';
import { getContentStatusClass } from '@/shared/utils/helpers';

const contentTypes: ContentType[] = ['Bài viết', 'Video', 'Infographic', 'Social Post', 'Podcast'];
// @ts-expect-error reserved for filter UI
const healthTopics: HealthTopic[] = ['Dinh dưỡng', 'Vận động', 'Sức khỏe tâm thần', 'Bệnh mãn tính', 'Sức khỏe trẻ em', 'Sức khỏe phụ nữ', 'Thuốc & Điều trị', 'Phòng bệnh'];
const statuses: ContentStatus[] = ['Chờ bắt đầu', 'Đang làm', 'Chờ duyệt', 'Đã duyệt', 'Đã đăng', 'Trễ hạn'];

export default function ContentsPage() {
  const { contents, projects, members, addContent, updateContent, deleteContent } = useAppStore();
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Content | null>(null);
  const [filterProject, setFilterProject] = useState('');
  const [filterStatus, setFilterStatus] = useState<ContentStatus | ''>('');
  const [filterType, setFilterType] = useState<ContentType | ''>('');

  const filtered = useMemo(() => {
    return contents.filter(c => {
      if (filterProject && c.projectId !== filterProject) return false;
      if (filterStatus && c.status !== filterStatus) return false;
      if (filterType && c.type !== filterType) return false;
      return true;
    });
  }, [contents, filterProject, filterStatus, filterType]);

  // Summary
  const summary = useMemo(() => ({
    total: contents.length,
    done: contents.filter(c => c.status === 'Đã đăng' || c.status === 'Đã duyệt').length,
    working: contents.filter(c => c.status === 'Đang làm').length,
    overdue: contents.filter(c => c.status === 'Trễ hạn').length,
  }), [contents]);

  const handleApprove = (content: Content, result: 'Đã duyệt' | 'Từ chối') => {
    const updates: Partial<Content> = { approvalResult: result };
    if (result === 'Đã duyệt') {
      if (content.approvalLevel === 'Leader') {
        updates.approvalLevel = 'Client';
        updates.approvalResult = 'Chờ';
        toast.success('Đã duyệt Leader. Chuyển sang Client.');
      } else {
        updates.status = 'Đã duyệt';
        toast.success('Đã duyệt! Sẵn sàng đăng.');
      }
    } else {
      updates.status = 'Đang làm';
      toast('Bị từ chối → chuyển về Đang làm.', { icon: '⚠️' });
    }
    updateContent(content.id, updates);
  };

  const handleSubmitForReview = (content: Content) => {
    updateContent(content.id, { status: 'Chờ duyệt', approvalLevel: 'Leader', approvalResult: 'Chờ' });
    toast.success('Đã gửi duyệt');
  };

  const handleDelete = (id: string) => {
    if (window.confirm('Xóa nội dung này?')) {
      deleteContent(id);
      toast.success('Đã xóa');
    }
  };

  const generateId = () => `C${Date.now().toString(36)}`;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><Package size={20} /></span>
            Quản lý sản phẩm dự án
          </h2>
          <p className="page-subtitle">{filtered.length} sản phẩm</p>
        </div>
        <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
          <Plus size={16} /> Thêm sản phẩm
        </button>
      </div>

      {/* Summary */}
      <div className="stats-grid" style={{ marginBottom: '16px' }}>
        {[
          { label: 'Tổng', value: summary.total, color: 'var(--primary-600)', bg: 'var(--primary-50)' },
          { label: 'Hoàn thành', value: summary.done, color: 'var(--success)', bg: 'var(--success-bg)' },
          { label: 'Đang làm', value: summary.working, color: 'var(--blue-600)', bg: 'var(--blue-100)' },
          { label: 'Trễ hạn', value: summary.overdue, color: 'var(--danger)', bg: 'var(--danger-bg)' },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: 36, height: 36, borderRadius: 'var(--radius-md)', background: s.bg, color: s.color,
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.1rem' }}>
                {s.value}
              </div>
              <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div className="filter-bar">
        <Filter size={16} style={{ color: 'var(--text-tertiary)' }} />
        <select className="filter-select" value={filterProject} onChange={e => setFilterProject(e.target.value)}>
          <option value="">Tất cả dự án</option>
          {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as ContentStatus | '')}>
          <option value="">Tất cả trạng thái</option>
          {statuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as ContentType | '')}>
          <option value="">Tất cả loại</option>
          {contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>

      <div className="data-table-wrapper">
        <table className="data-table">
          <thead>
            <tr>
              <th>Tiêu đề</th><th>Dự án</th><th>Loại</th><th>Phụ trách</th>
              <th>Deadline</th><th>Trạng thái</th><th>Phê duyệt</th><th>Tiến độ</th><th>Thao tác</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => {
              const project = projects.find(p => p.id === c.projectId);
              const assignee = members.find(m => m.id === c.assignee);
              return (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>{c.title}</div>
                    {c.link && (
                      <a href={c.link} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: '0.75rem', color: 'var(--primary-500)', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                        <ExternalLink size={10} /> Xem
                      </a>
                    )}
                  </td>
                  <td className="cell-secondary">
                    <span style={{ background: 'var(--bg-secondary)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem', fontWeight: 600 }}>
                      {project?.name || 'Chưa gán'}
                    </span>
                  </td>
                  <td className="cell-secondary">{c.type}</td>
                  <td className="cell-secondary">{assignee?.name || c.assignee}</td>
                  <td className="cell-secondary">{c.deadline}</td>
                  <td>
                    <span className={`status-badge ${getContentStatusClass(c.status)}`}>
                      <span className="status-dot"></span>{c.status}
                    </span>
                  </td>
                  <td>
                    {c.approvalLevel === 'Chưa gửi' ? (
                      <button className="btn btn-sm btn-secondary" onClick={() => handleSubmitForReview(c)}>
                        <Send size={12} /> Gửi duyệt
                      </button>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 600,
                          color: c.approvalResult === 'Đã duyệt' ? 'var(--success)' : c.approvalResult === 'Từ chối' ? 'var(--danger)' : 'var(--text-tertiary)' }}>
                          {c.approvalLevel}: {c.approvalResult}
                        </span>
                        {c.approvalResult === 'Chờ' && (
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-sm" style={{ background: 'var(--success-bg)', color: 'var(--success)', padding: '2px 6px' }}
                              onClick={() => handleApprove(c, 'Đã duyệt')}><CheckCircle size={12} /></button>
                            <button className="btn btn-sm" style={{ background: 'var(--danger-bg)', color: 'var(--danger)', padding: '2px 6px' }}
                              onClick={() => handleApprove(c, 'Từ chối')}><XCircle size={12} /></button>
                          </div>
                        )}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: '90px' }}>
                      <div className="progress-bar-bg" style={{ flex: 1 }}>
                        <div className={`progress-bar-fill ${c.progress === 100 ? 'complete' : c.progress >= 70 ? 'high' : c.progress >= 30 ? 'medium' : 'low'}`}
                          style={{ width: `${c.progress}%` }}></div>
                      </div>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, minWidth: '28px' }}>{c.progress}%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button className="btn btn-icon btn-ghost" onClick={() => { setEditItem(c); setShowForm(true); }}><Edit3 size={14} /></button>
                      <button className="btn btn-icon btn-ghost" onClick={() => handleDelete(c.id)} style={{ color: 'var(--danger)' }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                  Chưa có sản phẩm. Bấm "Thêm sản phẩm" để tạo mới.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ContentFormModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data) => {
            if (editItem) {
              updateContent(editItem.id, data);
              toast.success('Đã cập nhật');
            } else {
              addContent({ ...data, id: generateId() } as Content);
              toast.success('Đã thêm sản phẩm');
            }
            setShowForm(false); setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function ContentFormModal({ item, onClose, onSave }: {
  item: Content | null; onClose: () => void; onSave: (data: Partial<Content>) => void;
}) {
  const { projects, members } = useAppStore();
  const [form, setForm] = useState<Partial<Content>>(item || {
    projectId: '', title: '', type: 'Bài viết', topic: 'Dinh dưỡng',
    assignee: '', deadline: '', status: 'Chờ bắt đầu', progress: 0,
    approvalLevel: 'Chưa gửi', approver: '', approvalResult: 'Chờ', notes: '', link: '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { toast.error('Nhập tiêu đề'); return; }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '580px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Tiêu đề *</label>
              <input className="form-input" value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Dự án</label>
                <select className="form-select" value={form.projectId || ''} onChange={e => setForm({ ...form, projectId: e.target.value })}>
                  <option value="">Chọn dự án</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Loại</label>
                <select className="form-select" value={form.type || ''} onChange={e => setForm({ ...form, type: e.target.value as ContentType })}>
                  {contentTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phụ trách</label>
                <select className="form-select" value={form.assignee || ''} onChange={e => setForm({ ...form, assignee: e.target.value })}>
                  <option value="">Chọn</option>
                  {members.filter(m => m.role !== 'Client').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Deadline</label>
                <input className="form-input" type="date" value={form.deadline || ''} onChange={e => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select className="form-select" value={form.status || ''} onChange={e => setForm({ ...form, status: e.target.value as ContentStatus })}>
                  {statuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Tiến độ: {form.progress || 0}%</label>
                <input type="range" min="0" max="100" step="5" value={form.progress || 0}
                  onChange={e => setForm({ ...form, progress: parseInt(e.target.value) })}
                  style={{ width: '100%', accentColor: 'var(--primary-500)' }} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Link</label>
              <input className="form-input" value={form.link || ''} onChange={e => setForm({ ...form, link: e.target.value })} placeholder="https://..." />
            </div>
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <textarea className="form-textarea" value={form.notes || ''} onChange={e => setForm({ ...form, notes: e.target.value })} rows={2} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">{item ? 'Cập nhật' : 'Thêm mới'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
