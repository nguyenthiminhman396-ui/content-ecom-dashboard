import { ScanSearch } from 'lucide-react';
import { useAppStore } from '@/shared/store/appStore';
import { usePersistedState } from '@/shared/hooks/usePersistedState';
import ImportTab from './ImportTab';
import ReviewTab from './ReviewTab';
import TasksTab from './TasksTab';
import ReportsTab from './ReportsTab';

type Tab = 'import' | 'review' | 'tasks' | 'reports';
const TABS: { id: Tab; label: string; viewAll: boolean }[] = [
  { id: 'import', label: 'Nhập kết quả', viewAll: true },
  { id: 'review', label: 'Review Queue', viewAll: true },
  { id: 'tasks', label: 'Assignments', viewAll: false },
  { id: 'reports', label: 'Báo cáo', viewAll: true },
];

/** Content Intelligence (bản gọn): ChatGPT chấm bài → nhập kết quả → duyệt → giao To-do → nghiệm thu. */
export default function IntelligencePage() {
  const { currentUser, ciFindings } = useAppStore();
  const [tab, setTab] = usePersistedState<Tab>('ci_tab', 'review');
  if (!currentUser || currentUser.role === 'Client') return <div className="card" style={{ padding: 32 }}>Không có quyền truy cập.</div>;

  const canManage = currentUser.role === 'Manager';
  const canViewAll = canManage || currentUser.role === 'Leader';
  const tabs = TABS.filter(t => canViewAll || !t.viewAll);
  const active = tabs.some(t => t.id === tab) ? tab : tabs[0].id;
  const pending = ciFindings.filter(f => f.decision === 'pending').length;

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title"><ScanSearch size={20} style={{ color: 'var(--primary-500)' }} /> Content Intelligence</h2>
          <p className="page-subtitle">Nhập kết quả QC từ ChatGPT/Google Sheet, duyệt từng phát hiện, giao việc vào To-do và nghiệm thu sau khi kiểm tra lại.</p>
        </div>
      </div>
      <div className="tabs" style={{ overflowX: 'auto' }}>
        {tabs.map(t => (
          <button key={t.id} className={`tab-item ${active === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)} style={{ whiteSpace: 'nowrap' }}>
            {t.label}{t.id === 'review' && pending > 0 ? ` (${pending})` : ''}
          </button>
        ))}
      </div>
      {active === 'import' && <ImportTab />}
      {active === 'review' && <ReviewTab canManage={canManage} />}
      {active === 'tasks' && <TasksTab canManage={canManage} canViewAll={canViewAll} />}
      {active === 'reports' && <ReportsTab />}
    </div>
  );
}
