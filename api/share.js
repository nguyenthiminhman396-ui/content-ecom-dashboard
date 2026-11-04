/**
 * /api/share — link báo cáo chỉ xem, không cần đăng nhập.
 *
 *  POST { type, param }            (Manager) → { sig }  — ký link chia sẻ
 *  GET  ?type=&p=&sig=             (công khai) → chỉ dữ liệu cần cho đúng báo cáo đó
 *
 * Link không có chữ ký hợp lệ → 403. Không bao giờ trả về tài khoản, thông báo, đánh giá nhân sự...
 */
import { authSecret, shareSignature, verifyShareSignature, SHARE_TYPES } from './_lib/auth.js';
import { getSql, readKeys, getSession, baseHeaders } from './_lib/db.js';

/** Dữ liệu báo cáo tháng/quý cần (xem MonthlyQuarterlyReportPage) */
const PERIODIC_KEYS = ['hcms_submissions', 'hcms_projects', 'hcms_project_tasks', 'hcms_sites', 'hcms_monthly_reports'];

export default async function handler(req, res) {
  baseHeaders(res);
  const sql = getSql();
  if (!sql) return res.status(500).json({ error: 'Database URL not configured' });

  try {
    if (req.method === 'POST') {
      const session = await getSession(req, sql);
      if (!session) return res.status(401).json({ error: 'Chưa đăng nhập' });
      if (session.role !== 'Manager') return res.status(403).json({ error: 'Chỉ Manager được tạo link chia sẻ' });
      const { type, param } = req.body || {};
      if (!SHARE_TYPES.has(type) || typeof param !== 'string' || !param) {
        return res.status(400).json({ error: 'Tham số không hợp lệ' });
      }
      return res.status(200).json({ sig: shareSignature(type, param, authSecret()) });
    }

    if (req.method === 'GET') {
      const { type, p, sig } = req.query || {};
      if (!verifyShareSignature(type, p, sig, authSecret())) {
        return res.status(403).json({ error: 'Link chia sẻ không hợp lệ hoặc đã bị thay đổi' });
      }
      if (type === 'weekly') {
        const data = await readKeys(sql, ['hcms_weekly_reports']);
        const list = Array.isArray(data.hcms_weekly_reports) ? data.hcms_weekly_reports : [];
        return res.status(200).json({ hcms_weekly_reports: list.filter(r => r.id === p) });
      }
      const data = await readKeys(sql, PERIODIC_KEYS);
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Share API error:', error);
    return res.status(500).json({ error: 'Lỗi máy chủ' });
  }
}
