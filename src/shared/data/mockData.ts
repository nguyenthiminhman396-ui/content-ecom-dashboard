import type { Project, Content, Member, Client, Expense, TaskPointRule, TaskCategory, Site } from '@/shared/types';

// ── Sites mặc định: Nhà thuốc + Tiêm chủng ───────────────────────────────
export const defaultSites: Site[] = [
  {
    id: 's_nhathuoc',
    name: 'Nhà thuốc Long Châu',
    urlPattern: 'nhathuoclongchau',
    description: 'Site bài viết & sản phẩm Nhà thuốc',
    active: true,
    color: '#2453d6',
  },
  {
    id: 's_tiemchung',
    name: 'Tiêm chủng Long Châu',
    urlPattern: 'tiemchunglongchau',
    description: 'Site bài viết kiến thức tiêm chủng',
    active: true,
    color: '#2dc4ab',
  },
];

// ── Team thực tế: 11 người (3 Leaders + 8 Members) ───────────────────────
// Login accounts ở .env, member list dưới đây dùng cho KPI tracking

export const mockMembers: Member[] = [
  // ── Accounts đăng nhập ──
  { id: 'M_MANAGER', name: 'manntm3',  role: 'Manager', expertise: 'Quản lý chung', email: 'manntm3@longchau.com' },
  { id: 'M_LEAD',    name: 'anhlhp',   role: 'Leader',  expertise: 'Quản lý dự án', email: 'anhlhp@longchau.com' },
  { id: 'M_MEM',     name: 'mylyt',    role: 'Member',  expertise: 'Viết nội dung', email: 'mylyt@longchau.com' },
  { id: 'M_CLIENT',  name: 'khach',    role: 'Client',  expertise: 'Khách hàng',    email: 'khach@longchau.com' },

  // ── 3 Leaders ──────────────────────────────────────────────────────────
  { id: 'M_ANHLHP',    name: 'AnhLHP',    role: 'Leader', expertise: 'Lead Bài viết',                kpiRole: 'leader', teamGroup: 'Bài viết',                productivityFactor: 0.4 },
  { id: 'M_HONGDTM3',  name: 'HongDTM3',  role: 'Leader', expertise: 'Lead Sản phẩm',                kpiRole: 'leader', teamGroup: 'Sản phẩm',                productivityFactor: 0.4 },
  { id: 'M_UYENDNP3',  name: 'UyenDNP3',  role: 'Leader', expertise: 'Lead Multimedia - Tin nhanh',  kpiRole: 'leader', teamGroup: 'Multimedia - Tin nhanh',  productivityFactor: 0.4 },

  // ── 8 Members ──────────────────────────────────────────────────────────
  { id: 'M_MYLYT',     name: 'MyLYT',     role: 'Member', expertise: 'Bài viết SEO',                  kpiRole: 'member', teamGroup: 'Bài viết',                productivityFactor: 1.0 },
  { id: 'M_DIUNND',    name: 'DiuNND',    role: 'Member', expertise: 'Bài viết, Tối ưu',              kpiRole: 'member', teamGroup: 'Bài viết',                productivityFactor: 1.0 },
  { id: 'M_TAMLT2',    name: 'TamLTN2',   role: 'Member', expertise: 'Bài viết',                      kpiRole: 'member', teamGroup: 'Bài viết',                productivityFactor: 1.0 },
  { id: 'M_THIPTM',    name: 'ThiPTM',    role: 'Member', expertise: 'Bài viết, Tối ưu',              kpiRole: 'member', teamGroup: 'Bài viết',                productivityFactor: 1.0 },
  { id: 'M_KHAIDT6',   name: 'KhaiDT6',   role: 'Member', expertise: 'Bài viết, Nội dung',            kpiRole: 'member', teamGroup: 'Bài viết',                productivityFactor: 1.0 },
  { id: 'M_TRAMTTT7',  name: 'TramTTT7',  role: 'Member', expertise: 'Bài viết, Sản phẩm',            kpiRole: 'member', teamGroup: 'Sản phẩm',                productivityFactor: 1.0 },
  { id: 'M_NGOCTTH3',  name: 'NgocTTH3',  role: 'Member', expertise: 'Multimedia',                    kpiRole: 'member', teamGroup: 'Multimedia - Tin nhanh',  productivityFactor: 1.0 },
  { id: 'M_TRAMNMQ',   name: 'TramNMQ',   role: 'Member', expertise: 'Multimedia, Tin nhanh',         kpiRole: 'member', teamGroup: 'Multimedia - Tin nhanh',  productivityFactor: 1.0 },
];

