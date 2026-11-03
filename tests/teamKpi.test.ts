import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  memberTarget, teamTarget, kpiRoster, roleStateAt, factorOf, nextRoleHistory,
  submittedAsRole, monthBounds, dayKeyOf,
} from '../src/shared/selectors/teamKpi.ts';
import type { KPISubmission, Member } from '../src/shared/types/index.ts';

const scale = { memberTargetPoints: 300, leaderProductionWeight: 0.6 };
// Tháng 11/2026 có 30 ngày → 10đ/ngày cho Member, 6đ/ngày cho Leader
const NOV = { from: '2026-11-01', to: '2026-11-30' };

const mem = (name: string, over: Partial<Member> = {}): Member => ({
  id: name, name, role: 'Member', expertise: '', kpiRole: 'member', teamGroup: 'Bài viết', ...over,
});
const lead = (name: string, over: Partial<Member> = {}): Member =>
  mem(name, { role: 'Leader', kpiRole: 'leader', ...over });

const sub = (employeeName: string, submittedAt: string, totalPoints = 10): KPISubmission => ({
  id: `${employeeName}-${submittedAt}`, employeeName, submittedAt, taskType: 'x', taskDetail: 'y',
  links: ['l'], teamGroup: 'Bài viết', pointPerLink: totalPoints, totalPoints, timePerLink: 1, locked: true,
});

describe('Target cả tháng — giữ nguyên công thức cũ', () => {
  test('Member đủ tháng = memberTargetPoints', () => {
    assert.equal(memberTarget(mem('A'), NOV.from, NOV.to, scale), 300);
  });
  test('Leader đủ tháng = memberTargetPoints × leaderProductionWeight', () => {
    assert.equal(memberTarget(lead('L'), NOV.from, NOV.to, scale), 180);
  });
  test('productivityFactor riêng được ưu tiên', () => {
    assert.equal(memberTarget(mem('A', { productivityFactor: 0.8 }), NOV.from, NOV.to, scale), 240);
  });
  test('team 1 Leader + 3 Member', () => {
    const t = teamTarget([lead('L'), mem('A'), mem('B'), mem('C')], NOV.from, NOV.to, scale);
    assert.equal(t.total, 180 + 900);
  });
  test('tháng 31 ngày / tháng 2 vẫn đúng bằng target tháng', () => {
    assert.equal(memberTarget(mem('A'), '2026-10-01', '2026-10-31', scale), 300);
    assert.equal(memberTarget(mem('A'), '2026-02-01', '2026-02-28', scale), 300);
  });
});

describe('THÊM member giữa tháng', () => {
  test('vào ngày 16/11 → chỉ tính 15/30 ngày', () => {
    assert.equal(memberTarget(mem('New', { joinedAt: '2026-11-16' }), NOV.from, NOV.to, scale), 150);
  });
  test('target team tăng đúng phần ngày công của người mới', () => {
    const before = teamTarget([mem('A'), mem('B')], NOV.from, NOV.to, scale).total;
    const after = teamTarget([mem('A'), mem('B'), mem('New', { joinedAt: '2026-11-21' })], NOV.from, NOV.to, scale).total;
    assert.equal(after - before, 100); // 10 ngày × 10đ
  });
  test('vào từ tháng sau → không có trong roster tháng này', () => {
    const r = kpiRoster([mem('A'), mem('Future', { joinedAt: '2026-12-01' })], NOV.from, NOV.to);
    assert.deepEqual(r.map(m => m.name), ['A']);
  });
  test('member mới (có joinedAt) được tính ngay dù chưa submit lần nào', () => {
    const r = kpiRoster([mem('New', { joinedAt: '2026-11-10' })], NOV.from, NOV.to, { submitterNames: new Set() });
    assert.equal(r.length, 1);
  });
  test('member cũ (không joinedAt) chưa từng submit → không tính (giữ hành vi cũ)', () => {
    const r = kpiRoster([mem('Idle'), mem('A')], NOV.from, NOV.to, { submitterNames: new Set(['A']) });
    assert.deepEqual(r.map(m => m.name), ['A']);
  });
});

