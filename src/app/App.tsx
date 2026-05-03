import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from '@/features/auth/LoginPage';
import AppRouter from './router';
import { useAppStore } from '@/shared/store/appStore';
import type { Member } from '@/shared/types';
import '@/index.css';

const LS_USER = 'hcms_current_user';

export default function App() {
  const { currentUser, setCurrentUser } = useAppStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  // Restore user from localStorage on first mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_USER);
      if (raw && !currentUser) {
        const u = JSON.parse(raw) as Member;
        setCurrentUser(u);
      }
    } catch { /* ignore */ }
    const store = useAppStore.getState();
    document.documentElement.setAttribute('data-theme', store.theme);
    setBootstrapped(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist currentUser to localStorage
  useEffect(() => {
    if (currentUser) localStorage.setItem(LS_USER, JSON.stringify(currentUser));
    else localStorage.removeItem(LS_USER);
  }, [currentUser]);

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