export const mockClients: Client[] = [
  { id: 'C_001', name: 'Long Châu', industry: 'Dược phẩm, Y tế', contact: 'khach@longchau.com', totalBudget: 500000000 },
];

export const mockProjects: Project[] = [];
export const mockContents: Content[] = [];
export const mockExpenses: Expense[] = [];

// ============================================
// Phân loại Đầu việc lớn — 5 nhóm → map sang 3 team
// Đây là cấp phân loại cha, match cột "Đầu việc content" trong Sheet
// ============================================

export const defaultTaskCategories: TaskCategory[] = [
  {
    id: 'cat_baiviet',
    taskTypeName: 'Bài Góc sức khỏe - Bệnh lý - Thành phần',
    teamName: 'Bài viết',
    color: '#1D9E75',
    description: 'Bài viết sức khỏe, SEO, trend, bệnh lý, thành phần (716 lượt nộp)',
  },
  {
    id: 'cat_toiuu',
    taskTypeName: 'Tối ưu Sản phẩm - Bài viết',
    teamName: 'Bài viết',
    color: '#3B82F6',
    description: 'Tối ưu FAQ, bài viết, sản phẩm, multimedia, quản lý CTV (236 lượt nộp)',
  },
  {
    id: 'cat_sanpham',
    taskTypeName: 'Sản phẩm',
    teamName: 'Sản phẩm',
    color: '#8B5CF6',
    description: 'Cập nhật thông tin, mô tả chi tiết, listing image (137 lượt nộp)',
  },
  {
    id: 'cat_multimedia',
    taskTypeName: 'Multimedia',
    teamName: 'Multimedia - Tin nhanh',
    color: '#F59E0B',
    description: 'Infographic, video, longform, storytelling (110 lượt nộp)',
  },
  {
    id: 'cat_tinnhanh',
    taskTypeName: 'Tin nhanh',
    teamName: 'Multimedia - Tin nhanh',
    color: '#EF4444',
    description: 'News video, tin tức y tế (45 lượt nộp)',
  },
  {
    id: 'cat_duan',
    taskTypeName: 'Công việc dự án',
    teamName: 'Bài viết',
    color: '#6366F1',
    description: 'Công việc dự án ad-hoc — tính điểm theo giờ hoặc rule riêng do Manager tạo',
  },
];

// 3 nhóm tổng — Manager xem theo nhóm này, cộng thêm 'Tất cả team' cho mục tiêu chung
export const TEAM_GROUPS = ['Bài viết', 'Sản phẩm', 'Multimedia - Tin nhanh', 'Tất cả team'] as const;

// ============================================
// Bảng điểm quy đổi mặc định — trích từ cột "Điểm point mới" trong Sheet.
// Điểm phản ánh trọng số thời gian thực hiện (giá trị hơn count link).
// Mỗi rule gắn với category (đầu việc lớn) để phân loại team.
// ============================================

