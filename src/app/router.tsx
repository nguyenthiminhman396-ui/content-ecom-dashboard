import { Routes, Route } from 'react-router-dom';
import AppLayout from '@/shared/components/layout/AppLayout';
import DashboardPage from '@/features/dashboard/DashboardPage';
import ProjectsPage from '@/features/projects/ProjectsPage';
import ProjectDetailPage from '@/features/projects/ProjectDetailPage';
import ContentsPage from '@/features/projects/ContentsPage';
import DailyWorkPage from '@/features/daily-work/DailyWorkPage';
import ReportsPage from '@/features/reports/ReportsPage';
import MonthlyQuarterlyReportPage from '@/features/reports/MonthlyQuarterlyReportPage';
import MembersPage from '@/features/members/MembersPage';
import SettingsPage from '@/features/settings/SettingsPage';
import PointConfigPage from '@/features/settings/PointConfigPage';
import PerformancePage from '@/features/performance/PerformancePage';
import SubmitKPIPage from '@/features/kpi-submit/SubmitKPIPage';
import MySubmissionsPage from '@/features/kpi-submit/MySubmissionsPage';
import ImportDataPage from '@/features/admin/ImportDataPage';
import KPITargetsPage from '@/features/admin/KPITargetsPage';
import BonusPointsPage from '@/features/bonus/BonusPointsPage';
import RnDLogsPage from '@/features/rnd/RnDLogsPage';
import TodoPage from '@/features/todo/TodoPage';
import ExpensesPage from '@/features/expenses/ExpensesPage';

export default function AppRouter() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/"               element={<DashboardPage />} />
        <Route path="/submit-kpi"     element={<SubmitKPIPage />} />
        <Route path="/my-submissions" element={<MySubmissionsPage />} />
        <Route path="/import-data"    element={<ImportDataPage />} />
        <Route path="/kpi-targets"    element={<KPITargetsPage />} />
        <Route path="/bonus-points"   element={<BonusPointsPage />} />
        <Route path="/rnd-logs"       element={<RnDLogsPage />} />
        <Route path="/daily-work"     element={<DailyWorkPage />} />
        <Route path="/projects"       element={<ProjectsPage />} />
        <Route path="/projects/:id"   element={<ProjectDetailPage />} />
        <Route path="/contents"       element={<ContentsPage />} />
        <Route path="/performance"    element={<PerformancePage />} />
        <Route path="/reports"        element={<ReportsPage />} />
        <Route path="/reports/periodic" element={<MonthlyQuarterlyReportPage />} />
        <Route path="/members"        element={<MembersPage />} />
        <Route path="/point-config"   element={<PointConfigPage />} />
        <Route path="/settings"       element={<SettingsPage />} />
        <Route path="/todo"           element={<TodoPage />} />
        <Route path="/expenses"       element={<ExpensesPage />} />
      </Route>
    </Routes>
  );
}
