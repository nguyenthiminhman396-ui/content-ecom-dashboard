/**
 * Đọc tab PHÂN TÍCH ĐỐI THỦ: mỗi dòng = 1 cơ hội nội dung (Long Châu nên phát triển gì tiếp theo).
 * Không phải lỗi bài — không bắt buộc có bài Long Châu.
 */
import type { CiOpportunity, TodoPriority } from '@/shared/types';
import { norm, normalizeCheckedAt, shortId, type Row } from './importParser';

export const OPPORTUNITY_COLUMNS = [
  'checked_at', 'competitor', 'competitor_url', 'topic', 'opportunity_type', 'lc_url', 'priority', 'reason', 'suggested_outline',
] as const;

const LC_HOSTS = ['nhathuoclongchau.com.vn', 'tiemchunglongchau.com.vn'];

const deaccent = (s?: string) => norm(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd');

/** Chuẩn hoá tên đối thủ; nếu chỉ có link thì suy ra từ tên miền. */
export function normalizeCompetitor(name?: string, url?: string): string | undefined {
  const n = deaccent(name);
  let host = '';
  try { host = url ? new URL(url).hostname : ''; } catch { /* bỏ qua */ }
  if (n.includes('vinmec') || host.includes('vinmec')) return 'Vinmec';
  if (n.includes('vnvc') || host.includes('vnvc')) return 'VNVC';
  if (/tam ?anh/.test(n) || host.includes('tamanh')) return 'Tâm Anh';
  return name?.trim() || undefined;
}

function parseType(v?: string): CiOpportunity['type'] | null {
  const n = deaccent(v);
  if (!n) return 'new_article';
  if (/^(new|new_article|bai moi|viet moi|moi)/.test(n)) return 'new_article';
  if (/^(expand|expand_article|bo sung|mo rong|cap nhat)/.test(n)) return 'expand_article';
  return null;
}

function parsePriority(v?: string): TodoPriority {
  const n = deaccent(v);
  if (/^(cao|high|p0|p1)/.test(n)) return 'high';
  if (/^(thap|low|p3)/.test(n)) return 'low';
  return 'medium';
}

const httpUrl = (v?: string) => (/^https?:\/\//.test((v || '').trim()) ? v!.trim() : undefined);

export interface ParsedOpportunities {
  items: CiOpportunity[];
  errors: { row: number; message: string }[];
  warnings: { row: number; message: string }[];
  duplicates: number;
}

export function normalizeOpportunityRows(rows: Row[], ctx: { existingKeys: Set<string>; importedBy: string }): ParsedOpportunities {
  const out: ParsedOpportunities = { items: [], errors: [], warnings: [], duplicates: 0 };
  const now = new Date().toISOString();
  rows.forEach((r, idx) => {
    const line = idx + 2;
    const topic = (r.topic || '').trim();
    if (!topic) { out.errors.push({ row: line, message: 'Thiếu topic (chủ đề)' }); return; }
    if (!(r.reason || '').trim()) { out.errors.push({ row: line, message: 'Thiếu reason (vì sao nên làm)' }); return; }
    const type = parseType(r.opportunity_type);
    if (!type) { out.errors.push({ row: line, message: `opportunity_type phải là new_article hoặc expand_article: "${r.opportunity_type}"` }); return; }

    let lcUrl = httpUrl(r.lc_url);
    if (lcUrl) {
      let host = '';
      try { host = new URL(lcUrl).hostname; } catch { /* bỏ qua */ }
      if (!LC_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) { out.warnings.push({ row: line, message: 'lc_url không thuộc Long Châu — bỏ qua' }); lcUrl = undefined; }
    }
    if (type === 'expand_article' && !lcUrl) out.warnings.push({ row: line, message: 'Bổ sung bài nhưng thiếu lc_url (bài Long Châu cần bổ sung)' });

    let checkedAt = normalizeCheckedAt((r.checked_at || '').trim() || new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10));
    if (!checkedAt) { out.warnings.push({ row: line, message: `checked_at không đọc được: "${r.checked_at}" — dùng ngày nhập` }); checkedAt = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10); }

    const competitorUrl = httpUrl(r.competitor_url);
    const competitor = normalizeCompetitor(r.competitor, competitorUrl);
    const key = `${norm(topic)}|${competitor || ''}|${type}|${lcUrl || ''}`;
    if (ctx.existingKeys.has(key) || out.items.some(i => i.key === key)) { out.duplicates++; return; }

    out.items.push({
      id: shortId('O'), key, checkedAt, competitor, competitorUrl, topic, type, lcUrl,
      priority: parsePriority(r.priority), reason: r.reason!.trim(), suggestedOutline: (r.suggested_outline || '').trim() || undefined,
      status: 'pending', importedBy: ctx.importedBy, importedAt: now,
    });
  });
  return out;
}
