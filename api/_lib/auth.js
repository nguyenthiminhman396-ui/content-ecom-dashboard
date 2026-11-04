/**
 * Lõi xác thực phía server — thuần Node (không import DB) để test bằng `node --test`.
 *
 *  - Mật khẩu: scrypt + salt ngẫu nhiên, lưu dạng `scrypt$<salt>$<hash>`.
 *    Mật khẩu cũ (plain text) vẫn đăng nhập được 1 lần, sau đó được hash lại.
 *  - Phiên đăng nhập: token ký HMAC-SHA256 trong cookie HttpOnly (JS phía trình duyệt không đọc được).
 *  - Link chia sẻ: chữ ký HMAC trên (loại báo cáo + tham số) → không đoán/sửa được link.
 */
import { createHmac, randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

export const SESSION_COOKIE = 'hcms_session';
export const SESSION_TTL_SEC = 30 * 24 * 3600; // 30 ngày (giữ trải nghiệm "nhớ đăng nhập" như trước)
export const MIN_PASSWORD_LEN = 4;

export const KEY_ACCOUNTS = 'hcms_accounts';
export const KEY_MEMBERS = 'hcms_members';

// ── Secret ────────────────────────────────────────────────────────────────

/**
 * Secret ký token: AUTH_SECRET (khuyến nghị đặt trên Vercel).
 * Chưa đặt → suy ra từ chuỗi kết nối DB (cũng là bí mật phía server) để deploy cũ không hỏng.
 */
export function authSecret(env = process.env) {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  const db = env.POSTGRES_URL || env.contentecom_POSTGRES_URL;
  if (!db) throw new Error('AUTH_SECRET chưa cấu hình');
  return createHash('sha256').update(`hcms-auth:${db}`).digest('hex');
}

// ── Mật khẩu ──────────────────────────────────────────────────────────────

export function hashPassword(password) {
  const salt = randomBytes(16);
  const hash = scryptSync(String(password), salt, 32);
  return `scrypt$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export function isHashed(stored) {
  return typeof stored === 'string' && stored.startsWith('scrypt$');
}

function safeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) {
    timingSafeEqual(ba, ba); // giữ thời gian xử lý tương đương
    return false;
  }
  return timingSafeEqual(ba, bb);
}

/** So khớp mật khẩu với giá trị lưu (hash scrypt hoặc plain text cũ) */
export function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || stored === '' || typeof password !== 'string' || password === '') return false;
  if (!isHashed(stored)) return safeEqual(password, stored);
  const [, saltHex, hashHex] = stored.split('$');
  if (!saltHex || !hashHex) return false;
  const hash = scryptSync(password, Buffer.from(saltHex, 'hex'), 32);
  return safeEqual(hash.toString('hex'), hashHex);
}

// ── Token ký HMAC ─────────────────────────────────────────────────────────

const b64url = (buf) => Buffer.from(buf).toString('base64url');

function hmac(secret, data) {
  return createHmac('sha256', secret).update(data).digest('base64url');
}

export function signToken(payload, secret) {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(secret, body)}`;
}

/** Token hợp lệ và chưa hết hạn → payload; ngược lại null */
export function verifyToken(token, secret, nowSec = Math.floor(Date.now() / 1000)) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig || !safeEqual(sig, hmac(secret, body))) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (!payload || typeof payload.exp !== 'number' || payload.exp < nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

export function createSessionToken(memberId, secret, nowSec = Math.floor(Date.now() / 1000)) {
  return signToken({ sub: memberId, iat: nowSec, exp: nowSec + SESSION_TTL_SEC }, secret);
}

// ── Cookie ────────────────────────────────────────────────────────────────

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  for (const part of String(header).split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    if (!k) continue;
    try { out[k] = decodeURIComponent(part.slice(i + 1).trim()); } catch { out[k] = part.slice(i + 1).trim(); }
  }
  return out;
}

function isLocalHost(req) {
  const host = String(req?.headers?.host || '');
  return /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
}

