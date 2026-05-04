import { NavLink, useLocation } from 'react-router-dom';
import { useAppStore } from '@/shared/store/appStore';
import {
  LayoutDashboard, FolderKanban, BarChart3,
  Users, ChevronLeft, ChevronRight, Heart, Settings,
  Trophy, Calculator, Award, ClipboardList, History, Package, Database, Gift, Lightbulb, Target, CheckSquare, Sun, Moon, Wallet
} from 'lucide-react';
import type { MemberRole } from '@/shared/types';

interface NavItem {
  path: string;
  icon: typeof LayoutDashboard;
  label: string;
  section: string;
  /** Role được phép xem. Nếu undefined → tất cả role đều xem được */
  allowedRoles?: MemberRole[];
}

const navItems: NavItem[] = [
  // ── Tổng quan ──
  { path: '/',              icon: LayoutDashboard, label: 'Dashboard',           section: 'Tổng quan' },
  { path: '/submit-kpi',     icon: ClipboardList,  label: 'Submit KPI',          section: 'Tổng quan', allowedRoles: ['Manager', 'Leader', 'Member'] },
  { path: '/my-submissions', icon: History,        label: 'KPI đã submit',       section: 'Tổng quan', allowedRoles: ['Manager', 'Leader', 'Member'] },
  { path: '/daily-work',     icon: Trophy,         label: 'Công việc hằng ngày', section: 'Tổng quan' },
  { path: '/todo',            icon: CheckSquare,    label: 'Checklist',           section: 'Tổng quan' },
  // ── Quản lý ──
  { path: '/projects',      icon: FolderKanban,    label: 'Dự án',               section: 'Quản lý' },
  { path: '/expenses',      icon: Wallet,          label: 'Chi phí',             section: 'Quản lý', allowedRoles: ['Manager', 'Leader'] },
  { path: '/contents',      icon: Package,         label: 'Sản phẩm dự án',    section: 'Quản lý' },
  { path: '/performance',   icon: Award,           label: 'Đánh giá nhân sự',    section: 'Quản lý' },
  { path: '/bonus-points',  icon: Gift,            label: 'Điểm thưởng',         section: 'Quản lý', allowedRoles: ['Manager', 'Leader'] },
  { path: '/rnd-logs',      icon: Lightbulb,       label: 'R&D Log',             section: 'Quản lý' },
  { path: '/reports',       icon: BarChart3,       label: 'Báo cáo tuần',        section: 'Quản lý', allowedRoles: ['Manager'] },
  // ── Hệ thống ──
  { path: '/members',       icon: Users,           label: 'Thành viên',          section: 'Hệ thống', allowedRoles: ['Manager'] },
  { path: '/kpi-targets',   icon: Target,          label: 'KPI Target / Tháng',  section: 'Hệ thống', allowedRoles: ['Manager', 'Leader'] },
  { path: '/point-config',  icon: Calculator,      label: 'Cấu hình Điểm',       section: 'Hệ thống', allowedRoles: ['Manager'] },
  { path: '/import-data',   icon: Database,        label: 'Import dữ liệu cũ',   section: 'Hệ thống', allowedRoles: ['Manager'] },
  { path: '/settings',      icon: Settings,        label: 'Cài đặt',             section: 'Hệ thống', allowedRoles: ['Manager'] },
];

export default function Sidebar() {
  const { sidebarCollapsed, toggleSidebar, contents, currentUser, bonusPoints, todos, theme, toggleTheme } = useAppStore();
  const location = useLocation();

  const pendingApproval = contents.filter(c => c.status === 'Chờ duyệt').length;
  const pendingBonusCount = currentUser?.role === 'Manager'
    ? bonusPoints.filter(b => b.status === 'pending').length
    : 0;
  const overdueTodoCount = currentUser
    ? todos.filter(t =>
        (t.ownerName === currentUser.name && !t.completed && t.dueDate && new Date(t.dueDate + 'T23:59:59') < new Date()) ||
        (t.assigneeName === currentUser.name && t.ownerName !== currentUser.name && !t.completed)
      ).length
    : 0;

  // Lọc menu theo role
  const visibleItems = navItems.filter(item => {
    if (!item.allowedRoles) return true;
    return currentUser ? item.allowedRoles.includes(currentUser.role) : false;
  });

  let lastSection = '';

  return (
    <aside className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}>
      <div className="sidebar-logo">
        <div className="logo-icon">
          <Heart size={20} />
        </div>
        <div>
          <div className="logo-text">Content Ecom LC</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        {visibleItems.map((item) => {
          const showSection = item.section !== lastSection;
          lastSection = item.section;
          const isActive = location.pathname === item.path;
          const badge = item.path === '/contents' ? pendingApproval
                       : item.path === '/bonus-points' ? pendingBonusCount
                       : item.path === '/todo' ? overdueTodoCount
                       : 0;

          return (
            <div key={item.path}>
              {showSection && (
                <div className="nav-section-label">{item.section}</div>
              )}
              <NavLink
                to={item.path}
                className={`nav-item ${isActive ? 'active' : ''}`}
              >
                <span className="nav-icon">
                  <item.icon size={20} />
                </span>
                <span className="nav-label">{item.label}</span>
                {badge > 0 && <span className="nav-badge">{badge}</span>}
              </NavLink>
            </div>
          );
        })}
      </nav>

      <div style={{ display: 'flex', borderTop: '1px solid var(--border-light)' }}>
        <button className="sidebar-toggle" onClick={toggleSidebar} style={{ flex: 1, borderTop: 'none', borderRight: '1px solid var(--border-light)' }}>
          {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
        <button className="sidebar-toggle" onClick={toggleTheme} style={{ flex: 1, borderTop: 'none' }} title="Đổi giao diện">
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </aside>
  );
}
