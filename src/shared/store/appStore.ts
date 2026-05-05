import { create } from 'zustand';
import type { AppState, FilterState, GoogleSheetsConfig, KPISubmission, KPIScaleConfig, MemberAccount, WeeklyReport, Site, ProjectTask, BonusPoint, RnDLog, MonthlyKPITarget, TodoItem } from '@/shared/types';
import { DEFAULT_KPI_SCALE_CONFIG } from '@/shared/types';
import { mockProjects, mockContents, mockMembers, mockClients, mockExpenses, defaultTaskPointRules, defaultSites } from '@/shared/data/mockData';
import { sheetsService } from '@/shared/services/googleSheets';

// ── localStorage keys ─────────────────────────────────────────────────────
const LS_SUBMISSIONS = 'hcms_submissions';
const LS_SCALE       = 'hcms_scale_config';
const LS_MEMBERS     = 'hcms_members';
const LS_ACCOUNTS    = 'hcms_accounts';
const LS_WEEKLY      = 'hcms_weekly_reports';
const LS_SITES       = 'hcms_sites';
const LS_PROJ_TASKS  = 'hcms_project_tasks';
const LS_BONUS       = 'hcms_bonus';
const LS_RND         = 'hcms_rnd_logs';
const LS_KPI_TARGETS = 'hcms_kpi_targets';
const LS_TODOS       = 'hcms_todos';
const LS_PROJECTS    = 'hcms_projects';
const LS_CONTENTS    = 'hcms_contents';
const LS_CLIENTS     = 'hcms_clients';
const LS_EXPENSES    = 'hcms_expenses';
const LS_TASK_PT_RULES = 'hcms_task_point_rules';
const LS_PERF_REVIEWS  = 'hcms_perf_reviews';

function loadLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch { return fallback; }
}
function saveLS(key: string, value: unknown) {
  try { 
    localStorage.setItem(key, JSON.stringify(value)); 
    fetch('/api/store', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    }).catch(e => console.error("DB Save Error:", e));
  } catch { /* ignore */ }
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
  // ── Initial data (localStorage → mock fallback) ────────────────────────
  projects:   loadLS(LS_PROJECTS, mockProjects),
  contents:   loadLS(LS_CONTENTS, mockContents),
  members:    loadLS(LS_MEMBERS, mockMembers),
  clients:    loadLS(LS_CLIENTS, mockClients),
  expenses:   loadLS(LS_EXPENSES, mockExpenses),
  memberAccounts: loadLS<MemberAccount[]>(LS_ACCOUNTS, []),
  kpiEntries: [],
  taskPointRules: loadLS(LS_TASK_PT_RULES, defaultTaskPointRules),
  performanceReviews: loadLS(LS_PERF_REVIEWS, []),
  submissions: loadLS<KPISubmission[]>(LS_SUBMISSIONS, []),
  scaleConfig: (() => {
    const cfg = loadLS<KPIScaleConfig>(LS_SCALE, DEFAULT_KPI_SCALE_CONFIG);
    let dirty = false;
    // Migration: leader weight 0.40 → 0.60
    if (cfg.leaderProductionWeight <= 0.40) { cfg.leaderProductionWeight = 0.60; dirty = true; }
    // Migration: 22 ngày/176h → 24.5 ngày/196h
    if (cfg.standardHoursPerMonth <= 176) { cfg.standardHoursPerMonth = 196; dirty = true; }
    if (!cfg.workingDaysPerMonth || cfg.workingDaysPerMonth <= 22) { cfg.workingDaysPerMonth = 24.5; dirty = true; }
    if (cfg.memberTargetPoints <= 264) { cfg.memberTargetPoints = 294; dirty = true; }
    if (dirty) saveLS(LS_SCALE, cfg);
    return cfg;
  })(),
  sites:        loadLS<Site[]>(LS_SITES, defaultSites),
  projectTasks: loadLS<ProjectTask[]>(LS_PROJ_TASKS, []),
  bonusPoints:  loadLS<BonusPoint[]>(LS_BONUS, []),
  rndLogs:      loadLS<RnDLog[]>(LS_RND, []),
  kpiTargets:   loadLS<MonthlyKPITarget[]>(LS_KPI_TARGETS, []),
  todos:        loadLS<TodoItem[]>(LS_TODOS, []),
  weeklyReports: loadLS<WeeklyReport[]>(LS_WEEKLY, []),

  // ── Sheets config (load từ localStorage nếu có) ──────────────────────────
  sheetsConfig: sheetsService.loadSavedConfig(),

  // ── UI state ─────────────────────────────────────────────────────────────
  currentUser:      null,
  isConnected:      sheetsService.isAuthenticated(),
  isSyncing:        false,
  lastSyncTime:     null,
  sidebarCollapsed: false,
  theme: loadLS<'light' | 'dark'>('hcms_theme', 'light'),

  toggleTheme: () => set((state) => {
    const newTheme = state.theme === 'light' ? 'dark' : 'light';
    saveLS('hcms_theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    return { theme: newTheme };
  }),

  // ── Filters ───────────────────────────────────────────────────────────────
  filters: defaultFilters,

  // ── Data setters (all persist to localStorage) ─────────────────────────
  setProjects:           (projects)           => { set({ projects }); saveLS(LS_PROJECTS, projects); },
  setContents:           (contents)           => { set({ contents }); saveLS(LS_CONTENTS, contents); },
  setMembers:            (members)            => { set({ members }); saveLS(LS_MEMBERS, members); },
  setClients:            (clients)            => { set({ clients }); saveLS(LS_CLIENTS, clients); },
  setExpenses:           (expenses)           => { set({ expenses }); saveLS(LS_EXPENSES, expenses); },
  setKpiEntries:         (kpiEntries)         => set({ kpiEntries }),
  setTaskPointRules:     (taskPointRules)     => { set({ taskPointRules }); saveLS(LS_TASK_PT_RULES, taskPointRules); },
  setPerformanceReviews: (performanceReviews) => { set({ performanceReviews }); saveLS(LS_PERF_REVIEWS, performanceReviews); },
  setSubmissions: (submissions) => {
    set({ submissions });
    saveLS(LS_SUBMISSIONS, submissions);
  },
  setScaleConfig: (scaleConfig) => {
    set({ scaleConfig });
    saveLS(LS_SCALE, scaleConfig);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveScaleConfig(scaleConfig).catch(console.error);
    }
  },

  // ── KPISubmission CRUD ───────────────────────────────────────────────────
  addSubmission: (sub) => {
    const submissions = [...get().submissions, sub];
    set({ submissions });
    saveLS(LS_SUBMISSIONS, submissions);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveSubmission(sub).catch(console.error);
    }
  },
  addSubmissionsBatch: (subs) => {
    const submissions = [...get().submissions, ...subs];
    set({ submissions });
    saveLS(LS_SUBMISSIONS, submissions);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveSubmissionsBatch(subs).catch(console.error);
    }
  },
  deleteSubmission: (id) => {
    const submissions = get().submissions.filter(s => s.id !== id);
    set({ submissions });
    saveLS(LS_SUBMISSIONS, submissions);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('AppSubmissions', id).catch(console.error);
    }
  },

  // ── Content CRUD ─────────────────────────────────────────────────────────
  addContent: (content) => {
    const contents = [...get().contents, content];
    set({ contents });
    saveLS(LS_CONTENTS, contents);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveContent(content).catch(console.error);
    }
  },
  updateContent: (id, updates) => {
    const contents = get().contents.map((c) => c.id === id ? { ...c, ...updates } : c);
    set({ contents });
    saveLS(LS_CONTENTS, contents);
    if (sheetsService.isAuthenticated()) {
      const updated = contents.find(c => c.id === id);
      if (updated) sheetsService.saveContent(updated).catch(console.error);
    }
  },
  deleteContent: (id) => {
    const contents = get().contents.filter((c) => c.id !== id);
    set({ contents });
    saveLS(LS_CONTENTS, contents);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('Contents', id).catch(console.error);
    }
  },

  // ── Project CRUD ─────────────────────────────────────────────────────────
  addProject: (project) => {
    const projects = [...get().projects, project];
    set({ projects });
    saveLS(LS_PROJECTS, projects);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveProject(project).catch(console.error);
    }
  },
  updateProject: (id, updates) => {
    const projects = get().projects.map((p) => p.id === id ? { ...p, ...updates } : p);
    set({ projects });
    saveLS(LS_PROJECTS, projects);
    if (sheetsService.isAuthenticated()) {
      const updated = projects.find(p => p.id === id);
      if (updated) sheetsService.saveProject(updated).catch(console.error);
    }
  },
  deleteProject: (id) => {
    const projects = get().projects.filter((p) => p.id !== id);
    set({ projects });
    saveLS(LS_PROJECTS, projects);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('Projects', id).catch(console.error);
    }
  },

  // ── Expense CRUD ─────────────────────────────────────────────────────────
  addExpense: (expense) => {
    const expenses = [...get().expenses, expense];
    set({ expenses });
    saveLS(LS_EXPENSES, expenses);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveExpense(expense).catch(console.error);
    }
  },
  updateExpense: (id, updates) => {
    const expenses = get().expenses.map((e) => e.id === id ? { ...e, ...updates } : e);
    set({ expenses });
    saveLS(LS_EXPENSES, expenses);
    if (sheetsService.isAuthenticated()) {
      const updated = expenses.find(e => e.id === id);
      if (updated) sheetsService.saveExpense(updated).catch(console.error);
    }
  },
  deleteExpense: (id) => {
    const expenses = get().expenses.filter((e) => e.id !== id);
    set({ expenses });
    saveLS(LS_EXPENSES, expenses);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('Expenses', id).catch(console.error);
    }
  },

  // ── TaskPointRule CRUD ───────────────────────────────────────────────────
  addTaskPointRule: (rule) => {
    const taskPointRules = [...get().taskPointRules, rule];
    set({ taskPointRules });
    saveLS(LS_TASK_PT_RULES, taskPointRules);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveTaskPointRule(rule).catch(console.error);
    }
  },
  updateTaskPointRule: (id, updates) => {
    const taskPointRules = get().taskPointRules.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ taskPointRules });
    saveLS(LS_TASK_PT_RULES, taskPointRules);
    if (sheetsService.isAuthenticated()) {
      const updated = taskPointRules.find(r => r.id === id);
      if (updated) sheetsService.saveTaskPointRule(updated).catch(console.error);
    }
  },
  deleteTaskPointRule: (id) => {
    const taskPointRules = get().taskPointRules.filter((r) => r.id !== id);
    set({ taskPointRules });
    saveLS(LS_TASK_PT_RULES, taskPointRules);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('AppConfig', id).catch(console.error);
    }
  },

  // ── PerformanceReview CRUD ───────────────────────────────────────────────
  addPerformanceReview: (review) => {
    const performanceReviews = [...get().performanceReviews, review];
    set({ performanceReviews });
    saveLS(LS_PERF_REVIEWS, performanceReviews);
    if (sheetsService.isAuthenticated()) {
      sheetsService.savePerformanceReview(review).catch(console.error);
    }
  },
  updatePerformanceReview: (id, updates) => {
    const performanceReviews = get().performanceReviews.map((r) => r.id === id ? { ...r, ...updates } : r);
    set({ performanceReviews });
    saveLS(LS_PERF_REVIEWS, performanceReviews);
    if (sheetsService.isAuthenticated()) {
      const updated = performanceReviews.find(r => r.id === id);
      if (updated) sheetsService.savePerformanceReview(updated).catch(console.error);
    }
  },
  deletePerformanceReview: (id) => {
    const performanceReviews = get().performanceReviews.filter((r) => r.id !== id);
    set({ performanceReviews });
    saveLS(LS_PERF_REVIEWS, performanceReviews);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('AppReviews', id).catch(console.error);
    }
  },

  // ── Member CRUD ───────────────────────────────────────────────────────────
  addMember: (m, account) => {
    const members = [...get().members, m];
    set({ members });
    saveLS(LS_MEMBERS, members);
    if (sheetsService.isAuthenticated()) {
      sheetsService.appendRow('Members', sheetsService.memberToRow(m)).catch(console.error);
    }
    if (account) {
      const accs = [...get().memberAccounts.filter(a => a.memberId !== account.memberId), account];
      set({ memberAccounts: accs });
      saveLS(LS_ACCOUNTS, accs);
    }
  },
  updateMember: (id, updates) => {
    const members = get().members.map(m => m.id === id ? { ...m, ...updates } : m);
    set({ members });
    saveLS(LS_MEMBERS, members);
    const updated = members.find(m => m.id === id);
    if (updated && sheetsService.isAuthenticated()) {
      sheetsService.updateRowById('Members', id, sheetsService.memberToRow(updated)).catch(console.error);
    }
  },
  deleteMember: (id) => {
    const members = get().members.filter(m => m.id !== id);
    const memberAccounts = get().memberAccounts.filter(a => a.memberId !== id);
    set({ members, memberAccounts });
    saveLS(LS_MEMBERS, members);
    saveLS(LS_ACCOUNTS, memberAccounts);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('Members', id).catch(console.error);
    }
  },
  setMemberAccount: (account) => {
    const accs = [...get().memberAccounts.filter(a => a.memberId !== account.memberId), account];
    set({ memberAccounts: accs });
    saveLS(LS_ACCOUNTS, accs);
  },
  removeMemberAccount: (memberId) => {
    const accs = get().memberAccounts.filter(a => a.memberId !== memberId);
    set({ memberAccounts: accs });
    saveLS(LS_ACCOUNTS, accs);
  },

  // ── Site CRUD ────────────────────────────────────────────────────────────
  addSite: (s) => {
    const sites = [...get().sites, s];
    set({ sites });
    saveLS(LS_SITES, sites);
  },
  updateSite: (id, updates) => {
    const sites = get().sites.map(s => s.id === id ? { ...s, ...updates } : s);
    set({ sites });
    saveLS(LS_SITES, sites);
  },
  deleteSite: (id) => {
    const sites = get().sites.filter(s => s.id !== id);
    set({ sites });
    saveLS(LS_SITES, sites);
  },

  // ── ProjectTask CRUD ─────────────────────────────────────────────────────
  addProjectTask: (t) => {
    const projectTasks = [...get().projectTasks, t];
    set({ projectTasks });
    saveLS(LS_PROJ_TASKS, projectTasks);
  },
  updateProjectTask: (id, updates) => {
    const projectTasks = get().projectTasks.map(t => t.id === id ? { ...t, ...updates } : t);
    set({ projectTasks });
    saveLS(LS_PROJ_TASKS, projectTasks);
  },
  deleteProjectTask: (id) => {
    const projectTasks = get().projectTasks.filter(t => t.id !== id);
    set({ projectTasks });
    saveLS(LS_PROJ_TASKS, projectTasks);
  },

  // ── BonusPoint CRUD ─────────────────────────────────────────────────────
  addBonusPoint: (b) => {
    const bonusPoints = [...get().bonusPoints, b];
    set({ bonusPoints });
    saveLS(LS_BONUS, bonusPoints);
    if (sheetsService.isAuthenticated()) {
      sheetsService.appendRow('AppBonus', [
        b.id, b.employeeName, String(b.amount), b.reason,
        b.projectId ?? '', b.period, b.awardedAt, b.awardedBy,
      ]).catch(console.error);
    }
  },
  updateBonusPoint: (id, updates) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id ? { ...b, ...updates } : b);
    set({ bonusPoints });
    saveLS(LS_BONUS, bonusPoints);
  },
  deleteBonusPoint: (id) => {
    const bonusPoints = get().bonusPoints.filter(b => b.id !== id);
    set({ bonusPoints });
    saveLS(LS_BONUS, bonusPoints);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('AppBonus', id).catch(console.error);
    }
  },
  approveBonusPoint: (id, approverName) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id
      ? { ...b, status: 'approved' as const, approvedBy: approverName, approvedAt: new Date().toISOString() }
      : b);
    set({ bonusPoints });
    saveLS(LS_BONUS, bonusPoints);
  },
  rejectBonusPoint: (id, approverName, note) => {
    const bonusPoints = get().bonusPoints.map(b => b.id === id
      ? { ...b, status: 'rejected' as const, approvedBy: approverName, approvedAt: new Date().toISOString(), rejectionNote: note ?? '' }
      : b);
    set({ bonusPoints });
    saveLS(LS_BONUS, bonusPoints);
  },

  // ── R&D Log CRUD ─────────────────────────────────────────────────────────
  addRnDLog: (l) => {
    const rndLogs = [...get().rndLogs, l];
    set({ rndLogs });
    saveLS(LS_RND, rndLogs);
  },
  updateRnDLog: (id, updates) => {
    const rndLogs = get().rndLogs.map(x => x.id === id ? { ...x, ...updates, updatedAt: new Date().toISOString() } : x);
    set({ rndLogs });
    saveLS(LS_RND, rndLogs);
  },
  deleteRnDLog: (id) => {
    const rndLogs = get().rndLogs.filter(x => x.id !== id);
    set({ rndLogs });
    saveLS(LS_RND, rndLogs);
  },

  // ── Spot-check (qualityCheck trên submission) ────────────────────────────
  setQualityCheck: (submissionId, score, checkedBy, note) => {
    const submissions = get().submissions.map(s => s.id === submissionId
      ? { ...s, qualityCheck: { score, checkedBy, checkedAt: new Date().toISOString(), note } }
      : s);
    set({ submissions });
    saveLS(LS_SUBMISSIONS, submissions);
  },

  // ── Monthly KPI Target CRUD ──────────────────────────────────────────────
  addKpiTarget: (t) => {
    const kpiTargets = [...get().kpiTargets, t];
    set({ kpiTargets });
    saveLS(LS_KPI_TARGETS, kpiTargets);
  },
  updateKpiTarget: (id, updates) => {
    const kpiTargets = get().kpiTargets.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ kpiTargets });
    saveLS(LS_KPI_TARGETS, kpiTargets);
  },
  deleteKpiTarget: (id) => {
    const kpiTargets = get().kpiTargets.filter(x => x.id !== id);
    set({ kpiTargets });
    saveLS(LS_KPI_TARGETS, kpiTargets);
  },

  // ── Todo CRUD ─────────────────────────────────────────────────────────────────
  addTodo: (t) => {
    const todos = [...get().todos, t];
    set({ todos });
    saveLS(LS_TODOS, todos);
    if (sheetsService.isAuthenticated()) {
      sheetsService.saveTodo(t).catch(console.error);
    }
  },
  updateTodo: (id, updates) => {
    const todos = get().todos.map(x => x.id === id ? { ...x, ...updates } : x);
    set({ todos });
    saveLS(LS_TODOS, todos);
    if (sheetsService.isAuthenticated()) {
      const updated = todos.find(x => x.id === id);
      if (updated) sheetsService.updateTodoInSheet(id, updated).catch(console.error);
    }
  },
  deleteTodo: (id) => {
    const todos = get().todos.filter(x => x.id !== id);
    set({ todos });
    saveLS(LS_TODOS, todos);
    if (sheetsService.isAuthenticated()) {
      sheetsService.deleteRowById('AppTodos', id).catch(console.error);
    }
  },

  // ── Sheets config ─────────────────────────────────────────────────────────
  setSheetsConfig: (config: GoogleSheetsConfig | null) => {
    set({ sheetsConfig: config });
    if (config) {
      sheetsService.configure(config);
    } else {
      sheetsService.clearConfig();
    }
  },

  // ── UI actions ────────────────────────────────────────────────────────────
  setCurrentUser:  (user)              => set({ currentUser: user }),
  setFilter:       (key, value)        => set((s) => ({ filters: { ...s.filters, [key]: value } })),
  resetFilters:    ()                  => set({ filters: defaultFilters }),
  toggleSidebar:   ()                  => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setSyncing:      (syncing)           => set({ isSyncing: syncing }),
  setConnected:    (connected)         => set({ isConnected: connected }),

  // ── WeeklyReport CRUD ────────────────────────────────────────────────────
  addWeeklyReport: (report) => {
    const weeklyReports = [...get().weeklyReports, report];
    set({ weeklyReports });
    saveLS(LS_WEEKLY, weeklyReports);
  },
  updateWeeklyReport: (id, updates) => {
    const weeklyReports = get().weeklyReports.map(r => r.id === id ? { ...r, ...updates } : r);
    set({ weeklyReports });
    saveLS(LS_WEEKLY, weeklyReports);
  },
  deleteWeeklyReport: (id) => {
    const weeklyReports = get().weeklyReports.filter(r => r.id !== id);
    set({ weeklyReports });
    saveLS(LS_WEEKLY, weeklyReports);
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
      saveLS(LS_SITES, sites);
    }
  },
}));

