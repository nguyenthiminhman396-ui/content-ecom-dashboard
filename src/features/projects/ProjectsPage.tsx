import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import { formatCurrency, getProjectStatusClass, generateId } from '@/shared/utils/helpers';
import {
  FolderKanban, LayoutGrid, List, Calendar, Users,
  Plus, Filter, ChevronRight, Edit3, Trash2, X
} from 'lucide-react';
import type { ProjectType, ProjectStatus, Project } from '@/shared/types';
import toast from 'react-hot-toast';

const projectTypes: ProjectType[] = ['Campaign', 'Series', 'Client'];
const projectStatuses: ProjectStatus[] = ['Đang chạy', 'Hoàn thành', 'Tạm dừng', 'Hủy'];

export default function Projects() {
  const { projects, contents, clients, expenses, members, addProject, updateProject, deleteProject, currentUser, addTodo } = useAppStore();
  const canManage = currentUser?.role === 'Manager' || currentUser?.role === 'Leader';
  const navigate = useNavigate();
  const [view, setView] = useState<'card' | 'list'>('card');
  const [filterType, setFilterType] = useState<ProjectType | ''>('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | ''>('');
  const [filterClient, setFilterClient] = useState('');
  
  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Project | null>(null);

  const filtered = useMemo(() => {
    return projects.filter(p => {
      if (filterType && p.type !== filterType) return false;
      if (filterStatus && p.status !== filterStatus) return false;
      if (filterClient && p.clientId !== filterClient) return false;
      return true;
    });
  }, [projects, filterType, filterStatus, filterClient]);

  const getProjectProgress = (projectId: string) => {
    const pContents = contents.filter(c => c.projectId === projectId);
    if (pContents.length === 0) return 0;
    return Math.round(pContents.reduce((s, c) => s + c.progress, 0) / pContents.length);
  };

  const getProjectSpent = (projectId: string) => {
    return expenses.filter(e => e.projectId === projectId).reduce((s, e) => s + e.amount, 0);
  };

  const getContentCounts = (projectId: string) => {
    const pContents = contents.filter(c => c.projectId === projectId);
    return {
      total: pContents.length,
      done: pContents.filter(c => c.status === 'Đã đăng' || c.status === 'Đã duyệt').length,
      working: pContents.filter(c => c.status === 'Đang làm').length,
      overdue: pContents.filter(c => c.status === 'Trễ hạn').length,
    };
  };

  const handleDelete = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (window.confirm('Bạn có chắc muốn xóa dự án này? Toàn bộ chi phí & nội dung thuộc dự án sẽ có thể bị phân mảnh.')) {
      deleteProject(id);
      toast.success('Đã xóa dự án');
    }
  };

  const openEdit = (e: React.MouseEvent, project: Project) => {
    e.stopPropagation();
    setEditItem(project);
    setShowForm(true);
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><FolderKanban size={20} /></span>
            Quản lý Dự án
          </h2>
          <p className="page-subtitle">{filtered.length} dự án</p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} /> Tạo dự án mới
          </button>
        )}
      </div>

      <div className="filter-bar">
        <Filter size={16} style={{ color: 'var(--text-tertiary)' }} />
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as ProjectType | '')}>
          <option value="">Tất cả loại</option>
          {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | '')}>
          <option value="">Tất cả trạng thái</option>
          {projectStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="filter-select" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
          <option value="">Tất cả client</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>

        <div style={{ marginLeft: 'auto' }}>
          <div className="view-toggle">
            <button className={view === 'card' ? 'active' : ''} onClick={() => setView('card')}>
              <LayoutGrid size={14} /> Cards
            </button>
            <button className={view === 'list' ? 'active' : ''} onClick={() => setView('list')}>
              <List size={14} /> List
            </button>
          </div>
        </div>
      </div>

      {view === 'card' ? (
        <div className="projects-grid">
          {filtered.map((project) => {
            const client = clients.find(c => c.id === project.clientId);
            const leader = members.find(m => m.id === project.leader);
            const progress = getProjectProgress(project.id);
            const spent = getProjectSpent(project.id);
            const counts = getContentCounts(project.id);
            const typeClass = project.type.toLowerCase();

            return (
              <div
                key={project.id}
                className="project-card animate-in"
                onClick={() => navigate(`/projects/${project.id}`)}
              >
                <div className="project-header">
                  <div>
                    <div className="project-name">{project.name}</div>
                    <div className="project-meta" style={{ marginTop: '8px', marginBottom: 0 }}>
                      <span><Calendar size={13} /> {project.deadline}</span>
                      {leader && <span><Users size={13} /> {leader.name}</span>}
                    </div>
                  </div>
                  <span className={`project-type ${typeClass}`}>{project.type}</span>
                </div>

                <div style={{ margin: '16px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Tiến độ</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: 'var(--primary-600)' }}>{progress}%</span>
                  </div>
                  <div className="progress-bar-bg">
                    <div
                      className={`progress-bar-fill ${progress < 30 ? 'low' : progress < 70 ? 'medium' : progress === 100 ? 'complete' : 'high'}`}
                      style={{ width: `${progress}%` }}
                    ></div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '0.8rem', color: 'var(--text-tertiary)', marginBottom: '8px' }}>
                  <span>{client?.name || '—'}</span>
                  <span className={`status-badge ${getProjectStatusClass(project.status)}`}>
                    <span className="status-dot"></span>{project.status}
                  </span>
                </div>
                
                {canManage && (
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px', marginBottom: '12px' }}>
                    <button className="btn btn-icon btn-ghost" onClick={(e) => openEdit(e, project)} title="Sửa dự án">
                      <Edit3 size={14} />
                    </button>
                    <button className="btn btn-icon btn-ghost" onClick={(e) => handleDelete(e, project.id)} title="Xóa dự án" style={{ color: 'var(--danger)' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}

                <div className="project-stats" style={{ marginTop: '0' }}>
                  <div className="stat-item">
                    <div className="stat-value">{counts.total}</div>
                    <div className="stat-label">Nội dung</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value" style={{ color: counts.overdue > 0 ? 'var(--danger)' : 'inherit' }}>{counts.overdue}</div>
                    <div className="stat-label">Trễ hạn</div>
                  </div>
                  <div className="stat-item">
                    <div className="stat-value">{formatCurrency(project.budget - spent)}</div>
                    <div className="stat-label">Còn lại</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="data-table-wrapper">
          <table className="data-table">
            <thead>
              <tr>
                <th>Tên dự án</th>
                <th>Loại</th>
                <th>Client</th>
                <th>Leader</th>
                <th>Tiến độ</th>
                <th>Ngân sách</th>
                <th>Deadline</th>
                <th>Trạng thái</th>
                <th>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((project) => {
                const client = clients.find(c => c.id === project.clientId);
                const leader = members.find(m => m.id === project.leader);
                const progress = getProjectProgress(project.id);
                const spent = getProjectSpent(project.id);

                return (
                  <tr key={project.id} onClick={() => navigate(`/projects/${project.id}`)} style={{ cursor: 'pointer' }}>
                    <td className="cell-title">{project.name}</td>
                    <td><span className={`project-type ${project.type.toLowerCase()}`}>{project.type}</span></td>
                    <td className="cell-secondary">{client?.name || '—'}</td>
                    <td className="cell-secondary">{leader?.name || '—'}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                        <div className="progress-bar-bg" style={{ flex: 1 }}>
                          <div className={`progress-bar-fill ${progress === 100 ? 'complete' : 'high'}`} style={{ width: `${progress}%` }}></div>
                        </div>
                        <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{progress}%</span>
                      </div>
                    </td>
                    <td className="cell-secondary">{formatCurrency(spent)} / {formatCurrency(project.budget)}</td>
                    <td className="cell-secondary">{project.deadline}</td>
                    <td>
                      <span className={`status-badge ${getProjectStatusClass(project.status)}`}>
                        <span className="status-dot"></span>{project.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '4px' }}>
                         {canManage && (
                           <>
                             <button className="btn btn-icon btn-ghost" onClick={(e) => openEdit(e, project)}>
                               <Edit3 size={14} />
                             </button>
                             <button className="btn btn-icon btn-ghost" onClick={(e) => handleDelete(e, project.id)} style={{ color: 'var(--danger)' }}>
                               <Trash2 size={14} />
                             </button>
                           </>
                         )}
                         <ChevronRight size={16} style={{ color: 'var(--text-tertiary)', marginLeft: '8px' }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showForm && (
        <ProjectFormModal
          item={editItem}
          onClose={() => { setShowForm(false); setEditItem(null); }}
          onSave={(data) => {
            let leaderChanged = false;
            let leaderName = '';
            
            if (data.leader) {
              const newLeader = members.find(m => m.id === data.leader);
              leaderName = newLeader?.name || '';
              if (!editItem) {
                leaderChanged = true;
              } else if (editItem.leader !== data.leader) {
                leaderChanged = true;
              }
            }

            if (editItem) {
              updateProject(editItem.id, data);
              toast.success('Đã cập nhật dự án');
            } else {
              const newId = generateId('P', projects);
              addProject({ ...data, id: newId } as Project);
              toast.success('Đã thêm dự án mới');
            }

            // Gửi thông báo nếu thay đổi leader / có leader mới (kể cả tự assign)
            if (leaderChanged && leaderName && currentUser) {
              addTodo({
                id: `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
                ownerName: currentUser.name,
                assigneeName: leaderName,
                title: `🚀 Được phân công làm Leader dự án`,
                description: `Bạn được chọn làm Leader cho dự án "${data.name}".`,
                dueDate: data.deadline || '',
                priority: 'high',
                completed: false,
                createdAt: new Date().toISOString(),
              });
            }

            setShowForm(false);
            setEditItem(null);
          }}
        />
      )}
    </div>
  );
}

function ProjectFormModal({ item, onClose, onSave }: {
  item: Project | null;
  onClose: () => void;
  onSave: (data: Partial<Project>) => void;
}) {
  const { clients, members } = useAppStore();
  const [form, setForm] = useState<Partial<Project>>(item || {
    name: '',
    type: 'Campaign',
    clientId: clients[0]?.id || '',
    budget: 0,
    deadline: '',
    status: 'Đang chạy',
    leader: '',
    description: '',
  });

  const handleChange = (field: keyof Project, value: string | number) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.clientId || !form.leader || !form.deadline) {
      toast.error('Vui lòng điền các thông tin bắt buộc (*)');
      return;
    }
    onSave(form);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa dự án' : 'Tạo dự án mới'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Tên dự án *</label>
              <input className="form-input" value={form.name || ''} onChange={e => handleChange('name', e.target.value)} placeholder="Nhập tên dự án" />
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Khách hàng (Client) *</label>
                <select className="form-select" value={form.clientId || ''} onChange={e => handleChange('clientId', e.target.value)}>
                  <option value="">Chọn khách hàng</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Loại dự án</label>
                <select className="form-select" value={form.type || ''} onChange={e => handleChange('type', e.target.value)}>
                  {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Leader phụ trách *</label>
                <select className="form-select" value={form.leader || ''} onChange={e => handleChange('leader', e.target.value)}>
                  <option value="">Chọn leader</option>
                  {members.filter(m => m.role === 'Leader' || m.role === 'Manager').map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Deadline *</label>
                <input className="form-input" type="date" value={form.deadline || ''} onChange={e => handleChange('deadline', e.target.value)} />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Ngân sách (VNĐ)</label>
                <input className="form-input" type="number" min="0" value={form.budget || 0} onChange={e => handleChange('budget', parseInt(e.target.value) || 0)} />
              </div>
              <div className="form-group">
                <label className="form-label">Trạng thái</label>
                <select className="form-select" value={form.status || ''} onChange={e => handleChange('status', e.target.value)}>
                  {projectStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Mô tả dự án</label>
              <textarea className="form-textarea" value={form.description || ''} onChange={e => handleChange('description', e.target.value)} placeholder="Chi tiết, mục tiêu, link kế hoạch..." />
            </div>
          </div>

          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={onClose}>Hủy</button>
            <button type="submit" className="btn btn-primary">{item ? 'Cập nhật' : 'Tạo mới'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}
