// ============================================
// Long Châu Content Dashboard — Type Definitions
// Kiến trúc: Raw KPI (Sheet) → Cấu hình (Config) → Đánh giá (Performance)
// ============================================

// ── Enums & Literal Types ──────────────────────────────────────────────────

export type ProjectType = 'Campaign' | 'Series' | 'Client' | 'Thương hiệu' | 'Project tháng';
export type ProjectStatus = 'Đang chạy' | 'Hoàn thành' | 'Tạm dừng' | 'Hủy';
/**
 * Manager  – quyền cao nhất: đánh giá tất cả, xem tổng thể, set up hệ thống
 * Leader   – đánh giá nhân sự thuộc team mình, xem tổng team
 * Member   – nộp KPI, xem dữ liệu của bản thân, không sửa được sau khi nộp
 * Client   – chỉ xem (read-only)
 */
export type MemberRole = 'Manager' | 'Leader' | 'Member' | 'Client';

// ── Core Entities ──────────────────────────────────────────────────────────

export interface Project {
  id: string;
  name: string;
  type: ProjectType;
  clientId: string;
  budget: number;
  deadline: string;
  status: ProjectStatus;
  leader: string;
  description: string;
  /** Project tháng: chỉ active cho 1 hoặc nhiều tháng nhất định (YYYY-MM, comma-separated) */
  activeMonths?: string;
  /** True nếu đây là project biến động theo tháng (không phải tháng nào cũng có) */
  isMonthly?: boolean;
  /** Chi phí ước tính cho 1 điểm KPI — dùng tính tổng chi phí bài viết */
  costPerPoint?: number;
  /**
   * Tiến độ thủ công (0–100) — chỉ dùng khi dự án chưa có ProjectTask nào.
   * Khi task nhỏ được thêm vào, hệ thống TỰ ĐỘNG ưu tiên tính từ submissions,
   * bỏ qua trường này. Có thể dùng song song để ghi nhận ước tính nếu muốn.
   */
  manualProgress?: number;
}

// ============================================
// Site — nền tảng đăng bài (Nhà thuốc, Tiêm chủng, có thể mở rộng)
// Khác Project: site = "ai" đăng, project = "cái gì" đang triển khai
// ============================================

export interface Site {
  id: string;
  name: string;
  /** URL pattern để auto-detect site từ link (substring hoặc regex) */
  urlPattern: string;
  description?: string;
  active: boolean;
  /** Màu hiển thị badge */
  color?: string;
}

// ============================================
// ProjectTask — task cứng do Manager set, target số bài
// Tiến độ project = sum(submissions matching) / sum(targetLinks)
// ============================================

export type TaskTrackingMode = 'link' | 'quantity';

export interface ProjectTask {
  id: string;
  projectId: string;
  name: string;
  /** Chế độ tracking: 'link' = đếm link, 'quantity' = đếm số lượng */
  trackingMode?: TaskTrackingMode;
  /** Đầu việc — match với KPISubmission.taskType */
  taskType?: string;
  /** Chi tiết — match với KPISubmission.taskDetail. Nếu undefined → match mọi taskDetail trong taskType */
  taskDetail?: string;
  /** Target số link cần hoàn thành */
  targetLinks: number;
  /** Target số lượng — dùng khi trackingMode = 'quantity' */
  targetQuantity?: number;
  /** Assignees — nhiều người được phân công */
  assignees?: string[];
  deadline?: string;
  notes?: string;
}

export type KpiRole = 'leader' | 'member';
/** 3 nhóm phân loại KPI sau khi submit */
export type TeamGroup = 'Bài viết' | 'Sản phẩm' | 'Multimedia - Tin nhanh' | 'Tất cả team' | '';

export interface Member {
  id: string;
  name: string;
  role: MemberRole;
  expertise: string;
  avatar?: string;
  email?: string;
  /** Vai trò KPI: leader hoặc member */
  kpiRole?: KpiRole;
  /** Nhóm team */
  teamGroup?: TeamGroup;
  /** Hệ số năng suất (1.0 = member, 0.4 = leader production) */
  productivityFactor?: number;
}

/** Account đăng nhập do Manager cấp — lưu local + Sheet Members */
export interface MemberAccount {
  /** Member.id liên kết */
  memberId: string;
  email: string;
  /** Plain text — phù hợp prototype, production cần hash */
  password: string;
  active: boolean;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  contact: string;
  totalBudget: number;
}

