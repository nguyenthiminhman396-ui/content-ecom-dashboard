import { neon } from '@neondatabase/serverless';

export default async function handler(req, res) {
  // Config CORS for dev if needed
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const dbUrl = process.env.POSTGRES_URL || process.env.contentecom_POSTGRES_URL;
  if (!dbUrl) {
    return res.status(500).json({ error: 'Database URL not configured' });
  }

  const sql = neon(dbUrl);

  try {
    if (req.method === 'GET') {
      // Return all keys
      const data = await sql`SELECT key, value FROM global_store`;
      const result = {};
      data.forEach(row => {
        result[row.key] = row.value;
      });
      return res.status(200).json(result);
    } 
    
    if (req.method === 'POST') {
      // Save a single key-value
      const { key, value } = req.body;
      if (!key) return res.status(400).json({ error: 'Key is required' });
      
      const jsonValue = JSON.stringify(value);
      
      await sql`
        INSERT INTO global_store (key, value)
        VALUES (${key}, ${jsonValue}::jsonb)
        ON CONFLICT (key) DO UPDATE 
        SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP
      `;
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ error: error.message });
  }
}
