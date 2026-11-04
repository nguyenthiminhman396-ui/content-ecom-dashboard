/**
 * /api/auth — đăng nhập, đăng xuất, phiên hiện tại, đổi mật khẩu, quản lý tài khoản (Manager).
 * Mật khẩu chỉ được xử lý ở đây (server), không bao giờ gửi danh sách mật khẩu về trình duyệt.
 */
import {
  authSecret, checkLogin, createSessionToken, sessionCookie, clearSessionCookie,
  resolveMember, hashPassword, verifyPassword, sanitizeAccounts, envAccounts,
  KEY_ACCOUNTS, KEY_MEMBERS, MIN_PASSWORD_LEN,
} from './_lib/auth.js';
import { getSql, readKeys, writeKey, getSession, baseHeaders } from './_lib/db.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const lower = (s) => String(s || '').trim().toLowerCase();

export default async function handler(req, res) {
  baseHeaders(res);
  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database URL not configured' });

  try {
    if (req.method === 'GET') {
      const session = await getSession(req, sql);
      if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
      return res.status(200).json({ user: session.user });
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    const body = req.body || {};
    const action = body.action;

    // ── Đăng nhập ──
    if (action === 'login') {
      const data = await readKeys(sql, [KEY_ACCOUNTS, KEY_MEMBERS]);
      const result = checkLogin({ email: body.email, password: body.password, accounts: data[KEY_ACCOUNTS] });
      if (!result.ok) return res.status(401).json({ error: result.error });
      const user = resolveMember(data[KEY_MEMBERS], result.memberId, result.envAcc);
      if (!user) return res.status(401).json({ error: 'Tài khoản không liên kết được thành viên.' });
      if (result.accounts) await writeKey(sql, KEY_ACCOUNTS, result.accounts);
      res.setHeader('Set-Cookie', sessionCookie(createSessionToken(result.memberId, authSecret()), req));
      return res.status(200).json({ user });
    }

    if (action === 'logout') {
      res.setHeader('Set-Cookie', clearSessionCookie(req));
      return res.status(200).json({ success: true });
    }

    // Các thao tác còn lại cần đăng nhập
    const session = await getSession(req, sql);
    if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });

    // ── Đổi mật khẩu của chính mình ──
    if (action === 'changePassword') {
      const { currentPassword, newPassword } = body;
      if (typeof newPassword !== 'string' || newPassword.length < MIN_PASSWORD_LEN) {
        return res.status(400).json({ error: `Mật khẩu mới phải có ít nhất ${MIN_PASSWORD_LEN} ký tự.` });
      }
      const data = await readKeys(sql, [KEY_ACCOUNTS]);
      const accounts = Array.isArray(data[KEY_ACCOUNTS]) ? data[KEY_ACCOUNTS] : [];
      const idx = accounts.findIndex(a => a.memberId === session.user.id);
      if (idx < 0) return res.status(404).json({ error: 'Không tìm thấy tài khoản. Liên hệ Manager.' });
      if (!verifyPassword(String(currentPassword || ''), accounts[idx].password)) {
        return res.status(400).json({ error: 'Mật khẩu hiện tại không đúng.' });
      }
      if (currentPassword === newPassword) return res.status(400).json({ error: 'Mật khẩu mới phải khác mật khẩu cũ.' });
      const next = accounts.slice();
      next[idx] = { ...accounts[idx], password: hashPassword(newPassword) };
      await writeKey(sql, KEY_ACCOUNTS, next);
      return res.status(200).json({ success: true });
    }

    // ── Quản lý tài khoản: chỉ Manager ──
    if (action === 'setAccount' || action === 'removeAccount') {
      if (session.role !== 'Manager') return res.status(403).json({ error: 'Chỉ Manager được quản lý tài khoản' });
      const memberId = String(body.memberId || '');
      if (!memberId) return res.status(400).json({ error: 'Thiếu memberId' });

      const data = await readKeys(sql, [KEY_ACCOUNTS]);
      const accounts = Array.isArray(data[KEY_ACCOUNTS]) ? data[KEY_ACCOUNTS] : [];
      const existing = accounts.find(a => a.memberId === memberId);

      if (action === 'removeAccount') {
        if (memberId === session.user.id) return res.status(400).json({ error: 'Không thể xoá tài khoản đang đăng nhập' });
        const next = accounts.filter(a => a.memberId !== memberId);
        if (next.length !== accounts.length) await writeKey(sql, KEY_ACCOUNTS, next);
        return res.status(200).json({ accounts: sanitizeAccounts(next) });
      }

      const email = String(body.email || '').trim();
      if (!EMAIL_RE.test(email)) return res.status(400).json({ error: 'Email không hợp lệ' });
      const taken = accounts.some(a => a.memberId !== memberId && lower(a.email) === lower(email))
        || envAccounts().some(a => a.id !== memberId && lower(a.email) === lower(email));
      if (taken) return res.status(409).json({ error: 'Email đã được dùng cho tài khoản khác' });

      const password = typeof body.password === 'string' ? body.password : '';
      if (!existing && password.length < MIN_PASSWORD_LEN) {
        return res.status(400).json({ error: `Mật khẩu tối thiểu ${MIN_PASSWORD_LEN} ký tự` });
      }
      if (password && password.length < MIN_PASSWORD_LEN) {
        return res.status(400).json({ error: `Mật khẩu tối thiểu ${MIN_PASSWORD_LEN} ký tự` });
      }
      const active = body.active !== false;
      if (!active && memberId === session.user.id) return res.status(400).json({ error: 'Không thể khoá tài khoản đang đăng nhập' });

      const record = {
        memberId,
        email,
        password: password ? hashPassword(password) : existing.password,
        active,
      };
      const next = [...accounts.filter(a => a.memberId !== memberId), record];
      await writeKey(sql, KEY_ACCOUNTS, next);
      return res.status(200).json({ accounts: sanitizeAccounts(next) });
    }

    return res.status(400).json({ error: 'Action không hợp lệ' });
  } catch (error) {
    console.error('Auth API error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