export interface Expense {
  id: string;
  projectId: string;
  category: string;
  amount: number;
  date: string;
  createdBy: string;
  notes: string;
}

// ============================================
// KPI Entry — dữ liệu KPI
// Mỗi hàng = 1 lần nhân viên nộp việc
// ============================================

export interface KPIEntry {
  id: string;           // tạo tự động: hash(timestamp+employee+idx)
  projectName: string;  // tên tab hoặc "Hệ thống"
  timestamp: string;    // Cột A: Dấu thời gian
  employeeName: string; // Cột B: Nhân viên Content
  taskType: string;     // Cột C: Đầu việc content
  links: string[];      // Cột D-M: Link 1 → Link 10 (lọc empty)
  linkCount: number;    // Cột N: Count link
  taskDetail: string;   // Cột O: Chi tiết đầu việc (SEO, Bài mới…)
  countPoint: number;   // Cột Q: Count Point (điểm từ Sheet — tham khảo)
  bonusPoints: number;  // Cột R: Điểm bonus
  countNTLC: number;    // Cột S: Count NTLC
  countTCLC: number;    // Cột T: Count TCLC
  newArticles: number;  // Cột U: Bài viết mới
  totalTime: number;    // Cột V: Tổng thời gian
  totalPoints: number;  // Cột W: Điểm point mới (tham khảo)
  projectId?: string;   // liên kết sang Project (nếu có)
}

// ============================================
// Phân loại Đầu việc lớn — dùng để phân nhóm team
// Mỗi "Đầu việc content" trong Sheet → 1 category → 1 team
// ============================================

export interface TaskCategory {
  id: string;
  /** Tên đầu việc lớn — match chính xác với cột "Đầu việc content" trong Sheet */
  taskTypeName: string;
  /** Tên nhóm/team hiển thị (VD: "Team Bài viết", "Team Sản phẩm") */
  teamName: string;
  /** Màu hiển thị */
  color: string;
  /** Mô tả */
  description: string;
}

// ============================================
// Bảng Điểm Quy Đổi — Manager cấu hình, App tự tính
// Mỗi loại đầu việc (taskType + taskDetail) → điểm/link
// ============================================

export interface TaskPointRule {
  id: string;
  /** Tên đầu việc hoặc chi tiết đầu việc — match với KPIEntry.taskType hoặc taskDetail */
  taskLabel: string;
  /** Đầu việc lớn (category) — VD: "Bài Góc sức khỏe", "Sản phẩm" */
  category?: string;
  /** Thời gian chuẩn để thực hiện 1 link (tính bằng giờ, VD: 0.5h, 1h) */
  timePerLink: number;
  /** Điểm quy đổi cho mỗi link (Thường = timePerLink * 1.5) */
  pointPerLink: number;
  /** Ghi chú cho rule này */
  notes: string;
  /** Có đang active không */
  active: boolean;
}

// ============================================
// Đánh giá Performance nhân sự — Leader/Manager nhập hàng tháng
// Leader chấm member trong team mình; Manager chấm tất cả
// ============================================

export interface PerformanceReview {
  id: string;
  /** Tên nhân viên (khớp với KPIEntry.employeeName) */
  employeeName: string;
  /** Kỳ đánh giá: 'YYYY-MM' */
  period: string;
  /** Điểm chất lượng (1-5) — Leader/Manager chấm */
  qualityScore: number;
  /** Điểm thái độ (1-5) — Leader/Manager chấm */
  attitudeScore: number;
  /** Điểm đúng tiến độ (1-5) — Leader/Manager chấm hoặc auto */
  timelinessScore: number;
  /** Số ngày nghỉ trong tháng */
  daysOff: number;
  /** Số ngày nghỉ cho phép (chuẩn) */
  allowedDaysOff: number;
  /** Ghi chú đánh giá */
  notes: string;
  /** Ngày đánh giá */
  reviewedAt: string;
  /** Người đánh giá */
  reviewerId: string;
}

