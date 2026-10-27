import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Stethoscope, UserPlus, Trash2 } from 'lucide-react';
import { confirmAndRun, deleteFinding } from './deleteActions';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { CiDecision, CiFinding } from '@/shared/types';
import AssignDialog, { type AssignInput } from './AssignDialog';
import { createCiTask } from './createTask';
import { DECISION_LABEL, SEVERITY_ORDER, TASK_STATUS, fmtDate, fmtCheckedAt, mutedStyle } from './labels';
import { FindingDetail, Score, UrlLink } from './ui';

function DecisionBar({ f, onAssign }: { f: CiFinding; onAssign: (f: CiFinding) => void }) {
  const { currentUser, updateCiFinding } = useAppStore();
  const [score, setScore] = useState(f.managerScore || 0);
  const [reason, setReason] = useState(f.managerReason || '');
  const decide = (decision: Exclude<CiDecision, 'pending'>, thenAssign = false) => {
    if (decision === 'rejected' && !reason.trim()) { toast.error('Cần nêu lý do khi bác bỏ'); return; }
    updateCiFinding(f.id, {
      decision, managerScore: score || undefined, managerReason: reason || undefined,
      reviewedBy: currentUser?.name, reviewedAt: new Date().toISOString(), status: decision === 'rejected' ? 'rejected' : 'open',
    });
    if (thenAssign) {
      const updated = useAppStore.getState().ciFindings.find(x => x.id === f.id);
      if (updated) onAssign(updated);
    } else toast.success(DECISION_LABEL[decision]);
  };
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', borderTop: '1px dashed var(--border-light)', paddingTop: 8, marginTop: 8 }}>
      <span style={mutedStyle}>Mức cần tối ưu:</span>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => setScore(n)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '1.05rem', padding: 0, color: n <= score ? '#F59E0B' : 'var(--gray-300)' }}>★</button>
      ))}
      <input className="form-input" style={{ flex: 1, minWidth: 180 }} placeholder="Lý do / ghi chú (bắt buộc khi bác bỏ)" value={reason} onChange={e => setReason(e.target.value)} />
      <button className="btn btn-primary btn-sm" onClick={() => decide('confirmed', true)}><UserPlus size={13} /> Xác nhận &amp; giao việc</button>
      <button className="btn btn-secondary btn-sm" onClick={() => decide('confirmed')}><CheckCircle2 size={13} /> Chỉ xác nhận</button>
      <button className="btn btn-secondary btn-sm" onClick={() => decide('needs_medical_verification')}><Stethoscope size={13} /> Cần xác minh y khoa</button>
      <button className="btn btn-danger btn-sm" onClick={() => decide('rejected')}><XCircle size={13} /> Bác bỏ</button>
    </div>
  );
}

function AssignModal({ findings, onClose }: { findings: CiFinding[]; onClose: () => void }) {
  const { updateCiFinding } = useAppStore();
  const kind = findings[0].decision === 'needs_medical_verification' ? 'medical_verification' : 'optimization';
  const confirm = (input: AssignInput) => {
    // Chống giao trùng: đọc trạng thái mới nhất từ store
    const fresh = useAppStore.getState().ciFindings.filter(f => findings.some(x => x.id === f.id));
    if (fresh.some(f => f.taskId)) { toast.error('Có phát hiện đã được giao trong task khác.'); onClose(); return; }
    const taskId = createCiTask({
      kind, url: findings[0].url, title: findings[0].title, findingIds: fresh.map(f => f.id), input,
      detailLines: [`URL: ${findings[0].url}`, '', ...fresh.map((f, i) => `${i + 1}. [${f.severity}] ${f.location}${f.quote ? ` — “${f.quote}”` : ''}\n   Lý do: ${f.rationale}\n   Đề xuất: ${f.suggestedAction}`)],
    });
    fresh.forEach(f => updateCiFinding(f.id, { taskId, status: 'assigned' }));
    toast.success(`Đã giao vào To-do của ${input.assignee}`);
    onClose();
  };
  return (
    <AssignDialog
      title={kind === 'medical_verification' ? 'Giao xác minh y khoa' : 'Giao việc sửa bài'}
      note={<>Tạo 1 việc trong To-do list cho {findings.length} phát hiện của “{findings[0].title}”. Mỗi phát hiện chỉ được giao một lần.</>}
      defaultPriority={findings.some(f => f.severity === 'P0' || f.severity === 'P1') ? 'high' : 'medium'}
      onConfirm={confirm} onClose={onClose}
    />
  );
}

