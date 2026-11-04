import { getSql, getSession, baseHeaders } from './_lib/db.js';
import { checkStoreWrite, sanitizeAccounts, HIDDEN_KEYS, KEY_ACCOUNTS } from './_lib/auth.js';

export default async function handler(req, res) {
  baseHeaders(res);

  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database URL not configured' });

  try {
    // Mọi thao tác đều cần đăng nhập (cookie phiên do /api/auth cấp)
    const session = await getSession(req, sql);
    if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });

    // ── GET: return all keys (trừ mật khẩu tài khoản) ──────────
    if (req.method === 'GET') {
      const data = await sql`SELECT key, value FROM global_store`;
      const result = {};
      data.forEach(row => {
        if (row.key === KEY_ACCOUNTS) result[row.key] = sanitizeAccounts(row.value);
        else if (!HIDDEN_KEYS.has(row.key)) result[row.key] = row.value;
      });
      return res.status(200).json(result);
    }

    // ── POST: write data ───────────────────────────────────────
    if (req.method === 'POST') {
      const { key, value, op, items, ids, id, data } = req.body || {};
      if (!key) return res.status(400).json({ error: 'Key is required' });
      const writeOp = op === 'append' || op === 'remove' || op === 'update' ? op : 'overwrite';
      const denied = checkStoreWrite(session.role, key, writeOp);
      if (denied) return res.status(403).json({ error: denied });

      // ── Atomic APPEND: add items to array without overwriting ──
      // Idempotent theo id: nếu item.id đã tồn tại trong array → bỏ qua (tránh duplicate khi retry network).
      // Atomic ở mức row của Postgres: ON CONFLICT DO UPDATE giữ lock cho đến khi UPDATE chạy xong,
      // nên 10 client đồng thời append vẫn merge đúng, không ghi đè nhau.
      if (op === 'append' && items) {
        const jsonItems = JSON.stringify(items);
        await sql`
          INSERT INTO global_store (key, value)
          VALUES (${key}, ${jsonItems}::jsonb)
          ON CONFLICT (key) DO UPDATE
          SET value = (
            COALESCE(global_store.value, '[]'::jsonb)
            || COALESCE((
              SELECT jsonb_agg(new_item)
              FROM jsonb_array_elements(${jsonItems}::jsonb) AS new_item
              WHERE (new_item->>'id') IS NULL
                 OR NOT EXISTS (
                   SELECT 1
                   FROM jsonb_array_elements(COALESCE(global_store.value, '[]'::jsonb)) AS old_item
                   WHERE old_item->>'id' = new_item->>'id'
                 )
            ), '[]'::jsonb)
          ),
          updated_at = CURRENT_TIMESTAMP
        `;
        return res.status(200).json({ success: true, op: 'append' });
      }

      // ── Atomic REMOVE: remove items by id ─────────────────────
      if (op === 'remove' && ids) {
        const idsJson = JSON.stringify(ids);
        await sql`
          UPDATE global_store 
          SET value = (
            SELECT COALESCE(jsonb_agg(elem), '[]'::jsonb)
            FROM jsonb_array_elements(value) AS elem
            WHERE NOT (elem->>'id' IN (SELECT jsonb_array_elements_text(${idsJson}::jsonb)))
          ),
          updated_at = CURRENT_TIMESTAMP
          WHERE key = ${key}
        `;
        return res.status(200).json({ success: true, op: 'remove' });
      }

      // ── Atomic UPDATE: merge data into item by id ─────────────
      if (op === 'update' && id && data) {
        const dataJson = JSON.stringify(data);
        await sql`
          UPDATE global_store 
          SET value = (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN elem->>'id' = ${id}
                   THEN elem || ${dataJson}::jsonb
                   ELSE elem END
            ), '[]'::jsonb)
            FROM jsonb_array_elements(value) AS elem
          ),
          updated_at = CURRENT_TIMESTAMP
          WHERE key = ${key}
        `;
        return res.status(200).json({ success: true, op: 'update' });
      }

      // ── Default: full overwrite (non-array data like scaleConfig) ──
      const jsonValue = JSON.stringify(value);
      await sql`
        INSERT INTO global_store (key, value)
        VALUES (${key}, ${jsonValue}::jsonb)
        ON CONFLICT (key) DO UPDATE 
        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `;
      return res.status(200).json({ success: true });
    }

    // ── DELETE: remove a key ───────────────────────────────────
    if (req.method === 'DELETE') {
      const { key } = req.body || {};
      if (!key) return res.status(400).json({ error: 'Key is required' });
      const denied = checkStoreWrite(session.role, key, 'delete');
      if (denied) return res.status(403).json({ error: denied });
      await sql`DELETE FROM global_store WHERE key = ${key}`;
      return res.status(200).json({ success: true, deleted: key });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