/** Trọng số mặc định cho Performance */
export const PERFORMANCE_WEIGHTS = {
  productivity: 0.40,  // Sản lượng (auto từ KPI)
  quality: 0.20,       // Chất lượng (manual)
  attitude: 0.15,      // Thái độ (manual)
  timeliness: 0.15,    // Đúng tiến độ (manual)
  attendance: 0.10,    // Ngày nghỉ (auto tính)
} as const;

export const KPI_CONFIG = {
  /** Giờ chuẩn/tháng (8h × 24.5 ngày) */
  standardHoursPerMonth: 196,
  /** Số ngày làm việc chuẩn/tháng */
  workingDaysPerMonth: 24.5,
  /** Target điểm/tháng cho Member (196h × 1.5 = 294 điểm) */
  memberTargetPoints: 294,
  /** Leader: 60% sản xuất, 40% quản lý → target sản xuất = 294 × 0.6 = 176.4 */
  leaderProductionWeight: 0.60,
  leaderManagementWeight: 0.40,
  leaderProductionTarget: 176.4,
  /** Hệ số quy đổi: 1 giờ làm việc = pointPerHour điểm */
  pointPerHour: 1.5,
} as const;

/** Cấu hình thang điểm/thời gian — biến cứng có thể chỉnh trong Settings.
 *  Đây là source-of-truth cho toàn bộ tính toán điểm trên app. */
export interface KPIScaleConfig {
  /** Hệ số quy đổi: 1 giờ làm việc = pointPerHour điểm (mặc định 1.5) */
  pointPerHour: number;
  /** Giờ chuẩn/tháng (mặc định 196 = 8h × 24.5 ngày) */
  standardHoursPerMonth: number;
  /** Số ngày làm việc chuẩn/tháng (mặc định 24.5) */
  workingDaysPerMonth: number;
  /** Target điểm/tháng cho Member (mặc định = pointPerHour × standardHoursPerMonth) */
  memberTargetPoints: number;
  /** Leader: % sản xuất (0-1, mặc định 0.6) */
  leaderProductionWeight: number;
  /** Trọng số 5 chiều performance (cộng lại = 1.0) */
  weights: {
    productivity: number;
    quality: number;
    attitude: number;
    timeliness: number;
    attendance: number;
  };
  /** Số ngày nghỉ cho phép mặc định/tháng */
  allowedDaysOff: number;
}

export const DEFAULT_KPI_SCALE_CONFIG: KPIScaleConfig = {
  pointPerHour: 1.5,
  standardHoursPerMonth: 196,
  workingDaysPerMonth: 24.5,
  memberTargetPoints: 294,
  leaderProductionWeight: 0.60,
  weights: {
    productivity: 0.40,
    quality:      0.20,
    attitude:     0.15,
    timeliness:   0.15,
    attendance:   0.10,
  },
  allowedDaysOff: 2,
};

// ============================================
// Daily Task — mỗi link trong KPIEntry = 1 đơn vị công việc
// Được flatten từ KPIEntry[] × links[] qua selector
// ============================================

export interface DailyTask {
  id: string;              // `${entryId}_${linkIndex}`
  entryId: string;         // KPIEntry.id (nguồn)
  linkIndex: number;
  link: string;
  employeeName: string;
  taskType: string;        // Đầu việc content (cấp cha)
  taskDetail: string;      // Chi tiết đầu việc
  /** Đầu việc lớn — dùng phân loại team */
  category?: string;
  /** Team phụ trách (VD: "Bài viết", "Sản phẩm", "Nội dung mới") */
  teamName?: string;
  /** Điểm quy đổi — tính từ TaskPointRule, KHÔNG phải từ Sheet */
  point: number;
  timestamp: string;
  projectName: string;     // tên tab (= client/dự án)
  projectId?: string;      // nếu link match được Project
}

// ============================================
// Content — lưu tương thích với các trang cũ
// Giờ chỉ dùng cho Quản lý nội dung (view-only từ Sheet)
// ============================================

export type ContentType = 'Bài viết' | 'Video' | 'Infographic' | 'Social Post' | 'Podcast';
export type ContentStatus = 'Chờ bắt đầu' | 'Đang làm' | 'Chờ duyệt' | 'Đã duyệt' | 'Đã đăng' | 'Đã xuất bản' | 'Trễ hạn';
export type ApprovalLevel = 'Chưa gửi' | 'Leader' | 'Client' | 'Đã duyệt';
export type ApprovalResult = 'Chờ' | 'Đã duyệt' | 'Từ chối' | 'Tuyệt đối';
export type HealthTopic = 'Dinh dưỡng' | 'Vận động' | 'Sức khỏe tâm thần' | 'Bệnh mãn tính' | 'Sức khỏe trẻ em' | 'Sức khỏe phụ nữ' | 'Thuốc & Điều trị' | 'Phòng bệnh';

