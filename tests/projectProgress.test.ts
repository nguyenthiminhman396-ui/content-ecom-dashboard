import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeTaskProgress, overallProgress, computeSchedule, resolveStartDate,
  summarizeProject, sortByRisk, submissionHours,
} from '../src/shared/selectors/projectProgress.ts';
import type { KPISubmission, Project, ProjectTask } from '../src/shared/types/index.ts';

const project = (over: Partial<Project> = {}): Project => ({
  id: 'p1', name: 'Dự án', type: 'Campaign', clientId: 'c', budget: 0,
  deadline: '2026-12-31', status: 'Đang chạy', leader: 'L', description: '', ...over,
});

const task = (over: Partial<ProjectTask> = {}): ProjectTask => ({
  id: 't1', projectId: 'p1', name: 'Task', targetLinks: 0, ...over,
});

let seq = 0;
const sub = (over: Partial<KPISubmission> = {}): KPISubmission => ({
  id: `s${++seq}`, employeeName: 'An', submittedAt: '2026-10-15T03:00:00.000Z',
  taskType: 'Bài SEO', taskDetail: 'SEO', projectId: 'p1', links: [],
  teamGroup: 'Bài viết', pointPerLink: 1, totalPoints: 0, timePerLink: 0, locked: true, ...over,
});

const linkSub = (n: number, over: Partial<KPISubmission> = {}) =>
  sub({ links: Array.from({ length: n }, (_, i) => `https://x/${seq}-${i}`), timePerLink: 0.5, totalPoints: n, ...over });
const hourSub = (h: number, over: Partial<KPISubmission> = {}) =>
  sub({ hoursWorked: h, timePerLink: h, totalPoints: h * 1.5, ...over });

describe('submissionHours', () => {
  test('submit theo giờ dùng hoursWorked, không nhân với số link', () => {
    assert.equal(submissionHours(hourSub(4)), 4);
  });
  test('submit theo link = timePerLink × số link', () => {
    assert.equal(submissionHours(linkSub(3)), 1.5);
  });
});

describe('computeTaskProgress', () => {
  test('link: đếm link khớp taskType/taskDetail, chặn trần 100%', () => {
    const t = task({ trackingMode: 'link', taskType: 'Bài SEO', targetLinks: 4 });
    assert.equal(computeTaskProgress(t, [linkSub(2)]).progress, 50);
    assert.equal(computeTaskProgress(t, [linkSub(9)]).progress, 100);
  });

  test('link: submission đã gắn task khác không bị đếm trùng', () => {
    const t = task({ trackingMode: 'link', taskType: 'Bài SEO', targetLinks: 2 });
    const r = computeTaskProgress(t, [linkSub(2, { projectTaskId: 'other' })]);
    assert.equal(r.links, 0);
    assert.equal(r.progress, 0);
  });

  test('link: task không có taskType/taskDetail chỉ nhận submission gắn trực tiếp', () => {
    const t = task({ trackingMode: 'link', targetLinks: 2 });
    assert.equal(computeTaskProgress(t, [linkSub(2)]).progress, 0);
    assert.equal(computeTaskProgress(t, [linkSub(1, { projectTaskId: 't1' })]).progress, 50);
  });

  test('link: lọc theo assignees', () => {
    const t = task({ trackingMode: 'link', taskType: 'Bài SEO', targetLinks: 2, assignees: ['Bình'] });
    assert.equal(computeTaskProgress(t, [linkSub(2, { employeeName: 'An' })]).progress, 0);
    assert.equal(computeTaskProgress(t, [linkSub(2, { employeeName: 'Bình' })]).progress, 100);
  });

  test('hours: dự án tính theo thời gian — submit giờ (0 link) vẫn lên tiến độ', () => {
    const t = task({ trackingMode: 'hours', targetHours: 20, projectTaskId: undefined, taskType: 'Bài SEO' } as Partial<ProjectTask>);
    const r = computeTaskProgress(t, [hourSub(5), hourSub(3)]);
    assert.equal(r.links, 0);
    assert.equal(r.hours, 8);
    assert.equal(r.progress, 40);
  });

  test('hours: không đặt targetHours → 0%, không chia cho 0', () => {
    const t = task({ trackingMode: 'hours', taskType: 'Bài SEO' });
    assert.equal(computeTaskProgress(t, [hourSub(5)]).progress, 0);
  });

  test('quantity', () => {
    const t = task({ trackingMode: 'quantity', taskType: 'Bài SEO', targetQuantity: 10 });
    assert.equal(computeTaskProgress(t, [sub({ quantity: 3 }), sub({ quantity: 4 })]).progress, 70);
  });

  test('milestone: manualProgress ưu tiên, fallback isDone', () => {
    assert.equal(computeTaskProgress(task({ trackingMode: 'milestone', manualProgress: 60 }), []).progress, 60);
    assert.equal(computeTaskProgress(task({ trackingMode: 'milestone', isDone: true }), []).progress, 100);
    assert.equal(computeTaskProgress(task({ trackingMode: 'milestone' }), []).progress, 0);
  });

  test('không có trackingMode → mặc định link (dữ liệu cũ)', () => {
    const t = task({ taskType: 'Bài SEO', targetLinks: 4 });
    assert.equal(computeTaskProgress(t, [linkSub(1)]).progress, 25);
  });
});

