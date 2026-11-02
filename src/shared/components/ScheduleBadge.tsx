import type { ProjectSchedule, ScheduleStatus } from '@/shared/selectors/projectProgress';

const META: Record<ScheduleStatus, { label: string; color: string; bg: string }> = {
  done:        { label: '✓ Hoàn thành',      color: '#166534', bg: '#dcfce7' },
  ahead:       { label: '▲ Vượt tiến độ',    color: '#1d4ed8', bg: '#dbeafe' },
  on_track:    { label: '● Đúng tiến độ',    color: '#0f766e', bg: '#ccfbf1' },
  behind:      { label: '▼ Chậm tiến độ',    color: '#b45309', bg: '#fef3c7' },
  overdue:     { label: '⚠ Quá hạn',         color: '#b91c1c', bg: '#fee2e2' },
  no_deadline: { label: 'Chưa có deadline',  color: '#6b7280', bg: '#f3f4f6' },
};

/** Badge so % việc với % thời gian đã trôi tới deadline */
export default function ScheduleBadge({ schedule }: { schedule: ProjectSchedule }) {
  const m = META[schedule.status];
  const { daysLeft, elapsedPct } = schedule;
  const parts: string[] = [];
  if (schedule.status === 'overdue' && daysLeft !== undefined) parts.push(`trễ ${-daysLeft} ngày`);
  else if (schedule.status !== 'done' && daysLeft !== undefined) parts.push(daysLeft === 0 ? 'hạn hôm nay' : `còn ${daysLeft} ngày`);
  if (schedule.status !== 'done' && schedule.status !== 'overdue' && elapsedPct !== undefined) {
    parts.push(`đã qua ${elapsedPct}% thời gian`);
  }
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.72rem', flexWrap: 'wrap' }}>
      <span style={{ background: m.bg, color: m.color, fontWeight: 700, padding: '1px 7px', borderRadius: 4 }}>
        {m.label}
      </span>
      {parts.length > 0 && <span style={{ color: 'var(--text-tertiary)' }}>{parts.join(' · ')}</span>}
    </span>
  );
}
