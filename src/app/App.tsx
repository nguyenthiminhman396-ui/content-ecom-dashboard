import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from '@/features/auth/LoginPage';
import AppRouter from './router';
import { useAppStore, initFromDB, applyStoreData } from '@/shared/store/appStore';
import { fetchMe, fetchShareData } from '@/shared/services/authApi';
import '@/index.css';

import ErrorBoundary from '@/shared/components/ErrorBoundary';

export default function App() {
  const { currentUser } = useAppStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  const isShareRoute = window.location.pathname.startsWith('/share');

  // Bootstrap:
  //  - Trang chia sẻ: chỉ tải dữ liệu của đúng link (có chữ ký), không cần đăng nhập
  //  - App chính: hỏi server phiên hiện tại (cookie HttpOnly) rồi mới tải dữ liệu
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', useAppStore.getState().theme);
    try { localStorage.removeItem('hcms_current_user'); } catch { /* bản cũ lưu user ở đây — không dùng nữa */ }

    const boot = async () => {
      if (isShareRoute) {
        const data = await fetchShareData();
        if (data) applyStoreData(data);
        return;
      }
      const me = await fetchMe();
      if (me) {
        useAppStore.getState().setCurrentUser(me);
        await initFromDB();
      }
    };
    boot().finally(() => setBootstrapped(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) return null;

  if (!currentUser && !isShareRoute) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage onLogin={initFromDB} />
      </>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <ErrorBoundary>
        <AppRouter />
      </ErrorBoundary>
    </BrowserRouter>
  );
}
