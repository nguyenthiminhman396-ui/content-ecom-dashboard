import { Fragment, useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import { defaultTaskCategories } from '@/shared/data/mockData';
import { Plus, Save, Trash2, ChevronDown, ChevronRight, Scale, Users, Wand2 } from 'lucide-react';
import type { MonthlyKPITarget, TeamGroup, TodoPriority } from '@/shared/types';
import toast from 'react-hot-toast';
import {
  REAL_TEAMS, isTotal, ownerTeamOf, memberWeight, teamMembersOf, allocateByWeights,
  teamTargetsOf, memberTargetsOf, sameScope, sumLinks, normSite,
  computeUrgency, urgencyScore, periodRange, type UrgencyInfo, type Urgency,
} from './kpiAllocation';

const TEAM_COLORS: Record<string, string> = {
  'Bài viết': '#1D9E75',
  'Sản phẩm': '#8B5CF6',
  'Multimedia - Tin nhanh': '#F59E0B',
};

function generateId(): string {
  return `kt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** Số link đã nộp trong kỳ, cùng đầu việc + site; lọc thêm theo team hoặc người */
function useActual(period: string) {
  const { submissions } = useAppStore();
  return (total: MonthlyKPITarget, f: { team?: TeamGroup; name?: string }) =>
    submissions
      .filter(s => s.submittedAt.startsWith(period)
        && (!total.taskType || s.taskType === total.taskType)
        && (!total.siteId || s.siteId === total.siteId)
        && (!f.team || s.teamGroup === f.team)
        && (!f.name || s.employeeName === f.name))
      .reduce((sum, s) => sum + s.links.length, 0);
}

/**
 * Ghi một ô phân bổ xuống kpiTargets: cập nhật bản đầu, xoá bản trùng, thêm mới nếu chưa có, xoá nếu = 0.
 */
function useUpsert() {
  const { addKpiTarget, updateKpiTarget, deleteKpiTarget } = useAppStore();
  return (existing: MonthlyKPITarget[], value: number, base: Partial<MonthlyKPITarget>) => {
    const [first, ...dups] = existing;
    dups.forEach(d => deleteKpiTarget(d.id));
    if (value <= 0) {
      if (first) deleteKpiTarget(first.id);
      return;
    }
    if (first) {
      if (first.targetLinks !== value) updateKpiTarget(first.id, { targetLinks: value });
    } else {
      addKpiTarget({ id: generateId(), targetLinks: value, ...base } as MonthlyKPITarget);
    }
  };
}

function Remaining({ allocated, total }: { allocated: number; total: number }) {
  const rest = total - allocated;
  const color = rest === 0 ? 'var(--success)' : 'var(--danger)';
  return (
    <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
      Đã phân <strong>{allocated.toLocaleString()}</strong> / {total.toLocaleString()}
      {' · '}
      <strong style={{ color }}>
        {rest === 0 ? 'Khớp' : rest > 0 ? `Còn thiếu ${rest.toLocaleString()}` : `Vượt ${(-rest).toLocaleString()}`}
      </strong>
    </span>
  );
}

const URGENCY_STYLE: Record<Urgency, { label: string; color: string }> = {
  overdue: { label: 'Quá hạn', color: '#B91C1C' },
  urgent:  { label: 'Gấp', color: '#DC2626' },
  watch:   { label: 'Cần chú ý', color: '#D97706' },
  ok:      { label: 'Đúng tiến độ', color: '#059669' },
  done:    { label: 'Đã xong', color: '#64748B' },
};

const PRIORITY_STYLE: Record<TodoPriority, { label: string; color: string }> = {
  high:   { label: 'Ưu tiên cao', color: '#DC2626' },
  medium: { label: 'Ưu tiên TB', color: '#2563EB' },
  low:    { label: 'Ưu tiên thấp', color: '#64748B' },
};

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toLocaleString();

/** Giải thích độ gấp: còn bao nhiêu, bao nhiêu ngày, cần bao nhiêu/ngày */
function urgencyText(u: UrgencyInfo): string {
  if (u.level === 'done') return 'Đã đạt target';
  if (u.level === 'overdue') return `Quá hạn, còn thiếu ${u.remaining.toLocaleString()} link`;
  return `Còn ${u.remaining.toLocaleString()} link · ${u.daysLeft} ngày · cần ${fmt1(u.needPerDay)} link/ngày (đang ${fmt1(u.pace)}/ngày)`;
}

function UrgencyBadge({ info }: { info: UrgencyInfo }) {
  const st = URGENCY_STYLE[info.level];
  return (
    <span title={urgencyText(info)} style={{
      background: `${st.color}15`, color: st.color, padding: '2px 8px', borderRadius: 'var(--radius-full)',
      fontSize: '0.72rem', fontWeight: 700, whiteSpace: 'nowrap', cursor: 'help',
    }}>{st.label}</span>
  );
}

function PriorityBadge({ priority }: { priority?: TodoPriority }) {
  const st = PRIORITY_STYLE[priority ?? 'medium'];
  return (
    <span style={{ border: `1px solid ${st.color}55`, color: st.color, padding: '1px 7px',
                   borderRadius: 'var(--radius-full)', fontSize: '0.7rem', fontWeight: 600, whiteSpace: 'nowrap' }}>
      {st.label}
    </span>
  );
}

const fmtDay = (d: Date) => `${d.getDate()}/${d.getMonth() + 1}`;

const numInput: React.CSSProperties = { width: 90, textAlign: 'right', padding: '4px 8px', fontSize: '0.85rem' };

export default function KPIAllocationTab({ period, isManager, myTeamGroup }: {
  period: string;
  isManager: boolean;
  myTeamGroup: TeamGroup | null;
}) {
  const { kpiTargets, sites, currentUser, addKpiTarget } = useAppStore();
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    taskType: defaultTaskCategories[0]?.taskTypeName ?? '', siteId: '', targetLinks: 0,
    priority: 'medium' as TodoPriority, deadline: '',
  });
  const actualOf = useActual(period);

  const totals = useMemo(
    () => kpiTargets.filter(t => t.period === period && isTotal(t))
      .sort((a, b) => (a.taskType ?? '').localeCompare(b.taskType ?? '') || normSite(a.siteId).localeCompare(normSite(b.siteId))),
    [kpiTargets, period]
  );
  // Leader chỉ thấy KPI tổng có liên quan tới team mình
  // Sắp KPI gấp lên đầu (độ gấp → ưu tiên → thứ tự đầu việc)
  const visibleTotals = (isManager ? totals : totals.filter(t =>
    ownerTeamOf(t.taskType) === myTeamGroup
    || (myTeamGroup && teamTargetsOf(kpiTargets, t, myTeamGroup).length > 0)))
    .map(t => ({ t, score: urgencyScore(computeUrgency({
      target: t.targetLinks, actual: actualOf(t, {}), period, deadline: t.deadline, priority: t.priority,
    }).level, t.priority) }))
    .sort((a, b) => b.score - a.score)
    .map(x => x.t);
  const { start: periodStart, end: periodEnd } = periodRange(period);
  const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleAddTotal = () => {
    if (!draft.taskType || draft.targetLinks <= 0) { toast.error('Chọn đầu việc và nhập KPI > 0'); return; }
    const probe = { period, taskType: draft.taskType, siteId: draft.siteId } as MonthlyKPITarget;
    if (totals.some(t => sameScope(t, probe))) { toast.error('Đã có KPI tổng cho đầu việc + site này'); return; }
    addKpiTarget({
      id: generateId(), period, level: 'total', teamGroup: 'Tất cả team',
      taskType: draft.taskType, siteId: draft.siteId || undefined,
      targetLinks: draft.targetLinks, createdBy: currentUser?.name,
      priority: draft.priority, deadline: draft.deadline || undefined,
    });
    toast.success('Đã thêm KPI tổng');
    setShowAdd(false);
    setDraft(d => ({ ...d, targetLinks: 0 }));
  };

  return (
    <div>
      <div className="card" style={{ padding: '12px 14px', marginBottom: 16, fontSize: '0.82rem',
                                     background: 'var(--accent-50)', color: 'var(--primary-700)' }}>
        <strong>Luồng phân bổ:</strong> KPI tổng theo đầu việc → {isManager ? 'bạn' : 'Manager'} chia cho team
        → Leader chia cho từng người (mặc định theo hệ số năng suất: Leader 0.6, Member 1.0).
        Mỗi lần lưu sẽ tạo/cập nhật target ở tab Danh sách, tiến độ tính như cũ.
      </div>

      {isManager && (
        <div style={{ marginBottom: 16 }}>
          {!showAdd ? (
            <button className="btn btn-primary" onClick={() => setShowAdd(true)}><Plus size={16} /> KPI tổng</button>
          ) : (
            <div className="card" style={{ padding: 14, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div className="form-group" style={{ margin: 0, minWidth: 240 }}>
                <label className="form-label">Đầu việc</label>
                <select className="form-select" value={draft.taskType} onChange={e => setDraft({ ...draft, taskType: e.target.value })}>
                  {defaultTaskCategories.map(c => <option key={c.id} value={c.taskTypeName}>{c.taskTypeName} → {c.teamName}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Site</label>
                <select className="form-select" value={draft.siteId} onChange={e => setDraft({ ...draft, siteId: e.target.value })}>
                  <option value="">Tất cả site</option>
                  {sites.filter(s => s.active).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">KPI tổng (link)</label>
                <input className="form-input" type="number" min={1} value={draft.targetLinks || ''}
                  onChange={e => setDraft({ ...draft, targetLinks: parseInt(e.target.value) || 0 })} style={{ width: 130 }} />
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Ưu tiên</label>
                <select className="form-select" value={draft.priority} onChange={e => setDraft({ ...draft, priority: e.target.value as TodoPriority })}>
                  <option value="high">Cao</option>
                  <option value="medium">Trung bình</option>
                  <option value="low">Thấp</option>
                </select>
              </div>
              <div className="form-group" style={{ margin: 0 }}>
                <label className="form-label">Hạn chót (trống = cuối tháng)</label>
                <input className="form-input" type="date" value={draft.deadline}
                  min={isoDay(periodStart)} max={isoDay(periodEnd)}
                  onChange={e => setDraft({ ...draft, deadline: e.target.value })} />
              </div>
              <button className="btn btn-primary" onClick={handleAddTotal}><Save size={14} /> Thêm</button>
              <button className="btn btn-secondary" onClick={() => setShowAdd(false)}>Huỷ</button>
            </div>
          )}
        </div>
      )}

      {visibleTotals.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-tertiary)' }}>
          <Scale size={32} style={{ opacity: 0.4, marginBottom: 8 }} />
          <p>Chưa có KPI tổng cho kỳ này.</p>
          {isManager && <p style={{ fontSize: '0.82rem', marginTop: 6 }}>Bấm "KPI tổng" để nhập con số tổng theo đầu việc, rồi chia xuống team.</p>}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {visibleTotals.map(total => {
            // Remount khi dữ liệu đã lưu thay đổi → bản nháp lấy lại từ store
            const sig = REAL_TEAMS.map(team => sumLinks(teamTargetsOf(kpiTargets, total, team))).join('|') + `|${total.targetLinks}`;
            return <TotalCard key={`${total.id}:${sig}`} total={total} isManager={isManager} myTeamGroup={myTeamGroup} />;
          })}
        </div>
      )}
    </div>
  );
}

function TotalCard({ total, isManager, myTeamGroup }: {
  total: MonthlyKPITarget;
  isManager: boolean;
  myTeamGroup: TeamGroup | null;
}) {
  const { kpiTargets, sites, members, currentUser, updateKpiTarget, deleteKpiTarget } = useAppStore();
  const upsert = useUpsert();
  const actualOf = useActual(total.period);
  const owner = ownerTeamOf(total.taskType);
  const site = total.siteId ? sites.find(s => s.id === total.siteId) : null;
  // Team/cá nhân kế thừa ưu tiên + hạn chót của KPI tổng
  const urgencyOf = (target: number, actual: number) => computeUrgency({
    target, actual, period: total.period, deadline: total.deadline, priority: total.priority,
  });
  const totalUrgency = urgencyOf(total.targetLinks, actualOf(total, {}));
  const { start: pStart, end: pEnd } = periodRange(total.period);
  const deadlineDay = periodRange(total.period, total.deadline).end;
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const saved = useMemo(() => Object.fromEntries(
    REAL_TEAMS.map(team => [team, sumLinks(teamTargetsOf(kpiTargets, total, team))])
  ) as Record<string, number>, [kpiTargets, total]);
  const hasSaved = Object.values(saved).some(v => v > 0);

  // Chưa phân lần nào → đề xuất dồn hết cho team phụ trách đầu việc
  const [values, setValues] = useState<Record<string, number>>(() =>
    hasSaved ? saved : Object.fromEntries(REAL_TEAMS.map(t => [t, t === owner ? total.targetLinks : 0])));
  const [totalInput, setTotalInput] = useState(total.targetLinks);
  const [expanded, setExpanded] = useState<string | null>(!isManager ? myTeamGroup : null);

  const allocated = Object.values(values).reduce((s, v) => s + v, 0);
  const dirty = REAL_TEAMS.some(t => (values[t] ?? 0) !== (saved[t] ?? 0));
  const teamsShown = isManager ? REAL_TEAMS : REAL_TEAMS.filter(t => t === myTeamGroup);

  const saveTeams = () => {
    if (allocated !== total.targetLinks
      && !window.confirm(`Tổng chia cho team (${allocated}) chưa khớp KPI tổng (${total.targetLinks}). Vẫn lưu?`)) return;
    REAL_TEAMS.forEach(team => upsert(teamTargetsOf(kpiTargets, total, team), values[team] ?? 0, {
      period: total.period, teamGroup: team, taskType: total.taskType, siteId: total.siteId,
      createdBy: currentUser?.name, notes: 'Phân bổ từ KPI tổng',
    }));
    toast.success('Đã lưu phân bổ cho team');
  };

  const saveTotal = () => {
    if (totalInput <= 0) { toast.error('KPI tổng phải > 0'); return; }
    updateKpiTarget(total.id, { targetLinks: totalInput });
    toast.success('Đã cập nhật KPI tổng');
  };

  const removeTotal = () => {
    const children = kpiTargets.filter(t => !isTotal(t) && sameScope(t, total));
    const msg = children.length
      ? `Xoá KPI tổng này và ${children.length} target team/cá nhân đã phân từ nó?`
      : 'Xoá KPI tổng này?';
    if (!window.confirm(msg)) return;
    children.forEach(c => deleteKpiTarget(c.id));
    deleteKpiTarget(total.id);
    toast.success('Đã xoá');
  };

  return (
    <div className="card" style={{ padding: 0, borderLeft: `4px solid ${TEAM_COLORS[owner ?? ''] ?? '#3B82F6'}` }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
                    borderBottom: '1px solid var(--border-color, var(--bg-secondary))' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontWeight: 700 }}>{total.taskType}</div>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-tertiary)' }}>
            {site ? site.name : 'Tất cả site'}{owner ? ` · Team phụ trách: ${owner}` : ''}
            {' · '}Đã đạt {actualOf(total, {}).toLocaleString()} link
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
            <UrgencyBadge info={totalUrgency} />
            <PriorityBadge priority={total.priority} />
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              Hạn {fmtDay(deadlineDay)} · {urgencyText(totalUrgency)}
            </span>
          </div>
        </div>
        {isManager ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <select className="form-select" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
              value={total.priority ?? 'medium'} title="Ưu tiên"
              onChange={e => updateKpiTarget(total.id, { priority: e.target.value as TodoPriority })}>
              <option value="high">Ưu tiên cao</option>
              <option value="medium">Ưu tiên TB</option>
              <option value="low">Ưu tiên thấp</option>
            </select>
            <input className="form-input" type="date" title="Hạn chót" style={{ width: 'auto', padding: '4px 8px', fontSize: '0.8rem' }}
              value={total.deadline ?? iso(pEnd)} min={iso(pStart)} max={iso(pEnd)}
              onChange={e => updateKpiTarget(total.id, { deadline: e.target.value || undefined })} />
            <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>KPI tổng</span>
            <input className="form-input" type="number" min={1} style={numInput} value={totalInput || ''}
              onChange={e => setTotalInput(parseInt(e.target.value) || 0)} />
            {totalInput !== total.targetLinks && (
              <button className="btn btn-secondary" onClick={saveTotal}><Save size={13} /></button>
            )}
            <button className="btn btn-icon btn-ghost" style={{ color: 'var(--danger)' }} onClick={removeTotal} title="Xoá KPI tổng">
              <Trash2 size={14} />
            </button>
          </div>
        ) : (
          <div style={{ fontWeight: 800, fontSize: '1.1rem' }}>{total.targetLinks.toLocaleString()} link</div>
        )}
      </div>

      <div className="data-table-wrapper" style={{ margin: 0 }}>
        <table className="data-table" style={{ marginBottom: 0 }}>
          <thead>
            <tr>
              <th>Team</th>
              <th style={{ textAlign: 'right' }}>KPI team</th>
              <th style={{ textAlign: 'right' }}>% tổng</th>
              <th style={{ textAlign: 'right' }}>Đã đạt</th>
              <th>Độ gấp</th>
              <th>Chia cho người</th>
            </tr>
          </thead>
          <tbody>
            {teamsShown.map(team => {
              const color = TEAM_COLORS[team] ?? '#94A3B8';
              // Leader chỉ xem số đã lưu, không xem bản đề xuất của Manager
              const v = isManager ? (values[team] ?? 0) : (saved[team] ?? 0);
              const people = teamMembersOf(members, team);
              const personSum = people.reduce((s, m) => s + sumLinks(memberTargetsOf(kpiTargets, total, team, m.name)), 0);
              const isOpen = expanded === team;
              const canSplit = (saved[team] ?? 0) > 0;
              return (
                <Fragment key={team}>
                  <tr>
                    <td>
                      <span style={{ background: `${color}15`, color, padding: '2px 8px', borderRadius: 'var(--radius-full)',
                                     fontSize: '0.78rem', fontWeight: 600 }}>{team}</span>
                      {team === owner && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>phụ trách</span>}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {isManager ? (
                        <input className="form-input" type="number" min={0} style={numInput} value={v}
                          onChange={e => setValues({ ...values, [team]: Math.max(0, parseInt(e.target.value) || 0) })} />
                      ) : <strong>{(saved[team] ?? 0).toLocaleString()}</strong>}
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                      {total.targetLinks > 0 ? Math.round((v / total.targetLinks) * 100) : 0}%
                    </td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--primary-600)' }}>
                      {actualOf(total, { team }).toLocaleString()}
                    </td>
                    <td>
                      {(saved[team] ?? 0) > 0
                        ? <UrgencyBadge info={urgencyOf(saved[team], actualOf(total, { team }))} />
                        : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                    </td>
                    <td>
                      {canSplit ? (
                        <button className="btn btn-ghost" style={{ fontSize: '0.78rem', padding: '2px 6px' }}
                          onClick={() => setExpanded(isOpen ? null : team)}>
                          {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                          <Users size={13} /> {personSum.toLocaleString()} / {(saved[team] ?? 0).toLocaleString()}
                          {personSum !== (saved[team] ?? 0) && <span style={{ color: 'var(--danger)', marginLeft: 4 }}>•</span>}
                        </button>
                      ) : (
                        <span style={{ fontSize: '0.74rem', color: 'var(--text-tertiary)' }}>
                          {!isManager ? 'Chờ Manager phân KPI cho team' : v > 0 ? 'Lưu phân bổ team trước' : '—'}
                        </span>
                      )}
                    </td>
                  </tr>
                  {isOpen && canSplit && (
                    <tr>
                      <td colSpan={6} style={{ background: 'var(--bg-secondary)', padding: 12 }}>
                        <MemberAllocation
                          key={people.map(m => sumLinks(memberTargetsOf(kpiTargets, total, team, m.name))).join('|') + `|${saved[team]}`}
                          total={total} team={team} teamTarget={saved[team] ?? 0}
                          editable={isManager || myTeamGroup === team} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {isManager && (
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <Remaining allocated={allocated} total={total.targetLinks} />
          {!hasSaved && <span style={{ fontSize: '0.74rem', color: 'var(--warning)' }}>Đề xuất — chưa lưu</span>}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            {owner && (
              <button className="btn btn-secondary" onClick={() =>
                setValues(Object.fromEntries(REAL_TEAMS.map(t => [t, t === owner ? total.targetLinks : 0])))}>
                <Wand2 size={13} /> Dồn cho team phụ trách
              </button>
            )}
            <button className="btn btn-primary" onClick={saveTeams} disabled={!dirty && hasSaved}>
              <Save size={13} /> Lưu phân bổ team
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberAllocation({ total, team, teamTarget, editable }: {
  total: MonthlyKPITarget;
  team: TeamGroup;
  teamTarget: number;
  editable: boolean;
}) {
  const { kpiTargets, members, currentUser } = useAppStore();
  const upsert = useUpsert();
  const actualOf = useActual(total.period);
  const people = useMemo(() => teamMembersOf(members, team), [members, team]);

  const saved = useMemo(() => Object.fromEntries(
    people.map(m => [m.name, sumLinks(memberTargetsOf(kpiTargets, total, team, m.name))])
  ) as Record<string, number>, [people, kpiTargets, total, team]);
  const hasSaved = Object.values(saved).some(v => v > 0);

  const byWeight = () => {
    const parts = allocateByWeights(teamTarget, people.map(memberWeight));
    return Object.fromEntries(people.map((m, i) => [m.name, parts[i]]));
  };
  const equally = () => {
    const parts = allocateByWeights(teamTarget, people.map(() => 1));
    return Object.fromEntries(people.map((m, i) => [m.name, parts[i]]));
  };

  const [values, setValues] = useState<Record<string, number>>(() => hasSaved ? saved : byWeight());
  const allocated = people.reduce((s, m) => s + (values[m.name] ?? 0), 0);
  const dirty = people.some(m => (values[m.name] ?? 0) !== (saved[m.name] ?? 0));

  if (people.length === 0) {
    return <div style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Team chưa có thành viên (gán team ở trang Thành viên).</div>;
  }

  const save = () => {
    if (allocated !== teamTarget
      && !window.confirm(`Tổng chia cho người (${allocated}) chưa khớp KPI team (${teamTarget}). Vẫn lưu?`)) return;
    people.forEach(m => upsert(memberTargetsOf(kpiTargets, total, team, m.name), values[m.name] ?? 0, {
      period: total.period, teamGroup: team, taskType: total.taskType, siteId: total.siteId,
      employeeName: m.name, createdBy: currentUser?.name, notes: 'Phân bổ từ KPI team',
    }));
    toast.success(`Đã lưu KPI cá nhân team ${team}`);
  };

  return (
    <div>
      <table className="data-table" style={{ marginBottom: 8, background: 'var(--bg-card)' }}>
        <thead>
          <tr>
            <th>Nhân sự</th>
            <th style={{ textAlign: 'right' }}>Hệ số</th>
            <th style={{ textAlign: 'right' }}>KPI cá nhân</th>
            <th style={{ textAlign: 'right' }}>Đã đạt</th>
            <th style={{ textAlign: 'right' }}>Tiến độ</th>
            <th>Độ gấp</th>
          </tr>
        </thead>
        <tbody>
          {people.map(m => {
            const v = values[m.name] ?? 0;
            const actual = actualOf(total, { name: m.name });
            const pct = v > 0 ? Math.round((actual / v) * 100) : 0;
            return (
              <tr key={m.id}>
                <td>
                  <span style={{ fontWeight: 600 }}>{m.name}</span>
                  {m.role === 'Leader' && <span style={{ marginLeft: 6, fontSize: '0.7rem', color: 'var(--text-tertiary)' }}>Leader</span>}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>{memberWeight(m)}</td>
                <td style={{ textAlign: 'right' }}>
                  {editable ? (
                    <input className="form-input" type="number" min={0} style={numInput} value={v}
                      onChange={e => setValues({ ...values, [m.name]: Math.max(0, parseInt(e.target.value) || 0) })} />
                  ) : <strong>{v.toLocaleString()}</strong>}
                </td>
                <td style={{ textAlign: 'right', color: 'var(--primary-600)', fontWeight: 600 }}>{actual.toLocaleString()}</td>
                <td style={{ textAlign: 'right', fontWeight: 700,
                             color: pct >= 100 ? 'var(--success)' : pct >= 70 ? 'var(--text-primary)' : 'var(--warning)' }}>
                  {v > 0 ? `${pct}%` : '—'}
                </td>
                <td>
                  {v > 0 ? <UrgencyBadge info={computeUrgency({
                    target: v, actual, period: total.period, deadline: total.deadline, priority: total.priority,
                  })} /> : <span style={{ color: 'var(--text-tertiary)' }}>—</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Remaining allocated={allocated} total={teamTarget} />
        {!hasSaved && <span style={{ fontSize: '0.74rem', color: 'var(--warning)' }}>Đề xuất theo hệ số — chưa lưu</span>}
        {editable && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <button className="btn btn-secondary" onClick={() => setValues(byWeight())}><Scale size={13} /> Theo hệ số</button>
            <button className="btn btn-secondary" onClick={() => setValues(equally())}>Chia đều</button>
            <button className="btn btn-primary" onClick={save} disabled={!dirty && hasSaved}><Save size={13} /> Lưu KPI cá nhân</button>
          </div>
        )}
      </div>
    </div>
  );
}