describe('BỚT member (cho nghỉ)', () => {
  test('nghỉ sau ngày 10/11 → target 10 ngày', () => {
    assert.equal(memberTarget(mem('Gone', { leftAt: '2026-11-10' }), NOV.from, NOV.to, scale), 100);
  });
  test('đã nghỉ từ tháng trước → không có trong roster', () => {
    const r = kpiRoster([mem('A'), mem('Gone', { leftAt: '2026-10-31' })], NOV.from, NOV.to);
    assert.deepEqual(r.map(m => m.name), ['A']);
  });
  test('xem lại tháng cũ: người đã nghỉ vẫn tính đủ target tháng đó', () => {
    const gone = mem('Gone', { leftAt: '2026-11-10' });
    assert.equal(memberTarget(gone, '2026-10-01', '2026-10-31', scale), 300);
    assert.equal(kpiRoster([gone], '2026-10-01', '2026-10-31').length, 1);
  });
  test('vào và nghỉ trong cùng tháng', () => {
    assert.equal(memberTarget(mem('Temp', { joinedAt: '2026-11-11', leftAt: '2026-11-20' }), NOV.from, NOV.to, scale), 100);
  });
  test('Manager / Client không bao giờ có target', () => {
    const r = kpiRoster([mem('M', { role: 'Manager' }), mem('C', { role: 'Client' }), mem('A')], NOV.from, NOV.to);
    assert.deepEqual(r.map(m => m.name), ['A']);
  });
});

describe('ĐỔI vị trí Member → Leader', () => {
  const promoted = (): Member => {
    const before = mem('P', { joinedAt: '2026-01-05' });
    const hist = nextRoleHistory(before, { role: 'Leader', kpiRole: 'leader', productivityFactor: 0.6 }, '2026-11-16');
    return { ...before, role: 'Leader', kpiRole: 'leader', productivityFactor: 0.6, roleHistory: hist };
  };

  test('nextRoleHistory lưu cả vai trò cũ lẫn mới', () => {
    assert.deepEqual(promoted().roleHistory, [
      { from: '2026-01-05', kpiRole: 'member', productivityFactor: undefined },
      { from: '2026-11-16', kpiRole: 'leader', productivityFactor: 0.6 },
    ]);
  });
  test('lên Leader 16/11 → 15 ngày Member (150) + 15 ngày Leader (90) = 240', () => {
    assert.equal(memberTarget(promoted(), NOV.from, NOV.to, scale), 240);
  });
  test('tháng trước khi lên vẫn là target Member đầy đủ', () => {
    assert.equal(memberTarget(promoted(), '2026-10-01', '2026-10-31', scale), 300);
  });
  test('tháng sau là target Leader đầy đủ', () => {
    assert.equal(memberTarget(promoted(), '2026-12-01', '2026-12-31', scale), 180);
  });
  test('roleStateAt đúng hai phía ngày đổi', () => {
    const p = promoted();
    assert.equal(roleStateAt(p, '2026-11-15').kpiRole, 'member');
    assert.equal(roleStateAt(p, '2026-11-16').kpiRole, 'leader');
  });
  test('KPI team của Lead chỉ tính phần ngày còn là Member', () => {
    assert.equal(memberTarget(promoted(), NOV.from, NOV.to, scale, 'member'), 150);
  });
  test('submission được phân loại theo vai trò tại ngày nộp', () => {
    const p = promoted();
    assert.equal(submittedAsRole(sub('P', '2026-11-10T03:00:00Z'), [p], 'member'), true);
    assert.equal(submittedAsRole(sub('P', '2026-11-20T03:00:00Z'), [p], 'member'), false);
  });
  test('Leader → Member (đổi ngược) cũng chia theo ngày', () => {
    const l = lead('L', { productivityFactor: 0.6 });
    const hist = nextRoleHistory(l, { role: 'Member', kpiRole: 'member', productivityFactor: 1 }, '2026-11-21');
    const m = { ...l, role: 'Member' as const, kpiRole: 'member' as const, productivityFactor: 1, roleHistory: hist };
    assert.equal(memberTarget(m, NOV.from, NOV.to, scale), 20 * 6 + 10 * 10);
  });
  test('sửa thông tin khác (không đổi vai trò/hệ số) → không ghi lịch sử', () => {
    assert.equal(nextRoleHistory(mem('A'), { expertise: 'SEO' }, '2026-11-16'), undefined);
  });
  test('đổi 2 lần cùng ngày (sửa nhầm) → chỉ giữ lần sau', () => {
    const a = mem('A', { joinedAt: '2026-01-01' });
    const h1 = nextRoleHistory(a, { kpiRole: 'leader', productivityFactor: 0.6 }, '2026-11-16')!;
    const a1 = { ...a, kpiRole: 'leader' as const, productivityFactor: 0.6, roleHistory: h1 };
    const h2 = nextRoleHistory(a1, { productivityFactor: 0.7 }, '2026-11-16')!;
    assert.equal(h2.length, 2);
    assert.equal(h2[1].productivityFactor, 0.7);
  });
  test('đổi hệ số không đổi vai trò cũng được ghi lịch sử', () => {
    const h = nextRoleHistory(lead('L', { productivityFactor: 0.6 }), { productivityFactor: 0.5 }, '2026-11-16');
    assert.equal(h?.length, 2);
  });
});

