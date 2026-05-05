// ============================================
// Google Sheets API v4 — Full Implementation
// Dùng Google Identity Services (GSI) + REST API
// ============================================

import type {
  Project, Content, Member, Client, Expense,
  GoogleSheetsConfig, KPIEntry,
  TaskPointRule, PerformanceReview,
  ProjectType, ProjectStatus,
  ContentType, ContentStatus,
  ApprovalLevel, ApprovalResult,
  MemberRole, HealthTopic,
  KPISubmission, KPIScaleConfig, TeamGroup,
  TodoItem, TodoPriority,
} from '@/shared/types';
import { SHEET_TAB_NAMES, SHEET_HEADERS, DEFAULT_KPI_SCALE_CONFIG } from '@/shared/types';

// ── Google Identity Services type declarations ──────────────────────────────
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (cfg: GsiTokenConfig) => GsiTokenClient;
          revoke: (token: string, cb: () => void) => void;
        };
      };
    };
  }
}

interface GsiTokenConfig {
  client_id: string;
  scope: string;
  callback: (resp: GsiTokenResponse) => void;
  error_callback?: (err: { type: string; message?: string }) => void;
}
interface GsiTokenClient {
  requestAccessToken: (cfg?: { prompt?: string }) => void;
}
interface GsiTokenResponse {
  access_token: string;
  expires_in: number;
  error?: string;
}

// ── Constants ─────────────────────────────────────────────────────────────
const SHEETS_REST = 'https://sheets.googleapis.com/v4/spreadsheets';
const SCOPE       = 'https://www.googleapis.com/auth/spreadsheets';

// ── Helpers ───────────────────────────────────────────────────────────────
const str = (v: unknown): string => (v == null ? '' : String(v));
const num = (v: unknown): number => (isNaN(Number(v)) ? 0 : Number(v));

/** Chuyển 0-based index → tên cột Sheet (0→A, 25→Z, 26→AA, 44→AS…) */
const col = (idx: number): string => {
  let s = '';
  let n = idx;
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  }
  return s;
};

/** Chuyển mảng header thành range string. VD: 14 cột → "A:N" */
const headerRange = (headers: readonly string[]): string =>
  `A:${col(headers.length - 1)}`;

/** Băm chuỗi thành ID ngắn gọn, ổn định */
const stringHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

// ── Main Service Class ─────────────────────────────────────────────────────
class GoogleSheetsService {
  private spreadsheetId = '';
  private clientId      = '';
  private accessToken   = '';
  private tokenExpiry   = 0; // unix ms
  private tokenClient: GsiTokenClient | null = null;
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  // ── Config ──────────────────────────────────────────────────────────────

  configure(config: GoogleSheetsConfig): void {
    this.spreadsheetId = config.spreadsheetId.trim();
    this.clientId      = config.clientId.trim();
    // Persist config (không lưu token – bảo mật)
    localStorage.setItem('hcms_sheets_config', JSON.stringify(config));
  }

  loadSavedConfig(): GoogleSheetsConfig | null {
    try {
      const raw = localStorage.getItem('hcms_sheets_config');
      if (!raw) return null;
      const cfg = JSON.parse(raw) as GoogleSheetsConfig;
      if (cfg.spreadsheetId && cfg.clientId) {
        this.spreadsheetId = cfg.spreadsheetId;
        this.clientId      = cfg.clientId;
        try {
          const t = JSON.parse(localStorage.getItem('hcms_sheets_token') || '{}');
          if (t.accessToken && t.tokenExpiry && Date.now() < t.tokenExpiry) {
            this.accessToken = t.accessToken;
            this.tokenExpiry = t.tokenExpiry;
          }
        } catch { /* ignore */ }
        return cfg;
      }
    } catch { /* ignore */ }
    return null;
  }

  clearConfig(): void {
    this.spreadsheetId = '';
    this.clientId      = '';
    this.accessToken   = '';
    this.tokenExpiry   = 0;
    this.tokenClient   = null;
    localStorage.removeItem('hcms_sheets_config');
    localStorage.removeItem('hcms_sheets_token');
  }

  isConfigured(): boolean {
    return !!this.spreadsheetId && !!this.clientId;
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  /** Đăng nhập qua popup Google. Trả về Promise<true> khi thành công. */
  signIn(): Promise<boolean> {
    return new Promise((resolve, reject) => {
      if (!window.google?.accounts?.oauth2) {
        reject(new Error(
          'Thư viện Google Identity Services chưa tải. ' +
          'Vui lòng kiểm tra kết nối mạng và thử lại.'
        ));
        return;
      }
      if (!this.clientId) {
        reject(new Error('Chưa nhập OAuth Client ID.'));
        return;
      }

      this.tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) {
            reject(new Error(`Xác thực thất bại: ${resp.error}`));
            return;
          }
          this.accessToken = resp.access_token;
          this.tokenExpiry = Date.now() + resp.expires_in * 1000 - 60_000;
          localStorage.setItem('hcms_sheets_token', JSON.stringify({ accessToken: this.accessToken, tokenExpiry: this.tokenExpiry }));
          resolve(true);
        },
        error_callback: (err) => {
          if (err.type === 'popup_closed') {
            reject(new Error('Cửa sổ đăng nhập đã đóng. Vui lòng thử lại.'));
          } else {
            reject(new Error(err.message ?? 'Lỗi xác thực không xác định.'));
          }
        },
      });

      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  signOut(): void {
    if (this.accessToken && window.google?.accounts?.oauth2) {
      window.google.accounts.oauth2.revoke(this.accessToken, () => {});
    }
    this.accessToken = '';
    this.tokenExpiry = 0;
    localStorage.removeItem('hcms_sheets_token');
    this.stopPolling();
  }

