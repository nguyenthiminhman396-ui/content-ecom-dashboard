import type { Member, MemberAccount } from '@/shared/types';

/**
 * Gọi /api/auth và /api/share. Mật khẩu chỉ được kiểm tra ở server;
 * phiên đăng nhập nằm trong cookie HttpOnly (trình duyệt tự gửi kèm, JS không đọc được).
 */

async function post<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Không kết nối được máy chủ.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data as { error?: string }).error;
    if (!msg && res.status === 404) throw new Error('Không tìm thấy API máy chủ (chạy local cần `vercel dev`, không phải `vite`).');
    throw new Error(msg || `Lỗi ${res.status}`);
  }
  return data as T;
}

export async function login(email: string, password: string): Promise<Member> {
  const { user } = await post<{ user: Member }>('/api/auth', { action: 'login', email, password });
  return user;
}

export async function logout(): Promise<void> {
  try { await post('/api/auth', { action: 'logout' }); } catch { /* vẫn xoá phiên phía client */ }
}

/** Phiên hiện tại; null nếu chưa đăng nhập / hết hạn */
export async function fetchMe(): Promise<Member | null> {
  try {
    const res = await fetch('/api/auth', { cache: 'no-store', credentials: 'same-origin' });
    if (!res.ok) return null;
    const { user } = await res.json();
    return user ?? null;
  } catch {
    return null;
  }
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await post('/api/auth', { action: 'changePassword', currentPassword, newPassword });
}

/** Manager: tạo / sửa tài khoản. password rỗng = giữ mật khẩu cũ. Trả về danh sách (không có mật khẩu). */
export async function saveAccount(a: { memberId: string; email: string; password?: string; active: boolean }): Promise<MemberAccount[]> {
  const { accounts } = await post<{ accounts: MemberAccount[] }>('/api/auth', { action: 'setAccount', ...a });
  return accounts;
}

export async function deleteAccount(memberId: string): Promise<MemberAccount[]> {
  const { accounts } = await post<{ accounts: MemberAccount[] }>('/api/auth', { action: 'removeAccount', memberId });
  return accounts;
}

// ── Link chia sẻ ──────────────────────────────────────────────────────────

export type ShareType = 'weekly' | 'periodic';

/** Manager: tạo link chia sẻ có chữ ký */
export async function createShareUrl(type: ShareType, param: string): Promise<string> {
  const { sig } = await post<{ sig: string }>('/api/share', { type, param });
  const origin = window.location.origin;
  const q = (k: string, v: string) => `${k}=${encodeURIComponent(v)}`;
  return type === 'weekly'
    ? `${origin}/share/weekly-report?${q('id', param)}&${q('sig', sig)}`
    : `${origin}/share/report?${q('period', param)}&${q('sig', sig)}`;
}

/** Tạo link rồi sao chép; trình duyệt chặn clipboard → hiện hộp để người dùng tự copy */
export async function copyShareUrl(type: ShareType, param: string): Promise<boolean> {
  const url = await createShareUrl(type, param);
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    window.prompt('Sao chép link chia sẻ:', url);
    return false;
  }
}

/** Trang chia sẻ công khai: tải đúng dữ liệu của link (theo chữ ký) */
export async function fetchShareData(): Promise<Record<string, unknown> | null> {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname;
  const type: ShareType | null = path.startsWith('/share/weekly-report') ? 'weekly'
    : path.startsWith('/share/report') ? 'periodic' : null;
  const p = type === 'weekly' ? params.get('id') : params.get('period');
  const sig = params.get('sig');
  if (!type || !p || !sig) return null;
  try {
    const res = await fetch(`/api/share?type=${type}&p=${encodeURIComponent(p)}&sig=${encodeURIComponent(sig)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
