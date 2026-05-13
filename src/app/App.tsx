import { useEffect, useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import LoginPage from '@/features/auth/LoginPage';
import AppRouter from './router';
import { useAppStore, initFromDB } from '@/shared/store/appStore';
import '@/index.css';

export default function App() {
  const { currentUser, setCurrentUser } = useAppStore();
  const [bootstrapped, setBootstrapped] = useState(false);

  // Bootstrap: load all data from Postgres
  useEffect(() => {
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
