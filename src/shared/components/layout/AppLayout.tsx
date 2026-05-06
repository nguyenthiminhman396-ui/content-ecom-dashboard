import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import BottomTabBar from './BottomTabBar';
import Header from './Header';
import { useAppStore, syncFromSheets, syncKPIFromSheets, initPostgresSync } from '@/shared/store/appStore';
import { Toaster } from 'react-hot-toast';
import toast from 'react-hot-toast';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/daily-work': 'Công việc hằng ngày',
  '/projects': 'Quản lý Dự án',
  '/contents': 'Sản phẩm dự án',
  '/reports': 'Báo cáo',
  '/members': 'Thành viên',
  '/settings': 'Cài đặt',
};

export default function AppLayout() {
  const { sidebarCollapsed, isConnected } = useAppStore();
  const location = useLocation();
  const title = pageTitles[location.pathname] || 'Dashboard';

  useEffect(() => {
    // Load data từ Vercel Postgres
    initPostgresSync();
  }, []);

  useEffect(() => {
    if (!isConnected) return;
    
    let lastSyncedDay = -1;

    const interval = setInterval(() => {
      const now = new Date();
      // Chạy tự động vào đúng 17:00 mỗi ngày
      if (now.getHours() === 17 && now.getMinutes() === 0 && now.getDate() !== lastSyncedDay) {
        lastSyncedDay = now.getDate();
        toast('Đang chạy đồng bộ dữ liệu tự động (17:00)...', { icon: '🔄', id: 'autosync' });
        
        Promise.all([
          syncFromSheets(),
          syncKPIFromSheets()
        ]).then(() => {
          toast.success('Đồng bộ tự động 17:00 hoàn tất!', { id: 'autosync' });
        }).catch(err => {
          toast.error('Lỗi đồng bộ tự động: ' + (err as Error).message, { id: 'autosync' });
        });
      }
    }, 30000); // Kiểm tra mỗi 30 giây

    return () => clearInterval(interval);
  }, [isConnected]);

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
