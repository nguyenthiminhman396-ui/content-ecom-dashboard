import type { DailyTask, KPIEntry, Project, TaskPointRule } from '@/shared/types';
import { defaultTaskCategories } from '@/shared/data/mockData';

function resolveProjectId(link: string, projects: Project[]): string | undefined {
  if (link.includes('nhathuoclongchau')) {
    return projects.find((p) => p.id === 'p_nhathuoc')?.id ?? 'p_nhathuoc';
  }
  if (link.includes('tiemchunglongchau')) {
    return projects.find((p) => p.id === 'p_tiemchung')?.id ?? 'p_tiemchung';
  }
  return undefined;
}

/**
 * Tìm rule phù hợp nhất cho entry.
 * Ưu tiên: match taskDetail trước, rồi taskType, rồi fallback 0.
 */
function resolveRule(entry: KPIEntry, rules: TaskPointRule[]): TaskPointRule | null {
  const activeRules = rules.filter(r => r.active);
  if (activeRules.length === 0) return null;

  // Match exact taskDetail (VD: "SEO")
  const detailMatch = activeRules.find(r =>
    entry.taskDetail && r.taskLabel.toLowerCase() === entry.taskDetail.toLowerCase()
  );
  if (detailMatch) return detailMatch;

  // Match taskType (VD: "Bài Góc sức khỏe - Bệnh lý - Thành phần")
  const typeMatch = activeRules.find(r =>
    entry.taskType && entry.taskType.toLowerCase().includes(r.taskLabel.toLowerCase())
  );
  if (typeMatch) return typeMatch;

  // Partial match
  const partialMatch = activeRules.find(r =>
    r.taskLabel.toLowerCase().includes(entry.taskDetail.toLowerCase()) ||
    entry.taskType.toLowerCase().includes(r.taskLabel.toLowerCase())
  );
  if (partialMatch) return partialMatch;

  // Fallback: dùng rule "Mặc định" nếu có
  const defaultRule = activeRules.find(r => r.taskLabel.toLowerCase() === 'mặc định');
  return defaultRule ?? null;
}

/**
 * Resolve team từ category hoặc taskType.
 * Dùng defaultTaskCategories để map "Đầu việc content" → teamName.
 */
function resolveTeam(taskType: string, category?: string): { category: string; teamName: string } {
  // Nếu rule đã có category → dùng luôn
  if (category) {
    const catDef = defaultTaskCategories.find(c => c.taskTypeName === category);
    return {
      category,
      teamName: catDef?.teamName || category,
    };
  }
  // Fallback: match taskType từ KPIEntry với defaultTaskCategories
  const catDef = defaultTaskCategories.find(c =>
    c.taskTypeName.toLowerCase() === taskType.toLowerCase()
  );
  if (catDef) {
    return { category: catDef.taskTypeName, teamName: catDef.teamName };
  }
  return { category: taskType || 'Khác', teamName: 'Khác' };
}

export function flattenDailyTasks(
  entries: KPIEntry[],
  projects: Project[] = [],
  taskPointRules: TaskPointRule[] = []
): DailyTask[] {
  const tasks: DailyTask[] = [];

  for (const entry of entries) {
    const rule = resolveRule(entry, taskPointRules);
    const pointPerLink = rule?.pointPerLink ?? 0;
    const team = resolveTeam(entry.taskType, rule?.category);

    entry.links.forEach((link, i) => {
      if (!link) return;

      tasks.push({
        id: `${entry.id}_${i}`,
        entryId: entry.id,
        linkIndex: i,
        link,
        employeeName: entry.employeeName,
        taskType: entry.taskType,
        taskDetail: entry.taskDetail,
        category: team.category,
        teamName: team.teamName,
        point: pointPerLink,
        timestamp: entry.timestamp,
        projectName: entry.projectName,
        projectId: entry.projectId ?? resolveProjectId(link, projects),
      });
    });
  }

  return tasks;
}
