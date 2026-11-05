import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import { formatCurrency, getProjectStatusClass, makeId } from '@/shared/utils/helpers';
import {
  FolderKanban, LayoutGrid, List, Calendar, Users, Search,
  Plus, Filter, ChevronRight, ChevronDown, Edit3, Trash2, X, MoreHorizontal,
  CheckCircle2, Play, Pause, RotateCcw, Ban,
} from 'lucide-react';
import type { ProjectType, ProjectStatus, Project } from '@/shared/types';
import toast from 'react-hot-toast';
import { summarizeProject, sortByRisk, type ProjectSummary } from '@/shared/selectors/projectProgress';
import ScheduleBadge from '@/shared/components/ScheduleBadge';

const projectTypes: ProjectType[] = ['Campaign', 'Series', 'Client'];
const projectStatuses: ProjectStatus[] = ['Chưa bắt đầu', 'Đang chạy', 'Hoàn thành', 'Tạm dừng', 'Hủy'];
const CLOSED_STATUSES: ProjectStatus[] = ['Hoàn thành', 'Hủy'];
/** Số ngày coi là "sắp đến hạn" */
const SOON_DAYS = 14;

type QuickFilter = 'running' | 'overdue' | 'behind' | 'ready' | 'soon';
type GroupBy = 'none' | 'leader';

interface Section {
  key: string;
  title: string;
  hint?: string;
  items: ProjectSummary[];
}

const isClosed = (s: ProjectSummary) => CLOSED_STATUSES.includes(s.project.status);
const isRunning = (s: ProjectSummary) => s.project.status === 'Đang chạy';
/** Đang chạy nhưng việc đã đủ 100% → chờ Manager đóng */
const isReadyToClose = (s: ProjectSummary) => isRunning(s) && s.progress >= 100;
const isOverdue = (s: ProjectSummary) => isRunning(s) && s.schedule.status === 'overdue';
const isBehind = (s: ProjectSummary) => isRunning(s) && s.schedule.status === 'behind';
const isDueSoon = (s: ProjectSummary) =>
  (isRunning(s) || s.project.status === 'Chưa bắt đầu')
  && s.schedule.status !== 'done' && s.schedule.status !== 'overdue'
  && s.schedule.daysLeft !== undefined && s.schedule.daysLeft >= 0 && s.schedule.daysLeft <= SOON_DAYS;

const QUICK_FILTERS: Record<QuickFilter, { label: string; test: (s: ProjectSummary) => boolean; tone: string }> = {
  running: { label: 'Đang chạy', test: isRunning, tone: 'neutral' },
  overdue: { label: 'Quá hạn', test: isOverdue, tone: 'danger' },
  behind: { label: 'Chậm tiến độ', test: isBehind, tone: 'warning' },
  soon: { label: `Đến hạn ≤ ${SOON_DAYS} ngày`, test: isDueSoon, tone: 'info' },
  ready: { label: 'Sẵn sàng đóng', test: isReadyToClose, tone: 'success' },
};

/** Đang hoạt động: rủi ro trước; Tạm dừng xuống cuối */
function sortActive(a: ProjectSummary, b: ProjectSummary): number {
  const pa = a.project.status === 'Tạm dừng' ? 1 : 0;
  const pb = b.project.status === 'Tạm dừng' ? 1 : 0;
  if (pa !== pb) return pa - pb;
  return sortByRisk(a, b);
}

const sortClosed = (a: ProjectSummary, b: ProjectSummary) =>
  (b.project.deadline || '').localeCompare(a.project.deadline || '');

function formatDay(d?: string): string {
  const m = d ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d) : null;
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (d || '—');
}

/** Màu thanh tiến độ theo rủi ro, không theo con số */
function barClass(s: ProjectSummary): string {
  if (s.progress >= 100 || s.project.status === 'Hoàn thành') return 'complete';
  if (s.project.status === 'Hủy' || s.project.status === 'Tạm dừng') return 'muted';
  if (s.schedule.status === 'overdue') return 'low';
  if (s.schedule.status === 'behind') return 'medium';
  return 'high';
}

