import { useMemo, useState } from 'react';
import { CheckCircle2, XCircle, Stethoscope, UserPlus, Trash2, Layers, List, ChevronDown, ChevronRight, ChevronsUpDown } from 'lucide-react';
import { confirmAndRun, deleteFinding } from './deleteActions';
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';
import type { CiCategory, CiDecision, CiFinding, CiSeverity } from '@/shared/types';
import AssignDialog, { type AssignInput } from './AssignDialog';
import { createCiTask } from './createTask';
import {
  CATEGORY_LABEL, DECISION_LABEL, SEVERITY_ORDER, TASK_STATUS,
  fmtDate, fmtCheckedAt, mutedStyle, DEFAULT_DATE_FILTER, matchDateFilter, matchSearch,
  type DateFilterValue,
} from './labels';
import { FindingDetail, Score, SeverityBadge, UrlLink, SearchInput, DateFilterControl, PaginationBar } from './ui';

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
  const { currentUser, updateCiFinding } = useAppStore();
  const kind = findings.every(f => f.decision === 'needs_medical_verification') ? 'medical_verification' : 'optimization';
  const confirm = (input: AssignInput) => {
    // Chống giao trùng: đọc trạng thái mới nhất từ store
    const fresh = useAppStore.getState().ciFindings.filter(f => findings.some(x => x.id === f.id));
    if (fresh.some(f => f.taskId)) { toast.error('Có phát hiện đã được giao trong task khác.'); onClose(); return; }
    const now = new Date().toISOString();
    // Nếu có lỗi đang chờ duyệt khi bấm "Xác nhận & Giao cả bài", tự động chuyển sang confirmed trước khi giao
    fresh.forEach(f => {
      if (f.decision === 'pending') {
        updateCiFinding(f.id, { decision: 'confirmed', reviewedBy: currentUser?.name, reviewedAt: now, status: 'open' });
      }
    });
    const taskId = createCiTask({
      kind, url: findings[0].url, title: findings[0].title, findingIds: fresh.map(f => f.id), input,
      detailLines: [`URL: ${findings[0].url}`, '', ...fresh.map((f, i) => `${i + 1}. [${f.severity}] ${f.location}${f.quote ? ` — “${f.quote}”` : ''}\n   Lý do: ${f.rationale}\n   Đề xuất: ${f.suggestedAction}`)],
    });
    fresh.forEach(f => updateCiFinding(f.id, { taskId, status: 'assigned' }));
    toast.success(`Đã giao ${fresh.length} phát hiện vào To-do của ${input.assignee}`);
    onClose();
  };
  return (
    <AssignDialog
      title={kind === 'medical_verification' ? 'Giao xác minh y khoa' : 'Giao việc sửa bài'}
      note={<>Tạo 1 việc trong To-do list cho <strong>{findings.length}</strong> phát hiện của “{findings[0].title}”. Mỗi phát hiện chỉ được giao một lần.</>}
      defaultPriority={findings.some(f => f.severity === 'P0' || f.severity === 'P1') ? 'high' : 'medium'}
      onConfirm={confirm} onClose={onClose}
    />
  );
}

