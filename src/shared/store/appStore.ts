import { create } from 'zustand';
import type { AppState, FilterState, KPISubmission, MemberAccount, WeeklyReport, ProjectTask, BonusPoint, RnDLog, MonthlyKPITarget, TodoItem, AppNotification } from '@/shared/types';
import { DEFAULT_KPI_SCALE_CONFIG } from '@/shared/types';
import { mockProjects, mockContents, mockMembers, mockClients, mockExpenses, defaultTaskPointRules, defaultSites } from '@/shared/data/mockData';

// ── Postgres DB keys ──────────────────────────────────────────────────────
const DB_SUBMISSIONS = 'hcms_submissions';
const DB_SCALE       = 'hcms_scale_config';
const DB_MEMBERS     = 'hcms_members';
const DB_ACCOUNTS    = 'hcms_accounts';
const DB_WEEKLY      = 'hcms_weekly_reports';
const DB_SITES       = 'hcms_sites';
const DB_PROJ_TASKS  = 'hcms_project_tasks';
const DB_BONUS       = 'hcms_bonus';
const DB_RND         = 'hcms_rnd_logs';
const DB_KPI_TARGETS = 'hcms_kpi_targets';
const DB_TODOS       = 'hcms_todos';
const DB_PROJECTS    = 'hcms_projects';
const DB_CONTENTS    = 'hcms_contents';
const DB_CLIENTS     = 'hcms_clients';
const DB_EXPENSES    = 'hcms_expenses';
const DB_TASK_PT_RULES = 'hcms_task_point_rules';
const DB_PERF_REVIEWS  = 'hcms_perf_reviews';
const DB_USER          = 'hcms_current_user';
const DB_NOTIFICATIONS = 'hcms_notifications';

// ── Persist to Postgres with retry ────────────────────────────────────────
function saveDB(key: string, value: unknown) {
  const postToDb = (attempt: number) => {
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    })
      .then(res => {
        if (!res.ok && attempt < 3) {
          setTimeout(() => postToDb(attempt + 1), 1000 * attempt);
        }
      })
      .catch(() => {
        if (attempt < 3) {
          setTimeout(() => postToDb(attempt + 1), 1000 * attempt);
        } else {
          console.error('DB Save failed after 3 retries:', key);
        }
      });
  };
  postToDb(1);
}

const defaultFilters: FilterState = {
  projectId:     '',
  clientId:      '',
  memberId:      '',
  week:          '',
  month:         '',
  projectType:   '',
  projectStatus: '',
  contentStatus: '',
};