export default function Projects() {
  const { projects, clients, expenses, members, submissions, projectTasks, addProject, updateProject, deleteProject, currentUser, addTodo } = useAppStore();
  const canManage = currentUser?.role === 'Manager' || currentUser?.role === 'Leader';
  const navigate = useNavigate();
  const [view, setView] = useState<'card' | 'list'>('card');
  const [filterType, setFilterType] = useState<ProjectType | ''>('');
  const [filterStatus, setFilterStatus] = useState<ProjectStatus | ''>('');
  const [filterClient, setFilterClient] = useState('');
  const [search, setSearch] = useState('');
  const [quick, setQuick] = useState<QuickFilter | null>(null);
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const [showClosed, setShowClosed] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editItem, setEditItem] = useState<Project | null>(null);

  const today = useMemo(() => new Date(), []);

  // Cùng 1 cách tính tiến độ + lịch với Dashboard và trang chi tiết
  const summaries = useMemo(
    () => projects.map(p => summarizeProject(p, projectTasks, submissions, { today })),
    [projects, projectTasks, submissions, today],
  );

  const spentByProject = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of expenses) if (e.projectId) m.set(e.projectId, (m.get(e.projectId) ?? 0) + e.amount);
    return m;
  }, [expenses]);

  const memberName = useMemo(() => new Map(members.map(m => [m.id, m.name])), [members]);
  const clientName = useMemo(() => new Map(clients.map(c => [c.id, c.name])), [clients]);
  // Chỉ hiện client khi các dự án thực sự thuộc nhiều client khác nhau
  const showClient = useMemo(() => new Set(projects.map(p => p.clientId)).size > 1, [projects]);

  // Lọc cơ bản (loại / client / tìm kiếm) — dùng cho cả thanh tổng quan
  const base = useMemo(() => {
    const q = search.trim().toLowerCase();
    return summaries.filter(({ project: p }) => {
      if (filterType && p.type !== filterType) return false;
      if (filterClient && p.clientId !== filterClient) return false;
      if (q && !p.name.toLowerCase().includes(q) && !(memberName.get(p.leader) ?? '').toLowerCase().includes(q)) return false;
      return true;
    });
  }, [summaries, filterType, filterClient, search, memberName]);

  const counts = useMemo(() => {
    const c = {} as Record<QuickFilter, number>;
    for (const k of Object.keys(QUICK_FILTERS) as QuickFilter[]) c[k] = base.filter(QUICK_FILTERS[k].test).length;
    return c;
  }, [base]);

  const visible = useMemo(() => base.filter(s => {
    if (filterStatus && s.project.status !== filterStatus) return false;
    if (quick && !QUICK_FILTERS[quick].test(s)) return false;
    return true;
  }), [base, filterStatus, quick]);

  const active = useMemo(() => visible.filter(s => !isClosed(s)).sort(sortActive), [visible]);
  const closed = useMemo(() => visible.filter(isClosed).sort(sortClosed), [visible]);
  const closedTotal = useMemo(() => base.filter(isClosed).length, [base]);
  const activeTotal = base.length - closedTotal;
  // Lọc đúng trạng thái đã đóng → mở sẵn nhóm "Đã đóng"
  const closedOpen = showClosed || (filterStatus !== '' && CLOSED_STATUSES.includes(filterStatus));

  const sections: Section[] = useMemo(() => {
    if (groupBy === 'none') return [{ key: 'all', title: '', items: active }];
    const byLeader = new Map<string, ProjectSummary[]>();
    for (const s of active) {
      const k = s.project.leader || '';
      if (!byLeader.has(k)) byLeader.set(k, []);
      byLeader.get(k)!.push(s);
    }
    return [...byLeader.entries()]
      .map(([leader, items]) => {
        const risk = items.filter(s => isOverdue(s) || isBehind(s)).length;
        const running = items.filter(isRunning).length;
        return {
          key: leader || 'none',
          title: memberName.get(leader) ?? 'Chưa có leader',
          hint: [`${running} đang chạy`, risk > 0 ? `${risk} cần chú ý` : ''].filter(Boolean).join(' · '),
          items,
          risk,
        };
      })
      .sort((a, b) => b.risk - a.risk || b.items.length - a.items.length || a.title.localeCompare(b.title));
  }, [groupBy, active, memberName]);

  const hasFilters = !!(filterType || filterStatus || filterClient || search || quick);
  const clearFilters = () => {
    setFilterType(''); setFilterStatus(''); setFilterClient(''); setSearch(''); setQuick(null);
  };

  // ── Actions ────────────────────────────────────────────────────────────────
  const setStatus = (p: Project, status: ProjectStatus, msg: string) => {
    updateProject(p.id, { status });
    toast.success(msg);
    setOpenMenu(null);
  };

  const cancelProject = (p: Project) => {
    setOpenMenu(null);
    if (window.confirm(`Hủy dự án "${p.name}"? Dự án sẽ chuyển vào nhóm Đã đóng, có thể mở lại sau.`)) {
      updateProject(p.id, { status: 'Hủy' });
      toast.success('Đã hủy dự án');
    }
  };

  const handleDelete = (p: Project) => {
    setOpenMenu(null);
    if (window.confirm(`Xóa vĩnh viễn dự án "${p.name}"? Toàn bộ chi phí & nội dung thuộc dự án sẽ có thể bị phân mảnh.`)) {
      deleteProject(p.id);
      toast.success('Đã xóa dự án');
    }
  };

  const openEdit = (p: Project) => {
    setOpenMenu(null);
    setEditItem(p);
    setShowForm(true);
  };

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const renderMenu = (p: Project) => (
    <div className="pm-menu-wrap" onClick={stop}>
      <button
        className="btn btn-icon btn-ghost pm-menu-btn"
        aria-label="Thao tác dự án"
        aria-expanded={openMenu === p.id}
        onClick={() => setOpenMenu(openMenu === p.id ? null : p.id)}
      >
        <MoreHorizontal size={16} />
      </button>
      {openMenu === p.id && (
        <div className="pm-menu" role="menu">
          {p.status === 'Đang chạy' && (
            <>
              <button role="menuitem" onClick={() => setStatus(p, 'Hoàn thành', 'Đã hoàn thành dự án!')}>
                <CheckCircle2 size={14} /> Đánh dấu hoàn thành
              </button>
              <button role="menuitem" onClick={() => setStatus(p, 'Tạm dừng', 'Đã tạm dừng dự án')}>
                <Pause size={14} /> Tạm dừng
              </button>
            </>
          )}
          {p.status === 'Chưa bắt đầu' && (
            <button role="menuitem" onClick={() => setStatus(p, 'Đang chạy', 'Đã bắt đầu dự án!')}>
              <Play size={14} /> Bắt đầu
            </button>
          )}
          {(p.status === 'Tạm dừng' || p.status === 'Hoàn thành' || p.status === 'Hủy') && (
            <button role="menuitem" onClick={() => setStatus(p, 'Đang chạy', 'Đã mở lại dự án!')}>
              <RotateCcw size={14} /> Mở lại
            </button>
          )}
          <button role="menuitem" onClick={() => openEdit(p)}>
            <Edit3 size={14} /> Sửa thông tin
          </button>
          {!CLOSED_STATUSES.includes(p.status) && (
            <button role="menuitem" onClick={() => cancelProject(p)}>
              <Ban size={14} /> Hủy dự án
            </button>
          )}
          <div className="pm-menu-sep" />
          <button role="menuitem" className="danger" onClick={() => handleDelete(p)}>
            <Trash2 size={14} /> Xóa vĩnh viễn
          </button>
        </div>
      )}
    </div>
  );

  /** Trạng thái hiển thị: Đang chạy / Chưa bắt đầu / Hoàn thành → badge lịch; Tạm dừng / Hủy → badge trạng thái */
  const renderState = (s: ProjectSummary) => {
    const p = s.project;
    if (p.status === 'Tạm dừng' || p.status === 'Hủy') {
      return (
        <span className={`status-badge ${getProjectStatusClass(p.status)}`}>
          <span className="status-dot"></span>{p.status}
        </span>
      );
    }
    if (isReadyToClose(s)) {
      return canManage ? (
        <button
          className="pm-ready"
          title="Việc đã đủ 100% — bấm để đánh dấu Hoàn thành"
          onClick={(e) => { e.stopPropagation(); setStatus(p, 'Hoàn thành', 'Đã đóng dự án!'); }}
        >
          <CheckCircle2 size={12} /> Sẵn sàng đóng
        </button>
      ) : <span className="pm-ready static"><CheckCircle2 size={12} /> Sẵn sàng đóng</span>;
    }
    return <ScheduleBadge schedule={s.schedule} />;
  };

  const outputText = (s: ProjectSummary) => {
    const parts: string[] = [];
    parts.push(s.taskCount === 0 ? 'Chưa có task' : `${s.taskCount} task`);
    if (s.kind === 'time' || s.tracksHours) { if (s.hours > 0) parts.push(`${s.hours} giờ`); }
    else parts.push(`${s.links} link`);
    return parts.join(' · ');
  };

  const budgetText = (s: ProjectSummary) => {
    if (!s.project.budget) return '';
    const left = s.project.budget - (spentByProject.get(s.project.id) ?? 0);
    return left < 0 ? `Vượt ngân sách ${formatCurrency(-left)}` : `Còn ${formatCurrency(left)}`;
  };

  const renderCard = (s: ProjectSummary) => {
    const p = s.project;
    const leader = memberName.get(p.leader);
    const budget = budgetText(s);
    return (
      <div
        key={p.id}
        className={`project-card pm-card ${openMenu === p.id ? 'menu-open' : ''} ${isClosed(s) || p.status === 'Tạm dừng' ? 'dim' : ''}`}
        onClick={() => navigate(`/projects/${p.id}`)}
      >
        <div className="pm-card-head">
          <div className="project-name">{p.name}</div>
          {canManage && renderMenu(p)}
        </div>
        <div className="pm-card-meta">
          <span className={`pm-type ${p.type.toLowerCase()}`}>{p.type}</span>
          {leader && groupBy !== 'leader' && <span><Users size={12} /> {leader}</span>}
          <span><Calendar size={12} /> {formatDay(p.deadline)}</span>
          {showClient && <span>{clientName.get(p.clientId) ?? '—'}</span>}
        </div>

        <div className="pm-progress">
          <div className="progress-bar-bg">
            <div className={`progress-bar-fill ${barClass(s)}`} style={{ width: `${Math.min(100, s.progress)}%` }}></div>
          </div>
          <span className="pm-progress-pct">{s.progress}%</span>
        </div>

        <div className="pm-state">{renderState(s)}</div>

        <div className="pm-card-foot">
          <span>{outputText(s)}</span>
          {budget && <span className={budget.startsWith('Vượt') ? 'over' : ''}>{budget}</span>}
        </div>
      </div>
    );
  };

  const renderTable = (items: ProjectSummary[]) => (
    <div className="data-table-wrapper">
      <table className="data-table">
        <thead>
          <tr>
            <th>Tên dự án</th>
            <th>Loại</th>
            {showClient && <th>Client</th>}
            {groupBy !== 'leader' && <th>Leader</th>}
            <th>Tiến độ</th>
            <th>Tình trạng</th>
            <th>Deadline</th>
            <th>Khối lượng</th>
            <th>Ngân sách</th>
            <th style={{ width: 64 }}></th>
          </tr>
        </thead>
        <tbody>
          {items.map((s) => {
            const p = s.project;
            return (
              <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)}
                className={isClosed(s) || p.status === 'Tạm dừng' ? 'pm-row-dim' : ''} style={{ cursor: 'pointer' }}>
                <td className="cell-title">{p.name}</td>
                <td><span className={`pm-type ${p.type.toLowerCase()}`}>{p.type}</span></td>
                {showClient && <td className="cell-secondary">{clientName.get(p.clientId) ?? '—'}</td>}
                {groupBy !== 'leader' && <td className="cell-secondary">{memberName.get(p.leader) ?? '—'}</td>}
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: '120px' }}>
                    <div className="progress-bar-bg" style={{ flex: 1 }}>
                      <div className={`progress-bar-fill ${barClass(s)}`} style={{ width: `${Math.min(100, s.progress)}%` }}></div>
                    </div>
                    <span style={{ fontSize: '0.75rem', fontWeight: 600 }}>{s.progress}%</span>
                  </div>
                </td>
                <td>{renderState(s)}</td>
                <td className="cell-secondary">{formatDay(p.deadline)}</td>
                <td className="cell-secondary">{outputText(s)}</td>
                <td className="cell-secondary">{budgetText(s) || '—'}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                    {canManage && renderMenu(p)}
                    <ChevronRight size={16} style={{ color: 'var(--text-tertiary)' }} />
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  const renderItems = (items: ProjectSummary[]) =>
    view === 'card' ? <div className="projects-grid">{items.map(renderCard)}</div> : renderTable(items);

  return (
    <div>
      {openMenu && <div className="pm-menu-backdrop" onClick={() => setOpenMenu(null)} />}

      <div className="page-header">
        <div>
          <h2 className="page-title">
            <span className="icon"><FolderKanban size={20} /></span>
            Quản lý Dự án
          </h2>
          <p className="page-subtitle">
            {activeTotal} đang hoạt động · {closedTotal} đã đóng
          </p>
        </div>
        {canManage && (
          <button className="btn btn-primary" onClick={() => { setEditItem(null); setShowForm(true); }}>
            <Plus size={16} /> Tạo dự án mới
          </button>
        )}
      </div>

      {/* Thanh tổng quan — bấm để lọc nhanh */}
      <div className="pm-overview" role="group" aria-label="Lọc nhanh theo tình trạng">
        {(Object.keys(QUICK_FILTERS) as QuickFilter[]).map(k => {
          const f = QUICK_FILTERS[k];
          const n = counts[k];
          return (
            <button
              key={k}
              className={`pm-chip tone-${f.tone} ${quick === k ? 'active' : ''} ${n === 0 ? 'zero' : ''}`}
              aria-pressed={quick === k}
              onClick={() => setQuick(quick === k ? null : k)}
            >
              <span className="pm-chip-num">{n}</span>
              <span className="pm-chip-label">{f.label}</span>
            </button>
          );
        })}
      </div>

      <div className="filter-bar">
        <div className="pm-search">
          <Search size={14} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Tìm dự án hoặc leader…"
            aria-label="Tìm dự án"
          />
          {search && <button onClick={() => setSearch('')} aria-label="Xóa tìm kiếm"><X size={12} /></button>}
        </div>
        <Filter size={16} style={{ color: 'var(--text-tertiary)' }} />
        <select className="filter-select" value={filterType} onChange={e => setFilterType(e.target.value as ProjectType | '')}>
          <option value="">Tất cả loại</option>
          {projectTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        <select className="filter-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value as ProjectStatus | '')}>
          <option value="">Tất cả trạng thái</option>
          {projectStatuses.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {clients.length > 1 && (
          <select className="filter-select" value={filterClient} onChange={e => setFilterClient(e.target.value)}>
            <option value="">Tất cả client</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        )}
        {hasFilters && (
          <button className="btn btn-sm btn-ghost" onClick={clearFilters}><X size={12} /> Bỏ lọc</button>
        )}

        <div className="pm-toolbar-right">
          <div className="view-toggle" aria-label="Nhóm theo">
            <button className={groupBy === 'none' ? 'active' : ''} onClick={() => setGroupBy('none')}>Không nhóm</button>
            <button className={groupBy === 'leader' ? 'active' : ''} onClick={() => setGroupBy('leader')}>
              <Users size={14} /> Theo Leader
            </button>
          </div>
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

      {active.length === 0 && (
        <div className="pm-empty">
          {hasFilters ? 'Không có dự án đang hoạt động khớp bộ lọc.' : 'Chưa có dự án đang hoạt động.'}
        </div>
      )}

      {sections.map(sec => sec.items.length > 0 && (
        <section key={sec.key} className="pm-section">
          {sec.title && (
            <h3 className="pm-section-title">
              {sec.title}
              <span className="pm-section-count">{sec.items.length}</span>
              {sec.hint && <span className="pm-section-hint">{sec.hint}</span>}
            </h3>
          )}
          {renderItems(sec.items)}
        </section>
      ))}

      {/* Đã đóng: Hoàn thành / Hủy — thu gọn mặc định */}
      {closed.length > 0 && (
        <section className="pm-section pm-closed">
          <button className="pm-section-toggle" onClick={() => setShowClosed(!closedOpen)} aria-expanded={closedOpen}>
            {closedOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            Đã đóng
            <span className="pm-section-count">{closed.length}</span>
            <span className="pm-section-hint">Hoàn thành & Hủy</span>
          </button>
          {closedOpen && renderItems(closed)}
        </section>
      )}

      {showForm && (
        <ProjectFormModal
          item={editItem}
          hasTasks={editItem ? projectTasks.some(t => t.projectId === editItem.id) : false}
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
              const newId = makeId('P');
              addProject({ ...data, id: newId } as Project);
              toast.success('Đã thêm dự án mới');
            }

            // Gửi thông báo nếu thay đổi leader / có leader mới (kể cả tự assign)
            if (leaderChanged && leaderName && currentUser) {
              addTodo({
                id: makeId('todo'),
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

function ProjectFormModal({ item, hasTasks = false, onClose, onSave }: {
  item: Project | null;
  hasTasks?: boolean;
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
                <label className="form-label">Ngày bắt đầu</label>
                <input className="form-input" type="date" value={form.startDate || ''} max={form.deadline || undefined}
                  onChange={e => handleChange('startDate', e.target.value)} />
                <p style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)', marginTop: 4 }}>
                  Dùng để so % việc với % thời gian đã trôi tới deadline (Đúng / Chậm tiến độ).
                </p>
              </div>
              <div className="form-group" />
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

            {/* Manual progress — chỉ dùng khi chưa có task nhỏ */}
            {!hasTasks && (
              <div className="form-group">
                <label className="form-label" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span>Tiến độ thủ công</span>
                  <span style={{ fontWeight: 700, color: 'var(--primary-600)', fontSize: '0.95rem' }}>
                    {form.manualProgress ?? 0}%
                  </span>
                </label>
                <input
                  type="range"
                  min={0} max={100} step={5}
                  value={form.manualProgress ?? 0}
                  onChange={e => handleChange('manualProgress', parseInt(e.target.value))}
                  style={{ width: '100%', accentColor: 'var(--primary-500)', cursor: 'pointer' }}
                />
                <p style={{ fontSize: '0.77rem', color: 'var(--text-tertiary)', marginTop: '5px' }}>
                  💡 Chỉ dùng khi dự án chưa có task nhỏ. Khi bạn thêm task vào, tiến độ sẽ <b>tự động chuyển sang tính từ submissions</b> và bỏ qua giá trị này.
                </p>
              </div>
            )}
            {hasTasks && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'var(--success-bg)',
                fontSize: '0.8rem', color: '#166534', display: 'flex', alignItems: 'center', gap: '8px' }}>
                ✅ Dự án đã có task nhỏ — tiến độ đang được <b>tính tự động từ submissions</b>. Tiến độ thủ công không dùng.
              </div>
            )}
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