// ── Helper: load tất cả dữ liệu từ Sheets ─────────────────────────────────
export async function syncFromSheets(): Promise<void> {
  const store = useAppStore.getState();
  store.setSyncing(true);
  try {
    const config = store.sheetsConfig;
    const tabs = config?.kpiTabs?.filter(t => t.active) ?? [];

    const [data, entries, nativeKpi, sheetTodos] = await Promise.all([
      sheetsService.loadAll(),
      tabs.length > 0
        ? sheetsService.loadKPITabs(tabs.map(t => ({ tabName: t.tabName, projectName: t.projectName })))
        : Promise.resolve([]),
      sheetsService.loadKPITabs([{ tabName: 'Contents', projectName: 'Hệ thống' }]).catch(() => []),
      sheetsService.loadTodos().catch(() => []),
    ]);

    store.setProjects(data.projects.length  ? data.projects : store.projects);
    store.setMembers(data.members.length    ? data.members  : store.members);
    store.setClients(data.clients.length    ? data.clients  : store.clients);
    store.setExpenses(data.expenses.length  ? data.expenses : store.expenses);
    store.setConnected(true);

    // KPI entries
    const allKPIs = [...nativeKpi, ...entries];
    const uniqueKPIs = Array.from(new Map(allKPIs.map(e => [e.id, e])).values());

    // Merge todos: Sheet là source-of-truth, bổ sung local nếu Sheet thiếu
    const mergedTodos = sheetTodos.length > 0
      ? (() => {
          const sheetIds = new Set(sheetTodos.map(t => t.id));
          const localOnly = store.todos.filter(t => !sheetIds.has(t.id));
          return [...sheetTodos, ...localOnly];
        })()
      : store.todos;

    useAppStore.setState({
      kpiEntries: uniqueKPIs,
      contents: data.contents.length ? data.contents : store.contents,
      taskPointRules: data.taskPointRules.length ? data.taskPointRules : store.taskPointRules,
      performanceReviews: data.performanceReviews.length ? data.performanceReviews : store.performanceReviews,
      // Submissions: Sheet là source-of-truth → đè local nếu Sheet có data
      submissions: data.submissions.length ? data.submissions : store.submissions,
      // ScaleConfig: nếu Sheet đã có row CURRENT, dùng Sheet; ngược lại giữ local
      scaleConfig: data.scaleConfig,
      // Todos: merge từ Sheet + local
      todos: mergedTodos,
    });

    // Persist về local sau khi load
    saveLS(LS_SCALE, data.scaleConfig);

    // ── Migration: cập nhật cấu hình cũ ──
    const sc = { ...data.scaleConfig };
    let needsMigrate = false;
    if (sc.leaderProductionWeight <= 0.40) { sc.leaderProductionWeight = 0.60; needsMigrate = true; }
    if (sc.standardHoursPerMonth <= 176) { sc.standardHoursPerMonth = 196; needsMigrate = true; }
    if (!sc.workingDaysPerMonth || sc.workingDaysPerMonth <= 22) { sc.workingDaysPerMonth = 24.5; needsMigrate = true; }
    if (sc.memberTargetPoints <= 264) { sc.memberTargetPoints = 294; needsMigrate = true; }
    if (needsMigrate) {
      store.setScaleConfig(sc);
    }
    if (data.submissions.length) saveLS(LS_SUBMISSIONS, data.submissions);
    if (mergedTodos.length) saveLS(LS_TODOS, mergedTodos);
    // Persist thêm các entity lấy từ Sheet
    const finalState = useAppStore.getState();
    saveLS(LS_CONTENTS, finalState.contents);
    saveLS(LS_TASK_PT_RULES, finalState.taskPointRules);
    saveLS(LS_PERF_REVIEWS, finalState.performanceReviews);

    useAppStore.getState().ensureDefaultProjects();
    useAppStore.setState({ lastSyncTime: new Date() });
  } catch (e) {
    console.error("Sync error:", e);
    throw e;
  } finally {
    store.setSyncing(false);
  }
}

