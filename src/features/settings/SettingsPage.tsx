import { useState, useEffect } from 'react';
import { Settings, Database, RefreshCw, CheckCircle2, XCircle, Loader, Plus, Trash2, BarChart3, User, Moon, Sun, AlertTriangle } from 'lucide-react';
import { useAppStore, syncFromSheets, syncKPIFromSheets } from '@/shared/store/appStore';
import { sheetsService } from '@/shared/services/googleSheets';
import type { KPISheetTab } from '@/shared/types';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { sheetsConfig, setSheetsConfig, isConnected, isSyncing, lastSyncTime, currentUser } = useAppStore();

  const [spreadsheetId, setSpreadsheetId] = useState(sheetsConfig?.spreadsheetId || '');
  const [clientId, setClientId] = useState(sheetsConfig?.clientId ?? '');
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [kpiTabs, setKpiTabs] = useState<KPISheetTab[]>(sheetsConfig?.kpiTabs ?? []);
  const [newTabName, setNewTabName] = useState('');
  const [newProjectName, setNewProjectName] = useState('');
  const [darkMode, setDarkMode] = useState(document.documentElement.getAttribute('data-theme') === 'dark');

  useEffect(() => {
    if (sheetsConfig) {
      setSpreadsheetId(sheetsConfig.spreadsheetId);
      setClientId(sheetsConfig.clientId);
      setKpiTabs(sheetsConfig.kpiTabs ?? []);
    }
  }, [sheetsConfig]);

  const handlePasteUrl = (val: string) => {
    const match = val.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
    if (match) { setSpreadsheetId(match[1]); toast.success('Đã trích xuất Spreadsheet ID!'); }
    else setSpreadsheetId(val);
  };

  const handleConnect = async () => {
    if (!spreadsheetId.trim() || !clientId.trim()) { toast.error('Nhập Spreadsheet ID và Client ID'); return; }
    setSheetsConfig({ spreadsheetId: spreadsheetId.trim(), clientId: clientId.trim(), kpiTabs });
    setIsAuthenticating(true);
    try {
      await sheetsService.signIn();
      toast.success('Kết nối Google thành công!');
      await syncFromSheets();
      toast.success('Đã tải dữ liệu!');
    } catch (err) { toast.error((err as Error).message ?? 'Lỗi kết nối'); }
    finally { setIsAuthenticating(false); }
  };

  const handleDisconnect = () => {
    sheetsService.signOut();
    useAppStore.getState().setConnected(false);
    toast('Đã ngắt kết nối', { icon: '🔌' });
  };

  const handleSync = async () => {
    if (!sheetsService.isAuthenticated()) { toast.error('Chưa kết nối'); return; }
    try { await syncFromSheets(); toast.success('Đồng bộ thành công!'); }
    catch (err) { toast.error((err as Error).message ?? 'Lỗi'); }
  };

  const handleSyncKPI = async () => {
    if (!sheetsService.isAuthenticated()) { toast.error('Chưa kết nối'); return; }
    try {
      toast.loading('Đang tải KPI...', { id: 'kpi' });
      const count = await syncKPIFromSheets();
      toast.success(`Đã tải ${count.toLocaleString()} dòng!`, { id: 'kpi' });
    } catch (err) { toast.error((err as Error).message, { id: 'kpi' }); }
  };

  const addKpiTab = () => {
    if (!newTabName.trim()) { toast.error('Nhập tên tab'); return; }
    const tab: KPISheetTab = { tabName: newTabName.trim(), projectName: newProjectName.trim() || newTabName.trim(), active: true };
    const updated = [...kpiTabs, tab];
    setKpiTabs(updated);
    setSheetsConfig({ spreadsheetId, clientId, kpiTabs: updated });
    setNewTabName(''); setNewProjectName('');
    toast.success(`Đã thêm "${tab.tabName}"`);
  };

  const toggleKpiTab = (idx: number) => {
    const updated = kpiTabs.map((t, i) => i === idx ? { ...t, active: !t.active } : t);
    setKpiTabs(updated);
    setSheetsConfig({ spreadsheetId, clientId, kpiTabs: updated });
  };

  const removeKpiTab = (idx: number) => {
    const updated = kpiTabs.filter((_, i) => i !== idx);
    setKpiTabs(updated);
    setSheetsConfig({ spreadsheetId, clientId, kpiTabs: updated });
  };

  const toggleDarkMode = () => {
    const next = !darkMode;
    setDarkMode(next);
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    localStorage.setItem('theme', next ? 'dark' : 'light');
  };

  const connected = isConnected && sheetsService.isAuthenticated();

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title"><span className="icon"><Settings size={20} /></span>Cài đặt</h2>
          <p className="page-subtitle">Kết nối dữ liệu & tùy chỉnh</p>
        </div>
      </div>

      <div style={{ display: 'grid', gap: '16px', maxWidth: '700px' }}>

        {/* Profile */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--primary-100)', color: 'var(--primary-700)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '1.2rem' }}>
              {currentUser?.name?.charAt(0).toUpperCase() || <User size={22} />}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>{currentUser?.name || 'Chưa đăng nhập'}</div>
              <div style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)' }}>
                {currentUser?.role || ''} {currentUser?.email ? `· ${currentUser.email}` : ''}
              </div>
            </div>
            <button onClick={toggleDarkMode} className="btn btn-ghost"
              style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem' }}>
              {darkMode ? <Sun size={16} /> : <Moon size={16} />}
              {darkMode ? 'Sáng' : 'Tối'}
            </button>
          </div>
        </div>

        {/* Connection status */}
        <div className="card" style={{ padding: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ width: 40, height: 40, borderRadius: 'var(--radius-md)',
                background: connected ? 'var(--success-bg)' : 'var(--warning-bg)',
                display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {connected ? <CheckCircle2 size={20} color="var(--success)" /> : <XCircle size={20} color="var(--warning)" />}
              </div>
              <div>
                <div style={{ fontWeight: 700 }}>{connected ? 'Đã kết nối Google Sheets' : 'Chưa kết nối'}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>
                  {connected && lastSyncTime ? `Sync lúc ${lastSyncTime.toLocaleTimeString('vi-VN')}` : 'Dùng dữ liệu demo'}
                </div>
              </div>
            </div>
            {connected && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={handleSync} disabled={isSyncing}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.82rem' }}>
                  <RefreshCw size={14} className={isSyncing ? 'spin' : ''} /> {isSyncing ? 'Sync...' : 'Sync'}
                </button>
                <button className="btn btn-danger-outline" onClick={handleDisconnect} style={{ fontSize: '0.82rem' }}>Ngắt</button>
              </div>
            )}
          </div>
        </div>

        {/* Google Sheets config */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
            <Database size={18} color="var(--primary-500)" />
            <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>Google Sheets</h3>
          </div>

          <div className="form-group">
            <label className="form-label">Spreadsheet ID <span style={{ color: 'var(--text-tertiary)', fontWeight: 400 }}>(hoặc paste URL)</span></label>
            <input className="form-input" value={spreadsheetId} onChange={e => handlePasteUrl(e.target.value)}
              placeholder="ID hoặc URL Sheet" spellCheck={false} />
          </div>
          <div className="form-group">
            <label className="form-label">OAuth 2.0 Client ID</label>
            <input className="form-input" value={clientId} onChange={e => setClientId(e.target.value)}
              placeholder="xxxx.apps.googleusercontent.com" spellCheck={false} />
          </div>

          <button className="btn btn-primary" onClick={handleConnect} disabled={isAuthenticating || !spreadsheetId || !clientId}
            style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', justifyContent: 'center', marginTop: '8px' }}>
            {isAuthenticating
              ? <><Loader size={14} className="spin" /> Đang kết nối...</>
              : <><img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" width={16} height={16} alt="" /> Kết nối Google</>
            }
          </button>
        </div>

        {/* KPI Tabs */}
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
            <BarChart3 size={18} color="var(--purple-600)" />
            <h3 style={{ fontWeight: 700, fontSize: '1rem' }}>KPI Sheets</h3>
          </div>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-tertiary)', marginBottom: '12px' }}>
            Mỗi tab = 1 client/dự án trong Google Sheet
          </p>

          {kpiTabs.length > 0 && (
            <div style={{ marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {kpiTabs.map((tab, idx) => (
                <div key={idx} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 12px',
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)',
                  background: tab.active ? 'var(--bg-primary)' : 'var(--bg-secondary)', opacity: tab.active ? 1 : 0.6 }}>
                  <input type="checkbox" checked={tab.active} onChange={() => toggleKpiTab(idx)}
                    style={{ accentColor: 'var(--primary-500)', width: 15, height: 15 }} />
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem',
                    background: 'var(--primary-50)', color: 'var(--primary-700)', borderRadius: 4, padding: '1px 8px' }}>
                    {tab.tabName}
                  </span>
                  {tab.projectName !== tab.tabName && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-tertiary)' }}>→ {tab.projectName}</span>
                  )}
                  <button onClick={() => removeKpiTab(idx)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', padding: 4 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input className="form-input" value={newTabName} onChange={e => setNewTabName(e.target.value)}
              placeholder="Tên tab Sheet" style={{ flex: 2, minWidth: 120 }} onKeyDown={e => e.key === 'Enter' && addKpiTab()} />
            <input className="form-input" value={newProjectName} onChange={e => setNewProjectName(e.target.value)}
              placeholder="Tên hiển thị" style={{ flex: 2, minWidth: 100 }} onKeyDown={e => e.key === 'Enter' && addKpiTab()} />
            <button className="btn btn-secondary" onClick={addKpiTab} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Plus size={14} /> Thêm
            </button>
          </div>

          <button className="btn btn-primary" onClick={handleSyncKPI} disabled={!connected}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '12px', width: '100%', justifyContent: 'center' }}>
            <RefreshCw size={14} /> Sync KPI
          </button>

          {!connected && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', marginTop: '10px',
              background: 'var(--warning-bg)', borderRadius: 'var(--radius-sm)', fontSize: '0.82rem', color: '#92400e' }}>
              <AlertTriangle size={14} /> Kết nối Google Sheets để kích hoạt
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="card" style={{ padding: '16px' }}>
          <button className="btn btn-danger-outline" style={{ width: '100%' }}
            onClick={() => { useAppStore.getState().setCurrentUser(null); toast.success('Đã đăng xuất'); }}>
            Đăng xuất
          </button>
        </div>
      </div>
    </div>
  );
}