describe('overallProgress', () => {
  test('trung bình các task', () => {
    const tp = [
      computeTaskProgress(task({ id: 'a', trackingMode: 'milestone', isDone: true }), []),
      computeTaskProgress(task({ id: 'b', trackingMode: 'milestone', manualProgress: 50 }), []),
    ];
    assert.equal(overallProgress(project(), tp), 75);
  });
  test('không có task → manualProgress của dự án', () => {
    assert.equal(overallProgress(project({ manualProgress: 30 }), []), 30);
    assert.equal(overallProgress(project(), []), 0);
  });
});

describe('computeSchedule', () => {
  const today = new Date(2026, 10, 3); // 2026-11-03

  test('xong 100% → done, kể cả đã qua deadline', () => {
    assert.equal(computeSchedule(100, '2026-06-30', '2026-01-01', today).status, 'done');
  });
  test('qua deadline chưa xong → overdue, daysLeft âm', () => {
    const s = computeSchedule(80, '2026-11-01', '2026-10-01', today);
    assert.equal(s.status, 'overdue');
    assert.equal(s.daysLeft, -2);
  });
  test('việc chậm hơn thời gian trôi quá 10 điểm → behind', () => {
    // 2026-10-01 → 2026-12-01: 61 ngày, đã trôi 33 → 54%
    const s = computeSchedule(30, '2026-12-01', '2026-10-01', today);
    assert.equal(s.elapsedPct, 54);
    assert.equal(s.status, 'behind');
  });
  test('trong biên ±10 → on_track; vượt → ahead', () => {
    assert.equal(computeSchedule(50, '2026-12-01', '2026-10-01', today).status, 'on_track');
    assert.equal(computeSchedule(70, '2026-12-01', '2026-10-01', today).status, 'ahead');
  });
  test('deadline hôm nay → daysLeft 0, chưa quá hạn', () => {
    const s = computeSchedule(50, '2026-11-03', '2026-10-01', today);
    assert.equal(s.daysLeft, 0);
    assert.notEqual(s.status, 'overdue');
  });
  test('không có ngày bắt đầu → chỉ báo số ngày còn lại', () => {
    const s = computeSchedule(10, '2026-11-13', undefined, today);
    assert.equal(s.status, 'on_track');
    assert.equal(s.daysLeft, 10);
    assert.equal(s.elapsedPct, undefined);
  });
  test('không có / sai deadline → no_deadline', () => {
    assert.equal(computeSchedule(10, '', undefined, today).status, 'no_deadline');
    assert.equal(computeSchedule(10, 'abc', undefined, today).status, 'no_deadline');
  });
});

describe('resolveStartDate', () => {
  test('ưu tiên startDate → activeMonths → submission sớm nhất', () => {
    assert.equal(resolveStartDate({ startDate: '2026-09-05', activeMonths: '2026-08' }, []), '2026-09-05');
    assert.equal(resolveStartDate({ activeMonths: '2026-10, 2026-08' }, []), '2026-08-01');
    assert.equal(resolveStartDate({}, [sub({ submittedAt: '2026-10-20T01:00:00Z' }), sub({ submittedAt: '2026-09-02T01:00:00Z' })]), '2026-09-02');
    assert.equal(resolveStartDate({}, []), undefined);
  });
});

