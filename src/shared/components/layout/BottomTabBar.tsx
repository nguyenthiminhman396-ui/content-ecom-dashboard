import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, BarChart3, Trophy, ClipboardList } from 'lucide-react';

const tabs = [
  { path: '/',            icon: LayoutDashboard, label: 'Dashboard' },
  { path: '/submit-kpi',  icon: ClipboardList,   label: 'Submit' },
  { path: '/daily-work',  icon: Trophy,          label: 'Hằng ngày' },
  { path: '/projects',    icon: FolderKanban,    label: 'Dự án' },
  { path: '/reports',     icon: BarChart3,       label: 'Báo cáo' },
];

export default function BottomTabBar() {
  const location = useLocation();

  return (
    <div className="bottom-tab-bar">
      <div className="tabs-container">
        {tabs.map((tab) => {
          const isActive = location.pathname === tab.path;
          return (
            <NavLink
              key={tab.path}
              to={tab.path}
              className={`tab-btn ${isActive ? 'active' : ''}`}
            >
              <tab.icon size={22} className="tab-icon" />
              <span>{tab.label}</span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}