describe('Dữ liệu lưu DB — giá trị rỗng sau khi khôi phục / xoá ngày', () => {
  // API update merge JSON nên khi xoá trường, app ghi '' (hoặc DB có thể trả null) thay vì bỏ key
  test("leftAt '' (đã khôi phục) = vẫn đang làm", () => {
    const m = mem('Back', { leftAt: '' });
    assert.equal(memberTarget(m, NOV.from, NOV.to, scale), 300);
    assert.equal(kpiRoster([m], NOV.from, NOV.to).length, 1);
  });
  test('leftAt / joinedAt null từ DB không làm sai', () => {
    const m = mem('Null', { leftAt: null as unknown as string, joinedAt: null as unknown as string });
    assert.equal(memberTarget(m, NOV.from, NOV.to, scale), 300);
  });
  test("joinedAt '' + chưa submit → coi như member cũ (không tính)", () => {
    assert.equal(kpiRoster([mem('X', { joinedAt: '' })], NOV.from, NOV.to, { submitterNames: new Set() }).length, 0);
  });
  test("đổi vai trò khi joinedAt '' → mốc đầu là 0000-01-01, không phải ''", () => {
    const h = nextRoleHistory(mem('A', { joinedAt: '' }), { kpiRole: 'leader' }, '2026-11-16');
    assert.equal(h?.[0].from, '0000-01-01');
  });
  test('roleHistory lưu lệch thứ tự trong DB vẫn tính đúng', () => {
    const m = lead('P', { productivityFactor: 0.6, roleHistory: [
      { from: '2026-11-16', kpiRole: 'leader', productivityFactor: 0.6 },
      { from: '2026-01-01', kpiRole: 'member' },
    ] });
    assert.equal(memberTarget(m, NOV.from, NOV.to, scale), 240);
  });
  test('không mutate roleHistory gốc', () => {
    const hist = [{ from: '2026-11-16', kpiRole: 'leader' as const }, { from: '2026-01-01', kpiRole: 'member' as const }];
    roleStateAt(lead('P', { roleHistory: hist }), '2026-11-20');
    assert.equal(hist[0].from, '2026-11-16');
  });
  test('submission của người không còn trong danh sách (đã xoá hẳn) → không gán vai trò', () => {
    assert.equal(submittedAsRole(sub('Ghost', '2026-11-02T03:00:00Z'), [mem('A')], 'member'), false);
  });
  test('bài nộp 0h30 ngày 1/11 giờ VN (UTC vẫn là 31/10) tính vào tháng 11', () => {
    // chạy với TZ=Asia/Ho_Chi_Minh (npm test đặt sẵn)
    assert.equal(dayKeyOf('2026-10-31T17:30:00.000Z'), '2026-11-01');
  });
});

describe('helpers', () => {
  test('factorOf fallback', () => {
    assert.equal(factorOf({ kpiRole: 'leader' }, scale), 0.6);
    assert.equal(factorOf({ kpiRole: 'member' }, scale), 1);
    assert.equal(factorOf({ kpiRole: 'leader', productivityFactor: 0 }, scale), 0.6);
  });
  test('monthBounds / dayKeyOf', () => {
    assert.deepEqual(monthBounds('2026-02-14'), { from: '2026-02-01', to: '2026-02-28' });
    assert.equal(dayKeyOf('bad'), undefined);
    assert.equal(dayKeyOf('2026-11-03'), '2026-11-03');
  });
  test('from > to → 0', () => {
    assert.equal(memberTarget(mem('A'), '2026-11-30', '2026-11-01', scale), 0);
  });
});
