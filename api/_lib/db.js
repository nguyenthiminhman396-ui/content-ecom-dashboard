import { neon } from '@neondatabase/serverless';
import { authSecret, readSessionToken, resolveSession, KEY_ACCOUNTS, KEY_MEMBERS } from './auth.js';

export function getSql() {
  const dbUrl = process.env.POSTGRES_URL || process.env.contentecom_POSTGRES_URL;
  if (!dbUrl) return null;
  return neon(dbUrl);
}

/** Đọc nhiều key → { key: value } */
export async function readKeys(sql, keys) {
  // string_to_array thay vì truyền mảng JS: không phụ thuộc cách driver serialize mảng (key không chứa dấu phẩy)
  const rows = await sql`SELECT key, value FROM global_store WHERE key = ANY(string_to_array(${keys.join(',')}, ','))`;
  const out = {};
  rows.forEach(r => { out[r.key] = r.value; });
  return out;
}

export async function writeKey(sql, key, value) {
  const json = JSON.stringify(value);
  await sql`
    INSERT INTO global_store (key, value)
    VALUES (${key}, ${json}::jsonb)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
  `;
}

/** Phiên đăng nhập của request (null nếu chưa đăng nhập / hết hạn / tài khoản bị khoá) */
export async function getSession(req, sql) {
  const token = readSessionToken(req);
  if (!token) return null;
  const data = await readKeys(sql, [KEY_ACCOUNTS, KEY_MEMBERS]);
  return resolveSession({
    token,
    secret: authSecret(),
    accounts: data[KEY_ACCOUNTS],
    members: data[KEY_MEMBERS],
  });
}

/** Header chung: không cache, chỉ cùng origin (bỏ CORS `*`) */
export function baseHeaders(res) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