export interface Content {
  id: string;
  projectId: string;
  title: string;
  type: ContentType;
  topic: HealthTopic;
  assignee: string;
  deadline: string;
  status: ContentStatus;
  progress: number;
  approvalLevel: ApprovalLevel;
  approver: string;
  approvalResult: ApprovalResult;
  notes: string;
  link?: string;
  publishedAt?: string;
}

// ============================================
// BonusPoint — Manager cấp điểm thưởng cho việc phát sinh ngoài task cứng
// VD: hỗ trợ team khác, đề xuất ý tưởng, làm gấp ngoài giờ, sáng tạo nội dung...
// Bonus được cộng vào totalPoints của tháng tương ứng → ảnh hưởng KPI %
// ============================================

export type BonusStatus = 'pending' | 'approved' | 'rejected';

export interface BonusPoint {
  id: string;
  /** Nhân viên nhận bonus (employeeName) */
  employeeName: string;
  /** Số điểm bonus (có thể âm để trừ) */
  amount: number;
  /** Lý do cấp bonus */
  reason: string;
  /** Project liên quan (tùy chọn) */
  projectId?: string;
  /** Kỳ áp dụng: 'YYYY-MM' — bonus được tính vào tháng này */
  period: string;
  /** Thời gian đề xuất ISO */
  awardedAt: string;
  /** Người đề xuất (Leader name) hoặc Manager nếu cấp trực tiếp */
  awardedBy: string;
  /** Trạng thái duyệt:
   *  - pending: Leader đề xuất, chờ Manager duyệt
   *  - approved: Manager đã duyệt (hoặc Manager cấp trực tiếp)
   *  - rejected: Manager từ chối
   *  Chỉ status='approved' mới cộng vào totalPoints. */
  status: BonusStatus;
  /** Người duyệt (Manager) — undefined nếu chưa duyệt */
  approvedBy?: string;
  /** Thời gian duyệt ISO */
  approvedAt?: string;
  /** Ghi chú khi từ chối */
  rejectionNote?: string;
}

// ============================================
// KPI Submission — người dùng submit qua dashboard
// Mỗi lần submit = 1 entry với nhiều link cùng loại bài
// Sau khi submit → ghi xuống Sheet (append) và LOCK (Member không sửa được)
// ============================================

export interface KPISubmission {
  id: string;
  /** Người submit (employeeName) */
  employeeName: string;
  /** Thời gian submit ISO */
  submittedAt: string;
  /** Đầu việc (taskType) — VD: "Bài Góc sức khỏe - Bệnh lý - Thành phần" */
  taskType: string;
  /** Chi tiết đầu việc — VD: "SEO" */
  taskDetail: string;
  /** Site đăng bài (Nhà thuốc / Tiêm chủng / ...) — bắt buộc cho link */
  siteId?: string;
  /** Project (optional) — id của project biến động */
  projectId?: string;
  /** Project task (optional) — id của ProjectTask này submission đóng góp vào */
  projectTaskId?: string;
  /** Các link đã submit (1..N) */
  links: string[];
  /** Team group được phân loại — Manager xem tổng theo nhóm này */
  teamGroup: TeamGroup;
  /** Snapshot điểm/link tại thời điểm submit (pointPerLink × links.length) */
  pointPerLink: number;
  totalPoints: number;
  /** Snapshot thời gian/link */
  timePerLink: number;
  /** True nếu Manager/Leader đã chốt — Member tuyệt đối không sửa */
  locked: boolean;
  /** Ghi chú thêm (optional) */
  notes?: string;
  /** Số giờ làm việc — dùng cho submit theo giờ (Approach A: dự án ad-hoc) */
  hoursWorked?: number;
  /** Số lượng (tuỳ chọn) — dùng để đồng bộ tracking tiến độ dự án khi không có link */
  quantity?: number;
  /** Spot-check (hậu kiểm chất lượng 20%) — Lead/Manager chấm */
  qualityCheck?: {
    score: number;          // 1-5
    checkedBy: string;      // Lead/Manager name
    checkedAt: string;      // ISO
    note?: string;
  };
}

