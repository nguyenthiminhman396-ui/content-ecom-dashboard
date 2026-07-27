/**
 * WeeklyReportSharePage — Public read-only view of a weekly report.
 * Accessed via /share/weekly-report?id=<report_id>
 * No login required, no edit controls shown.
 */
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import WeeklyReportViewer from '@/features/reports/WeeklyReportViewer';
import { BarChart3, AlertTriangle } from 'lucide-react';

export default function WeeklyReportSharePage() {
  const [searchParams] = useSearchParams();
  const reportId = searchParams.get('id');
  const { weeklyReports } = useAppStore();

  const report = reportId ? weeklyReports.find(r => r.id === reportId) : null;

  if (!reportId || !report) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#f1f5f9', fontFamily: 'Inter, sans-serif',
      }}>
        <div style={{
          background: '#fff', borderRadius: '20px', padding: '48px 40px', textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0,0,0,.1)', maxWidth: '420px',
        }}>
          <div style={{ fontSize: '3rem', marginBottom: '16px' }}><AlertTriangle size={48} color="#f59e0b" /></div>
          <h2 style={{ fontWeight: 800, fontSize: '1.3rem', color: '#0f172a', marginBottom: '10px' }}>
            Không tìm thấy báo cáo
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.9rem', marginBottom: '24px', lineHeight: 1.6 }}>
            Link báo cáo không hợp lệ hoặc báo cáo đã bị xóa.<br />
            Vui lòng liên hệ người tạo link.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'center', color: '#94a3b8', fontSize: '0.8rem' }}>
            <BarChart3 size={14} /> Long Châu Content Studio
          </div>
        </div>
      </div>
    );
  }

  return (
    <WeeklyReportViewer
      report={report}
      canEdit={false}
      isShareMode={true}
      onClose={() => { /* no-op in share mode */ }}
      onSave={() => { /* no-op in share mode */ }}
    />
  );
}