export function sessionCookie(token, req) {
  const secure = isLocalHost(req) ? '' : '; Secure';
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SEC}${secure}`;
}

export function clearSessionCookie(req) {
  const secure = isLocalHost(req) ? '' : '; Secure';
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export function readSessionToken(req) {
  return parseCookies(req?.headers?.cookie)[SESSION_COOKIE];
}

// ── Tài khoản ─────────────────────────────────────────────────────────────

/** Bỏ mật khẩu trước khi trả về trình duyệt */
export function sanitizeAccounts(accounts) {
  if (!Array.isArray(accounts)) return [];
  return accounts.map(a => ({ memberId: a.memberId, email: a.email, active: a.active !== false }));
}

/**
 * Tài khoản cấu hình qua biến môi trường (chỉ đọc phía server).
 * Hỗ trợ cả tên cũ VITE_ACCOUNT_* để deploy hiện tại không phải đổi cấu hình.
 */
export function envAccounts(env = process.env) {
  const pick = (k) => env[`ACCOUNT_${k}`] || env[`VITE_ACCOUNT_${k}`] || '';
  return [
    { id: 'M_MANAGER', role: 'Manager', email: pick('ADMIN_EMAIL'),  pass: pick('ADMIN_PASS'),  name: pick('ADMIN_NAME')  || 'manager' },
    { id: 'M_LEAD',    role: 'Leader',  email: pick('LEADER_EMAIL'), pass: pick('LEADER_PASS'), name: pick('LEADER_NAME') || 'leader' },
    { id: 'M_MEM',     role: 'Member',  email: pick('MEMBER_EMAIL'), pass: pick('MEMBER_PASS'), name: pick('MEMBER_NAME') || 'member' },
    // Client: giữ như cũ — không đặt CLIENT_PASS thì đăng nhập không cần mật khẩu (chỉ có quyền xem + duyệt)
    { id: 'M_CLIENT',  role: 'Client',  email: pick('CLIENT_EMAIL'), pass: pick('CLIENT_PASS'), name: pick('CLIENT_NAME') || 'khach' },
  ].filter(a => a.email && (a.pass || a.role === 'Client'));
}

/** Tài khoản khách env không đặt mật khẩu → đăng nhập không cần mật khẩu (hành vi cũ) */
export function isPasswordlessClient(envAcc) {
  return !!envAcc && envAcc.role === 'Client' && !envAcc.pass;
}

const lower = (s) => String(s || '').trim().toLowerCase();

/** Member tương ứng tài khoản; tài khoản env chưa có member trong DB → member tạm */
export function resolveMember(members, memberId, envAcc) {
  const list = Array.isArray(members) ? members : [];
  const byId = list.find(m => m.id === memberId);
  if (byId) return byId;
  if (!envAcc) return null;
  const match = list.find(m =>
    (envAcc.email && lower(m.email) === lower(envAcc.email)) || m.name === envAcc.name);
  return match || { id: envAcc.id, name: envAcc.name, role: envAcc.role, expertise: '', email: envAcc.email };
}

/**
 * Kiểm tra đăng nhập. Trả về { ok, memberId, accounts? (mảng mới cần ghi lại nếu thay đổi), envAcc? }.
 *  1. Tài khoản trong DB theo email (khoá → từ chối, không rơi xuống env).
 *  2. Tài khoản env: nếu DB đã có bản ghi cho memberId đó → dùng bản ghi DB (đã đổi mật khẩu / bị khoá).
 *     Lần đầu → so với mật khẩu env rồi tạo bản ghi DB (đã hash).
 * Mật khẩu plain text cũ đúng → hash lại.
 */
export function checkLogin({ email, password, accounts, env = process.env }) {
  const accs = Array.isArray(accounts) ? accounts : [];
  const em = lower(email);
  if (!em || typeof password !== 'string') return { ok: false, error: 'Sai email hoặc mật khẩu.' };
  const envs = envAccounts(env);

  // Bản ghi khách không mật khẩu (Manager chưa đặt mật khẩu riêng) → cho qua như cũ
  const passOk = (acc, envAcc) =>
    (!acc.password && isPasswordlessClient(envAcc)) || verifyPassword(password, acc.password);

  const rehash = (idx) => {
    if (!accs[idx].password || isHashed(accs[idx].password)) return undefined;
    const next = accs.slice();
    next[idx] = { ...accs[idx], password: hashPassword(password) };
    return next;
  };

  const idx = accs.findIndex(a => lower(a.email) === em);
  if (idx >= 0) {
    const acc = accs[idx];
    const envAcc = envs.find(a => a.id === acc.memberId);
    if (acc.active === false) return { ok: false, error: 'Tài khoản đã bị khoá. Liên hệ Manager.' };
    if (!passOk(acc, envAcc)) return { ok: false, error: 'Sai email hoặc mật khẩu.' };
    return { ok: true, memberId: acc.memberId, accounts: rehash(idx), envAcc };
  }

  const envAcc = envs.find(a => lower(a.email) === em);
  if (!envAcc) return { ok: false, error: 'Sai email hoặc mật khẩu.' };

  const dbIdx = accs.findIndex(a => a.memberId === envAcc.id);
  if (dbIdx >= 0) {
    const acc = accs[dbIdx];
    if (acc.active === false) return { ok: false, error: 'Tài khoản đã bị khoá. Liên hệ Manager.' };
    if (!passOk(acc, envAcc)) return { ok: false, error: 'Sai email hoặc mật khẩu.' };
    return { ok: true, memberId: envAcc.id, accounts: rehash(dbIdx), envAcc };
  }

  // Lần đầu: tạo bản ghi DB (cần để phiên đăng nhập có hiệu lực / Manager khoá được)
  if (isPasswordlessClient(envAcc)) {
    const created = { memberId: envAcc.id, email: envAcc.email, password: '', active: true };
    return { ok: true, memberId: envAcc.id, accounts: [...accs, created], envAcc };
  }
  if (!verifyPassword(password, envAcc.pass)) return { ok: false, error: 'Sai email hoặc mật khẩu.' };
  const created = { memberId: envAcc.id, email: envAcc.email, password: hashPassword(password), active: true };
  return { ok: true, memberId: envAcc.id, accounts: [...accs, created], envAcc };
}

/**
 * Phiên còn hiệu lực: token đúng chữ ký + tài khoản vẫn active + member còn tồn tại.
 * Vai trò luôn lấy từ dữ liệu member mới nhất (Manager đổi vai trò → có hiệu lực ngay).
 */
export function resolveSession({ token, secret, accounts, members, env = process.env }) {
  const payload = verifyToken(token, secret);
  if (!payload || !payload.sub) return null;
  const accs = Array.isArray(accounts) ? accounts : [];
  const acc = accs.find(a => a.memberId === payload.sub);
  if (!acc || acc.active === false) return null;
  const envAcc = envAccounts(env).find(a => a.id === payload.sub);
  const user = resolveMember(members, payload.sub, envAcc);
  if (!user) return null;
  return { user, role: user.role };
}

// ── Phân quyền ghi /api/store ─────────────────────────────────────────────

/** Các key hợp lệ của store — key lạ bị từ chối (không cho tạo rác / ghi đè tuỳ ý) */
export const STORE_KEYS = new Set([
  'hcms_submissions', 'hcms_scale_config', 'hcms_members', 'hcms_weekly_reports', 'hcms_monthly_reports',
  'hcms_sites', 'hcms_project_tasks', 'hcms_bonus', 'hcms_rnd_logs', 'hcms_kpi_targets', 'hcms_todos',
  'hcms_projects', 'hcms_contents', 'hcms_clients', 'hcms_expenses', 'hcms_task_point_rules',
  'hcms_perf_reviews', 'hcms_notifications', 'hcms_ci_checks', 'hcms_ci_findings', 'hcms_ci_tasks',
  'hcms_ci_settings', 'hcms_ci_opportunities',
]);

/** Key không bao giờ trả về / ghi qua /api/store */
export const HIDDEN_KEYS = new Set([KEY_ACCOUNTS, 'hcms_current_user']);

/** Cấu hình hệ thống — chỉ Manager được ghi */
export const MANAGER_ONLY_KEYS = new Set([
  'hcms_members', 'hcms_scale_config', 'hcms_task_point_rules', 'hcms_sites',
]);

/** Client (khách hàng) chỉ được: duyệt sản phẩm, đánh dấu thông báo, to-do */
export const CLIENT_WRITABLE_KEYS = new Set(['hcms_contents', 'hcms_notifications', 'hcms_todos']);

/**
 * Quyền ghi của 1 vai trò lên 1 key. op: 'append' | 'remove' | 'update' | 'overwrite' | 'delete'.
 * Trả về null nếu được phép, ngược lại là thông báo lỗi.
 */
export function checkStoreWrite(role, key, op) {
  if (HIDDEN_KEYS.has(key)) return 'Tài khoản chỉ được quản lý qua /api/auth';
  if (!STORE_KEYS.has(key)) return `Key không hợp lệ: ${key}`;
  if (op === 'delete') return role === 'Manager' ? null : 'Chỉ Manager được xoá cả bộ dữ liệu';
  if (MANAGER_ONLY_KEYS.has(key) && role !== 'Manager') return 'Chỉ Manager được sửa cấu hình này';
  if (role === 'Client') {
    if (!CLIENT_WRITABLE_KEYS.has(key)) return 'Tài khoản khách chỉ có quyền xem';
    if (key === 'hcms_contents' && op !== 'update') return 'Tài khoản khách chỉ được duyệt sản phẩm';
  }
  if (!['Manager', 'Leader', 'Member', 'Client'].includes(role)) return 'Vai trò không hợp lệ';
  return null;
}

// ── Link chia sẻ ──────────────────────────────────────────────────────────

export const SHARE_TYPES = new Set(['weekly', 'periodic']);

export function shareSignature(type, param, secret) {
  return hmac(secret, `share:${type}:${param}`);
}

export function verifyShareSignature(type, param, sig, secret) {
  if (!SHARE_TYPES.has(type) || typeof param !== 'string' || !param || typeof sig !== 'string' || !sig) return false;
  return safeEqual(sig, shareSignature(type, param, secret));
}
