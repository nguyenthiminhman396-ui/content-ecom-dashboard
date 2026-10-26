import { useMemo, useState } from 'react';
import { useAppStore } from '@/shared/store/appStore';
import type { CiSeverity } from '@/shared/types';
import { CATEGORY_LABEL, todayVN, mutedStyle } from './labels';
import { SeverityBadge, UrlLink } from './ui';

const addDays = (s: string, n: number) => { const d = new Date(`${s}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (s: string) => { const d = new Date(`${s}T00:00:00Z`); return addDays(s, -((d.getUTCDay() + 6) % 7)); };
const lastDayOfMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); };
const prevMonth = (m: string) => { const [y, mo] = m.split('-').map(Number); return new Date(Date.UTC(y, mo - 2, 1)).toISOString().slice(0, 7); };
const vnDay = (iso?: string) => (iso ? (iso.length === 10 ? iso : new Date(new Date(iso).getTime() + 7 * 3600_000).toISOString().slice(0, 10)) : '');

const fmtRange = (a: string, b: string) => {
  const f = (x: string) => x.split('-').reverse().join('/');
  return a === b ? f(a) : `${f(a)} → ${f(b)}`;
};

const Stat = ({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) => (
  <div className="stat-card"><div style={mutedStyle}>{label}</div><div style={{ fontWeight: 800, fontSize: '1.4rem' }}>{value}</div>{sub && <div style={mutedStyle}>{sub}</div>}</div>
);

/** Báo cáo ngày / tuần / tháng — tính trực tiếp từ dữ liệu đã nhập. */
export default function ReportsTab() {
  const { ciChecks, ciFindings, ciTasks } = useAppStore();
  const [mode, setMode] = useState<'day' | 'week' | 'month'>('week');
  const [day, setDay] = useState(todayVN());
  const [week, setWeek] = useState(mondayOf(todayVN()));
  const [month, setMonth] = useState(todayVN().slice(0, 7));
  const from = mode === 'day' ? day : mode === 'week' ? week : `${month}-01`;
  const to = mode === 'day' ? day : mode === 'week' ? addDays(week, 6) : lastDayOfMonth(month);
  // Kỳ trước để so sánh
  const prevFrom = mode === 'day' ? addDays(day, -1) : mode === 'week' ? addDays(week, -7) : `${prevMonth(month)}-01`;
  const prevTo = mode === 'day' ? addDays(day, -1) : mode === 'week' ? addDays(week, -1) : lastDayOfMonth(prevMonth(month));
  const inRange = (iso?: string) => { const d = vnDay(iso); return !!d && d >= from && d <= to; };

  const r = useMemo(() => {
    const checks = ciChecks.filter(c => inRange(c.checkedAt));
    const qc = checks.filter(c => c.type === 'qc');
    const scored = qc.filter(c => c.scores);
    const prevQc = ciChecks.filter(c => c.type === 'qc' && vnDay(c.checkedAt) >= prevFrom && vnDay(c.checkedAt) <= prevTo);
    const prevScored = prevQc.filter(c => c.scores);
    const prev = { qc: prevQc.length, avg: prevScored.length ? Math.round(prevScored.reduce((a, c) => a + (c.scores?.total || 0), 0) / prevScored.length) : null };
    const ids = new Set(checks.map(c => c.id));
    const findings = ciFindings.filter(f => ids.has(f.checkId));
    const sev: Record<CiSeverity, number> = { P0: 0, P1: 0, P2: 0, P3: 0 };
    findings.forEach(f => { sev[f.severity]++; });
    const reviewed = ciFindings.filter(f => inRange(f.reviewedAt));
    const confirmed = reviewed.filter(f => f.decision === 'confirmed').length;
    const byCat = Object.entries(findings.reduce<Record<string, number>>((a, f) => ({ ...a, [f.category]: (a[f.category] || 0) + 1 }), {}));
    const worst = [...new Set(findings.map(f => f.url))].map(url => ({ url, title: findings.find(f => f.url === url)!.title, n: findings.filter(f => f.url === url && (f.severity === 'P0' || f.severity === 'P1')).length }))
      .filter(x => x.n > 0).sort((a, b) => b.n - a.n).slice(0, 5);
    const pendingUrgent = ciFindings.filter(f => f.decision === 'pending' && (f.severity === 'P0' || f.severity === 'P1'));
    const medicalOpen = ciFindings.filter(f => f.category === 'medical_verification' && f.status !== 'resolved' && f.status !== 'rejected' && f.decision !== 'rejected').length;
    const tasks = {
      assigned: ciTasks.filter(t => inRange(t.createdAt)).length,
      submitted: ciTasks.filter(t => inRange(t.submittedAt)).length,
      accepted: ciTasks.filter(t => t.history.some(h => h.action === 'Đã nghiệm thu' && inRange(h.at))).length,
      open: ciTasks.filter(t => t.status === 'assigned' || t.status === 'changes_requested').length,
      overdue: ciTasks.filter(t => (t.status === 'assigned' || t.status === 'changes_requested') && t.dueDate && t.dueDate < todayVN()).length,
    };
    const rechecks = ciTasks.filter(t => t.recheck && inRange(t.recheck.importedAt)).map(t => t.recheck!);
    const rc = { resolved: rechecks.reduce((a, x) => a + x.resolved.length, 0), unresolved: rechecks.reduce((a, x) => a + x.unresolved.length, 0), fresh: rechecks.reduce((a, x) => a + x.newFindingIds.length, 0) };
    const insights: string[] = [];
    if (sev.P0 + sev.P1) insights.push(`${sev.P0 + sev.P1} cảnh báo P0/P1 trên ${qc.length} lượt QC — ưu tiên rà soát.`);
    if (pendingUrgent.length) insights.push(`${pendingUrgent.length} cảnh báo P0/P1 đang chờ duyệt (toàn bộ dữ liệu).`);
    if (medicalOpen) insights.push(`${medicalOpen} vấn đề y khoa chưa được xác minh/xử lý.`);
    if (tasks.overdue) insights.push(`${tasks.overdue}/${tasks.open} task đang mở đã quá hạn.`);
    if (reviewed.length) insights.push(`Tỷ lệ phát hiện được xác nhận: ${Math.round((confirmed / reviewed.length) * 100)}% (${confirmed}/${reviewed.length}) — dùng để đánh giá độ chính xác của ChatGPT.`);
    if (rc.resolved + rc.unresolved) insights.push(`Kiểm tra lại: ${rc.resolved}/${rc.resolved + rc.unresolved} lỗi đã xử lý.`);
    const compFindings = findings.filter(f => f.competitor);
    const byCompetitor = Object.entries(compFindings.reduce<Record<string, { n: number; important: number; articles: Set<string> }>>((a, f) => {
      const k = f.competitor!;
      a[k] ??= { n: 0, important: 0, articles: new Set() };
      a[k].n++; if (f.severity === 'P0' || f.severity === 'P1' || f.severity === 'P2') a[k].important++; a[k].articles.add(f.url);
      return a;
    }, {})).map(([name, v]) => ({ name, n: v.n, important: v.important, articles: v.articles.size })).sort((a, b) => b.n - a.n);
    const behind = [...new Set(compFindings.map(f => f.url))].map(url => {
      const list = compFindings.filter(f => f.url === url);
      return { url, title: list[0].title, n: list.length, who: [...new Set(list.map(f => f.competitor))].join(', ') };
    }).sort((a, b) => b.n - a.n).slice(0, 5);
    if (compFindings.length) insights.splice(Math.min(2, insights.length), 0, `${compFindings.length} cơ hội từ so sánh đối thủ trên ${new Set(compFindings.map(f => f.url)).size} bài${byCompetitor[0] ? ` — nhiều nhất so với ${byCompetitor[0].name} (${byCompetitor[0].n})` : ''}.`);
    return { compFindings, byCompetitor, behind, checks, qc, scored, prev, sev, findings, reviewed, confirmed, byCat, worst, tasks, rc, insights: insights.slice(0, 5) };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ciChecks, ciFindings, ciTasks, from, to, prevFrom, prevTo]);

  const avg = r.scored.length ? Math.round(r.scored.reduce((a, c) => a + (c.scores?.total || 0), 0) / r.scored.length) : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card" style={{ padding: '10px 14px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        {(['day', 'week', 'month'] as const).map(m => (
          <button key={m} className={`btn btn-sm ${mode === m ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode(m)}>
            {m === 'day' ? 'Ngày' : m === 'week' ? 'Tuần' : 'Tháng'}
          </button>
        ))}
        {mode === 'day' && <input className="form-input" type="date" style={{ width: 'auto' }} value={day} onChange={e => setDay(e.target.value)} />}
        {mode === 'week' && <input className="form-input" type="date" style={{ width: 'auto' }} value={week} onChange={e => e.target.value && setWeek(mondayOf(e.target.value))} />}
        {mode === 'month' && <input className="form-input" type="month" style={{ width: 'auto' }} value={month} onChange={e => e.target.value && setMonth(e.target.value)} />}
        <span style={mutedStyle}>{fmtRange(from, to)}</span>
        <span style={{ ...mutedStyle, marginLeft: 'auto' }}>Số liệu tính từ kết quả ChatGPT đã nhập</span>
      </div>

      <div className="card" style={{ padding: 14, borderLeft: '4px solid var(--primary-500)' }}>
        <strong>Insight</strong>
        {r.insights.length ? <ol style={{ margin: '6px 0 0 18px', fontSize: '0.88rem' }}>{r.insights.map((x, i) => <li key={i}>{x}</li>)}</ol> : <div style={mutedStyle}>Chưa đủ dữ liệu trong kỳ.</div>}
      </div>

      <div className="stats-grid">
        <Stat label="Bài đã QC" value={r.qc.length} sub={`${r.checks.length - r.qc.length} lượt kiểm tra lại · kỳ trước ${r.prev.qc}`} />
        <Stat label="Điểm trung bình" value={avg ?? '—'} sub={`${r.scored.length}/${r.qc.length} bài có điểm · kỳ trước ${r.prev.avg ?? '—'}`} />
        <Stat label="Phát hiện" value={r.findings.length} sub={`P0 ${r.sev.P0} · P1 ${r.sev.P1} · P2 ${r.sev.P2} · P3 ${r.sev.P3}`} />
        <Stat label="Đã duyệt / xác nhận" value={`${r.reviewed.length} / ${r.confirmed}`} />
        <Stat label="Task giao / nộp / nghiệm thu" value={`${r.tasks.assigned} / ${r.tasks.submitted} / ${r.tasks.accepted}`} sub={`${r.tasks.overdue}/${r.tasks.open} task mở quá hạn`} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 14 }}>
        <div className="card" style={{ padding: 14 }}>
          <strong>Theo loại</strong>
          {r.byCat.map(([k, n]) => <div key={k} style={mutedStyle}>{CATEGORY_LABEL[k as keyof typeof CATEGORY_LABEL]}: {n}</div>)}
          {!r.byCat.length && <div style={mutedStyle}>—</div>}
          <div style={{ marginTop: 8 }}><strong>Kiểm tra lại</strong><div style={mutedStyle}>✅ {r.rc.resolved} đã xử lý · ❌ {r.rc.unresolved} chưa xử lý · 🆕 {r.rc.fresh} lỗi mới</div></div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <strong>So sánh đối thủ</strong>
          {r.byCompetitor.map(c => <div key={c.name} style={mutedStyle}>{c.name}: {c.n} cơ hội ({c.important} quan trọng P0–P2) trên {c.articles} bài</div>)}
          {!r.byCompetitor.length && <div style={mutedStyle}>Chưa có dòng so sánh đối thủ trong kỳ (cột competitor trong Sheet).</div>}
          {r.behind.length > 0 && <div style={{ marginTop: 8, fontWeight: 600, fontSize: '0.84rem' }}>Bài thiếu nhiều nhất so với đối thủ</div>}
          {r.behind.map(b => <div key={b.url} style={{ fontSize: '0.82rem', paddingTop: 4 }}>×{b.n} <UrlLink url={b.url} label={b.title} /> <span style={mutedStyle}>({b.who})</span></div>)}
        </div>
        <div className="card" style={{ padding: 14 }}>
          <strong>Bài nhiều cảnh báo P0/P1 nhất</strong>
          {r.worst.map(w => <div key={w.url} style={{ fontSize: '0.82rem', paddingTop: 4 }}><SeverityBadge severity="P1" /> ×{w.n} <UrlLink url={w.url} label={w.title} /></div>)}
          {!r.worst.length && <div style={mutedStyle}>Không có.</div>}
        </div>
      </div>
    </div>
  );
}
