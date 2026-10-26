import { useAppStore } from '@/shared/store/appStore';
import type { CiTask, TodoItem } from '@/shared/types';
import { makeId } from '@/shared/utils/helpers';
import type { AssignInput } from './AssignDialog';

export const TASK_KIND_LABEL: Record<CiTask['kind'], string> = {
  optimization: '✏️ Sửa bài',
  medical_verification: '🩺 Xác minh y khoa',
  new_article: '🆕 Viết bài mới',
  expand_article: '➕ Bổ sung bài',
};

const TODO_PREFIX: Record<CiTask['kind'], string> = {
  optimization: '[CI] Sửa bài',
  medical_verification: '[CI] Xác minh y khoa',
  new_article: '[CI] Viết bài mới',
  expand_article: '[CI] Bổ sung bài',
};

/** Tạo việc trong To-do hiện có + bản ghi CiTask. Trả về id task. */
export function createCiTask(params: {
  kind: CiTask['kind']; url: string; title: string; findingIds?: string[]; opportunityId?: string;
  detailLines: string[]; input: AssignInput;
}): string {
  const { currentUser, addTodo, addCiTask } = useAppStore.getState();
  const owner = currentUser?.name || '';
  const { kind, url, title, input } = params;
  const taskId = makeId('citask');
  const todoId = `todo_ci_${taskId}`;
  const now = new Date().toISOString();
  const description = [
    ...(input.instructions ? [`Yêu cầu: ${input.instructions}`, ''] : []),
    ...params.detailLines,
    '', 'Khi xong: nộp URL bài ở Content Intelligence › Assignments.',
  ].join('\n');
  const todo: TodoItem = {
    id: todoId, ownerName: owner, assigneeName: input.assignee, title: `${TODO_PREFIX[kind]}: ${title}`.slice(0, 140), description,
    dueDate: input.dueDate, priority: input.priority, completed: false, createdAt: now, source: 'content_intelligence', ciTaskId: taskId,
  };
  const task: CiTask = {
    id: taskId, todoId, url, title, kind, findingIds: params.findingIds || [], opportunityId: params.opportunityId,
    ownerName: owner, assigneeName: input.assignee, priority: input.priority, dueDate: input.dueDate, instructions: input.instructions,
    status: 'assigned', history: [{ at: now, by: owner, action: `Giao cho ${input.assignee}` }], createdAt: now,
  };
  addTodo(todo);
  addCiTask(task);
  return taskId;
}
