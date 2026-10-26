import { useMemo, useState } from 'react';
import { CheckCircle2, SkipForward, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { CiOpportunity } from '@/shared/types';
import AssignDialog, { type AssignInput } from './AssignDialog';
import { createCiTask } from './createTask';
import { TASK_STATUS, fmtCheckedAt, mutedStyle } from './labels';
import { OpportunityDetail } from './ui';
import { opportunityLines } from './opportunityParser';

const STATUS_LABEL: Record<CiOpportunity['status'], string> = {
  pending: 'Chờ duyệt', approved: 'Đã duyệt — chưa giao', assigned: 'Đã giao', done: 'Đã hoàn thành', skipped: 'Bỏ qua',
};
const TYPE_LABEL: Record<CiOpportunity['type'], string> = { new_article: '🆕 Viết bài mới', expand_article: '➕ Bổ sung bài có sẵn' };
const PRIORITY_LABEL = { high: '🔴 Cao', medium: '🟡 Trung bình', low: '⚪ Thấp' } as const;
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 } as const;

function OpportunityCard({ o, canManage, onAssign }: { o: CiOpportunity; canManage: boolean; onAssign: (o: CiOpportunity) => void }) {
  const { currentUser, ciTasks, updateCiOpportunity } = useAppStore();
  const [note, setNote] = useState('');
  const task = o.taskId ? ciTasks.find(t => t.id === o.taskId) : undefined;
  const decide = (status: 'approved' | 'skipped') => {
    updateCiOpportunity(o.id, { status, decisionBy: currentUser?.name, decisionAt: new Date().toISOString(), decisionNote: note || undefined });
    toast.success(status === 'approved' ? 'Đã duyệt' : 'Đã bỏ qua');
  };
  return (
    <div className="card" style={{ padding: 14, borderLeft: `4px solid ${o.priority === 'high' ? 'var(--danger)' : o.priority === 'medium' ? 'var(--warning)' : 'var(--border-medium)'}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{o.topic}</div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <span className="status-badge status-waiting">{TYPE_LABEL[o.type]}</span>
          <span className="status-badge status-cancelled">{PRIORITY_LABEL[o.priority]}</span>
          {task ? <span className={`status-badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label} · {task.assigneeName}</span>
            : <span className="status-badge status-cancelled">{STATUS_LABEL[o.status]}</span>}
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 6 }}>
        <OpportunityDetail o={o} />
        <div style={mutedStyle}>Phân tích {fmtCheckedAt(o.checkedAt)} · nhập bởi {o.importedBy}{o.decisionBy ? ` · ${STATUS_LABEL[o.status]} bởi ${o.decisionBy}${o.decisionNote ? ` (${o.decisionNote})` : ''}` : ''}</div>
      </div>
      {canManage && !o.taskId && o.status !== 'done' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px dashed var(--border-light)', paddingTop: 8, marginTop: 8 }}>
          <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Ghi chú (tuỳ chọn)" value={note} onChange={e => setNote(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => onAssign(o)}><UserPlus size={13} /> Duyệt &amp; giao việc</button>
          {o.status === 'pending' && <button className="btn btn-secondary btn-sm" onClick={() => decide('approved')}><CheckCircle2 size={13} /> Chỉ duyệt</button>}
          {o.status !== 'skipped' && <button className="btn btn-secondary btn-sm" onClick={() => decide('skipped')}><SkipForward size={13} /> Bỏ qua</button>}
        </div>
      )}
    </div>
  );
}

export default function OpportunitiesTab({ canManage }: { canManage: boolean }) {
  const { currentUser, ciOpportunities, updateCiOpportunity } = useAppStore();
  const [status, setStatus] = useState<'todo' | CiOpportunity['status'] | 'all'>('todo');
  const [type, setType] = useState('');
  const [competitor, setCompetitor] = useState('');
  const [assigning, setAssigning] = useState<CiOpportunity | null>(null);
  const competitors = useMemo(() => [...new Set(ciOpportunities.map(o => o.competitor).filter((x): x is string => !!x))].sort(), [ciOpportunities]);

  const list = useMemo(() => ciOpportunities
    .filter(o => (status === 'all' || (status === 'todo' ? o.status === 'pending' || o.status === 'approved' : o.status === status))
      && (!type || o.type === type) && (!competitor || o.competitor === competitor))
    .sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || b.importedAt.localeCompare(a.importedAt)), [ciOpportunities, status, type, competitor]);

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value as typeof status)}>
          <option value="todo">Cần xử lý (chờ duyệt + chưa giao)</option>
          {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="all">Tất cả</option>
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={type} onChange={e => setType(e.target.value)}>
          <option value="">Mọi loại</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={competitor} onChange={e => setCompetitor(e.target.value)}>
          <option value="">Mọi đối thủ</option>
          {competitors.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ ...mutedStyle, marginLeft: 'auto' }}>{list.length} cơ hội · định hướng nội dung nên phát triển tiếp</span>
      </div>
      {!list.length && <div className="card" style={{ padding: 30, textAlign: 'center', ...mutedStyle }}>Chưa có cơ hội nào. Nhập dữ liệu sheet phân tích đối thủ ở tab Nhập kết quả.</div>}
      {list.map(o => <OpportunityCard key={o.id} o={o} canManage={canManage} onAssign={setAssigning} />)}
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