// ============================================
// R&D Log — Lead ghi nhận sáng kiến/quy trình mới (đo R&D output)
// ============================================
// ============================================
// Monthly KPI Target — Manager setup target/tháng cho từng nhóm × site
// VD: Tháng 5/2026: Bài viết × Nhà thuốc → 1500 link; Bài viết × Tiêm chủng → 1000 link
// ============================================

export interface MonthlyKPITarget {
  id: string;
  /** Kỳ áp dụng: 'YYYY-MM' */
  period: string;
  /** Nhóm team: 'Bài viết' | 'Sản phẩm' | 'Multimedia - Tin nhanh' */
  teamGroup: TeamGroup;
  /** Site (tùy chọn — undefined = chung cho cả 2 site) */
  siteId?: string;
  /** Đầu việc cụ thể (tùy chọn — undefined = cả nhóm) */
  taskType?: string;
  /** Target cho nhân viên cụ thể (undefined = target tổng nhóm, do Manager set) */
  employeeName?: string;
  /** Target số link */
  targetLinks: number;
  /** Người tạo target */
  createdBy?: string;
  /** Ghi chú */
  notes?: string;
}

export type TodoPriority = 'low' | 'medium' | 'high';
export interface TodoItem {
  id: string;
  /** Tên người sở hữu */
  ownerName: string;
  /** Người được assign (nếu có) — chỉ owner + assignee mới thấy task này */
  assigneeName?: string;
  /** Tiêu đề */
  title: string;
  /** Mô tả chi tiết */
  description?: string;
  /** Hạn hoàn thành (ISO date) */
  dueDate?: string;
  /** Ưu tiên */
  priority: TodoPriority;
  /** Đã hoàn thành */
  completed: boolean;
  /** Xác nhận đã đọc notification (dành cho assignees) */
  acknowledged?: boolean;
  /** Ngày hoàn thành */
  completedAt?: string;
  /** Ngày tạo */
  createdAt: string;
}

export type RnDStatus = 'proposed' | 'in_progress' | 'completed' | 'archived';
export interface RnDLog {
  id: string;
  /** Lead phụ trách (name) */
  leaderName: string;
  /** Kỳ tính: 'YYYY-MM' */
  period: string;
  title: string;
  description: string;
  /** Impact 1-5 do Lead/Manager đánh giá */
  impact: number;
  status: RnDStatus;
  createdAt: string;
  updatedAt?: string;
}

// ============================================
// Notifications — thông báo khi assignee hoàn thành task
// ============================================

export type NotificationType = 'task_completed' | 'task_assigned' | 'info';

export interface AppNotification {
  id: string;
  /** Loại thông báo */
  type: NotificationType;
  /** Người nhận thông báo (ownerName) */
  recipientName: string;
  /** Người gây ra sự kiện (assigneeName) */
  actorName: string;
  /** Tiêu đề thông báo */
  title: string;
  /** Nội dung chi tiết */
  message: string;
  /** ID todo/task liên quan */
  referenceId?: string;
  /** Đã đọc chưa */
  read: boolean;
  /** Thời gian tạo ISO */
  createdAt: string;
}


// ============================================
// App State
// ============================================

export interface FilterState {
  projectId: string;
  clientId: string;
  memberId: string;
  week: string;
  month: string;
  projectType: ProjectType | '';
  projectStatus: ProjectStatus | '';
  contentStatus: ContentStatus | '';
}

export interface AppState {
  // Data
  projects: Project[];
  contents: Content[];
  members: Member[];
  clients: Client[];
  expenses: Expense[];
  kpiEntries: KPIEntry[];
  taskPointRules: TaskPointRule[];
  performanceReviews: PerformanceReview[];
  /** KPI người dùng submit qua dashboard */
  submissions: KPISubmission[];
  /** Thang điểm/thời gian — biến cứng có thể chỉnh */
  scaleConfig: KPIScaleConfig;
  /** Sites — Nhà thuốc, Tiêm chủng,... */
  sites: Site[];
  /** Tasks cứng của Project */
  projectTasks: ProjectTask[];
  /** Điểm thưởng do Manager/Leader cấp */
  bonusPoints: BonusPoint[];
  /** R&D logs — sáng kiến/quy trình do Lead ghi nhận */
  rndLogs: RnDLog[];
  /** Monthly KPI targets — Manager setup target/tháng */
  kpiTargets: MonthlyKPITarget[];
  /** Personal checklist / to-do */
  todos: TodoItem[];
  /** Thông báo (task completion, assignment, etc.) */
  notifications: AppNotification[];

