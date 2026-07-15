/**
 * Vercel Serverless Function — AI Proxy
 * Giấu Gemini API key ở server-side, frontend gọi /api/ai
 */

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên server. Vui lòng thêm biến môi trường GEMINI_API_KEY trên Vercel Dashboard.' });
  }

  const { model, contents, generationConfig } = req.body;

  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing required fields: model, contents' });
  }

  const geminiModel = model || 'gemini-2.5-pro';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${apiKey}`;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: generationConfig || {
          temperature: 0.7,
          topP: 0.95,
          topK: 40,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      
      if (geminiRes.status === 401 || geminiRes.status === 403) {
        return res.status(401).json({ error: 'API Key không hợp lệ. Vui lòng kiểm tra GEMINI_API_KEY trên Vercel.' });
      }
      if (geminiRes.status === 429) {
        return res.status(429).json({ error: 'Đã vượt giới hạn request. Vui lòng thử lại sau vài phút.' });
      }
      return res.status(geminiRes.status).json({ error: `Lỗi Gemini API (${geminiRes.status})` });
    }

    const data = await geminiRes.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('AI Proxy error:', error);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
