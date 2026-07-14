import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';
import Header from './Header';
import { useAppStore } from '@/shared/store/appStore';
import { Toaster } from 'react-hot-toast';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/daily-work': 'Công việc hằng ngày',
  '/projects': 'Quản lý Dự án',
  '/contents': 'Sản phẩm dự án',
  '/reports': 'Báo cáo',
  '/reports/periodic': 'Báo cáo tháng/quý',
  '/members': 'Thành viên',
  '/settings': 'Cài đặt',
};

export default function AppLayout() {
  const { sidebarCollapsed } = useAppStore();
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Dashboard';

  return (
    <div className="app-layout">
      <Sidebar />
      <div className={`main-area ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <Header title={title} />
        <main className="main-content">
          <Outlet />
        </main>
      </div>
      <BottomTabBar />
      <Toaster
        position="top-right"
        toastOptions={{
          className: 'toast-custom',
          duration: 3000,
          style: {
            background: '#fff',
            color: '#0f172a',
            boxShadow: '0 10px 25px rgba(0,0,0,0.1)',
            borderRadius: '12px',
            padding: '12px 16px',
          },
        }}
      />
    </div>
  );
}
