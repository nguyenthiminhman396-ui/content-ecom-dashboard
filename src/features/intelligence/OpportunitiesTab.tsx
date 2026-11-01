import { useMemo, useState } from 'react';
import { CheckCircle2, SkipForward, UserPlus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';
import { confirmAndRun, deleteOpportunity } from './deleteActions';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { CiOpportunity, TodoPriority } from '@/shared/types';
import AssignDialog, { type AssignInput } from './AssignDialog';
import { createCiTask } from './createTask';
import {
  TASK_STATUS, fmtCheckedAt, mutedStyle,
  DEFAULT_DATE_FILTER, matchDateFilter, matchSearch,
  type DateFilterValue,
} from './labels';
import { OpportunityDetail, SearchInput, DateFilterControl, PaginationBar } from './ui';
import { opportunityLines } from './opportunityParser';

const STATUS_LABEL: Record<CiOpportunity['status'], string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt — chưa giao', assigned: 'Đã giao', done: 'Đã hoàn thành', skipped: 'Bỏ qua',
};
const TYPE_LABEL: Record<CiOpportunity['type'], string> = { new_article: '🆕 Viết bài mới', expand_article: '➕ Bổ sung bài có sẵn' };
const PRIORITY_LABEL = { high: '🔴 Cao', medium: '🟡 Trung bình', low: '⚪ Thấp' } as const;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function OpportunityCard({
  o,
  canManage,
  defaultCompact,
  onAssign,
}: {
  o: CiOpportunity;
  canManage: boolean;
  defaultCompact: boolean;
  onAssign: (o: CiOpportunity) => void;
}) {
  const { currentUser, ciTasks, updateCiOpportunity } = useAppStore();
  const [note, setNote] = useState('');
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const isCompact = expanded !== null ? !expanded : defaultCompact;
  const task = o.taskId ? ciTasks.find(t => t.id === o.taskId) : undefined;
  const decide = (status: 'approved' | 'skipped') => {
    updateCiOpportunity(o.id, { status, decisionBy: currentUser?.name, decisionAt: new Date().toISOString(), decisionNote: note || undefined });
    toast.success(status === 'approved' ? 'Đã duyệt' : 'Đã bỏ qua');
  };
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${o.priority === 'high' ? 'var(--danger)' : o.priority === 'medium' ? 'var(--warning)' : 'var(--border-medium)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div
          style={{ fontWeight: 700, fontSize: '0.95rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
          onClick={() => setExpanded(isCompact)}
          title="Bấm để xem chi tiết / thu gọn"
        >
          <span>{o.topic}</span>
          {isCompact ? <ChevronDown size={15} style={{ color: 'var(--text-tertiary)' }} /> : <ChevronUp size={15} style={{ color: 'var(--text-tertiary)' }} />}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="status-badge status-waiting">{TYPE_LABEL[o.type]}</span>
          <span className="status-badge status-cancelled">{PRIORITY_LABEL[o.priority]}</span>
          {task ? <span className={`status-badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label} · {task.assigneeName}</span>
            : <span className="status-badge status-cancelled">{STATUS_LABEL[o.status]}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        <OpportunityDetail o={o} compact={isCompact} />
        <div style={{ ...mutedStyle, display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          <span>
            Phân tích {fmtCheckedAt(o.checkedAt)} · nhập bởi {o.importedBy}{o.decisionBy ? ` · ${STATUS_LABEL[o.status]} bởi ${o.decisionBy}${o.decisionNote ? ` (${o.decisionNote})` : ''}` : ''}
          </span>
          <button
            type="button"
            onClick={() => setExpanded(isCompact)}
            style={{ background: 'none', border: 'none', color: 'var(--text-link)', cursor: 'pointer', fontSize: '0.78rem', padding: 0 }}
          >
            {isCompact ? 'Xem đầy đủ chi tiết ▾' : 'Thu gọn ▴'}
          </button>
        </div>
      </div>
      {canManage && !o.taskId && o.status !== 'done' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px dashed var(--border-light)', paddingTop: 8, marginTop: 8 }}>
          <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => onAssign(o)}><UserPlus size={13} /> Duyệt &amp; giao việc</button>
          {o.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => decide('approved')}><CheckCircle2 size={13} /> Chỉ duyệt</button>}
          {o.status !== 'skipped' && <button className="btn btn-secondary btn-sm" onClick={() => decide('skipped')}><SkipForward size={13} /> Bỏ qua</button>}
          <button className="btn btn-ghost btn-sm" title="Xoá cơ hội này" style={{ color: 'var(--danger)' }}
            onClick={() => confirmAndRun(`Xoá cơ hội “${o.topic}”? Không hoàn tác được.`, () => deleteOpportunity(o.id))}><Trash2 size={13} /></button>
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesTab({ canManage }: { canManage: boolean }) {
  const { currentUser, ciOpportunities, updateCiOpportunity } = useAppStore();
  const [status, setStatus] = useState<'todo' | CiOpportunity['status'] | 'all'>('todo');
  const [type, setType] = useState('');
  const [priority, setPriority] = useState<TodoPriority | ''>('');
  const [competitor, setCompetitor] = useState('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [compact, setCompact] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [assigning, setAssigning] = useState<CiOpportunity | null>(null);
  const competitors = useMemo(() => [...new Set(ciOpportunities.map(o => o.competitor).filter((x): x is string => !!x))].sort(), [ciOpportunities]);

  const list = useMemo(() => ciOpportunities
    .filter(o => {
      const matchSt = status === 'all' || (status === 'todo' ? o.status === 'pending' || o.status === 'approved' : o.status === status);
      const matchTp = !type || o.type === type;
      const matchPr = !priority || o.priority === priority;
      const matchCp = !competitor || o.competitor === competitor;
      const matchDt = matchDateFilter(o.checkedAt || o.importedAt, dateFilter);
      const matchKw = matchSearch(search, o.topic, o.competitor, o.lcUrl, o.competitorUrl, o.competitorObservation, o.lcGap, o.suggestedAction);
      return matchSt && matchTp && matchPr && matchCp && matchDt && matchKw;
    })
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.importedAt.localeCompare(a.importedAt)),
  [ciOpportunities, status, type, priority, competitor, dateFilter, search]);

  const totalPages = Math.max(1, Math.ceil(list.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedList = useMemo(() => list.slice((safePage - 1) * pageSize, safePage * pageSize), [list, safePage, pageSize]);

  const confirm = (input: AssignInput) => {
    const o = assigning!;
    const fresh = useAppStore.getState().ciOpportunities.find(x => x.id === o.id);
    if (fresh?.taskId) { toast.error('Cơ hội này đã được giao.'); setAssigning(null); return; }
    const taskId = createCiTask({
      kind: o.type, url: o.lcUrl || '', title: o.topic, opportunityId: o.id, input,
      detailLines: opportunityLines(o),
    });
    updateCiOpportunity(o.id, { status: 'assigned', taskId, decisionBy: currentUser?.name, decisionAt: new Date().toISOString() });
    toast.success(`Đã giao vào To-do của ${input.assignee}`);
    setAssigning(null);
  };

  const resetFilter = () => {
    setStatus('todo');
    setType('');
    setPriority('');
    setCompetitor('');
    setSearch('');
    setDateFilter(DEFAULT_DATE_FILTER);
    setPage(1);
  };
  const hasActiveFilter = status !== 'todo' || !!type || !!priority || !!competitor || !!search || dateFilter.preset !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Tìm chủ đề, đối thủ, nội dung thiếu…" />
          <DateFilterControl label="Ngày phân tích" value={dateFilter} onChange={v => { setDateFilter(v); setPage(1); }} />

          <select className="form-select" style={{ width: 'auto' }} value={status} onChange={e => { setStatus(e.target.value as typeof status); setPage(1); }}>
            <option value="todo">Cần xử lý (chờ duyệt + chưa giao)</option>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="all">Tất cả trạng thái</option>
          </select>

          <select className="form-select" style={{ width: 'auto' }} value={type} onChange={e => { setType(e.target.value); setPage(1); }}>
            <option value="">Mọi loại</option>
            {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select className="form-select" style={{ width: 'auto' }} value={priority} onChange={e => { setPriority(e.target.value as TodoPriority | ''); setPage(1); }}>
            <option value="">Mọi mức ưu tiên</option>
            {Object.entries(PRIORITY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>

          <select className="form-select" style={{ width: 'auto' }} value={competitor} onChange={e => { setCompetitor(e.target.value); setPage(1); }}>
            <option value="">Mọi đối thủ</option>
            {competitors.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={mutedStyle}><strong>{list.length}</strong> cơ hội nội dung</span>
            {hasActiveFilter && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.78rem' }} onClick={resetFilter}>
                Đặt lại bộ lọc
              </button>
            )}
          </div>
          <label style={{ ...mutedStyle, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} />
            Hiển thị gọn (chỉ hiện tóm tắt, bấm để mở rộng)
          </label>
        </div>
      </div>

      {!list.length && <div className="card" style={{ padding: 30, textAlign: 'center', ...mutedStyle }}>Không có cơ hội nào khớp bộ lọc hiện tại.</div>}
      {pagedList.map(o => <OpportunityCard key={`${o.id}-${compact}`} o={o} canManage={canManage} defaultCompact={compact} onAssign={setAssigning} />)}

      <PaginationBar
        total={list.length}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        unit="cơ hội"
        pageSizeOptions={[10, 20, 50]}
      />

      {assigning && (
        <AssignDialog
          title={assigning.type === 'new_article' ? 'Giao viết bài mới' : 'Giao bổ sung bài'}
          note={<>Tạo 1 việc trong To-do list cho chủ đề “{assigning.topic}”.</>}
          defaultPriority={assigning.priority}
          onConfirm={confirm} onClose={() => setAssigning(null)}
        />
      )}
    </div>
  );
}
