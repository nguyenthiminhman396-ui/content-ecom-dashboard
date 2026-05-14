import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from '@/features/auth/LoginPage';
import AppRouter from './router';
import { useAppStore, initFromDB } from '@/shared/store/appStore';
import '@/index.css';

export default function App() {
  const { currentUser } = useAppStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  // Bootstrap: restore per-device user + load shared data from Postgres
  useEffect(() => {
    // Restore currentUser from localStorage (per-device, KHÔNG từ DB chung)
    try {
      const raw = localStorage.getItem('hcms_current_user');
      if (raw) {
        const u = JSON.parse(raw);
        if (u && u.name) useAppStore.getState().setCurrentUser(u);
      }
    } catch { /* ignore */ }

    document.documentElement.setAttribute('data-theme', useAppStore.getState().theme);
    initFromDB().finally(() => setBootstrapped(true));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!bootstrapped) return null;

  if (!currentUser) {
    return (
      <>
        <Toaster position="top-right" />
        <LoginPage onLogin={() => { /* setCurrentUser handled inside LoginPage */ }} />
      </>
    );
  }

  return (
    <BrowserRouter>
      <Toaster position="top-right" />
      <AppRouter />
    </BrowserRouter>
  );
}
