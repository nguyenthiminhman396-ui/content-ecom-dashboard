/**
 * Vercel Serverless Function — AI Proxy
 * Giấu Gemini API key ở server-side, frontend gọi /api/ai
 */

import { getSql, getSession, baseHeaders } from './_lib/db.js';

export const maxDuration = 60;

export default async function handler(req, res) {
  baseHeaders(res);
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Chỉ người đã đăng nhập mới dùng được (tránh người ngoài dùng chùa Gemini API key)
  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database URL not configured' });
  try {
    const session = await getSession(req, sql);
    if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
    if (session.role === 'Client') return res.status(403).json({ error: 'Không có quyền dùng AI' });
  } catch (e) {
    console.error('AI auth error:', e);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GEMINI_API_KEY chưa được cấu hình trên server. Vui lòng thêm biến môi trường GEMINI_API_KEY trên Vercel Dashboard.' });
  }

  const { model, contents, generationConfig } = req.body;

  if (!model || !contents) {
    return res.status(400).json({ error: 'Missing required fields: model, contents' });
  }

  const geminiModel = model || 'gemini-2.5-pro';
  // Tên model nằm trong URL → chỉ cho ký tự an toàn
  if (!/^[a-zA-Z0-9.\-]+$/.test(geminiModel)) return res.status(400).json({ error: 'Model không hợp lệ' });
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
          maxOutputTokens: 8192,
        },
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
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
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
