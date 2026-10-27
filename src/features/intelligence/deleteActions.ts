/**
 * Xoá / huỷ dữ liệu Content Intelligence (chỉ Quản lý). Mục đã giao việc phải huỷ việc trước khi xoá.
 * Trả về thông báo lỗi (string) nếu không thực hiện được, null nếu thành công.
 */
import toast from 'react-hot-toast';
import { useAppStore } from '@/shared/store/appStore';

export function deleteFinding(id: string): string | null {
  const s = useAppStore.getState();
  const f = s.ciFindings.find(x => x.id === id);
  if (!f) return null;
  if (f.taskId) return 'Lỗi này đã được giao việc — hãy huỷ việc ở tab Assignments trước.';
  s.removeCiFindings([id]);
  return null;
}

/** Xoá cả một lượt chấm (QC hoặc kiểm tra lại) cùng toàn bộ lỗi của lượt đó — dùng khi nhập nhầm. */
export function deleteCheck(id: string): string | null {
  const s = useAppStore.getState();
  const findings = s.ciFindings.filter(f => f.checkId === id);
  if (findings.some(f => f.taskId)) return 'Lượt chấm này có lỗi đã được giao việc — hãy huỷ việc trước.';
  // Nếu đây là kết quả kiểm tra lại đã gắn vào task → gỡ kết quả đó khỏi task
  s.ciTasks.filter(t => t.recheck?.checkId === id).forEach(t => s.updateCiTask(t.id, { recheck: null }));
  s.removeCiFindings(findings.map(f => f.id));
  s.removeCiChecks([id]);
  return null;
}

export function deleteOpportunity(id: string): string | null {
  const s = useAppStore.getState();
  const o = s.ciOpportunities.find(x => x.id === id);
  if (!o) return null;
  if (o.taskId) return 'Cơ hội này đã được giao việc — hãy huỷ việc ở tab Assignments trước.';
  s.removeCiOpportunities([id]);
  return null;
}

/** Huỷ việc: xoá To-do liên kết, trả lỗi/cơ hội về trạng thái chưa giao. */
export function cancelTask(id: string): string | null {
  const s = useAppStore.getState();
  const t = s.ciTasks.find(x => x.id === id);
  if (!t) return null;
  if (t.status === 'accepted') return 'Việc đã nghiệm thu — không huỷ được.';
  t.findingIds.forEach(fid => s.updateCiFinding(fid, { taskId: null, status: 'open' }));
  if (t.opportunityId) s.updateCiOpportunity(t.opportunityId, { taskId: null, status: 'approved' });
  s.deleteTodo(t.todoId);
  s.removeCiTask(id);
  return null;
}

/** Hỏi xác nhận rồi chạy thao tác; báo kết quả bằng toast. */
export function confirmAndRun(question: string, action: () => string | null, done = 'Đã xoá') {
  if (!window.confirm(question)) return;
  const err = action();
  if (err) toast.error(err); else toast.success(done);
}