describe('summarizeProject — case trên Dashboard', () => {
  const today = new Date(2026, 10, 3);
  const nov = { from: new Date(2026, 10, 1).getTime(), to: new Date(2026, 10, 30, 23, 59, 59).getTime() };

  test('dự án chỉ có mốc: không còn hiện "0 link 0 điểm" mà là dạng time + đếm mốc', () => {
    const tasks = [
      task({ id: 'a', trackingMode: 'milestone', isDone: true }),
      task({ id: 'b', trackingMode: 'milestone', manualProgress: 100 }),
      task({ id: 'c', trackingMode: 'milestone', manualProgress: 40 }),
    ];
    const s = summarizeProject(project(), tasks, [], { today, periodFrom: nov.from, periodTo: nov.to });
    assert.equal(s.kind, 'time');
    assert.equal(s.milestoneCount, 3);
    assert.equal(s.milestoneDone, 2);
    assert.equal(s.progress, 80);
  });

  test('link/điểm là luỹ kế dự án (khớp %), phần trong kỳ tách riêng', () => {
    const tasks = [task({ trackingMode: 'link', taskType: 'Bài SEO', targetLinks: 10 })];
    const subs = [
      linkSub(6, { submittedAt: '2026-10-10T03:00:00Z' }),
      linkSub(2, { submittedAt: '2026-11-02T03:00:00Z' }),
      linkSub(5, { projectId: 'other' }),
    ];
    const s = summarizeProject(project(), tasks, subs, { today, periodFrom: nov.from, periodTo: nov.to });
    assert.equal(s.kind, 'output');
    assert.equal(s.links, 8);
    assert.equal(s.periodLinks, 2);
    assert.equal(s.points, 8);
    assert.equal(s.progress, 80);
  });

  test('dự án tính theo giờ: hiện giờ + điểm, kind time', () => {
    const tasks = [task({ trackingMode: 'hours', taskType: 'Bài SEO', targetHours: 10 })];
    const s = summarizeProject(project(), tasks, [hourSub(4, { submittedAt: '2026-10-10T03:00:00Z' })], { today });
    assert.equal(s.kind, 'time');
    assert.equal(s.hours, 4);
    assert.equal(s.points, 6);
    assert.equal(s.progress, 40);
    assert.equal(s.tracksHours, true);
  });

  test('dự án kết hợp giờ + link: kind output nhưng vẫn báo tracksHours', () => {
    const tasks = [
      task({ id: 'h', trackingMode: 'hours', taskType: 'Bài SEO', targetHours: 100 }),
      task({ id: 'l', trackingMode: 'link', taskType: 'Bài SEO', targetLinks: 20 }),
    ];
    const subs = [hourSub(30), linkSub(3)];
    const s = summarizeProject(project(), tasks, subs, { today });
    assert.equal(s.kind, 'output');
    assert.equal(s.tracksHours, true);
    assert.equal(s.links, 3);
    // giờ = 30h submit theo giờ + 3 link × 0.5h
    assert.equal(s.hours, 31.5);
  });

  test('submission ngày sai định dạng không làm crash', () => {
    const s = summarizeProject(project(), [], [sub({ submittedAt: 'n/a' })], { today, periodFrom: nov.from, periodTo: nov.to });
    assert.equal(s.periodLinks, 0);
  });
});

describe('sortByRisk', () => {
  test('quá hạn & chậm lên đầu, xong xuống cuối', () => {
    const today = new Date(2026, 10, 3);
    const mk = (id: string, over: Partial<Project>, manualProgress: number) =>
      summarizeProject(project({ id, manualProgress, ...over }), [], [], { today });
    const list = [
      mk('done', { deadline: '2026-06-30' }, 100),
      mk('ok', { deadline: '2026-12-01', startDate: '2026-10-01' }, 55),
      mk('late', { deadline: '2026-10-30' }, 90),
      mk('slow', { deadline: '2026-12-01', startDate: '2026-10-01' }, 10),
    ].sort(sortByRisk).map(s => s.project.id);
    assert.deepEqual(list, ['late', 'slow', 'ok', 'done']);
  });
});