export const useAppStore = create<AppState>((set, get) => ({
  // ── Initial data (mock fallback — Postgres sẽ override qua initFromDB) ──
  projects:   mockProjects,
  contents:   mockContents,
  members:    mockMembers,
  clients:    mockClients,
  expenses:   mockExpenses,
  memberAccounts: [] as MemberAccount[],
  kpiEntries: [],
  taskPointRules: defaultTaskPointRules,
  performanceReviews: [],
  submissions: [] as KPISubmission[],
  scaleConfig: DEFAULT_KPI_SCALE_CONFIG,
  sites:        defaultSites,
  projectTasks: [] as ProjectTask[],
  bonusPoints:  [] as BonusPoint[],
  rndLogs:      [] as RnDLog[],
  kpiTargets:   [] as MonthlyKPITarget[],
  todos:        [] as TodoItem[],
  weeklyReports: [] as WeeklyReport[],
  notifications: [] as AppNotification[],

  // ── UI state ─────────────────────────────────────────────────────────────
  currentUser:      null,
  isSyncing:        false,
  lastSyncTime:     null,
  sidebarCollapsed: false,
  theme: 'light' as 'light' | 'dark',

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  }),

  // ── Filters ───────────────────────────────────────────────────────────────
  filters: defaultFilters,

  // ── Data setters (all persist to Postgres) ──────────────────────────────
  setProjects:           (projects)           => { set({ projects }); saveDB(DB_PROJECTS, projects); },
  setContents:           (contents)           => { set({ contents }); saveDB(DB_CONTENTS, contents); },
  setMembers:            (members)            => { set({ members }); saveDB(DB_MEMBERS, members); },
  setClients:            (clients)            => { set({ clients }); saveDB(DB_CLIENTS, clients); },
  setExpenses:           (expenses)           => { set({ expenses }); saveDB(DB_EXPENSES, expenses); },
  setKpiEntries:         (kpiEntries)         => set({ kpiEntries }),
  setTaskPointRules:     (taskPointRules)     => { set({ taskPointRules }); saveDB(DB_TASK_PT_RULES, taskPointRules); },
  setPerformanceReviews: (performanceReviews) => { set({ performanceReviews }); saveDB(DB_PERF_REVIEWS, performanceReviews); },
  setSubmissions: (submissions) => {
    set({ submissions });
    saveDB(DB_SUBMISSIONS, submissions);
  },
  setScaleConfig: (scaleConfig) => {
    set({ scaleConfig });
    saveDB(DB_SCALE, scaleConfig);
  },

  // ── KPISubmission CRUD ───────────────────────────────────────────────────
  addSubmission: (sub) => {
    const submissions = [...get().submissions, sub];
    set({ submissions });
    saveDB(DB_SUBMISSIONS, submissions);
  },
  addSubmissionsBatch: (subs) => {
    const submissions = [...get().submissions, ...subs];
    set({ submissions });
    saveDB(DB_SUBMISSIONS, submissions);
  },
  deleteSubmission: (id) => {
    const submissions = get().submissions.filter(s => s.id !== id);
    set({ submissions });
    saveDB(DB_SUBMISSIONS, submissions);
  },

  // ── Content CRUD ─────────────────────────────────────────────────────────
  addContent: (content) => {
    const contents = [...get().contents, content];
    set({ contents });
    saveDB(DB_CONTENTS, contents);
  },
  updateContent: (id, updates) => {
    const contents = get().contents.map((c) => c.id === id ? { ...c, ...updates } : c);
    set({ contents });
    saveDB(DB_CONTENTS, contents);
  },
  deleteContent: (id) => {
    const contents = get().contents.filter((c) => c.id !== id);
    set({ contents });
    saveDB(DB_CONTENTS, contents);
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────
  addProject: (project) => {
    const projects = [...get().projects, project];
    set({ projects });
    saveDB(DB_PROJECTS, projects);
  },
  updateProject: (id, updates) => {
    const projects = get().projects.map((p) => p.id === id ? { ...p, ...updates } : p);
    set({ projects });
    saveDB(DB_PROJECTS, projects);
  },
  deleteProject: (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    saveDB(DB_PROJECTS, projects);
  },

  // ── Expense CRUD ─────────────────────────────────────────────────────────
  addExpense: (expense) => {
    const expenses = [...get().expenses, expense];
    set({ expenses });
    saveDB(DB_EXPENSES, expenses);
  },
  updateExpense: (id, updates) => {
    const expenses = get().expenses.map((e) => e.id === id ? { ...e, ...updates } : e);
    set({ expenses });
    saveDB(DB_EXPENSES, expenses);
  },
  deleteExpense: (id) => {
    const expenses = get().expenses.filter((e) => e.id !== id);
    set({ expenses });
    saveDB(DB_EXPENSES, expenses);
  },

  // ── TaskPointRule CRUD ───────────────────────────────────────────────────
  addTaskPointRule: (rule) => {
    const taskPointRules = [...get().taskPointRules, rule];
    set({ taskPointRules });
    saveDB(DB_TASK_PT_RULES, taskPointRules);
  },
  updateTaskPointRule: (id, updates) => {
    const taskPointRules = get().taskPointRules.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ taskPointRules });
    saveDB(DB_TASK_PT_RULES, taskPointRules);
  },
  deleteTaskPointRule: (id) => {
    const taskPointRules = get().taskPointRules.filter((r) => r.id !== id);
    set({ taskPointRules });
    saveDB(DB_TASK_PT_RULES, taskPointRules);
  },

  // ── PerformanceReview CRUD ───────────────────────────────────────────────
  addPerformanceReview: (review) => {
    const performanceReviews = [...get().performanceReviews, review];
    set({ performanceReviews });
    saveDB(DB_PERF_REVIEWS, performanceReviews);
  },
  updatePerformanceReview: (id, updates) => {
    const performanceReviews = get().performanceReviews.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ performanceReviews });
    saveDB(DB_PERF_REVIEWS, performanceReviews);
  },
  deletePerformanceReview: (id) => {
    const performanceReviews = get().performanceReviews.filter((r) => r.id !== id);
    set({ performanceReviews });
    saveDB(DB_PERF_REVIEWS, performanceReviews);
  },

  // ── Member CRUD ───────────────────────────────────────────────────────────
  addMember: (m, account) => {
    const members = [...get().members, m];
    set({ members });
    saveDB(DB_MEMBERS, members);
    if (account) {
      const accs = [...get().memberAccounts.filter(a => a.memberId !== account.memberId), account];
      set({ memberAccounts: accs });
      saveDB(DB_ACCOUNTS, accs);
    }
  },
  updateMember: (id, updates) => {
    const members = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members });
    saveDB(DB_MEMBERS, members);
  },
  deleteMember: (id) => {
    const members = get().members.filter(m => m.id !== id);
    const memberAccounts = get().memberAccounts.filter(a => a.memberId !== id);
    set({ members, memberAccounts });
    saveDB(DB_MEMBERS, members);
    saveDB(DB_ACCOUNTS, memberAccounts);
  },
  setMemberAccount: (account) => {
    const accs = [...get().memberAccounts.filter(a => a.memberId !== account.memberId), account];
    set({ memberAccounts: accs });
    saveDB(DB_ACCOUNTS, accs);
  },
  removeMemberAccount: (memberId) => {
    const accs = get().memberAccounts.filter(a => a.memberId !== memberId);
    set({ memberAccounts: accs });
    saveDB(DB_ACCOUNTS, accs);
  },

  // ── Site CRUD ────────────────────────────────────────────────────────────
  addSite: (s) => {
    const sites = [...get().sites, s];
    set({ sites });
    saveDB(DB_SITES, sites);
  },
  updateSite: (id, updates) => {
    const sites = get().sites.map(s => s.id === id ? { ...s, ...updates } : s);
    set({ sites });
    saveDB(DB_SITES, sites);
  },
  deleteSite: (id) => {
    const sites = get().sites.filter(s => s.id !== id);
    set({ sites });
    saveDB(DB_SITES, sites);
  },

  // ── ProjectTask CRUD ─────────────────────────────────────────────────────
  addProjectTask: (t) => {
    const projectTasks = [...get().projectTasks, t];
    set({ projectTasks });
    saveDB(DB_PROJ_TASKS, projectTasks);
  },
  updateProjectTask: (id, updates) => {
    const projectTasks = get().projectTasks.map(t => t.id === id ? { ...t, ...updates } : t);
    set({ projectTasks });
    saveDB(DB_PROJ_TASKS, projectTasks);
  },
  deleteProjectTask: (id) => {
    const projectTasks = get().projectTasks.filter(t => t.id !== id);
    set({ projectTasks });
    saveDB(DB_PROJ_TASKS, projectTasks);
  },

  // ── BonusPoint CRUD ─────────────────────────────────────────────────────
  addBonusPoint: (b) => {
    const bonusPoints = [...get().bonusPoints, b];
    set({ bonusPoints });
    saveDB(DB_BONUS, bonusPoints);
  },
  updateBonusPoint: (id, updates) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id ? { ...b, ...updates } : b);
    set({ bonusPoints });
    saveDB(DB_BONUS, bonusPoints);
  },
  deleteBonusPoint: (id) => {
    const bonusPoints = get().bonusPoints.filter(b => b.id !== id);
    set({ bonusPoints });
    saveDB(DB_BONUS, bonusPoints);
  },
  approveBonusPoint: (id, approverName) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id
      ? { ...b, status: 'approved' as const, approvedBy: approverName, approvedAt: new Date().toISOString() }
      : b);
    set({ bonusPoints });
    saveDB(DB_BONUS, bonusPoints);
  },
  rejectBonusPoint: (id, approverName, note) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id
      ? { ...b, status: 'rejected' as const, approvedBy: approverName, approvedAt: new Date().toISOString(), rejectionNote: note ?? '' }
      : b);
    set({ bonusPoints });
    saveDB(DB_BONUS, bonusPoints);
  },

  // ── R&D Log CRUD ─────────────────────────────────────────────────────────
  addRnDLog: (l) => {
    const rndLogs = [...get().rndLogs, l];
    set({ rndLogs });
    saveDB(DB_RND, rndLogs);
  },
  updateRnDLog: (id, updates) => {
    const rndLogs = get().rndLogs.map(x => x.id === id ? { ...x, ...updates, updatedAt: new Date().toISOString() } : x);
    set({ rndLogs });
    saveDB(DB_RND, rndLogs);
  },
  deleteRnDLog: (id) => {
    const rndLogs = get().rndLogs.filter(x => x.id !== id);
    set({ rndLogs });
    saveDB(DB_RND, rndLogs);
  },

  // ── Spot-check (qualityCheck trên submission) ────────────────────────────
  setQualityCheck: (submissionId, score, checkedBy, note) => {
    const submissions = get().submissions.map(s => s.id === submissionId
      ? { ...s, qualityCheck: { score, checkedBy, checkedAt: new Date().toISOString(), note } }
      : s);
    set({ submissions });
    saveDB(DB_SUBMISSIONS, submissions);
  },

  // ── Monthly KPI Target CRUD ──────────────────────────────────────────────
  addKpiTarget: (t) => {
    const kpiTargets = [...get().kpiTargets, t];
    set({ kpiTargets });
    saveDB(DB_KPI_TARGETS, kpiTargets);
  },
  updateKpiTarget: (id, updates) => {
    const kpiTargets = get().kpiTargets.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ kpiTargets });
    saveDB(DB_KPI_TARGETS, kpiTargets);
  },
  deleteKpiTarget: (id) => {
    const kpiTargets = get().kpiTargets.filter(x => x.id !== id);
    set({ kpiTargets });
    saveDB(DB_KPI_TARGETS, kpiTargets);
  },

  // ── Todo CRUD ─────────────────────────────────────────────────────────────────
  addTodo: (t) => {
    const todos = [...get().todos, t];
    set({ todos });
    saveDB(DB_TODOS, todos);
  },
  updateTodo: (id, updates) => {
    const oldTodo = get().todos.find(x => x.id === id);
    const todos = get().todos.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ todos });
    saveDB(DB_TODOS, todos);

    // Auto-notification: khi assignee tick done → thông báo cho owner
    if (oldTodo && !oldTodo.completed && updates.completed === true) {
      const currentUser = get().currentUser;
      // Chỉ tạo notification khi: người tick done là assignee (không phải owner)
      if (currentUser && oldTodo.assigneeName === currentUser.name && oldTodo.ownerName !== currentUser.name) {
        const notif: AppNotification = {
          id: `notif_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,5)}`,
          type: 'task_completed',
          recipientName: oldTodo.ownerName,
          actorName: currentUser.name,
          title: 'Công việc đã hoàn thành',
          message: `${currentUser.name} đã hoàn thành "${oldTodo.title}"`,
          referenceId: oldTodo.id,
          read: false,
          createdAt: new Date().toISOString(),
        };
        get().addNotification(notif);
      }
    }
  },
  deleteTodo: (id) => {
    const todos = get().todos.filter(x => x.id !== id);
    set({ todos });
    saveDB(DB_TODOS, todos);
  },

  // ── Notification CRUD ─────────────────────────────────────────────────────────
  addNotification: (n) => {
    const notifications = [n, ...get().notifications];
    set({ notifications });
    saveDB(DB_NOTIFICATIONS, notifications);
  },
  markNotificationRead: (id) => {
    const notifications = get().notifications.map(n => n.id === id ? { ...n, read: true } : n);
    set({ notifications });
    saveDB(DB_NOTIFICATIONS, notifications);
  },
  markAllNotificationsRead: (recipientName) => {
    const notifications = get().notifications.map(n =>
      n.recipientName === recipientName ? { ...n, read: true } : n
    );
    set({ notifications });
    saveDB(DB_NOTIFICATIONS, notifications);
  },
  clearNotifications: (recipientName) => {
    const notifications = get().notifications.filter(n => n.recipientName !== recipientName);
    set({ notifications });
    saveDB(DB_NOTIFICATIONS, notifications);
  },

  // ── UI actions ────────────────────────────────────────────────────────────
  setCurrentUser:  (user) => {
    set({ currentUser: user });
    // Persist per-device (localStorage, KHÔNG lưu DB chung vì mỗi máy 1 acc)
    try {
      if (user) localStorage.setItem('hcms_current_user', JSON.stringify(user));
      else localStorage.removeItem('hcms_current_user');
    } catch { /* ignore */ }
  },
  setFilter:       (key, value)        => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters:    ()                  => set({ filters: defaultFilters }),
  toggleSidebar:   ()                  => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSyncing:      (syncing)           => set({ isSyncing: syncing }),

  // ── WeeklyReport CRUD ────────────────────────────────────────────────────
  addWeeklyReport: (report) => {
    const weeklyReports = [...get().weeklyReports, report];
    set({ weeklyReports });
    saveDB(DB_WEEKLY, weeklyReports);
  },
  updateWeeklyReport: (id, updates) => {
    const weeklyReports = get().weeklyReports.map(r => r.id === id ? { ...r, ...updates } : r);
    set({ weeklyReports });
    saveDB(DB_WEEKLY, weeklyReports);
  },
  deleteWeeklyReport: (id) => {
    const weeklyReports = get().weeklyReports.filter(r => r.id !== id);
    set({ weeklyReports });
    saveDB(DB_WEEKLY, weeklyReports);
  },

  // ── Migrate: bỏ p_nhathuoc/p_tiemchung khỏi Projects (chúng là Sites) ───
  ensureDefaultProjects: () => {
    const state = get();
    const cleaned = state.projects.filter(p => p.id !== 'p_nhathuoc' && p.id !== 'p_tiemchung');
    if (cleaned.length !== state.projects.length) set({ projects: cleaned });
    // Đảm bảo 2 site mặc định
    const sites = [...state.sites];
    let changed = false;
    if (!sites.find(s => s.id === 's_nhathuoc')) {
      sites.push(defaultSites[0]); changed = true;
    }
    if (!sites.find(s => s.id === 's_tiemchung')) {
      sites.push(defaultSites[1]); changed = true;
    }
    if (changed) {
      set({ sites });
      saveDB(DB_SITES, sites);
    }
  },
}));