// ── Helper: load KPI data từ các tab thực tế ────────────────────────────────
export async function syncKPIFromSheets(): Promise<number> {
  const store  = useAppStore.getState();
  const config = store.sheetsConfig;
  const tabs   = config?.kpiTabs?.filter(t => t.active) ?? [];
  if (!tabs.length) return 0;

  store.setSyncing(true);
  try {
    const entries = await sheetsService.loadKPITabs(
      tabs.map(t => ({ tabName: t.tabName, projectName: t.projectName }))
    );
    store.setKpiEntries(entries);
    useAppStore.setState({ lastSyncTime: new Date() });
    return entries.length;
  } finally {
    store.setSyncing(false);
  }
}

// ── Helper: load data từ Postgres Vercel ────────────────────────────────
export async function initPostgresSync() {
  try {
    const res = await fetch('/api/store');
    if (!res.ok) return;
    const data = await res.json();
    const stateUpdate: any = {};
    
    const keyMap: Record<string, string> = {
      'hcms_submissions': 'submissions',
      'hcms_projects': 'projects',
      'hcms_todos': 'todos',
      'hcms_members': 'members',
      'hcms_contents': 'contents',
      'hcms_clients': 'clients',
      'hcms_expenses': 'expenses',
      'hcms_task_point_rules': 'taskPointRules',
      'hcms_perf_reviews': 'performanceReviews',
      'hcms_scale_config': 'scaleConfig',
      'hcms_sites': 'sites',
      'hcms_project_tasks': 'projectTasks',
      'hcms_bonus': 'bonusPoints',
      'hcms_rnd_logs': 'rndLogs',
      'hcms_kpi_targets': 'kpiTargets',
      'hcms_weekly_reports': 'weeklyReports',
      'hcms_accounts': 'memberAccounts'
    };

    for (const [key, stateKey] of Object.entries(keyMap)) {
      if (data[key]) {
        stateUpdate[stateKey] = data[key];
        localStorage.setItem(key, JSON.stringify(data[key])); // update local cache
      }
    }
    
    if (Object.keys(stateUpdate).length > 0) {
      useAppStore.setState(stateUpdate);
    }
  } catch (e) {
    console.error("DB Load Error:", e);
  }
}