  // UI State
  currentUser: Member | null;
  isSyncing: boolean;
  lastSyncTime: Date | null;
  sidebarCollapsed: boolean;

  // Filters
  filters: FilterState;

  // Data setters
  setProjects: (projects: Project[]) => void;
  setContents: (contents: Content[]) => void;
  setMembers: (members: Member[]) => void;
  setClients: (clients: Client[]) => void;
  setExpenses: (expenses: Expense[]) => void;
  setKpiEntries: (entries: KPIEntry[]) => void;
  setTaskPointRules: (rules: TaskPointRule[]) => void;
  setPerformanceReviews: (reviews: PerformanceReview[]) => void;
  setSubmissions: (subs: KPISubmission[]) => void;
  setScaleConfig: (cfg: KPIScaleConfig) => void;

  // Theme
  theme: 'light' | 'dark';
  toggleTheme: () => void;

  // Member CRUD (Manager only)
  addMember: (m: Member, account?: MemberAccount) => void;
  updateMember: (id: string, updates: Partial<Member>) => void;
  deleteMember: (id: string) => void;

  // Account management
  memberAccounts: MemberAccount[];
  setMemberAccount: (a: MemberAccount) => void;
  removeMemberAccount: (memberId: string) => void;

  // Site CRUD
  addSite: (s: Site) => void;
  updateSite: (id: string, updates: Partial<Site>) => void;
  deleteSite: (id: string) => void;

  // ProjectTask CRUD
  addProjectTask: (t: ProjectTask) => void;
  updateProjectTask: (id: string, updates: Partial<ProjectTask>) => void;
  deleteProjectTask: (id: string) => void;

  // Bonus CRUD
  addBonusPoint: (b: BonusPoint) => void;
  updateBonusPoint: (id: string, updates: Partial<BonusPoint>) => void;
  deleteBonusPoint: (id: string) => void;
  /** Manager approve bonus pending */
  approveBonusPoint: (id: string, approverName: string) => void;
  // RnDLog CRUD
  addRnDLog: (l: RnDLog) => void;
  updateRnDLog: (id: string, updates: Partial<RnDLog>) => void;
  deleteRnDLog: (id: string) => void;
  // Spot-check
  setQualityCheck: (submissionId: string, score: number, checkedBy: string, note?: string) => void;
  // Monthly KPI Target CRUD
  addKpiTarget: (t: MonthlyKPITarget) => void;
  updateKpiTarget: (id: string, updates: Partial<MonthlyKPITarget>) => void;
  deleteKpiTarget: (id: string) => void;
  /** Manager reject bonus pending */
  rejectBonusPoint: (id: string, approverName: string, note?: string) => void;
  // Todo CRUD
  addTodo: (t: TodoItem) => void;
  updateTodo: (id: string, updates: Partial<TodoItem>) => void;
  deleteTodo: (id: string) => void;

  // Notification CRUD
  addNotification: (n: AppNotification) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: (recipientName: string) => void;
  clearNotifications: (recipientName: string) => void;

  // KPISubmission CRUD — Member chỉ add, Manager/Leader có thể delete khi cần
  addSubmission: (sub: KPISubmission) => void;
  /** Thêm hàng loạt — dùng khi user paste/upload nhiều link cùng loại */
  addSubmissionsBatch: (subs: KPISubmission[]) => Promise<boolean>;
  deleteSubmission: (id: string) => void;
  /** Manager chỉnh sửa submission đã submit — phòng hờ nhập sai */
  updateSubmission: (id: string, updates: Partial<KPISubmission>) => void;

  // Content CRUD
  addContent: (content: Content) => void;
  updateContent: (id: string, updates: Partial<Content>) => void;
  deleteContent: (id: string) => void;

  // Project CRUD
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  deleteProject: (id: string) => void;