// ── Helper: load data từ Postgres (Neon) ────────────────────────────────
export async function initFromDB() {
  try {
    const res = await fetch('/api/store');
    if (!res.ok) return;
    const data = await res.json();
    const stateUpdate: Record<string, unknown> = {};
    
    const keyMap: Record<string, string> = {
      [DB_SUBMISSIONS]:    'submissions',
      [DB_PROJECTS]:       'projects',
      [DB_TODOS]:          'todos',
      [DB_MEMBERS]:        'members',
      [DB_CONTENTS]:       'contents',
      [DB_CLIENTS]:        'clients',
      [DB_EXPENSES]:       'expenses',
      [DB_TASK_PT_RULES]:  'taskPointRules',
      [DB_PERF_REVIEWS]:   'performanceReviews',
      [DB_SCALE]:          'scaleConfig',
      [DB_SITES]:          'sites',
      [DB_PROJ_TASKS]:     'projectTasks',
      [DB_BONUS]:          'bonusPoints',
      [DB_RND]:            'rndLogs',
      [DB_KPI_TARGETS]:    'kpiTargets',
      [DB_WEEKLY]:         'weeklyReports',
      [DB_ACCOUNTS]:       'memberAccounts',
      [DB_NOTIFICATIONS]:  'notifications',
    };

    for (const [key, stateKey] of Object.entries(keyMap)) {
      if (data[key] !== undefined && data[key] !== null) {
        stateUpdate[stateKey] = data[key];
      }
    }

    // Apply scale config migration
    if (stateUpdate['scaleConfig']) {
      const sc = { ...(stateUpdate['scaleConfig'] as any) };
      let dirty = false;
      if (sc.leaderProductionWeight <= 0.40) { sc.leaderProductionWeight = 0.60; dirty = true; }
      if (sc.standardHoursPerMonth <= 176) { sc.standardHoursPerMonth = 196; dirty = true; }
      if (!sc.workingDaysPerMonth || sc.workingDaysPerMonth <= 22) { sc.workingDaysPerMonth = 24.5; dirty = true; }
      if (sc.memberTargetPoints <= 264) { sc.memberTargetPoints = 294; dirty = true; }
      if (dirty) {
        stateUpdate['scaleConfig'] = sc;
        saveDB(DB_SCALE, sc);
      }
    }
    
    if (Object.keys(stateUpdate).length > 0) {
      useAppStore.setState(stateUpdate);
    }

    useAppStore.getState().ensureDefaultProjects();
    useAppStore.setState({ lastSyncTime: new Date() });
  } catch (e) {
    console.error("DB Load Error:", e);
  }
}