export default function ReviewTab({ canManage }: { canManage: boolean }) {
  const { ciFindings, ciChecks, ciTasks } = useAppStore();
  const [decision, setDecision] = useState<CiDecision | 'all' | 'todo'>('todo');
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState<CiFinding[] | null>(null);

  const list = useMemo(() => ciFindings
    .filter(f => (decision === 'all' || (decision === 'todo' ? f.decision === 'pending' || (!f.taskId && f.decision !== 'rejected') : f.decision === decision)) && (!severity || f.severity === severity))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt)), [ciFindings, decision, severity]);
  const selectedFindings = list.filter(f => selected.includes(f.id));

  const toggle = (f: CiFinding) => {
    if (selected.includes(f.id)) { setSelected(selected.filter(id => id !== f.id)); return; }
    const first = selectedFindings[0];
    if (first && (first.url !== f.url || first.decision !== f.decision)) { toast.error('Chỉ gộp phát hiện cùng bài và cùng loại quyết định'); return; }
    setSelected([...selected, f.id]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <select className="form-select" style={{ width: 'auto' }} value={decision} onChange={e => { setDecision(e.target.value as CiDecision | 'all' | 'todo'); setSelected([]); }}>
          <option value="todo">Cần xử lý (chờ duyệt + chưa giao)</option>
          {Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          <option value="all">Tất cả</option>
        </select>
        <select className="form-select" style={{ width: 'auto' }} value={severity} onChange={e => setSeverity(e.target.value)}>
          <option value="">Mọi mức độ</option>{['P0', 'P1', 'P2', 'P3'].map(s => <option key={s}>{s}</option>)}
        </select>
        <span style={{ ...mutedStyle, marginLeft: 'auto' }}>{list.length} phát hiện · Nguồn ChatGPT, chưa kiểm chứng tự động</span>
        {canManage && selected.length > 0 && <button className="btn btn-primary btn-sm" onClick={() => setAssigning(selectedFindings)}><UserPlus size={13} /> Giao {selected.length} phát hiện</button>}
      </div>

      {!list.length && <div className="card" style={{ padding: 30, textAlign: 'center', ...mutedStyle }}>Không có phát hiện nào với bộ lọc hiện tại.</div>}
      {list.map(f => {
        const check = ciChecks.find(c => c.id === f.checkId);
        const task = f.taskId ? ciTasks.find(t => t.id === f.taskId) : undefined;
        const assignable = canManage && !f.taskId && (f.decision === 'confirmed' || f.decision === 'needs_medical_verification');
        return (
          <div key={f.id} className="card" style={{ padding: 14, borderLeft: `4px solid ${f.severity === 'P0' || f.severity === 'P1' ? 'var(--danger)' : f.severity === 'P2' ? 'var(--warning)' : 'var(--border-medium)'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <div>
                <div style={{ fontWeight: 700 }}>{f.title}</div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}><UrlLink url={f.url} /><span style={mutedStyle}>chấm {fmtCheckedAt(check?.checkedAt)}{check?.type === 'recheck' ? ' (kiểm tra lại)' : ''}</span><Score value={check?.scores?.total} /></div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {f.decision !== 'pending' && <span className="status-badge status-cancelled">{DECISION_LABEL[f.decision]}{f.managerScore ? ` · ${f.managerScore}★` : ''}</span>}
                {task && <span className={`status-badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label} · {task.assigneeName}</span>}
                {assignable && <label style={{ ...mutedStyle, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f)} /> chọn</label>}
                {assignable && <button className="btn btn-secondary btn-sm" onClick={() => setAssigning([f])}><UserPlus size={13} /> Giao việc</button>}
                {canManage && !f.taskId && (
                  <button className="btn btn-ghost btn-sm" title="Xoá lỗi này" style={{ color: 'var(--danger)' }}
                    onClick={() => confirmAndRun(`Xoá lỗi ${f.id} (${f.location})? Không hoàn tác được.`, () => deleteFinding(f.id))}><Trash2 size={13} /></button>
                )}
              </div>
            </div>
            <FindingDetail f={f} />
            {f.decision !== 'pending' && f.managerReason && <div style={{ ...mutedStyle, marginTop: 6 }}>Ghi chú ({f.reviewedBy}, {fmtDate(f.reviewedAt)}): {f.managerReason}</div>}
            {canManage && !f.taskId && <DecisionBar key={`${f.id}-${f.decision}`} f={f} onAssign={x => setAssigning([x])} />}
          </div>
        );
      })}
      {assigning && <AssignModal findings={assigning} onClose={() => { setAssigning(null); setSelected([]); }} />}
    </div>
  );
}
