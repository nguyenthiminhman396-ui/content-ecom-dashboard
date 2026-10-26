/**
 * Đọc tab PHÂN TÍCH ĐỐI THỦ: mỗi dòng = 1 cơ hội nội dung (Long Châu nên phát triển gì tiếp theo).
 * Không phải lỗi bài — không bắt buộc có bài Long Châu.
 */
import type { CiOpportunity, TodoPriority } from '@/shared/types';
import { norm, normalizeCheckedAt, shortId, type Row } from './importParser';

/** Cột của sheet Competitor Insights (đúng thứ tự trong sheet) */
export const OPPORTUNITY_COLUMNS = [
  'checked_at', 'topic', 'longchau_url', 'competitor', 'competitor_url', 'insight_type', 'competitor_observation',
  'longchau_gap', 'user_value', 'suggested_action', 'priority', 'evidence_urls', 'verification', 'status',
] as const;

/** Lấy giá trị theo tên cột chính hoặc tên cũ (tương thích định dạng đề xuất trước đó). */
const pick = (r: Row, ...keys: string[]) => keys.map(k => (r[k] || '').trim()).find(Boolean) || '';

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

/** insight_type → viết bài mới / bổ sung bài. Giá trị khác: có bài Long Châu thì là bổ sung, chưa có thì là bài mới. */
function parseType(v: string, hasLcUrl: boolean): CiOpportunity['type'] {
  const n = deaccent(v);
  if (/(new|bai moi|viet moi|chua co|missing topic|topic gap)/.test(n)) return 'new_article';
  if (/(expand|bo sung|mo rong|cap nhat|update|thieu|gap|depth|format)/.test(n) && hasLcUrl) return 'expand_article';
  return hasLcUrl ? 'expand_article' : 'new_article';
}

/** Các dòng mô tả insight dùng cho nội dung To-do. */
export function opportunityLines(o: CiOpportunity): string[] {
  return [
    `Chủ đề: ${o.topic}`,
    o.type === 'expand_article' ? `Bài Long Châu cần bổ sung: ${o.lcUrl || '(chưa có link)'}` : 'Loại: viết bài mới (Long Châu chưa có bài)',
    ...(o.competitor || o.competitorUrl ? [`Tham khảo ${o.competitor || 'đối thủ'}: ${o.competitorUrl || ''}`] : []),
    ...(o.competitorObservation ? [`Đối thủ làm gì: ${o.competitorObservation}`] : []),
    ...(o.lcGap ? [`Long Châu còn thiếu: ${o.lcGap}`] : []),
    ...(o.userValue ? [`Giá trị cho người đọc: ${o.userValue}`] : []),
    ...(o.suggestedAction ? [`Đề xuất: ${o.suggestedAction}`] : []),
    'Lưu ý: tham khảo để biết độ phủ chủ đề, không sao chép nội dung đối thủ.',
  ];
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
    const topic = pick(r, 'topic');
    if (!topic) { if (Object.values(r).some(v => (v || '').trim() && v !== r.__cells)) out.errors.push({ row: line, message: 'Thiếu topic (chủ đề)' }); return; }
    const observation = pick(r, 'competitor_observation');
    const gap = pick(r, 'longchau_gap', 'reason');
    const action = pick(r, 'suggested_action', 'suggested_outline');
    if (!observation && !gap && !action) { out.errors.push({ row: line, message: 'Cần ít nhất một trong: competitor_observation, longchau_gap, suggested_action' }); return; }

    let lcUrl = httpUrl(pick(r, 'longchau_url', 'lc_url'));
    if (lcUrl) {
      let host = '';
      try { host = new URL(lcUrl).hostname; } catch { /* bỏ qua */ }
      if (!LC_HOSTS.some(h => host === h || host.endsWith(`.${h}`))) { out.warnings.push({ row: line, message: 'longchau_url không thuộc Long Châu — bỏ qua' }); lcUrl = undefined; }
    }
    const insightType = pick(r, 'insight_type', 'opportunity_type');
    const type = parseType(insightType, !!lcUrl);

    const rawDate = pick(r, 'checked_at');
    let checkedAt = rawDate ? normalizeCheckedAt(rawDate) : null;
    if (!checkedAt) {
      if (rawDate) out.warnings.push({ row: line, message: `checked_at không đọc được: "${rawDate}" — dùng ngày nhập` });
      checkedAt = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    }

    const competitorUrl = httpUrl(pick(r, 'competitor_url'));
    const competitor = normalizeCompetitor(pick(r, 'competitor'), competitorUrl);
    const key = `${norm(topic)}|${competitor || ''}|${norm(insightType)}|${lcUrl || ''}`;
    if (ctx.existingKeys.has(key) || out.items.some(i => i.key === key)) { out.duplicates++; return; }

    out.items.push({
      id: shortId('O'), key, checkedAt, topic, type, insightType: insightType || undefined, lcUrl, competitor, competitorUrl,
      competitorObservation: observation || undefined, lcGap: gap || undefined, userValue: pick(r, 'user_value') || undefined,
      suggestedAction: action || undefined, priority: parsePriority(pick(r, 'priority')),
      evidenceUrls: pick(r, 'evidence_urls').split(/[\s,;]+/).filter(u => /^https?:\/\//.test(u)),
      verification: pick(r, 'verification') || undefined, sheetStatus: pick(r, 'status') || undefined,
      status: 'pending', importedBy: ctx.importedBy, importedAt: now,
    });
  });
  return out;
}
