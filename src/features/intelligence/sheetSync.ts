/**
 * Đồng bộ 2 tab Google Sheet (QC + Competitor Insights) qua link CSV "Publish to web".
 * Tự đồng bộ chỉ chạy cho Manager/Leader, tối đa 1 lần / 30 phút cho cả team.
 */
import { useAppStore, refreshCiFromDB } from '@/shared/store/appStore';
import type { CiSyncLog } from '@/shared/types';
import { parseTable, normalizeRows, type ParsedImport } from './importParser';
import { normalizeOpportunityRows } from './opportunityParser';

export const AUTO_SYNC_INTERVAL_MS = 30 * 60_000;

/** Ghi kết quả QC (gồm gắn kết quả kiểm tra lại vào task). Trả về số kết quả kiểm tra lại đã gắn. */
export function applyQcImport(p: ParsedImport): number {
  const { currentUser, ciTasks, addCiImport, updateCiTask } = useAppStore.getState();
  addCiImport(p.checks, p.findings);
  const byCheck = new Map<string, typeof p.recheckRows>();
  for (const r of p.recheckRows) byCheck.set(r.checkKey, [...(byCheck.get(r.checkKey) || []), r]);
  let linked = 0;
  for (const [key, rows] of byCheck) {
    const check = p.checks.find(c => c.key === key);
    const task = ciTasks.find(t => rows.some(r => t.findingIds.includes(r.findingId)));
    if (!check || !task) continue;
    const ids = (s: string) => rows.filter(r => r.status === s && task.findingIds.includes(r.findingId)).map(r => r.findingId);
    const covered = new Set(rows.map(r => r.findingId));
    updateCiTask(task.id, {
      recheck: {
        checkId: check.id, resolved: ids('resolved'), unresolved: ids('unresolved'),
        unableToVerify: [...ids('unable_to_verify'), ...task.findingIds.filter(id => !covered.has(id))],
        newFindingIds: p.findings.filter(f => f.checkId === check.id).map(f => f.id), importedAt: new Date().toISOString(),
      },
      history: [...task.history, { at: new Date().toISOString(), by: currentUser?.name || '', action: 'Nhập kết quả kiểm tra lại' }],
    });
    linked++;
  }
  return linked;
}

async function fetchCsv(url: string): Promise<string> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const fmtErrors = (errs: { row: number; message: string }[]) => errs.slice(0, 20).map(e => `dòng ${e.row}: ${e.message}`);

/**
 * Đồng bộ cả 2 tab. auto=true: bỏ qua nếu team vừa đồng bộ trong 30 phút.
 * Trả về log, hoặc null nếu không chạy.
 */
export async function syncSheets({ auto }: { auto: boolean }): Promise<CiSyncLog | null> {
  const store = useAppStore.getState();
  const me = store.currentUser;
  if (!me || (me.role !== 'Manager' && me.role !== 'Leader')) return null;

  // Lấy dữ liệu mới nhất trước (người khác có thể vừa đồng bộ)
  await refreshCiFromDB();
  const { ciSettings } = useAppStore.getState();
  if (!ciSettings.sheetCsvUrl && !ciSettings.opportunitySheetCsvUrl) return null;
  if (auto && ciSettings.lastSync && Date.now() - new Date(ciSettings.lastSync.at).getTime() < AUTO_SYNC_INTERVAL_MS) return null;

  // Giữ chỗ trước để người mở cùng lúc không chạy trùng
  const log: CiSyncLog = { at: new Date().toISOString(), by: me.name, auto };
  useAppStore.getState().setCiSettings({ ...ciSettings, lastSync: log });

  if (ciSettings.sheetCsvUrl) {
    try {
      const { rows, error } = parseTable(await fetchCsv(ciSettings.sheetCsvUrl));
      if (error) log.qc = { error };
      else {
        const s = useAppStore.getState();
        const p = normalizeRows(rows, { existingChecks: new Map(s.ciChecks.map(c => [c.key, c])), existingFindingKeys: new Set(s.ciFindings.map(f => f.key)), importedBy: me.name });
        const rechecks = applyQcImport(p);
        log.qc = { checks: p.checks.length, findings: p.findings.length, rechecks, duplicates: p.duplicates, errors: fmtErrors(p.errors) };
      }
    } catch (e) { log.qc = { error: `Không đọc được link tab QC (${String((e as Error).message)})` }; }
  }
  if (ciSettings.opportunitySheetCsvUrl) {
    try {
      const { rows, error } = parseTable(await fetchCsv(ciSettings.opportunitySheetCsvUrl));
      if (error) log.competitor = { error };
      else {
        const s = useAppStore.getState();
        const p = normalizeOpportunityRows(rows, { existingKeys: new Set(s.ciOpportunities.map(o => o.key)), importedBy: me.name });
        s.addCiOpportunities(p.items);
        log.competitor = { items: p.items.length, duplicates: p.duplicates, errors: fmtErrors(p.errors) };
      }
    } catch (e) { log.competitor = { error: `Không đọc được link tab đối thủ (${String((e as Error).message)})` }; }
  }
  const latest = useAppStore.getState().ciSettings;
  useAppStore.getState().setCiSettings({ ...latest, lastSync: log });
  return log;
}

/** Tóm tắt 1 dòng cho toast / hiển thị. */
export function summarizeSync(log: CiSyncLog): { text: string; hasErrors: boolean } {
  const parts: string[] = [];
  let hasErrors = false;
  if (log.qc) {
    if ('error' in log.qc) { parts.push(`QC: ${log.qc.error}`); hasErrors = true; }
    else { parts.push(`QC +${log.qc.checks} lượt chấm, +${log.qc.findings} lỗi${log.qc.rechecks ? `, ${log.qc.rechecks} kiểm tra lại` : ''}`); if (log.qc.errors.length) { parts.push(`${log.qc.errors.length} dòng QC lỗi`); hasErrors = true; } }
  }
  if (log.competitor) {
    if ('error' in log.competitor) { parts.push(`Đối thủ: ${log.competitor.error}`); hasErrors = true; }
    else { parts.push(`Đối thủ +${log.competitor.items} cơ hội`); if (log.competitor.errors.length) { parts.push(`${log.competitor.errors.length} dòng đối thủ lỗi`); hasErrors = true; } }
  }
  return { text: parts.join(' · '), hasErrors };
}
