import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  const dbUrl = process.env.POSTGRES_URL || process.env.contentecom_POSTGRES_URL;
  if (!dbUrl) return res.status(500).json({ error: 'Database URL not configured' });

  const sql = neon(dbUrl);

  try {
    // ── GET: return all keys ───────────────────────────────────
    if (req.method === 'GET') {
      const data = await sql`SELECT key, value FROM global_store`;
      const result = {};
      data.forEach(row => { result[row.key] = row.value; });
      return res.status(200).json(result);
    }

    // ── POST: write data ───────────────────────────────────────
    if (req.method === 'POST') {
      const { key, value, op, items, ids, id, data } = req.body;
      if (!key) return res.status(400).json({ error: 'Key is required' });

      // ── Atomic APPEND: add items to array without overwriting ──
      if (op === 'append' && items) {
        const jsonItems = JSON.stringify(items);
        await sql`
          INSERT INTO global_store (key, value)
          VALUES (${key}, ${jsonItems}::jsonb)
          ON CONFLICT (key) DO UPDATE 
          SET value = (COALESCE(global_store.value, '[]'::jsonb) || ${jsonItems}::jsonb),
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
      await sql`DELETE FROM global_store WHERE key = ${key}`;
      return res.status(200).json({ success: true, deleted: key });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
