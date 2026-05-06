import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import { formatFullCurrency, getProjectStatusClass } from '@/shared/utils/helpers';
import {
  ArrowLeft, Calendar, Users, Wallet, FileText, ExternalLink,
  Plus, X, Edit3, Trash2, Save, Target, Sparkles, ChevronDown, ChevronUp
} from 'lucide-react';
import type { ProjectTask, Expense } from '@/shared/types';
import { defaultTaskCategories } from '@/shared/data/mockData';
import toast from 'react-hot-toast';

function generateId(prefix = 'pt'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`;
}

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    projects, clients, members, expenses, submissions, projectTasks,
    addProjectTask, updateProjectTask, deleteProjectTask,
    addExpense, updateExpense, deleteExpense, currentUser, addTodo, todos,
  } = useAppStore();

  const project = projects.find(p => p.id === id);
  const [taskForm, setTaskForm] = useState<{ open: boolean; item: ProjectTask | null }>({ open: false, item: null });
  const [expForm,  setExpForm]  = useState<{ open: boolean; item: Expense | null }>({ open: false, item: null });
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const isManager = currentUser?.role === 'Manager';
  const isManagerOrLeader = isManager || currentUser?.role === 'Leader';

  // Tạo thông báo (todo) cho assignees khi phân công
  const notifyAssignees = (taskName: string, assignees: string[], deadline?: string) => {
    if (!currentUser || !project) return;
    assignees.forEach(name => {
      // Tạo todo cho tất cả assignees, kể cả tự assign
      addTodo({
        id: `todo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
        ownerName: currentUser.name,
        assigneeName: name,
        title: `📌 Được phân công task: ${taskName}`,
        description: `Bạn được phân công task "${taskName}" trong dự án "${project.name}".`,
        dueDate: deadline || '',
        priority: 'medium',
        completed: false,
        createdAt: new Date().toISOString(),
      });
    });
  };

  if (!project) {
    return (
      <div className="empty-state">
        <div className="empty-icon"><FileText size={28} /></div>
        <div className="empty-title">Không tìm thấy dự án</div>
        <button className="btn btn-secondary" onClick={() => navigate('/projects')}>
          <ArrowLeft size={16} /> Quay lại
        </button>
      </div>
    );
  }

  const client = clients.find(c => c.id === project.clientId);
  const leader = members.find(m => m.id === project.leader);
  const projectExpenses = expenses.filter(e => e.projectId === project.id);
  const projectSubs = submissions.filter(s => s.projectId === project.id);
  const tasks = projectTasks.filter(t => {
    if (t.projectId !== project.id) return false;
    if (!isManagerOrLeader && currentUser) {
      return t.assignees?.includes(currentUser.name);
    }
    return true;
  });

  // ── Tính số link + quantity đã hoàn thành cho mỗi task ────────────────
  const taskProgress = useMemo(() => {
    return tasks.map(t => {
      const matched = projectSubs.filter(s => {
        if (s.projectTaskId === t.id) return true;
        if (s.projectTaskId) return false; // đã gắn task khác
        // Match theo taskType + taskDetail
        if (t.taskType && s.taskType !== t.taskType) return false;
        if (t.taskDetail && s.taskDetail !== t.taskDetail) return false;
        if (t.assignees && t.assignees.length > 0 && !t.assignees.includes(s.employeeName)) return false;
        return !!t.taskType || !!t.taskDetail;
      });
      const links = matched.reduce((sum, s) => sum + s.links.length, 0);
      const qty = matched.reduce((sum, s) => sum + (s.quantity ?? 0), 0);
      const points = matched.reduce((sum, s) => sum + s.totalPoints, 0);
      // Progress: dựa theo trackingMode của task
      let progress = 0;
      const mode = t.trackingMode || 'link';
      if (mode === 'quantity' && t.targetQuantity && t.targetQuantity > 0) {
        progress = Math.min(100, Math.round((qty / t.targetQuantity) * 100));
      } else if (t.targetLinks > 0) {
        progress = Math.min(100, Math.round((links / t.targetLinks) * 100));
      }
      return { task: t, matched, links, qty, points, progress };
    });
  }, [tasks, projectSubs]);

  // ── Tổng tiến độ project ────────────────────────────────────────────────
  const overallProgress = useMemo(() => {
    if (taskProgress.length === 0) {
      // Fallback: count submissions
      return projectSubs.length > 0 ? 50 : 0;
    }
    const total = taskProgress.reduce((s, x) => s + x.progress, 0);
    return Math.round(total / taskProgress.length);
  }, [taskProgress, projectSubs]);

  // ── Chi phí ─────────────────────────────────────────────────────────────
  const totalExpense = projectExpenses.reduce((s, e) => s + e.amount, 0);
  const articlePoints = projectSubs.reduce((s, x) => s + x.totalPoints, 0);
  const articleCost = (project.costPerPoint ?? 0) * articlePoints;
  const totalCost = totalExpense + articleCost;
  const remaining = project.budget - totalCost;

  return (
    <div>
      <button className="btn btn-ghost" onClick={() => navigate('/projects')} style={{ marginBottom: '16px' }}>
        <ArrowLeft size={16} /> Quay lại danh sách dự án
      </button>

      {/* Project Header */}
      <div className="card" style={{ marginBottom: '20px', padding: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', flexWrap: 'wrap', gap: '16px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{project.name}</h2>
              <span className={`project-type ${project.type.toLowerCase()}`}>{project.type}</span>
              <span className={`status-badge ${getProjectStatusClass(project.status)}`}>
                <span className="status-dot"></span>{project.status}
              </span>
              {project.isMonthly && (
                <span style={{ background: 'var(--accent-100)', color: 'var(--primary-700)',
                               padding: '2px 10px', borderRadius: 'var(--radius-full)',
                               fontSize: '0.72rem', fontWeight: 600 }}>
                  📅 Project tháng
                </span>
              )}
            </div>
            <p style={{ color: 'var(--text-tertiary)', fontSize: '0.9rem', maxWidth: '600px' }}>
              {project.description || '—'}
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', marginTop: '20px', flexWrap: 'wrap' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Calendar size={15} /> Deadline: <strong>{project.deadline || '—'}</strong>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Users size={15} /> Leader: <strong>{leader?.name || project.leader || '—'}</strong>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            <Wallet size={15} /> Client: <strong>{client?.name || '—'}</strong>
          </span>
        </div>

        {/* Auto progress bar */}
        <div style={{ marginTop: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600,
                           display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Sparkles size={13} color="var(--primary-500)" />
              Tiến độ tự động ({tasks.length} task · {projectSubs.length} submission)
            </span>
            <span style={{ fontSize: '0.92rem', fontWeight: 800, color: 'var(--primary-600)' }}>
              {overallProgress}%
            </span>
          </div>
          <div className="progress-bar-bg" style={{ height: 10 }}>
            <div className={`progress-bar-fill ${overallProgress >= 100 ? 'complete' : 'high'}`}
              style={{ width: `${overallProgress}%` }}></div>
          </div>
          <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
            Tự cập nhật từ submission của member — không cần kéo tay.
          </p>
        </div>
      </div>

      {/* Stats — Chi phí + KPI */}
      <div className="stats-grid" style={{ marginBottom: '20px' }}>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Ngân sách</div>
          <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--primary-600)' }}>
            {formatFullCurrency(project.budget)}
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Chi phí phát sinh</div>
          <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--warning)' }}>
            {formatFullCurrency(totalExpense)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Tay nhập {projectExpenses.length} mục
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Chi phí bài viết (auto)</div>
          <div style={{ fontWeight: 800, fontSize: '1.4rem', color: 'var(--accent-500)' }}>
            {formatFullCurrency(articleCost)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            {articlePoints.toFixed(0)}đ × {project.costPerPoint?.toLocaleString('vi-VN') ?? 0}đ/điểm
          </div>
        </div>
        <div className="stat-card">
          <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>Còn lại</div>
          <div style={{ fontWeight: 800, fontSize: '1.4rem',
                        color: remaining >= 0 ? 'var(--success)' : 'var(--danger)' }}>
            {formatFullCurrency(remaining)}
          </div>
          <div style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', marginTop: 2 }}>
            Tổng chi: {formatFullCurrency(totalCost)}
          </div>
        </div>
      </div>

      {/* ── Tasks cứng ─────────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Target size={16} color="var(--primary-500)" /> Task cứng ({tasks.length})
          </span>
          {isManagerOrLeader && (
            <button className="btn btn-primary" onClick={() => setTaskForm({ open: true, item: null })}>
              <Plus size={14} /> Thêm task
            </button>
          )}
        </div>
        <div className="card-body">
          {taskProgress.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
              Chưa có task. Thêm task để theo dõi tiến độ tự động theo submission.
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {taskProgress.map(({ task, matched, links, qty, points, progress }) => (
              <div key={task.id} style={{
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-md)', overflow: 'hidden',
              }}>
                <div style={{ padding: '12px 14px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>{task.name}</span>
                      {task.taskType && (
                        <span style={{ fontSize: '0.72rem', background: 'var(--primary-50)', color: 'var(--primary-700)',
                                       padding: '1px 8px', borderRadius: 4 }}>{task.taskType}</span>
                      )}
                      {task.taskDetail && (
                        <span style={{ fontSize: '0.72rem', background: 'var(--accent-100)', color: 'var(--primary-700)',
                                       padding: '1px 8px', borderRadius: 4 }}>{task.taskDetail}</span>
                      )}
                      {task.assignees && task.assignees.length > 0 && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                          👤 {task.assignees.join(', ')}
                        </span>
                      )}
                      {task.deadline && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--text-tertiary)' }}>
                          📅 {task.deadline}
                        </span>
                      )}
                    </div>
                    <div style={{ marginTop: '6px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem',
                                    marginBottom: '3px', color: 'var(--text-secondary)' }}>
                        <span>
                          {(task.trackingMode || 'link') === 'quantity'
                            ? `📊 ${qty} / ${task.targetQuantity ?? 0} SL`
                            : `🔗 ${links} / ${task.targetLinks} link`}
                          {' '}· {points.toFixed(0)}đ
                          {(task.trackingMode || 'link') === 'quantity' && links > 0 && ` · ${links} link`}
                        </span>
                        <span style={{ fontWeight: 700,
                                       color: progress >= 100 ? 'var(--success)' : progress >= 50 ? 'var(--primary-600)' : 'var(--warning)' }}>
                          {progress}%
                        </span>
                      </div>
                      <div className="progress-bar-bg" style={{ height: 6 }}>
                        <div className={`progress-bar-fill ${progress >= 100 ? 'complete' : progress >= 70 ? 'high' : progress >= 30 ? 'medium' : 'low'}`}
                          style={{ width: `${progress}%` }}></div>
                      </div>
                    </div>
                  </div>
                  <button className="btn btn-icon btn-ghost"
                    onClick={() => setExpandedTask(expandedTask === task.id ? null : task.id)}
                    title="Xem submissions">
                    {expandedTask === task.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                  {isManagerOrLeader && (
                    <>
                      <button className="btn btn-icon btn-ghost"
                        onClick={() => setTaskForm({ open: true, item: task })}>
                        <Edit3 size={14} />
                      </button>
                      <button className="btn btn-icon btn-ghost"
                        style={{ color: 'var(--danger)' }}
                        onClick={() => {
                          if (window.confirm(`Xóa task "${task.name}"?`)) {
                            deleteProjectTask(task.id);
                            toast.success('Đã xóa task');
                          }
                        }}>
                        <Trash2 size={14} />
                      </button>
                    </>
                  )}
                </div>
                {expandedTask === task.id && matched.length > 0 && (
                  <div style={{ background: 'var(--bg-secondary)', padding: '10px 14px',
                                borderTop: '1px solid var(--border-light)' }}>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginBottom: '6px', fontWeight: 600 }}>
                      {matched.length} submission đóng góp
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: 240, overflowY: 'auto' }}>
                      {matched.flatMap(s => s.links.map((l, i) => (
                        <a key={`${s.id}_${i}`} href={l} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: '0.78rem', color: 'var(--primary-500)',
                                   display: 'flex', alignItems: 'center', gap: 4, wordBreak: 'break-all' }}>
                          <ExternalLink size={11} style={{ flexShrink: 0 }} />
                          <span style={{ color: 'var(--text-tertiary)' }}>
                            [{s.employeeName} · {new Date(s.submittedAt).toLocaleDateString('vi-VN')}]
                          </span>{' '}
                          {l}
                        </a>
                      )))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chi phí CRUD ───────────────────────────────────────── */}
      <div className="card" style={{ marginBottom: '20px' }}>
        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wallet size={16} color="var(--warning)" />
            Chi phí phát sinh ({formatFullCurrency(totalExpense)})
          </span>
          {isManagerOrLeader && (
            <button className="btn btn-primary" onClick={() => setExpForm({ open: true, item: null })}>
              <Plus size={14} /> Thêm chi phí
            </button>
          )}
        </div>
        <div className="card-body">
          {projectExpenses.length === 0 && (
            <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text-tertiary)' }}>
              Chưa có chi phí phát sinh.
            </div>
          )}
          {projectExpenses.length > 0 && (
            <div className="data-table-wrapper" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Hạng mục</th>
                    <th>Số tiền</th>
                    <th>Ngày</th>
                    <th>Người ghi</th>
                    <th>Ghi chú</th>
                    {isManagerOrLeader && <th>Thao tác</th>}
                  </tr>
                </thead>
                <tbody>
                  {projectExpenses.map(e => (
                    <tr key={e.id}>
                      <td className="cell-title">{e.category}</td>
                      <td style={{ fontWeight: 600, color: 'var(--primary-600)' }}>{formatFullCurrency(e.amount)}</td>
                      <td className="cell-secondary">{e.date}</td>
                      <td className="cell-secondary">{e.createdBy}</td>
                      <td className="cell-secondary">{e.notes}</td>
                      {isManagerOrLeader && (
                        <td>
                          <div style={{ display: 'flex', gap: '4px' }}>
                            <button className="btn btn-icon btn-ghost"
                              onClick={() => setExpForm({ open: true, item: e })}>
                              <Edit3 size={13} />
                            </button>
                            <button className="btn btn-icon btn-ghost"
                              style={{ color: 'var(--danger)' }}
                              onClick={() => {
                                if (window.confirm(`Xóa chi phí "${e.category}"?`)) {
                                  deleteExpense(e.id);
                                  toast.success('Đã xóa');
                                }
                              }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {taskForm.open && (
        <TaskFormModal
          item={taskForm.item}
          projectId={project.id}
          members={members.map(m => m.name)}
          onClose={() => setTaskForm({ open: false, item: null })}
          onSave={(data) => {
            const newAssignees = data.assignees ?? [];
            if (taskForm.item) {
              const oldAssignees = taskForm.item.assignees ?? [];
              const added = newAssignees.filter(n => !oldAssignees.includes(n));
              updateProjectTask(taskForm.item.id, data);
              // Notify người mới thêm
              if (added.length > 0) {
                notifyAssignees(data.name || taskForm.item.name, added, data.deadline);
              }
              // Bù noti cho người đã có nhưng chưa có todo (do code cũ skip)
              const taskName = data.name || taskForm.item.name;
              const existing = newAssignees.filter(n => !added.includes(n));
              const missingNoti = existing.filter(n => {
                return !todos.some(t =>
                  t.assigneeName === n &&
                  t.title.includes(taskName) &&
                  !t.completed
                );
              });
              if (missingNoti.length > 0) {
                notifyAssignees(taskName, missingNoti, data.deadline);
              }
              const totalNotified = added.length + missingNoti.length;
              if (totalNotified > 0) {
                toast.success(`Đã cập nhật task — thông báo ${totalNotified} người`);
              } else {
                toast.success('Đã cập nhật task');
              }
            } else {
              addProjectTask({ id: generateId(), projectId: project.id, name: '', targetLinks: 0, ...data } as ProjectTask);
              if (newAssignees.length > 0) {
                notifyAssignees(data.name || '', newAssignees, data.deadline);
                toast.success(`Đã thêm task — thông báo ${newAssignees.length} người`);
              } else {
                toast.success('Đã thêm task');
              }
            }
            setTaskForm({ open: false, item: null });
          }}
        />
      )}

      {expForm.open && (
        <ExpenseFormModal
          item={expForm.item}
          projectId={project.id}
          createdBy={currentUser?.name ?? 'Manager'}
          onClose={() => setExpForm({ open: false, item: null })}
          onSave={(data) => {
            if (expForm.item) {
              updateExpense(expForm.item.id, data);
              toast.success('Đã cập nhật chi phí');
            } else {
              addExpense({ id: generateId('exp'), projectId: project.id, ...data } as Expense);
              toast.success('Đã thêm chi phí');
            }
            setExpForm({ open: false, item: null });
          }}
        />
      )}
    </div>
  );
}

// ── Task form modal ────────────────────────────────────────────────────────
function TaskFormModal({ item, projectId, members, onClose, onSave }: {
  item: ProjectTask | null;
  projectId: string;
  members: string[];
  onClose: () => void;
  onSave: (data: Partial<ProjectTask>) => void;
}) {
  const [form, setForm] = useState<Partial<ProjectTask>>(item || {
    projectId, name: '', trackingMode: 'link', taskType: '', taskDetail: '',
    targetLinks: 1, targetQuantity: 0, assignees: [] as string[], deadline: '', notes: '',
  });

  const mode = form.trackingMode || 'link';

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '560px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa Task' : 'Thêm Task'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!form.name) { toast.error('Cần tên task'); return; } onSave(form); }}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Tên task *</label>
              <input className="form-input" value={form.name ?? ''}
                onChange={e => setForm({ ...form, name: e.target.value })}
                placeholder="VD: Bài viết dinh dưỡng cho mẹ" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Đầu việc (taskType)</label>
                <select className="form-select" value={form.taskType ?? ''}
                  onChange={e => setForm({ ...form, taskType: e.target.value })}>
                  <option value="">— (mọi loại)</option>
                  {defaultTaskCategories.map(c => (
                    <option key={c.id} value={c.taskTypeName}>{c.taskTypeName}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Chi tiết (taskDetail)</label>
                <input className="form-input" value={form.taskDetail ?? ''}
                  onChange={e => setForm({ ...form, taskDetail: e.target.value })}
                  placeholder="VD: SEO, FAQ, Bài AI" />
              </div>
            </div>

            {/* ── Tracking mode toggle ── */}
            <div className="form-group">
              <label className="form-label" style={{ marginBottom: '8px' }}>Tracking tiến độ theo</label>
              <div style={{ display: 'flex', gap: '0', borderRadius: 'var(--radius-md)', overflow: 'hidden',
                            border: '1px solid var(--border-medium)' }}>
                <button type="button" onClick={() => setForm({ ...form, trackingMode: 'link' })}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                    fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s ease',
                    background: mode === 'link' ? 'var(--primary-500)' : 'var(--bg-secondary)',
                    color: mode === 'link' ? '#fff' : 'var(--text-secondary)',
                  }}>
                  🔗 Theo link
                </button>
                <button type="button" onClick={() => setForm({ ...form, trackingMode: 'quantity' })}
                  style={{
                    flex: 1, padding: '10px 16px', border: 'none', cursor: 'pointer',
                    borderLeft: '1px solid var(--border-medium)',
                    fontWeight: 600, fontSize: '0.85rem', transition: 'all 0.2s ease',
                    background: mode === 'quantity' ? 'var(--primary-500)' : 'var(--bg-secondary)',
                    color: mode === 'quantity' ? '#fff' : 'var(--text-secondary)',
                  }}>
                  📊 Theo số lượng
                </button>
              </div>
            </div>

            {/* ── Target field based on tracking mode ── */}
            <div className="form-group">
              {mode === 'link' ? (
                <>
                  <label className="form-label">Target số link *</label>
                  <input className="form-input" type="number" min="1" value={form.targetLinks ?? 1}
                    onChange={e => setForm({ ...form, targetLinks: parseInt(e.target.value) || 1 })} />
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Tiến độ = số link đã submit / target link
                  </p>
                </>
              ) : (
                <>
                  <label className="form-label">Target số lượng *</label>
                  <input className="form-input" type="number" min="1" value={form.targetQuantity ?? 1}
                    onChange={e => setForm({ ...form, targetQuantity: parseInt(e.target.value) || 1 })} />
                  <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                    Tiến độ = số lượng đã submit ở KPI / target số lượng
                  </p>
                </>
              )}
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Phân công cho</label>
                <div style={{ maxHeight: '140px', overflowY: 'auto', border: '1px solid var(--border-light)',
                              borderRadius: 'var(--radius-sm)', padding: '6px' }}>
                  {members.map(n => {
                    const checked = (form.assignees ?? []).includes(n);
                    return (
                      <label key={n} style={{ display: 'flex', alignItems: 'center', gap: '6px',
                                               padding: '4px 6px', borderRadius: 4, cursor: 'pointer',
                                               fontSize: '0.84rem',
                                               background: checked ? 'var(--primary-50)' : 'transparent' }}>
                        <input type="checkbox" checked={checked}
                          onChange={() => {
                            const curr = form.assignees ?? [];
                            setForm({ ...form, assignees: checked ? curr.filter(x => x !== n) : [...curr, n] });
                          }} />
                        {n}
                      </label>
                    );
                  })}
                </div>
                {(form.assignees ?? []).length > 0 && (
                  <p style={{ fontSize: '0.74rem', color: 'var(--primary-600)', marginTop: 4 }}>
                    Đã chọn: {(form.assignees ?? []).join(', ')}
                  </p>
                )}
              </div>
              <div className="form-group">
                <label className="form-label">Deadline</label>
                <input className="form-input" type="date" value={form.deadline ?? ''}
                  onChange={e => setForm({ ...form, deadline: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <textarea className="form-textarea" rows={2} value={form.notes ?? ''}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div style={{ padding: '10px', background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)',
                          fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              💡 {mode === 'link'
                ? 'Member submit link sẽ tự động cập nhật tiến độ task này.'
                : 'Member submit KPI và nhập "Số lượng hoàn thành" sẽ tự động cập nhật tiến độ.'}
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

// ── Expense form modal ────────────────────────────────────────────────────
function ExpenseFormModal({ item, projectId, createdBy, onClose, onSave }: {
  item: Expense | null;
  projectId: string;
  createdBy: string;
  onClose: () => void;
  onSave: (data: Partial<Expense>) => void;
}) {
  const [form, setForm] = useState<Partial<Expense>>(item || {
    projectId, category: '', amount: 0,
    date: new Date().toISOString().slice(0, 10),
    createdBy, notes: '',
  });

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
        <div className="modal-header">
          <h3 className="modal-title">{item ? 'Chỉnh sửa chi phí' : 'Thêm chi phí'}</h3>
          <button className="modal-close" onClick={onClose}><X size={16} /></button>
        </div>
        <form onSubmit={e => { e.preventDefault(); if (!form.category) { toast.error('Cần hạng mục'); return; } onSave(form); }}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Hạng mục *</label>
              <input className="form-input" value={form.category ?? ''}
                onChange={e => setForm({ ...form, category: e.target.value })}
                placeholder="VD: Thuê CTV viết bài, Mua hình ảnh,..." />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Số tiền (VNĐ) *</label>
                <input className="form-input" type="number" min="0" value={form.amount ?? 0}
                  onChange={e => setForm({ ...form, amount: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="form-group">
                <label className="form-label">Ngày</label>
                <input className="form-input" type="date" value={form.date ?? ''}
                  onChange={e => setForm({ ...form, date: e.target.value })} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Ghi chú</label>
              <textarea className="form-textarea" rows={2} value={form.notes ?? ''}
                onChange={e => setForm({ ...form, notes: e.target.value })} />
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