  isAuthenticated(): boolean {
    return !!this.accessToken && Date.now() < this.tokenExpiry;
  }

  /** Lấy token hợp lệ; nếu hết hạn thì yêu cầu lại (silent). */
  private ensureToken(): Promise<string> {
    if (this.isAuthenticated()) return Promise.resolve(this.accessToken);
    if (!this.tokenClient) return Promise.reject(new Error('Chưa đăng nhập Google.'));

    return new Promise((resolve, reject) => {
      this.tokenClient = window.google!.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) { reject(new Error(resp.error)); return; }
          this.accessToken = resp.access_token;
          this.tokenExpiry = Date.now() + resp.expires_in * 1000 - 60_000;
          localStorage.setItem('hcms_sheets_token', JSON.stringify({ accessToken: this.accessToken, tokenExpiry: this.tokenExpiry }));
          resolve(this.accessToken);
        },
      });
      this.tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  // ── REST helpers ─────────────────────────────────────────────────────────

  private async apiGet(path: string): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${SHEETS_REST}/${this.spreadsheetId}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error((err as { error: { message: string } }).error?.message ?? res.statusText);
    }
    return res.json();
  }

  private async apiPut(path: string, body: unknown): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${SHEETS_REST}/${this.spreadsheetId}${path}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error((err as { error: { message: string } }).error?.message ?? res.statusText);
    }
    return res.json();
  }

  private async apiPost(path: string, body: unknown): Promise<unknown> {
    const token = await this.ensureToken();
    const res = await fetch(`${SHEETS_REST}/${this.spreadsheetId}${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
      throw new Error((err as { error: { message: string } }).error?.message ?? res.statusText);
    }
    return res.json();
  }

  // ── Read ────────────────────────────────────────────────────────────────

  async readRange(tabName: string, range: string): Promise<string[][]> {
    const fullRange = encodeURIComponent(`${tabName}!${range}`);
    const data = await this.apiGet(`/values/${fullRange}`) as { values?: string[][] };
    return data.values ?? [];
  }

  // ── Write ────────────────────────────────────────────────────────────────

  async writeRange(tabName: string, range: string, values: string[][]): Promise<void> {
    const fullRange = encodeURIComponent(`${tabName}!${range}`);
    await this.apiPut(
      `/values/${fullRange}?valueInputOption=USER_ENTERED`,
      { values }
    );
  }

  async appendRow(tabName: string, values: string[]): Promise<void> {
    const range = encodeURIComponent(`${tabName}!A1`);
    await this.apiPost(
      `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values: [values] }
    );
  }

  /**
   * Xóa hàng theo id (cột A).
   * Tìm rowIndex rồi dùng DeleteDimensionRequest.
   */
  async deleteRowById(tabName: string, id: string): Promise<boolean> {
    const rows = await this.readRange(tabName, 'A:A');
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIndex < 0) return false;

    const meta = await this.apiGet('') as {
      sheets: Array<{ properties: { title: string; sheetId: number } }>;
    };
    const sheet = meta.sheets.find(s => s.properties.title === tabName);
    if (!sheet) return false;

    await this.apiPost(':batchUpdate', {
      requests: [{
        deleteDimension: {
          range: {
            sheetId:    sheet.properties.sheetId,
            dimension:  'ROWS',
            startIndex: rowIndex,
            endIndex:   rowIndex + 1,
          },
        },
      }],
    });
    return true;
  }

  /**
   * Cập nhật hàng theo id.
   * Tìm rowIndex, sau đó ghi đè cả hàng đó.
   */
  async updateRowById(tabName: string, id: string, values: string[]): Promise<boolean> {
    const rows = await this.readRange(tabName, 'A:A');
    const rowIndex = rows.findIndex((r, i) => i > 0 && r[0] === id);
    if (rowIndex < 0) return false;

    const sheetRow = rowIndex + 1; // 1-based
    const lastCol  = col(values.length - 1);
    await this.writeRange(tabName, `A${sheetRow}:${lastCol}${sheetRow}`, [values]);
    return true;
  }

  // ── Initialize Headers ──────────────────────────────────────────────────

  /**
   * Ghi hàng header vào hàng đầu tiên của từng tab.
   * Gọi 1 lần khi tạo Sheet mới.
   */
  async initializeHeaders(): Promise<void> {
    const entries = Object.entries(SHEET_HEADERS) as Array<
      [keyof typeof SHEET_HEADERS, readonly string[]]
    >;
    for (const [key, headers] of entries) {
      const tabName = SHEET_TAB_NAMES[key];
      const range   = `A1:${col(headers.length - 1)}1`;
      await this.writeRange(tabName, range, [Array.from(headers)]);
    }
  }

  // ── Load All Data ────────────────────────────────────────────────────────

  async loadAll(): Promise<{
    projects: Project[];
    contents: Content[];
    members:  Member[];
    clients:  Client[];
    expenses: Expense[];
    taskPointRules: TaskPointRule[];
    performanceReviews: PerformanceReview[];
    submissions: KPISubmission[];
    scaleConfig: KPIScaleConfig;
  }> {
    const [pRows, cRows, mRows, clRows, eRows, cfgRows, revRows, subRows, scaleRows] = await Promise.all([
      this.readRange(SHEET_TAB_NAMES.PROJECTS,    headerRange(SHEET_HEADERS.PROJECTS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.CONTENTS,    headerRange(SHEET_HEADERS.CONTENTS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.MEMBERS,     headerRange(SHEET_HEADERS.MEMBERS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.CLIENTS,     headerRange(SHEET_HEADERS.CLIENTS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.EXPENSES,    headerRange(SHEET_HEADERS.EXPENSES)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.CONFIG,      headerRange(SHEET_HEADERS.CONFIG)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.REVIEWS,     headerRange(SHEET_HEADERS.REVIEWS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.SUBMISSIONS, headerRange(SHEET_HEADERS.SUBMISSIONS)).catch(() => [] as string[][]),
      this.readRange(SHEET_TAB_NAMES.SCALE,       headerRange(SHEET_HEADERS.SCALE)).catch(() => [] as string[][]),
    ]);

    return {
      projects: this.parseProjects(pRows),
      contents: this.parseContents(cRows),
      members:  this.parseMembers(mRows),
      clients:  this.parseClients(clRows),
      expenses: this.parseExpenses(eRows),
      taskPointRules: this.parseConfig(cfgRows),
      performanceReviews: this.parseReviews(revRows),
      submissions: this.parseSubmissions(subRows),
      scaleConfig: this.parseScaleConfig(scaleRows),
    };
  }

  // ── Parsers (rows[0] = header, rows[1..] = data) ─────────────────────────

  parseProjects(rows: string[][]): Project[] {
    return rows.slice(1)
      .filter(r => r[0] || r[1])
      .map((r, i) => ({
        id:           str(r[0]) || `p_${stringHash(str(r[1]) + i)}`,
        name:         str(r[1]),
        type:         (str(r[2]) || 'Client') as ProjectType,
        clientId:     str(r[3]),
        budget:       num(r[4]),
        deadline:     str(r[5]),
        status:       (str(r[6]) || 'Đang chạy') as ProjectStatus,
        leader:       str(r[7]),
        description:  str(r[8]),
        isMonthly:    str(r[9]).toLowerCase() === 'true',
        activeMonths: str(r[10]),
      }));
  }

  parseContents(rows: string[][]): Content[] {
    if (rows.length < 2) return [];
    
    // Detect unified schema vs old schema!
    const headers = rows[0].map(h => (h ?? '').toString().toLowerCase().trim());
    const isUnified = headers.some(h => h.includes('dấu thời gian') || h.includes('timestamp'));
    
    if (!isUnified) {
      // OLD Schema
      return rows.slice(1)
        .filter(r => r[0] || r[2])
        .map((r, i) => ({
          id:            str(r[0]) || `c_${stringHash(str(r[2]) + i)}`,
          projectId:     str(r[1]),
          title:         str(r[2]),
          type:          (str(r[3]) || 'Bài viết') as ContentType,
          topic:         (str(r[4]) || 'Phòng bệnh') as HealthTopic,
          assignee:      str(r[5]),
          deadline:      str(r[6]),
          status:        (str(r[7]) || 'Chờ bắt đầu') as ContentStatus,
          progress:      num(r[8]),
          approvalLevel: (str(r[9])  || 'Chưa gửi') as ApprovalLevel,
          approver:      str(r[10]),
          approvalResult:(str(r[11]) || 'Chờ') as ApprovalResult,
          notes:         str(r[12]),
          link:          str(r[13]) || undefined,
          publishedAt:   str(r[14]) || undefined,
        }));
    }

    // UNIFIED SCHEMA (Google Form Raw Data inside Contents tab)
    const findCol = (...keywords: string[]): number =>
      headers.findIndex(h => keywords.some(kw => h.includes(kw.toLowerCase())));

    const COL = {
      timestamp:   findCol('đầu thời gian', 'thời gian', 'timestamp', 'date'),
      employee:    findCol('nhân viên', 'employee', 'staff'),
      taskType:    findCol('đầu việc', 'task type'),
      taskDetail:  findCol('chi tiết', 'task detail'),
      metaData:    findCol('app_metadata_json')
    };

    const linkCols = headers
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.includes('link') && !h.includes('count'))
      .map(({ i }) => i);

    const contentsOutput: Content[] = [];

    const tCol = COL.timestamp >= 0 ? COL.timestamp : 0;
    const eCol = COL.employee >= 0 ? COL.employee : 1;
    const tTypeCol = COL.taskType >= 0 ? COL.taskType : 2;

    rows.slice(1).forEach((r, idx) => {
      if (!r[eCol] || r[eCol].toString().trim() === '') return;

      const kpiId = `kpi_${stringHash(str(r[tCol]) + str(r[eCol]) + idx)}`;
      
      // Parse JSON
      let metaJson: Record<string, Partial<Content>> = {};
      if (COL.metaData >= 0 && r[COL.metaData]) {
        try { metaJson = JSON.parse(str(r[COL.metaData])); } catch { /* ignore */ }
      }

      const links = linkCols.map(ci => str(r[ci]).trim()).filter(l => l.startsWith('http') || l.startsWith('www'));

      links.forEach((url, linkIndex) => {
        const linkId = `${kpiId}_${linkIndex}`;
        const meta = metaJson[linkIndex] || {};

        let autoProjectId = '';
        if (url.includes('nhathuoclongchau')) autoProjectId = 'p_nhathuoc';
        else if (url.includes('tiemchunglongchau')) autoProjectId = 'p_tiemchung';

        contentsOutput.push({
          id: linkId,
          title: meta.title || `[${str(r[tTypeCol])}] ${COL.taskDetail >= 0 ? str(r[COL.taskDetail]) : 'Nội dung'}`,
          projectId: meta.projectId || autoProjectId,
          type: meta.type || 'Bài viết',
          topic: meta.topic || 'Phòng bệnh',
          assignee: str(r[eCol]),
          deadline: meta.deadline || str(r[tCol]),
          status: meta.status || 'Đã xuất bản',
          progress: meta.progress ?? 100,
          approvalLevel: meta.approvalLevel || 'Đã duyệt',
          approver: meta.approver || '',
          approvalResult: meta.approvalResult || 'Tuyệt đối',
          notes: meta.notes || '',
          link: url,
          publishedAt: meta.publishedAt || str(r[tCol]),
          _rawJsonCol: COL.metaData,
          _rawRowIndex: idx + 1, // 1-based since header is 0
          _rawJsonObj: metaJson,
          _rawLinkIndex: linkIndex
        } as Content & { _rawJsonCol: number; _rawRowIndex: number; _rawJsonObj: any; _rawLinkIndex: number; });
      });
    });

    return contentsOutput;
  }

  parseMembers(rows: string[][]): Member[] {
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => {
        // Backward compat: chấp nhận role 'Admin' cũ — quy về 'Manager'
        const rawRole = str(r[2]);
        const role = (rawRole === 'Admin' ? 'Manager' : (rawRole || 'Member')) as MemberRole;
        return {
          id:        str(r[0]),
          name:      str(r[1]),
          role,
          expertise: str(r[3]),
          email:     str(r[4]) || undefined,
          avatar:    str(r[5]) || undefined,
          kpiRole:   (str(r[6]) === 'leader' ? 'leader' : str(r[6]) === 'member' ? 'member' : undefined),
          teamGroup: ((): TeamGroup | undefined => {
            const t = str(r[7]);
            if (t === 'Bài viết' || t === 'Sản phẩm' || t === 'Multimedia - Tin nhanh') return t;
            if (t === 'Nội dung mới') return 'Multimedia - Tin nhanh'; // backward compat
            return undefined;
          })(),
          productivityFactor: r[8] !== undefined && r[8] !== '' ? num(r[8]) : undefined,
        };
      });
  }

  parseClients(rows: string[][]): Client[] {
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => ({
        id:          str(r[0]),
        name:        str(r[1]),
        industry:    str(r[2]),
        contact:     str(r[3]),
        totalBudget: num(r[4]),
      }));
  }

  parseExpenses(rows: string[][]): Expense[] {
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => ({
        id:        str(r[0]),
        projectId: str(r[1]),
        category:  str(r[2]),
        amount:    num(r[3]),
        date:      str(r[4]),
        createdBy: str(r[5]),
        notes:     str(r[6]),
      }));
  }

  // ── KPI Sheet Parser ─────────────────────────────────────────────────────
  //
  // Đọc sheet thực tế của team: mỗi hàng = 1 lần nộp việc
  // Row 1 = header → tự động detect vị trí cột theo tên
  //
  // Cột dự kiến (dựa trên ảnh chụp):
  //   A: Đầu thời gian | B: Nhân viên | C: Đầu việc content
  //   J..: Link 1, Link 2 … (nhiều cột link liên tiếp)
  //   AJ: Count Link | AK: Chi tiết đầu việc
  //   AL: Điểm point | AM: Count Point | AN: Điểm bonus
  //   AO: Count NTLC | AP: Count TCLC | AQ: Bài viết mới
  //   AR: Tổng thời gian | AS: Điểm point tổng
  //
  parseKPISheet(rows: string[][], projectName: string): KPIEntry[] {
    if (rows.length < 2) return [];

    const header = rows[0].map(h => (h ?? '').toString().toLowerCase().trim());

    // ── Tự động tìm vị trí cột theo keyword ──────────────────────────────
    const findCol = (...keywords: string[]): number =>
      header.findIndex(h => keywords.some(kw => h.includes(kw.toLowerCase())));

    const COL = {
      timestamp:   findCol('đầu thời gian', 'thời gian', 'timestamp', 'date'),
      employee:    findCol('nhân viên', 'employee', 'staff', 'cộng tác'),
      taskType:    findCol('đầu việc', 'task type', 'loại công việc'),
      countLink:   findCol('count link', 'tổng link', 'số link'),
      taskDetail:  findCol('chi tiết', 'task detail', 'loại bài'),
      pointVal:    findCol('điểm point', 'điểm\npoint'),
      countPoint:  findCol('count point', 'điểm số'),
      bonus:       findCol('bonus', 'thưởng'),
      ntlc:        findCol('ntlc'),
      tclc:        findCol('tclc'),
      newArticles: findCol('bài viết mới', 'new article'),
      totalTime:   findCol('tổng thời', 'total time'),
      totalPoints: findCol('điểm point t', 'total point', 'tổng điểm'),
    };

    // Tìm tất cả cột Link (header chứa "link" nhưng không phải "count link")
    const linkCols = header
      .map((h, i) => ({ h, i }))
      .filter(({ h }) => h.includes('link') && !h.includes('count'))
      .map(({ i }) => i);

    // Fallback nếu không detect được timestamp/employee
    const tCol = COL.timestamp  >= 0 ? COL.timestamp  : 0;
    const eCol = COL.employee   >= 0 ? COL.employee   : 1;
    const tTypeCol = COL.taskType >= 0 ? COL.taskType : 2;

    return rows.slice(1)
      .filter(r => r[eCol] && r[eCol].toString().trim() !== '')  // bỏ hàng trống
      .map((r, idx) => {
        // Lấy tất cả link, lọc empty
        const links = linkCols
          .map(ci => str(r[ci]).trim())
          .filter(l => l.startsWith('http') || l.startsWith('www'));

        return {
          id:          `kpi_${stringHash(str(r[tCol]) + str(r[eCol]) + idx)}`,
          projectName,
          timestamp:   str(r[tCol]),
          employeeName:str(r[eCol]).trim(),
          taskType:    str(r[tTypeCol]),
          links,
          linkCount:   COL.countLink  >= 0 ? num(r[COL.countLink])  : links.length,
          taskDetail:  COL.taskDetail >= 0 ? str(r[COL.taskDetail]) : '',
          countPoint:  COL.countPoint >= 0 ? num(r[COL.countPoint]) : 0,
          bonusPoints: COL.bonus      >= 0 ? num(r[COL.bonus])      : 0,
          countNTLC:   COL.ntlc       >= 0 ? num(r[COL.ntlc])       : 0,
          countTCLC:   COL.tclc       >= 0 ? num(r[COL.tclc])       : 0,
          newArticles: COL.newArticles>= 0 ? num(r[COL.newArticles]): 0,
          totalTime:   COL.totalTime  >= 0 ? num(r[COL.totalTime])  : 0,
          totalPoints: COL.totalPoints>= 0 ? num(r[COL.totalPoints]): 0,
        } satisfies KPIEntry;
      });
  }

  // ── Config & Reviews Parsers ──────────────────────────────────────────────

  parseConfig(rows: string[][]): TaskPointRule[] {
    if (rows.length < 2) return [];
    // Detect new schema (7 cols: id, taskLabel, category, timePerLink, pointPerLink, notes, active)
    // vs old schema (5 cols: id, taskLabel, pointPerLink, notes, active)
    const headerLen = rows[0].length;
    const isNewSchema = headerLen >= 7;
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => {
        if (isNewSchema) {
          const time  = parseFloat(str(r[3]).replace(',', '.')) || 0;
          const point = parseFloat(str(r[4]).replace(',', '.')) || 0;
          return {
            id:           str(r[0]),
            taskLabel:    str(r[1]),
            category:     str(r[2]) || undefined,
            timePerLink:  time,
            pointPerLink: point,
            notes:        str(r[5]),
            active:       str(r[6]).toLowerCase() !== 'false',
          };
        }
        // Old schema fallback
        const pointPerLink = parseFloat(str(r[2]).replace(',', '.')) || 0;
        return {
          id:           str(r[0]),
          taskLabel:    str(r[1]),
          timePerLink:  Math.round((pointPerLink / 1.5) * 100) / 100,
          pointPerLink,
          notes:        str(r[3]),
          active:       str(r[4]).toLowerCase() !== 'false',
        };
      });
  }

  // ── KPISubmission parser & serializer ────────────────────────────────────
  parseSubmissions(rows: string[][]): KPISubmission[] {
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => {
        const teamGroupRaw = str(r[7]);
        const teamGroup: TeamGroup =
          teamGroupRaw === 'Bài viết' || teamGroupRaw === 'Sản phẩm' || teamGroupRaw === 'Multimedia - Tin nhanh'
            ? teamGroupRaw
            : teamGroupRaw === 'Nội dung mới' ? 'Multimedia - Tin nhanh' : '';
        return {
          id:           str(r[0]),
          employeeName: str(r[1]),
          submittedAt:  str(r[2]),
          taskType:     str(r[3]),
          taskDetail:   str(r[4]),
          projectId:    str(r[5]) || undefined,
          links:        str(r[6]).split('\n').map(s => s.trim()).filter(Boolean),
          teamGroup,
          timePerLink:  num(r[8]),
          pointPerLink: num(r[9]),
          totalPoints:  num(r[10]),
          locked:       str(r[11]).toLowerCase() === 'true',
          notes:        str(r[12]) || undefined,
        };
      });
  }

  submissionToRow(s: KPISubmission): string[] {
    return [
      s.id,
      s.employeeName,
      s.submittedAt,
      s.taskType,
      s.taskDetail,
      s.projectId ?? '',
      s.links.join('\n'),
      s.teamGroup,
      String(s.timePerLink),
      String(s.pointPerLink),
      String(s.totalPoints),
      String(s.locked),
      s.notes ?? '',
    ];
  }

  async saveSubmission(sub: KPISubmission): Promise<void> {
    await this.appendRow(SHEET_TAB_NAMES.SUBMISSIONS, this.submissionToRow(sub));
  }

  async saveSubmissionsBatch(subs: KPISubmission[]): Promise<void> {
    if (!subs.length) return;
    const range = encodeURIComponent(`${SHEET_TAB_NAMES.SUBMISSIONS}!A1`);
    await this.apiPost(
      `/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
      { values: subs.map(s => this.submissionToRow(s)) }
    );
  }

  async loadSubmissions(): Promise<KPISubmission[]> {
    const rows = await this.readRange(
      SHEET_TAB_NAMES.SUBMISSIONS,
      headerRange(SHEET_HEADERS.SUBMISSIONS)
    ).catch(() => [] as string[][]);
    return this.parseSubmissions(rows);
  }

  // ── Scale config parser & serializer ─────────────────────────────────────
  parseScaleConfig(rows: string[][]): KPIScaleConfig {
    if (rows.length < 2) return DEFAULT_KPI_SCALE_CONFIG;
    const r = rows[1];
    return {
      pointPerHour:           num(r[1]) || DEFAULT_KPI_SCALE_CONFIG.pointPerHour,
      standardHoursPerMonth:  num(r[2]) || DEFAULT_KPI_SCALE_CONFIG.standardHoursPerMonth,
      memberTargetPoints:     num(r[3]) || DEFAULT_KPI_SCALE_CONFIG.memberTargetPoints,
      leaderProductionWeight: num(r[4]) || DEFAULT_KPI_SCALE_CONFIG.leaderProductionWeight,
      weights: {
        productivity: num(r[5]) || DEFAULT_KPI_SCALE_CONFIG.weights.productivity,
        quality:      num(r[6]) || DEFAULT_KPI_SCALE_CONFIG.weights.quality,
        attitude:     num(r[7]) || DEFAULT_KPI_SCALE_CONFIG.weights.attitude,
        timeliness:   num(r[8]) || DEFAULT_KPI_SCALE_CONFIG.weights.timeliness,
        attendance:   num(r[9]) || DEFAULT_KPI_SCALE_CONFIG.weights.attendance,
      },
      allowedDaysOff:         num(r[10]) || DEFAULT_KPI_SCALE_CONFIG.allowedDaysOff,
    };
  }

  async saveScaleConfig(cfg: KPIScaleConfig): Promise<void> {
    const row: string[] = [
      'CURRENT',
      String(cfg.pointPerHour),
      String(cfg.standardHoursPerMonth),
      String(cfg.memberTargetPoints),
      String(cfg.leaderProductionWeight),
      String(cfg.weights.productivity),
      String(cfg.weights.quality),
      String(cfg.weights.attitude),
      String(cfg.weights.timeliness),
      String(cfg.weights.attendance),
      String(cfg.allowedDaysOff),
      new Date().toISOString(),
    ];
    // Header on row 1, current value on row 2 — write a fixed range
    const headerRow = Array.from(SHEET_HEADERS.SCALE);
    const lastCol   = col(headerRow.length - 1);
    await this.writeRange(SHEET_TAB_NAMES.SCALE, `A1:${lastCol}1`, [headerRow]);
    await this.writeRange(SHEET_TAB_NAMES.SCALE, `A2:${lastCol}2`, [row]);
  }

  async loadScaleConfig(): Promise<KPIScaleConfig> {
    const rows = await this.readRange(
      SHEET_TAB_NAMES.SCALE,
      headerRange(SHEET_HEADERS.SCALE)
    ).catch(() => [] as string[][]);
    return this.parseScaleConfig(rows);
  }

  parseReviews(rows: string[][]): PerformanceReview[] {
    return rows.slice(1)
      .filter(r => r[0])
      .map(r => ({
        id:              str(r[0]),
        employeeName:    str(r[1]),
        period:          str(r[2]),
        qualityScore:    num(r[3]),
        attitudeScore:   num(r[4]),
        timelinessScore: num(r[5]),
        daysOff:         num(r[6]),
        allowedDaysOff:  num(r[7]),
        notes:           str(r[8]),
        reviewedAt:      str(r[9]),
        reviewerId:      str(r[10]),
      }));
  }

  /** Đọc nhiều tab KPI cùng lúc (mỗi tab = 1 client/dự án) */
  async loadKPITabs(tabNames: { tabName: string; projectName: string }[]): Promise<KPIEntry[]> {
    const results = await Promise.all(
      tabNames.map(async ({ tabName, projectName }) => {
        try {
          const rows = await this.readRange(tabName, 'A:AS'); // đọc đến cột AS
          return this.parseKPISheet(rows, projectName);
        } catch (err) {
          console.warn(`[Sheets] Không đọc được tab "${tabName}":`, err);
          return [] as KPIEntry[];
        }
      })
    );
    return results.flat();
  }

  // ── Serializers (object → string[]) ──────────────────────────────────────

  projectToRow(p: Project): string[] {
    return [p.id, p.name, p.type, p.clientId, String(p.budget),
            p.deadline, p.status, p.leader, p.description,
            String(!!p.isMonthly), p.activeMonths ?? ''];
  }

  contentToRow(c: Content): string[] {
    return [
      c.id, c.projectId, c.title, c.type, c.topic,
      c.assignee, c.deadline, c.status, String(c.progress),
      c.approvalLevel, c.approver, c.approvalResult,
      c.notes, c.link ?? '', c.publishedAt ?? '',
    ];
  }

  memberToRow(m: Member): string[] {
    return [m.id, m.name, m.role, m.expertise, m.email ?? '', m.avatar ?? '',
            m.kpiRole ?? '', m.teamGroup ?? '',
            m.productivityFactor !== undefined ? String(m.productivityFactor) : ''];
  }

  clientToRow(c: Client): string[] {
    return [c.id, c.name, c.industry, c.contact, String(c.totalBudget)];
  }

  expenseToRow(e: Expense): string[] {
    return [e.id, e.projectId, e.category, String(e.amount), e.date, e.createdBy, e.notes];
  }

  configToRow(r: TaskPointRule): string[] {
    // New schema: id, taskLabel, category, timePerLink, pointPerLink, notes, active
    return [r.id, r.taskLabel, r.category ?? '',
            String(r.timePerLink), String(r.pointPerLink),
            r.notes, String(r.active)];
  }

  reviewToRow(r: PerformanceReview): string[] {
    return [
      r.id, r.employeeName, r.period,
      String(r.qualityScore), String(r.attitudeScore), String(r.timelinessScore),
      String(r.daysOff), String(r.allowedDaysOff),
      r.notes, r.reviewedAt, r.reviewerId,
    ];
  }

  // ── High-level CRUD helpers ───────────────────────────────────────────────

  async saveContent(content: Content): Promise<void> {
    const extra = content as any;
    if (extra._rawRowIndex !== undefined) {
      // UNIFIED SCHEMA (Save MetaData JSON)
      const rowIndex = extra._rawRowIndex + 1; // 1-based header is 1, so row is idx+1
      const metaCol = extra._rawJsonCol >= 0 ? extra._rawJsonCol : 25; // Default col Z
      
      const metaJson = { ...extra._rawJsonObj };
      metaJson[extra._rawLinkIndex] = {
        projectId: content.projectId,
        type: content.type,
        topic: content.topic,
        status: content.status,
        progress: content.progress,
        approvalLevel: content.approvalLevel,
        approver: content.approver,
        approvalResult: content.approvalResult,
        notes: content.notes,
      };

      const metaColName = col(metaCol);
      
      // Update local state directly so subsequent saves don't overwrite this!
      extra._rawJsonObj = metaJson;

      // Write JSON to Google Sheets cell
      if (extra._rawJsonCol < 0) {
         // Also label the header cell if it was missing
         await this.writeRange(SHEET_TAB_NAMES.CONTENTS, `${metaColName}1`, [['App_MetaData_JSON']]);
      }
      await this.writeRange(SHEET_TAB_NAMES.CONTENTS, `${metaColName}${rowIndex}`, [[JSON.stringify(metaJson)]]);
      return;
    }

    // OLD SCHEMA
    const exists = await this.updateRowById(
      SHEET_TAB_NAMES.CONTENTS, content.id, this.contentToRow(content)
    );
    if (!exists) {
      await this.appendRow(SHEET_TAB_NAMES.CONTENTS, this.contentToRow(content));
    }
  }

  async saveProject(project: Project): Promise<void> {
    const exists = await this.updateRowById(
      SHEET_TAB_NAMES.PROJECTS, project.id, this.projectToRow(project)
    );
    if (!exists) {
      await this.appendRow(SHEET_TAB_NAMES.PROJECTS, this.projectToRow(project));
    }
  }

  async saveTaskPointRule(rule: TaskPointRule): Promise<void> {
    const exists = await this.updateRowById(
      SHEET_TAB_NAMES.CONFIG, rule.id, this.configToRow(rule)
    );
    if (!exists) {
      await this.appendRow(SHEET_TAB_NAMES.CONFIG, this.configToRow(rule));
    }
  }

  async savePerformanceReview(review: PerformanceReview): Promise<void> {
    const exists = await this.updateRowById(
      SHEET_TAB_NAMES.REVIEWS, review.id, this.reviewToRow(review)
    );
    if (!exists) {
      await this.appendRow(SHEET_TAB_NAMES.REVIEWS, this.reviewToRow(review));
    }
  }

  async saveExpense(expense: Expense): Promise<void> {
    const exists = await this.updateRowById(
      SHEET_TAB_NAMES.EXPENSES, expense.id, this.expenseToRow(expense)
    );
    if (!exists) {
      await this.appendRow(SHEET_TAB_NAMES.EXPENSES, this.expenseToRow(expense));
    }
  }

  // ── Polling ───────────────────────────────────────────────────────────────

  startPolling(onUpdate: () => void | Promise<void>, intervalMs = 5 * 60_000): void {
    this.stopPolling();
    this.pollingTimer = setInterval(async () => {
      try {
        await onUpdate();
      } catch (err) {
        console.warn('[Sheets] Polling error:', err);
      }
    }, intervalMs);
  }

  stopPolling(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  // ── Export mock → Sheet (khởi tạo lần đầu) ───────────────────────────────

  /**
   * Đẩy toàn bộ dữ liệu lên Sheet (ghi đè từ hàng 2 trở đi).
   * Dùng khi muốn sync dữ liệu demo lên Sheet thật lần đầu.
   */
  async exportAllData(data: {
    projects: Project[];
    contents: Content[];
    members:  Member[];
    clients:  Client[];
    expenses: Expense[];
  }): Promise<void> {
    const writes: Promise<void>[] = [];

    if (data.projects.length)
      writes.push(this.writeRange(SHEET_TAB_NAMES.PROJECTS,
        `A2:${col(SHEET_HEADERS.PROJECTS.length - 1)}${data.projects.length + 1}`,
        data.projects.map(p => this.projectToRow(p))));

    if (data.contents.length)
      writes.push(this.writeRange(SHEET_TAB_NAMES.CONTENTS,
        `A2:${col(SHEET_HEADERS.CONTENTS.length - 1)}${data.contents.length + 1}`,
        data.contents.map(c => this.contentToRow(c))));

    if (data.members.length)
      writes.push(this.writeRange(SHEET_TAB_NAMES.MEMBERS,
        `A2:${col(SHEET_HEADERS.MEMBERS.length - 1)}${data.members.length + 1}`,
        data.members.map(m => this.memberToRow(m))));

    if (data.clients.length)
      writes.push(this.writeRange(SHEET_TAB_NAMES.CLIENTS,
        `A2:${col(SHEET_HEADERS.CLIENTS.length - 1)}${data.clients.length + 1}`,
        data.clients.map(c => this.clientToRow(c))));

    if (data.expenses.length)
      writes.push(this.writeRange(SHEET_TAB_NAMES.EXPENSES,
        `A2:${col(SHEET_HEADERS.EXPENSES.length - 1)}${data.expenses.length + 1}`,
        data.expenses.map(e => this.expenseToRow(e))));

    await Promise.all(writes);
  }

  // ── Todo CRUD for Google Sheets ────────────────────────────────────────────
  todoToRow(t: TodoItem): string[] {
    return [
      t.id, t.ownerName, t.assigneeName ?? '', t.title,
      t.description ?? '', t.dueDate ?? '',
      t.priority, String(t.completed),
      t.completedAt ?? '', t.createdAt, String(!!t.acknowledged),
    ];
  }

  parseTodos(rows: string[][]): TodoItem[] {
    if (rows.length < 2) return [];
    return rows.slice(1).filter(r => r[0]).map(r => ({
      id:           r[0],
      ownerName:    r[1] ?? '',
      assigneeName: r[2] ?? '',
      title:        r[3] ?? '',
      description:  r[4] || undefined,
      dueDate:      r[5] || undefined,
      priority:     (r[6] || 'medium') as TodoPriority,
      completed:    r[7] === 'true',
      completedAt:  r[8] || undefined,
      createdAt:    r[9] || new Date().toISOString(),
      acknowledged: r[10] === 'true',
    }));
  }

  async saveTodo(t: TodoItem): Promise<void> {
    await this.appendRow(SHEET_TAB_NAMES.TODOS, this.todoToRow(t));
  }

  async updateTodoInSheet(id: string, t: TodoItem): Promise<void> {
    await this.updateRowById(SHEET_TAB_NAMES.TODOS, id, this.todoToRow(t));
  }

  async loadTodos(): Promise<TodoItem[]> {
    const rows = await this.readRange(
      SHEET_TAB_NAMES.TODOS,
      headerRange(SHEET_HEADERS.TODOS)
    ).catch(() => [] as string[][]);
    return this.parseTodos(rows);
  }
}

// Singleton export
export const sheetsService = new GoogleSheetsService();
export default GoogleSheetsService;