export default function ReviewTab({ canManage }: { canManage: boolean }) {
  const { currentUser, ciFindings, ciChecks, ciTasks, updateCiFinding } = useAppStore();
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');
  const [compact, setCompact] = useState(false);
  const [decision, setDecision] = useState<CiDecision | 'all' | 'todo'>('todo');
  const [severity, setSeverity] = useState('');
  const [category, setCategory] = useState<CiCategory | ''>('');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilterValue>(DEFAULT_DATE_FILTER);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [assigning, setAssigning] = useState<CiFinding[] | null>(null);

  const checkMap = useMemo(() => new Map(ciChecks.map(c => [c.id, c])), [ciChecks]);

  const list = useMemo(() => ciFindings
    .filter(f => {
      const check = checkMap.get(f.checkId);
      const matchDec = decision === 'all' || (decision === 'todo' ? f.decision === 'pending' || (!f.taskId && f.decision !== 'rejected') : f.decision === decision);
      const matchSev = !severity || f.severity === severity;
      const matchCat = !category || f.category === category;
      const matchDt = matchDateFilter(check?.checkedAt || f.createdAt, dateFilter);
      const matchKw = matchSearch(search, f.title, f.url, f.location, f.quote, f.rationale, f.suggestedAction, f.id);
      return matchDec && matchSev && matchCat && matchDt && matchKw;
    })
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt)),
  [ciFindings, checkMap, decision, severity, category, dateFilter, search]);

  // Gom theo bài viết (checkId hoặc url)
  const articleGroups = useMemo(() => {
    const map = new Map<string, { key: string; url: string; title: string; checkId: string; findings: CiFinding[]; topSeverity: CiSeverity; latestAt: string }>();
    list.forEach(f => {
      const key = f.checkId || f.url;
      const check = checkMap.get(f.checkId);
      const existing = map.get(key);
      if (!existing) {
        map.set(key, {
          key,
          url: f.url,
          title: f.title,
          checkId: f.checkId,
          findings: [f],
          topSeverity: f.severity,
          latestAt: check?.checkedAt || f.createdAt,
        });
      } else {
        existing.findings.push(f);
        if (SEVERITY_ORDER[f.severity] < SEVERITY_ORDER[existing.topSeverity]) {
          existing.topSeverity = f.severity;
        }
      }
    });
    return [...map.values()].sort(
      (a, b) => SEVERITY_ORDER[a.topSeverity] - SEVERITY_ORDER[b.topSeverity] || b.latestAt.localeCompare(a.latestAt)
    );
  }, [list, checkMap]);

  const selectedFindings = list.filter(f => selected.includes(f.id));

  const toggle = (f: CiFinding) => {
    if (selected.includes(f.id)) { setSelected(selected.filter(id => id !== f.id)); return; }
    const first = selectedFindings[0];
    if (first && (first.url !== f.url || first.decision !== f.decision)) { toast.error('Chỉ gộp phát hiện cùng bài và cùng loại quyết định'); return; }
    setSelected([...selected, f.id]);
  };

  const confirmAllInGroup = (findings: CiFinding[]) => {
    const pendingOnes = findings.filter(f => f.decision === 'pending' && !f.taskId);
    if (!pendingOnes.length) return;
    const now = new Date().toISOString();
    pendingOnes.forEach(f => {
      updateCiFinding(f.id, {
        decision: 'confirmed',
        reviewedBy: currentUser?.name,
        reviewedAt: now,
        status: 'open',
      });
    });
    toast.success(`Đã xác nhận ${pendingOnes.length} phát hiện của bài viết`);
  };

  const totalItems = viewMode === 'grouped' ? articleGroups.length : list.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, totalPages);
  const pagedGroups = useMemo(() => articleGroups.slice((safePage - 1) * pageSize, safePage * pageSize), [articleGroups, safePage, pageSize]);
  const pagedFindings = useMemo(() => list.slice((safePage - 1) * pageSize, safePage * pageSize), [list, safePage, pageSize]);

  const isGroupOpen = (key: string, idx: number) => expandedGroups[key] ?? (idx === 0 && pagedGroups.length <= 5);
  const toggleGroup = (key: string, idx: number) => {
    const current = isGroupOpen(key, idx);
    setExpandedGroups(prev => ({ ...prev, [key]: !current }));
  };
  const expandAllOnPage = (open: boolean) => {
    const next: Record<string, boolean> = { ...expandedGroups };
    pagedGroups.forEach(g => { next[g.key] = open; });
    setExpandedGroups(next);
  };

  const resetFilter = () => {
    setDecision('todo');
    setSeverity('');
    setCategory('');
    setSearch('');
    setDateFilter(DEFAULT_DATE_FILTER);
    setPage(1);
  };
  const hasActiveFilter = decision !== 'todo' || !!severity || !!category || !!search || dateFilter.preset !== 'all';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Thanh công cụ lọc + tìm kiếm + chế độ hiển thị */}
      <div className="card" style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', borderRadius: 8, border: '1px solid var(--border-light)', overflow: 'hidden' }}>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'grouped' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => { setViewMode('grouped'); setPage(1); }}
              title="Gom các phát hiện của cùng 1 bài viết vào chung 1 thẻ để tránh cuộn dài"
            >
              <Layers size={13} /> Gom theo bài ({articleGroups.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === 'flat' ? 'btn-primary' : 'btn-ghost'}`}
              style={{ borderRadius: 0, border: 'none' }}
              onClick={() => { setViewMode('flat'); setPage(1); }}
              title="Hiển thị từng phát hiện rời"
            >
              <List size={13} /> Từng lỗi ({list.length})
            </button>
          </div>

          <SearchInput value={search} onChange={v => { setSearch(v); setPage(1); }} placeholder="Tìm tên bài, URL, vị trí, trích dẫn…" />
          <DateFilterControl label="Ngày chấm" value={dateFilter} onChange={v => { setDateFilter(v); setPage(1); }} />

          <select className="form-select" style={{ width: 'auto' }} value={decision} onChange={e => { setDecision(e.target.value as CiDecision | 'all' | 'todo'); setSelected([]); setPage(1); }}>
            <option value="todo">Cần xử lý (chờ duyệt + chưa giao)</option>
            {Object.entries(DECISION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            <option value="all">Mọi trạng thái duyệt</option>
          </select>

          <select className="form-select" style={{ width: 'auto' }} value={severity} onChange={e => { setSeverity(e.target.value); setPage(1); }}>
            <option value="">Mọi mức độ</option>
            {['P0', 'P1', 'P2', 'P3'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          <select className="form-select" style={{ width: 'auto' }} value={category} onChange={e => { setCategory(e.target.value as CiCategory | ''); setPage(1); }}>
            <option value="">Mọi loại lỗi</option>
            {Object.entries(CATEGORY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderTop: '1px solid var(--border-light)', paddingTop: 8 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={mutedStyle}>
              <strong>{articleGroups.length}</strong> bài viết · <strong>{list.length}</strong> phát hiện
            </span>
            {hasActiveFilter && (
              <button type="button" className="btn btn-ghost btn-sm" style={{ padding: '2px 8px', fontSize: '0.78rem' }} onClick={resetFilter}>
                Đặt lại bộ lọc
              </button>
            )}
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            <label style={{ ...mutedStyle, display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer', marginRight: 4 }}>
              <input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)} />
              Chế độ gọn (ẩn trích dẫn)
            </label>
            {viewMode === 'grouped' && pagedGroups.length > 0 && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAllOnPage(true)} title="Mở chi tiết tất cả bài trong trang này">
                  <ChevronsUpDown size={12} /> Mở hết trang
                </button>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => expandAllOnPage(false)} title="Thu gọn tất cả bài trong trang này">
                  Thu gọn hết
                </button>
              </>
            )}
            {canManage && selected.length > 0 && (
              <button className="btn btn-primary btn-sm" onClick={() => setAssigning(selectedFindings)}>
                <UserPlus size={13} /> Giao {selected.length} phát hiện đã chọn
              </button>
            )}
          </div>
        </div>
      </div>

      {!list.length && <div className="card" style={{ padding: 30, textAlign: 'center', ...mutedStyle }}>Không có phát hiện nào khớp bộ lọc hiện tại.</div>}

      {/* CHẾ ĐỘ 1: GOM THEO BÀI VIẾT (MẶC ĐỊNH) */}
      {viewMode === 'grouped' && pagedGroups.map((group, idx) => {
        const check = checkMap.get(group.checkId);
        const open = isGroupOpen(group.key, idx);
        const sevCounts = group.findings.reduce<Record<CiSeverity, number>>((acc, f) => ({ ...acc, [f.severity]: (acc[f.severity] || 0) + 1 }), { P0: 0, P1: 0, P2: 0, P3: 0 });
        const pendingFindings = group.findings.filter(f => f.decision === 'pending' && !f.taskId);
        const confirmedUnassigned = group.findings.filter(f => !f.taskId && f.decision === 'confirmed');
        const batchAssignable = group.findings.filter(f => !f.taskId && (f.decision === 'pending' || f.decision === 'confirmed'));
        const assignedCount = group.findings.filter(f => !!f.taskId).length;

        return (
          <div
            key={group.key}
            className="card"
            style={{
              padding: 0,
              overflow: 'hidden',
              borderLeft: `4px solid ${group.topSeverity === 'P0' || group.topSeverity === 'P1' ? 'var(--danger)' : group.topSeverity === 'P2' ? 'var(--warning)' : 'var(--border-medium)'}`,
            }}
          >
            {/* Header bài viết — bấm để đóng/mở */}
            <div
              onClick={() => toggleGroup(group.key, idx)}
              style={{
                padding: '12px 14px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
                cursor: 'pointer',
                background: open ? 'var(--bg-secondary)' : 'transparent',
              }}
            >
              <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', flex: 1, minWidth: 240 }}>
                <div style={{ marginTop: 2, color: 'var(--text-secondary)' }}>
                  {open ? <ChevronDown size={17} /> : <ChevronRight size={17} />}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{group.title}</div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                    <UrlLink url={group.url} />
                    <span style={mutedStyle}>chấm {fmtCheckedAt(check?.checkedAt)}{check?.type === 'recheck' ? ' (kiểm tra lại)' : ''}</span>
                    <Score value={check?.scores?.total} />
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                {(['P0', 'P1', 'P2', 'P3'] as CiSeverity[]).filter(s => sevCounts[s] > 0).map(s => (
                  <span key={s} style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                    <SeverityBadge severity={s} />
                    <span style={{ fontSize: '0.78rem', fontWeight: 600 }}>×{sevCounts[s]}</span>
                  </span>
                ))}
                {pendingFindings.length > 0 && <span className="status-badge status-waiting">{pendingFindings.length} chờ duyệt</span>}
                {confirmedUnassigned.length > 0 && <span className="status-badge status-review">{confirmedUnassigned.length} chờ giao</span>}
                {assignedCount > 0 && <span className="status-badge status-working">{assignedCount} đã giao</span>}

                {canManage && pendingFindings.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => confirmAllInGroup(group.findings)}
                    title="Xác nhận tất cả phát hiện đang chờ duyệt của bài này"
                  >
                    <CheckCircle2 size={13} /> Duyệt cả bài ({pendingFindings.length})
                  </button>
                )}
                {canManage && batchAssignable.length > 0 && (
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={() => setAssigning(batchAssignable)}
                    title="Tự động xác nhận và gom tất cả lỗi của bài này thành 1 việc trong To-do"
                  >
                    <UserPlus size={13} /> Giao cả bài ({batchAssignable.length} lỗi)
                  </button>
                )}
              </div>
            </div>

            {/* Danh sách lỗi bên trong bài viết */}
            {open && (
              <div style={{ padding: '10px 14px 14px', display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--border-light)' }}>
                {group.findings.map(f => {
                  const task = f.taskId ? ciTasks.find(t => t.id === f.taskId) : undefined;
                  const assignable = canManage && !f.taskId && (f.decision === 'confirmed' || f.decision === 'needs_medical_verification');
                  return (
                    <div
                      key={f.id}
                      style={{
                        padding: 12,
                        borderRadius: 8,
                        border: '1px solid var(--border-light)',
                        borderLeft: `3px solid ${f.severity === 'P0' || f.severity === 'P1' ? 'var(--danger)' : f.severity === 'P2' ? 'var(--warning)' : 'var(--border-medium)'}`,
                        background: '#fff',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', marginBottom: 6 }}>
                        <FindingDetail f={f} compact={compact} />
                        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                          {f.decision !== 'pending' && <span className="status-badge status-cancelled">{DECISION_LABEL[f.decision]}{f.managerScore ? ` · ${f.managerScore}★` : ''}</span>}
                          {task && <span className={`status-badge ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label} · {task.assigneeName}</span>}
                          {assignable && <label style={{ ...mutedStyle, display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}><input type="checkbox" checked={selected.includes(f.id)} onChange={() => toggle(f)} /> chọn</label>}
                          {assignable && <button className="btn btn-secondary btn-sm" onClick={() => setAssigning([f])}><UserPlus size={13} /> Giao lẻ</button>}
                          {canManage && !f.taskId && (
                            <button className="btn btn-ghost btn-sm" title="Xoá lỗi này" style={{ color: 'var(--danger)' }}
                              onClick={() => confirmAndRun(`Xoá lỗi ${f.id} (${f.location})? Không hoàn tác được.`, () => deleteFinding(f.id))}><Trash2 size={13} /></button>
                          )}
                        </div>
                      </div>
                      {f.decision !== 'pending' && f.managerReason && <div style={{ ...mutedStyle, marginTop: 4 }}>Ghi chú ({f.reviewedBy}, {fmtDate(f.reviewedAt)}): {f.managerReason}</div>}
                      {canManage && !f.taskId && <DecisionBar key={`${f.id}-${f.decision}`} f={f} onAssign={x => setAssigning([x])} />}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* CHẾ ĐỘ 2: HIỂN THỊ TỪNG LỖI RỜI */}
      {viewMode === 'flat' && pagedFindings.map(f => {
        const check = checkMap.get(f.checkId);
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
            <FindingDetail f={f} compact={compact} />
            {f.decision !== 'pending' && f.managerReason && <div style={{ ...mutedStyle, marginTop: 6 }}>Ghi chú ({f.reviewedBy}, {fmtDate(f.reviewedAt)}): {f.managerReason}</div>}
            {canManage && !f.taskId && <DecisionBar key={`${f.id}-${f.decision}`} f={f} onAssign={x => setAssigning([x])} />}
          </div>
        );
      })}

      {/* Thanh phân trang */}
      <PaginationBar
        total={totalItems}
        page={safePage}
        pageSize={pageSize}
        onPageChange={setPage}
        onPageSizeChange={setPageSize}
        unit={viewMode === 'grouped' ? 'bài viết' : 'phát hiện'}
        pageSizeOptions={[5, 10, 20, 50]}
      />

      {assigning && <AssignModal findings={assigning} onClose={() => { setAssigning(null); setSelected([]); }} />}
    </div>
  );
}