export const defaultTaskPointRules: TaskPointRule[] = [
  // ══════════════════════════════════════════════════════════════
  // 📝 BÀI VIẾT — "Bài Góc sức khỏe - Bệnh lý - Thành phần"
  // ══════════════════════════════════════════════════════════════
  { id: 'r_seo',           taskLabel: 'SEO',                    category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.5,  pointPerLink: 0.75,  notes: 'Bài SEO tiêu chuẩn (459 lượt)',          active: true },
  { id: 'r_bai_ai',        taskLabel: 'Bài AI',                 category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.67,  pointPerLink: 1.0,  notes: 'Bài viết có hỗ trợ AI (133 lượt)',       active: true },
  { id: 'r_benh_ly',       taskLabel: 'Bệnh lý',               category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.8,  pointPerLink: 1.2,  notes: 'Bài chuyên sâu bệnh lý (46 lượt)',       active: true },
  { id: 'r_trend',         taskLabel: 'Trend',                  category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.5,  pointPerLink: 0.75,  notes: 'Bài xu hướng (62 lượt)',                 active: true },
  { id: 'r_thanh_phan',    taskLabel: 'Thành phần khác',        category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.8,  pointPerLink: 1.2,  notes: 'Bài thành phần dược liệu (5 lượt)',      active: true },
  { id: 'r_thuoc_goc',     taskLabel: 'Thuốc gốc',             category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.8,  pointPerLink: 1.2,  notes: 'Bài thuốc gốc (8 lượt)',                 active: true },
  { id: 'r_mkt',           taskLabel: 'MKT',                    category: 'Bài Góc sức khỏe - Bệnh lý - Thành phần', timePerLink: 0.5,  pointPerLink: 0.75,  notes: 'Marketing content (3 lượt)',              active: true },

  // ══════════════════════════════════════════════════════════════
  // 🔧 TỐI ƯU — "Tối ưu Sản phẩm - Bài viết"
  // ══════════════════════════════════════════════════════════════
  { id: 'r_faq',           taskLabel: 'FAQ',                                       category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Tối ưu FAQ sản phẩm/bài viết (81 lượt)', active: true },
  { id: 'r_toiuu_bv_dg',   taskLabel: 'Tối ưu bài viết đơn giản',                 category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Tối ưu bài viết nhẹ (21 lượt)',          active: true },
  { id: 'r_toiuu_bv_ct',   taskLabel: 'Tối ưu bài viết chi tiết',                 category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.67,  pointPerLink: 1.0,  notes: 'Tối ưu bài viết chuyên sâu (1 lượt)',    active: true },
  { id: 'r_toiuu_sp_dg',   taskLabel: 'Tối ưu sản phẩm đơn giản',                category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Tối ưu sản phẩm nhẹ (39 lượt)',          active: true },
  { id: 'r_toiuu_sp_ct',   taskLabel: 'Tối ưu sản phẩm chi tiết',                category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.67,  pointPerLink: 1.0,  notes: 'Tối ưu sản phẩm chuyên sâu (4 lượt)',    active: true },
  { id: 'r_toiuu_mm_dg',   taskLabel: 'Tối ưu multimedia đơn giản',               category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Tối ưu multimedia nhẹ (2 lượt)',          active: true },
  { id: 'r_toiuu_mm_ct',   taskLabel: 'Tối ưu multimedia chi tiết',               category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 0.67,  pointPerLink: 1.0,  notes: 'Tối ưu multimedia chuyên sâu (4 lượt)',   active: true },
  { id: 'r_ql_ctv_art',    taskLabel: 'Quản lý cộng tác viên (Articles+Product)', category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 16,  pointPerLink: 24.0, notes: 'Quản lý CTV bài viết + sản phẩm (23 lượt)', active: true },
  { id: 'r_ql_ctv_mm',     taskLabel: 'Quản lý cộng tác viên (Multimedia)',        category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 8,  pointPerLink: 12.0, notes: 'Quản lý CTV multimedia (10 lượt)',        active: true },
  { id: 'r_truc_ban',      taskLabel: 'Trực ban',                                 category: 'Tối ưu Sản phẩm - Bài viết', timePerLink: 4,  pointPerLink: 6.0,  notes: 'Ca trực ban biên tập (51 lượt)',          active: true },

  // ══════════════════════════════════════════════════════════════
  // 📦 SẢN PHẨM — "Sản phẩm"
  // ══════════════════════════════════════════════════════════════
  { id: 'r_capnhat_tt',    taskLabel: 'Cập nhật thông tin',     category: 'Sản phẩm', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Cập nhật thông tin sản phẩm (69 lượt)',  active: true },
  { id: 'r_duyet_mota',    taskLabel: 'Duyệt mô tả chi tiết',  category: 'Sản phẩm', timePerLink: 1,  pointPerLink: 1.5,  notes: 'Duyệt mô tả sản phẩm chi tiết (28 lượt)', active: true },
  { id: 'r_viet_mota',     taskLabel: 'Viết mô tả chi tiết',   category: 'Sản phẩm', timePerLink: 2,  pointPerLink: 3.0,  notes: 'Viết mô tả sản phẩm mới (5 lượt)',      active: true },
  { id: 'r_listing_hang',  taskLabel: 'Listing Image (Hãng)',   category: 'Sản phẩm', timePerLink: 2,  pointPerLink: 3.0,  notes: 'Thiết kế ảnh listing hãng (22 lượt)',    active: true },
  { id: 'r_listing_ecom',  taskLabel: 'Listing Image (Ecom)',   category: 'Sản phẩm', timePerLink: 3,  pointPerLink: 4.5,  notes: 'Thiết kế ảnh listing Ecom (13 lượt)',    active: true },

  // ══════════════════════════════════════════════════════════════
  // 🎨 MULTIMEDIA — "Multimedia"
  // ══════════════════════════════════════════════════════════════
  { id: 'r_kiem_tra_sk',   taskLabel: 'Bài kiểm tra sức khỏe', category: 'Multimedia', timePerLink: 3.33,  pointPerLink: 5.0,  notes: 'Bài kiểm tra sức khỏe chuyên sâu (8 lượt)', active: true },
  { id: 'r_infographic',   taskLabel: 'Infographic',            category: 'Multimedia', timePerLink: 2.67,  pointPerLink: 4.0,  notes: 'Thiết kế infographic (26 lượt)',          active: true },
  { id: 'r_short_video',   taskLabel: 'Short video',            category: 'Multimedia', timePerLink: 1.33,  pointPerLink: 2.0,  notes: 'Sản xuất short video (10 lượt)',          active: true },
  { id: 'r_reup_short',    taskLabel: 'Reup Short video (Media/MKT)', category: 'Multimedia', timePerLink: 0.33,  pointPerLink: 0.5,  notes: 'Reup short video MKT (50 lượt)',    active: true },
  { id: 'r_longform',      taskLabel: 'Longform chuyên gia',    category: 'Multimedia', timePerLink: 10,  pointPerLink: 15.0, notes: 'Bài dài chuyên gia y tế (15 lượt)',      active: true },
  { id: 'r_storytelling',  taskLabel: 'Storytelling',           category: 'Multimedia', timePerLink: 16.67,  pointPerLink: 25.0, notes: 'Bài storytelling cao cấp (1 lượt)',       active: true },

  // ══════════════════════════════════════════════════════════════
  // 📰 TIN NHANH — "Tin nhanh"
  // ══════════════════════════════════════════════════════════════
  { id: 'r_news_short',    taskLabel: 'News Short video',       category: 'Tin nhanh', timePerLink: 2,  pointPerLink: 3.0,  notes: 'News short video (21 lượt)',              active: true },
  { id: 'r_news_yte',      taskLabel: 'News tin tức y tế',      category: 'Tin nhanh', timePerLink: 2.67,  pointPerLink: 4.0,  notes: 'Tin tức y tế dài (19 lượt)',              active: true },
  { id: 'r_news_tt_yte',   taskLabel: 'News thông tin y tế',    category: 'Tin nhanh', timePerLink: 3.33,  pointPerLink: 5.0,  notes: 'Thông tin y tế chuyên sâu (5 lượt)',     active: true },

  // ══════════════════════════════════════════════════════════════
  // 🏗️ CÔNG VIỆC DỰ ÁN — "Công việc dự án"
  // Tính theo giờ: pointPerLink = 1 (= 1 giờ × pointPerHour)
  // NV nhập số giờ thay vì link, hệ thống nhân pointPerHour
  // Manager có thể tạo thêm rule riêng cho từng project
  // ══════════════════════════════════════════════════════════════
  { id: 'r_duan_gio',       taskLabel: 'Công việc dự án (theo giờ)',  category: 'Công việc dự án', timePerLink: 1,  pointPerLink: 1.5,  notes: 'Quy đổi 1:1 theo giờ — NV nhập giờ thực tế', active: true },
];
