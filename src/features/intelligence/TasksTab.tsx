import { useState } from 'react';
import { ChevronDown, ChevronUp, Copy, Send, CheckCircle2, Undo2, Stethoscope } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { CiFinding, CiTask, CiTaskStatus } from '@/shared/types';
import { recheckPrompt } from './prompts';
import { TASK_STATUS, copyText, fmtDate, todayVN, mutedStyle } from './labels';
import { FindingDetail, Score, UrlLink } from './ui';

const PRIORITY: Record<string, string> = { high: '🔴 Cao', medium: '🟡 Trung bình', low: '⚪ Thấp' };

function DiffCol({ title, ids, color, findings }: { title: string; ids: string[]; color: string; findings: CiFinding[] }) {
  return (
    <div style={{ flex: 1, minWidth: 180 }}>
      <div style={{ fontWeight: 700, color, fontSize: '0.84rem' }}>{title}: {ids.length}</div>
      {ids.map(id => { const f = findings.find(x => x.id === id); return <div key={id} style={mutedStyle}>{id}{f ? ` · ${f.severity} ${f.location}` : ''}</div>; })}
    </div>
  );
}

function TaskPanel({ task, canManage }: { task: CiTask; canManage: boolean }) {
  const { currentUser, ciFindings, ciChecks, updateCiTask, updateCiFinding, updateTodo } = useAppStore();
  const [resultUrl, setResultUrl] = useState(task.resultUrl || task.url);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const findings = ciFindings.filter(f => task.findingIds.includes(f.id));
  const isAssignee = task.assigneeName === currentUser?.name;
  const rc = task.recheck;
  const rcCheck = rc ? ciChecks.find(c => c.id === rc.checkId) : undefined;
  const now = () => new Date().toISOString();
  const log = (action: string, note?: string) => [...task.history, { at: now(), by: currentUser?.name || '', action, note }];

  const submit = () => {
    if (!/^https?:\/\/(www\.)?(nhathuoclongchau|tiemchunglongchau)\.com\.vn\//.test(resultUrl)) { toast.error('URL kết quả phải là bài trên website Long Châu'); return; }
    updateCiTask(task.id, { status: 'submitted', resultUrl, submitNotes: notes || undefined, submittedAt: now(), history: log('Nộp kết quả', notes || undefined) });
    // Tick To-do hiện có — store tự báo cho người giao khi assignee hoàn thành
    updateTodo(task.todoId, { completed: true, completedAt: now() });
    toast.success('Đã nộp. Quản lý sẽ cho ChatGPT kiểm tra lại rồi nghiệm thu.');
  };

  const accept = (status: Extract<CiTaskStatus, 'accepted' | 'changes_requested' | 'needs_medical_verification'>) => {
    if (status !== 'accepted' && !reason.trim()) { toast.error('Cần nêu lý do / yêu cầu chỉnh sửa'); return; }
    updateCiTask(task.id, { status, acceptanceReason: reason || undefined, history: log(TASK_STATUS[status].label, reason || undefined) });
    if (status === 'accepted') findings.forEach(f => updateCiFinding(f.id, { status: 'resolved' }));
    if (status === 'changes_requested') updateTodo(task.todoId, { completed: false, completedAt: undefined });
    toast.success(TASK_STATUS[status].label);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 12 }}>
      {task.instructions && <div style={{ fontSize: '0.85rem' }}><strong>Yêu cầu:</strong> {task.instructions}</div>}
      {findings.map(f => <div key={f.id} style={{ padding: 10, border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)' }}><FindingDetail f={f} /></div>)}

      {(isAssignee || canManage) && (task.status === 'assigned' || task.status === 'changes_requested') && (
        <div className="card" style={{ padding: 12 }}>
          {task.status === 'changes_requested' && task.acceptanceReason && <div style={{ color: '#B45309', fontSize: '0.84rem', marginBottom: 6 }}>Yêu cầu sửa thêm: {task.acceptanceReason}</div>}
          <div className="form-group"><label className="form-label">URL bài đã cập nhật</label><input className="form-input" value={resultUrl} onChange={e => setResultUrl(e.target.value)} /></div>
          <div className="form-group"><label className="form-label">Ghi chú</label><input className="form-input" value={notes} onChange={e => setNotes(e.target.value)} /></div>
          <button className="btn btn-primary btn-sm" onClick={submit}><Send size={13} /> Nộp kết quả</button>
        </div>
      )}

      {task.status !== 'assigned' && (
        <div className="card" style={{ padding: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <strong>Kiểm tra lại (trước / sau)</strong>
            <button className="btn btn-secondary btn-sm" onClick={async () => { if (await copyText(recheckPrompt(task, findings))) toast.success('Đã copy prompt kiểm tra lại — chạy trong ChatGPT rồi nhập kết quả ở tab Nhập kết quả'); }}>
              <Copy size={13} /> Copy prompt kiểm tra lại
            </button>
          </div>
          {task.resultUrl && <div style={{ ...mutedStyle, marginTop: 4 }}>URL kết quả: <UrlLink url={task.resultUrl} /></div>}
          {rc ? (
            <div style={{ marginTop: 8 }}>
              <div style={mutedStyle}>Nhập lúc {fmtDate(rc.importedAt)} · điểm mới <Score value={rcCheck?.scores?.total} /></div>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 6 }}>
                <DiffCol title="Đã xử lý" ids={rc.resolved} color="var(--success)" findings={ciFindings} />
                <DiffCol title="Chưa xử lý" ids={rc.unresolved} color="var(--danger)" findings={ciFindings} />
                <DiffCol title="Lỗi mới" ids={rc.newFindingIds} color="#B45309" findings={ciFindings} />
                <DiffCol title="Không xác minh được" ids={rc.unableToVerify} color="var(--text-secondary)" findings={ciFindings} />
              </div>
            </div>
          ) : <div style={{ ...mutedStyle, marginTop: 6 }}>Chưa có kết quả kiểm tra lại.</div>}
        </div>
      )}

      {canManage && task.status === 'submitted' && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <input className="form-input" style={{ flex: 1, minWidth: 220 }} placeholder="Lý do / yêu cầu chỉnh sửa" value={reason} onChange={e => setReason(e.target.value)} />
          <button className="btn btn-primary btn-sm" onClick={() => accept('accepted')}><CheckCircle2 size={13} /> Nghiệm thu</button>
          <button className="btn btn-secondary btn-sm" onClick={() => accept('changes_requested')}><Undo2 size={13} /> Yêu cầu sửa thêm</button>
          <button className="btn btn-secondary btn-sm" onClick={() => accept('needs_medical_verification')}><Stethoscope size={13} /> Cần xác minh y khoa</button>
        </div>
      )}

      <div>
        <div style={{ fontWeight: 700, fontSize: '0.85rem' }}>Lịch sử</div>
        {task.history.map((h, i) => <div key={i} style={mutedStyle}>{new Date(h.at).toLocaleString('vi-VN')} · {h.action} — {h.by}{h.note ? ` (${h.note})` : ''}</div>)}
      </div>
    </div>
  );
}

export default function TasksTab({ canManage, canViewAll }: { canManage: boolean; canViewAll: boolean }) {
  const { currentUser, ciTasks } = useAppStore();
  const [open, setOpen] = useState<string | null>(null);
  const [status, setStatus] = useState('');
  const today = todayVN();
  const list = ciTasks
    .filter(t => (canViewAll || t.assigneeName === currentUser?.name) && (!status || t.status === status))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center' }}>
        <select className="form-select" style={{ width: 'auto' }} value={status} onChange={e => setStatus(e.target.value)}>
          <option value="">Mọi trạng thái</option>{Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <span style={{ ...mutedStyle, marginLeft: 'auto' }}>{list.length} task · nằm trong To-do list hiện có</span>
      </div>
      {!list.length && <div className="card" style={{ padding: 30, textAlign: 'center', ...mutedStyle }}>Chưa có task.</div>}
      {list.map(t => {
        const overdue = (t.status === 'assigned' || t.status === 'changes_requested') && !!t.dueDate && t.dueDate < today;
        return (
          <div key={t.id} className="card" style={{ padding: 14, borderLeft: overdue ? '4px solid var(--danger)' : undefined }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, cursor: 'pointer' }} onClick={() => setOpen(open === t.id ? null : t.id)}>
              <div>
                <div style={{ fontWeight: 700 }}>{t.kind === 'medical_verification' ? '🩺 Xác minh y khoa' : '✏️ Tối ưu'} · {t.title}</div>
                <div style={mutedStyle}>→ {t.assigneeName} · {PRIORITY[t.priority]} · Hạn {t.dueDate ? fmtDate(t.dueDate) : '—'}{overdue ? ' (quá hạn)' : ''} · {t.findingIds.length} phát hiện · giao bởi {t.ownerName}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span className={`status-badge ${TASK_STATUS[t.status].cls}`}>{TASK_STATUS[t.status].label}</span>
                {open === t.id ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </div>
            </div>
            {open === t.id && <TaskPanel task={t} canManage={canManage} />}
          </div>
        );
      })}
    </div>
  );
}