  // Expense CRUD
  addExpense: (expense: Expense) => void;
  updateExpense: (id: string, updates: Partial<Expense>) => void;
  deleteExpense: (id: string) => void;

  // TaskPointRule CRUD
  addTaskPointRule: (rule: TaskPointRule) => void;
  updateTaskPointRule: (id: string, updates: Partial<TaskPointRule>) => void;
  deleteTaskPointRule: (id: string) => void;

  // PerformanceReview CRUD
  addPerformanceReview: (review: PerformanceReview) => void;
  updatePerformanceReview: (id: string, updates: Partial<PerformanceReview>) => void;
  deletePerformanceReview: (id: string) => void;

  ensureDefaultProjects: () => void;

  // UI actions
  setCurrentUser: (user: Member | null) => void;
  setFilter: (key: keyof FilterState, value: string) => void;
  resetFilters: () => void;
  toggleSidebar: () => void;
  setSyncing: (syncing: boolean) => void;
  // WeeklyReport CRUD
  weeklyReports: WeeklyReport[];
  monthlyReports: MonthlyReportConfig[];
  updateMonthlyReport: (report: MonthlyReportConfig) => void;
  addWeeklyReport: (report: WeeklyReport) => void;
  updateWeeklyReport: (id: string, updates: Partial<WeeklyReport>) => void;
  deleteWeeklyReport: (id: string) => void;
}

// ============================================
// Weekly Report — Manager báo cáo tuần
// ============================================

export interface WeeklyReportProject {
  projectId: string;
  projectName: string;
  progress: number;
  tasksCompleted: number;
  tasksTotal: number;
  notes: string;
  /** Chi tiết tiến độ task cứng — auto-fill từ ProjectTask + submissions */
  taskBreakdown?: Array<{
    taskName: string;
    targetLinks: number;
    completedLinks: number;
    progress: number;
  }>;
}

export interface WeeklyReport {
  id: string;
  /** Tuần báo cáo: ISO date của ngày thứ 2 đầu tuần */
  weekStart: string;
  /** Người tạo báo cáo */
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  /** Tiến độ các dự án */
  projectProgress: WeeklyReportProject[];
  /** Tổng công việc hoàn thành trong tuần */
  totalTasksCompleted: number;
  /** Tổng link nộp trong tuần */
  totalLinks: number;
  /** Tổng điểm trong tuần */
  totalPoints: number;
  /** Nhận xét tổng quan (manager viết hoặc AI gợi ý) */
  summary: string;
  /** Đánh giá AI (auto-generated) */
  aiAssessment: string;
  /** Đánh giá manager (có thể chỉnh sửa) */
  managerAssessment: string;
  /** Kế hoạch tuần tới */
  nextWeekPlan: string;
  /** Các vấn đề cần lưu ý */
  issues: string;
  /** Nhận xét tự động từ số liệu */
  insights?: string;
  /** Điểm nghẽn hiện tại */
  bottlenecks?: string;
  /** Chi tiết đầu việc theo nhóm (JSON) */
  taskBreakdownByTeam?: Array<{ team: string; color: string; items: Array<{ label: string; links: number; points: number }> }>;
  /** KPI Tuần - Mục tiêu số link */
  kpiTargetLinks?: number;
  /** KPI Tuần - Mục tiêu số điểm */
  kpiTargetPoints?: number;
  /** KPI Tuần - Chất lượng (%) */
  kpiQuality?: number;
  /** Đã chốt (không sửa được) */
  locked: boolean;
}

// ============================================
// Quality review types (kept for compatibility)
// ============================================

export interface QualityBreakdown {
  accuracy: number;
  form: number;
  usefulness: number;
}

export interface LinkQualityReview {
  link: string;
  qualityScore: number;
  breakdown: QualityBreakdown;
  reviewerId: string;
  reviewedAt: string;
  notes?: string;
}


// ============================================
// Monthly / Quarterly Report Config
// ============================================

export interface MonthlyReportConfig {
  id: string; // Tên kỳ báo cáo (VD: 'Tháng 07/2026')
  summaryText: string;
  recommendationText: string;
  bottleneckText: string;
  customerCommentAnalysisText: string;
  additionalContextText: string;
  metricOverrides: Record<string, string>;
  selectedFocusProjects: string[];
  updatedAt?: string;
}
