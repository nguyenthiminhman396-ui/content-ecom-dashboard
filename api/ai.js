/**
 * Vercel Serverless Function — AI Proxy
 * Giấu Gemini API key ở server-side, frontend gọi /api/ai
 *
 * Body: { model, contents, generationConfig?, systemInstruction?, stream? }
 * - stream=false → trả JSON của generateContent
 * - stream=true  → chuyển tiếp luồng SSE của streamGenerateContent (text/event-stream)
 */

import { getSql, getSession, baseHeaders } from './_lib/db.js';

// Giữ 60s như cũ: gói Vercel Hobby không có Fluid Compute sẽ từ chối deploy nếu đặt cao hơn.
export const maxDuration = 60;

const DEFAULT_GENERATION_CONFIG = { temperature: 0.3, topP: 0.95, maxOutputTokens: 32768 };

const SAFETY_SETTINGS = [
  { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
  { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
];

function geminiErrorMessage(status) {
  if (status === 401 || status === 403) return { status: 401, error: 'API Key không hợp lệ. Vui lòng kiểm tra GEMINI_API_KEY trên Vercel.' };
  if (status === 429) return { status: 429, error: 'Đã vượt giới hạn request. Vui lòng thử lại sau vài phút.' };
  return { status, error: `Lỗi Gemini API (${status})` };
}

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

  const { model, contents, generationConfig, systemInstruction, stream } = req.body || {};

  if (!Array.isArray(contents) || contents.length === 0) {
    return res.status(400).json({ error: 'Thiếu nội dung gửi cho AI (contents)' });
  }

  const geminiModel = model || 'gemini-2.5-pro';
  // Tên model nằm trong URL → chỉ cho ký tự an toàn
  if (!/^[a-zA-Z0-9.\-]+$/.test(geminiModel)) return res.status(400).json({ error: 'Model không hợp lệ' });

  const base = `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}`;
  const url = stream ? `${base}:streamGenerateContent?alt=sse` : `${base}:generateContent`;

  const payload = {
    contents,
    generationConfig: generationConfig && typeof generationConfig === 'object' ? generationConfig : DEFAULT_GENERATION_CONFIG,
    safetySettings: SAFETY_SETTINGS,
  };
  if (systemInstruction && typeof systemInstruction === 'object') payload.systemInstruction = systemInstruction;

  try {
    const geminiRes = await fetch(url, {
      method: 'POST',
      // Key đặt trong header thay vì query string → không lọt vào log URL
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(payload),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error('Gemini API error:', geminiRes.status, errText);
      const { status, error } = geminiErrorMessage(geminiRes.status);
      return res.status(status).json({ error });
    }

    if (!stream) {
      const data = await geminiRes.json();
      return res.status(200).json(data);
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    if (typeof res.flushHeaders === 'function') res.flushHeaders();

    try {
      for await (const chunk of geminiRes.body) res.write(chunk);
    } catch (e) {
      console.error('AI stream error:', e);
      res.write(`data: ${JSON.stringify({ error: 'Mất kết nối khi AI đang trả lời. Vui lòng thử lại.' })}\n\n`);
    }
    return res.end();
  } catch (error) {
    console.error('AI Proxy error:', error);
    if (res.headersSent) return res.end();
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
