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

// ── Atomic: append items to array (no overwrite) ──────────────────────────
async function appendDB(key: string, items: unknown[]): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, op: 'append', items })
      });
      if (res.ok) return true;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  console.error('DB Append failed after 3 retries:', key);
  return false;
}

// ── Atomic: remove items by id ────────────────────────────────────────────
async function removeItemDB(key: string, ids: string[]): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, op: 'remove', ids })
      });
      if (res.ok) return true;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  console.error('DB Remove failed after 3 retries:', key);
  return false;
}

// ── Atomic: update single item by id (merge fields) ──────────────────────
async function updateItemDB(key: string, id: string, data: unknown): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch('/api/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key, op: 'update', id, data })
      });
      if (res.ok) return true;
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    } catch {
      if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
    }
  }
  console.error('DB Update failed after 3 retries:', key);
  return false;
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
    appendDB(DB_SUBMISSIONS, [sub]);
  },
  addSubmissionsBatch: async (subs) => {
    const oldSubmissions = get().submissions;
    const submissions = [...oldSubmissions, ...subs];
    set({ submissions });
    const ok = await appendDB(DB_SUBMISSIONS, subs);
    if (!ok) {
      // Rollback local state if DB save failed
      set({ submissions: oldSubmissions });
    }
    return ok;
  },
  deleteSubmission: (id) => {
    const submissions = get().submissions.filter(s => s.id !== id);
    set({ submissions });
    removeItemDB(DB_SUBMISSIONS, [id]);
  },

  // ── Content CRUD ─────────────────────────────────────────────────────────
  addContent: (content) => {
    const contents = [...get().contents, content];
    set({ contents });
    appendDB(DB_CONTENTS, [content]);
  },
  updateContent: (id, updates) => {
    const contents = get().contents.map((c) => c.id === id ? { ...c, ...updates } : c);
    set({ contents });
    updateItemDB(DB_CONTENTS, id, updates);
  },
  deleteContent: (id) => {
    const contents = get().contents.filter((c) => c.id !== id);
    set({ contents });
    removeItemDB(DB_CONTENTS, [id]);
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────
  addProject: (project) => {
    const projects = [...get().projects, project];
    set({ projects });
    appendDB(DB_PROJECTS, [project]);
  },
  updateProject: (id, updates) => {
    const projects = get().projects.map((p) => p.id === id ? { ...p, ...updates } : p);
    set({ projects });
    updateItemDB(DB_PROJECTS, id, updates);
  },
  deleteProject: (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    removeItemDB(DB_PROJECTS, [id]);
  },

  // ── Expense CRUD ─────────────────────────────────────────────────────────
  addExpense: (expense) => {
    const expenses = [...get().expenses, expense];
    set({ expenses });
    appendDB(DB_EXPENSES, [expense]);
  },
  updateExpense: (id, updates) => {
    const expenses = get().expenses.map((e) => e.id === id ? { ...e, ...updates } : e);
    set({ expenses });
    updateItemDB(DB_EXPENSES, id, updates);
  },
  deleteExpense: (id) => {
    const expenses = get().expenses.filter((e) => e.id !== id);
    set({ expenses });
    removeItemDB(DB_EXPENSES, [id]);
  },

  // ── TaskPointRule CRUD ───────────────────────────────────────────────────
  addTaskPointRule: (rule) => {
    const taskPointRules = [...get().taskPointRules, rule];
    set({ taskPointRules });
    appendDB(DB_TASK_PT_RULES, [rule]);
  },
  updateTaskPointRule: (id, updates) => {
    const taskPointRules = get().taskPointRules.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ taskPointRules });
    updateItemDB(DB_TASK_PT_RULES, id, updates);
  },
  deleteTaskPointRule: (id) => {
    const taskPointRules = get().taskPointRules.filter((r) => r.id !== id);
    set({ taskPointRules });
    removeItemDB(DB_TASK_PT_RULES, [id]);
  },

  // ── PerformanceReview CRUD ───────────────────────────────────────────────
  addPerformanceReview: (review) => {
    const performanceReviews = [...get().performanceReviews, review];
    set({ performanceReviews });
    appendDB(DB_PERF_REVIEWS, [review]);
  },
  updatePerformanceReview: (id, updates) => {
    const performanceReviews = get().performanceReviews.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ performanceReviews });
    updateItemDB(DB_PERF_REVIEWS, id, updates);
  },
  deletePerformanceReview: (id) => {
    const performanceReviews = get().performanceReviews.filter((r) => r.id !== id);
    set({ performanceReviews });
    removeItemDB(DB_PERF_REVIEWS, [id]);
  },

  // ── Member CRUD ───────────────────────────────────────────────────────────
  addMember: (m, account) => {
    const members = [...get().members, m];
    set({ members });
    appendDB(DB_MEMBERS, [m]);
    if (account) {
      const accs = [...get().memberAccounts.filter(a => a.memberId !== account.memberId), account];
      set({ memberAccounts: accs });
      saveDB(DB_ACCOUNTS, accs);
    }
  },
  updateMember: (id, updates) => {
    const members = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members });
    updateItemDB(DB_MEMBERS, id, updates);
  },
  deleteMember: (id) => {
    const members = get().members.filter(m => m.id !== id);
    const memberAccounts = get().memberAccounts.filter(a => a.memberId !== id);
    set({ members, memberAccounts });
    removeItemDB(DB_MEMBERS, [id]);
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
    appendDB(DB_SITES, [s]);
  },
  updateSite: (id, updates) => {
    const sites = get().sites.map(s => s.id === id ? { ...s, ...updates } : s);
    set({ sites });
    updateItemDB(DB_SITES, id, updates);
  },
  deleteSite: (id) => {
    const sites = get().sites.filter(s => s.id !== id);
    set({ sites });
    removeItemDB(DB_SITES, [id]);
  },

  // ── ProjectTask CRUD ─────────────────────────────────────────────────────
  addProjectTask: (t) => {
    const projectTasks = [...get().projectTasks, t];
    set({ projectTasks });
    appendDB(DB_PROJ_TASKS, [t]);
  },
  updateProjectTask: (id, updates) => {
    const projectTasks = get().projectTasks.map(t => t.id === id ? { ...t, ...updates } : t);
    set({ projectTasks });
    updateItemDB(DB_PROJ_TASKS, id, updates);
  },
  deleteProjectTask: (id) => {
    const projectTasks = get().projectTasks.filter(t => t.id !== id);
    set({ projectTasks });
    removeItemDB(DB_PROJ_TASKS, [id]);
  },

  // ── BonusPoint CRUD ─────────────────────────────────────────────────────
  addBonusPoint: (b) => {
    const bonusPoints = [...get().bonusPoints, b];
    set({ bonusPoints });
    appendDB(DB_BONUS, [b]);
  },
  updateBonusPoint: (id, updates) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id ? { ...b, ...updates } : b);
    set({ bonusPoints });
    updateItemDB(DB_BONUS, id, updates);
  },
  deleteBonusPoint: (id) => {
    const bonusPoints = get().bonusPoints.filter(b => b.id !== id);
    set({ bonusPoints });
    removeItemDB(DB_BONUS, [id]);
  },
  approveBonusPoint: (id, approverName) => {
    const upd = { status: 'approved' as const, approvedBy: approverName, approvedAt: new Date().toISOString() };
    const bonusPoints = get().bonusPoints.map(b => b.id === id ? { ...b, ...upd } : b);
    set({ bonusPoints });
    updateItemDB(DB_BONUS, id, upd);
  },
  rejectBonusPoint: (id, approverName, note) => {
    const upd = { status: 'rejected' as const, approvedBy: approverName, approvedAt: new Date().toISOString(), rejectionNote: note ?? '' };
    const bonusPoints = get().bonusPoints.map(b => b.id === id ? { ...b, ...upd } : b);
    set({ bonusPoints });
    updateItemDB(DB_BONUS, id, upd);
  },

  // ── R&D Log CRUD ─────────────────────────────────────────────────────────
  addRnDLog: (l) => {
    const rndLogs = [...get().rndLogs, l];
    set({ rndLogs });
    appendDB(DB_RND, [l]);
  },
  updateRnDLog: (id, updates) => {
    const upd = { ...updates, updatedAt: new Date().toISOString() };
    const rndLogs = get().rndLogs.map(x => x.id === id ? { ...x, ...upd } : x);
    set({ rndLogs });
    updateItemDB(DB_RND, id, upd);
  },
  deleteRnDLog: (id) => {
    const rndLogs = get().rndLogs.filter(x => x.id !== id);
    set({ rndLogs });
    removeItemDB(DB_RND, [id]);
  },

  // ── Spot-check (qualityCheck trên submission) ────────────────────────────
  setQualityCheck: (submissionId, score, checkedBy, note) => {
    const qc = { qualityCheck: { score, checkedBy, checkedAt: new Date().toISOString(), note } };
    const submissions = get().submissions.map(s => s.id === submissionId ? { ...s, ...qc } : s);
    set({ submissions });
    updateItemDB(DB_SUBMISSIONS, submissionId, qc);
  },

  // ── Monthly KPI Target CRUD ──────────────────────────────────────────────
  addKpiTarget: (t) => {
    const kpiTargets = [...get().kpiTargets, t];
    set({ kpiTargets });
    appendDB(DB_KPI_TARGETS, [t]);
  },
  updateKpiTarget: (id, updates) => {
    const kpiTargets = get().kpiTargets.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ kpiTargets });
    updateItemDB(DB_KPI_TARGETS, id, updates);
  },
  deleteKpiTarget: (id) => {
    const kpiTargets = get().kpiTargets.filter(x => x.id !== id);
    set({ kpiTargets });
    removeItemDB(DB_KPI_TARGETS, [id]);
  },

  // ── Todo CRUD ─────────────────────────────────────────────────────────────────
  addTodo: (t) => {
    const todos = [...get().todos, t];
    set({ todos });
    appendDB(DB_TODOS, [t]);
  },
  updateTodo: (id, updates) => {
    const oldTodo = get().todos.find(x => x.id === id);
    const todos = get().todos.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ todos });
    updateItemDB(DB_TODOS, id, updates);

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
    removeItemDB(DB_TODOS, [id]);
  },

  // ── Notification CRUD ─────────────────────────────────────────────────────────
  addNotification: (n) => {
    const notifications = [n, ...get().notifications];
    set({ notifications });
    appendDB(DB_NOTIFICATIONS, [n]);
  },
  markNotificationRead: (id) => {
    const notifications = get().notifications.map(n => n.id === id ? { ...n, read: true } : n);
    set({ notifications });
    updateItemDB(DB_NOTIFICATIONS, id, { read: true });
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
    appendDB(DB_WEEKLY, [report]);
  },
  updateWeeklyReport: (id, updates) => {
    const weeklyReports = get().weeklyReports.map(r => r.id === id ? { ...r, ...updates } : r);
    set({ weeklyReports });
    updateItemDB(DB_WEEKLY, id, updates);
  },
  deleteWeeklyReport: (id) => {
    const weeklyReports = get().weeklyReports.filter(r => r.id !== id);
    set({ weeklyReports });
    removeItemDB(DB_WEEKLY, [id]);
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

    // Migration: xoá key currentUser cũ khỏi DB chung (không dùng nữa, mỗi máy lưu localStorage)
    if (data[DB_USER]) {
      fetch('/api/store', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: DB_USER }),
      }).catch(() => {});
    }

    useAppStore.getState().ensureDefaultProjects();
    useAppStore.setState({ lastSyncTime: new Date() });
  } catch (e) {
    console.error("DB Load Error:", e);
  }
}
