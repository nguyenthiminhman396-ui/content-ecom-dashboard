import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildContextString, splitCommentLines, commentsByIds, parseJsonResponse,
} from '../src/shared/services/aiService.ts';
import {
  buildWeeklyReportContext, pctChange, shiftWeek, submissionsInWeek,
} from '../src/features/reports/weeklyAIContext.ts';
import type { KPISubmission } from '../src/shared/types/index.ts';

const sub = (over: Partial<KPISubmission>): KPISubmission => ({
  id: Math.random().toString(36), employeeName: 'A', submittedAt: '2026-11-03T09:00:00+07:00',
  taskType: 'Sản phẩm', taskDetail: 'SKU', links: ['l1'], teamGroup: 'Sản phẩm',
  pointPerLink: 10, totalPoints: 10, timePerLink: 1, locked: true, ...over,
});

describe('Comment khách hàng — ID khớp giữa prompt và kết quả', () => {
  const raw = 'Giao nhanh\n\n  Sai giá  \n\nThiếu hướng dẫn dùng';

  test('bỏ dòng trống, mỗi comment chỉ đánh số 1 lần', () => {
    assert.deepEqual(splitCommentLines(raw), ['Giao nhanh', 'Sai giá', 'Thiếu hướng dẫn dùng']);
    const ctx = buildWeeklyReportContext({ submissions: [], weekStart: '2026-11-02', customerCommentsRaw: raw });
    const prompt = buildContextString(ctx);
    assert.match(prompt, /\[ID: 2\] Sai giá/);
    assert.match(prompt, /\[ID: 3\] Thiếu hướng dẫn dùng/);
    assert.doesNotMatch(prompt, /\[ID: \d+\] \[ID:/);
  });

  test('ID AI trả về ánh xạ đúng comment, bỏ ID không tồn tại', () => {
    assert.deepEqual(commentsByIds(raw, [2, 3, 99, 0]), ['Sai giá', 'Thiếu hướng dẫn dùng']);
  });
});

describe('So sánh tuần trước', () => {
  test('pctChange trả null khi tuần trước không có dữ liệu', () => {
    assert.equal(pctChange(10, 0), null);
    assert.equal(pctChange(15, 10), 50);
    assert.equal(pctChange(5, 10), -50);
  });

  test('shiftWeek lùi đúng 7 ngày, kể cả qua tháng', () => {
    assert.equal(shiftWeek('2026-11-02', -1), '2026-10-26');
    assert.equal(shiftWeek('2026-03-02', -1), '2026-02-23');
  });

  test('submission sáng sớm thứ Hai vẫn thuộc tuần đó (theo giờ VN)', () => {
    const early = sub({ submittedAt: '2026-11-02T01:30:00+07:00' });
    assert.equal(submissionsInWeek([early], '2026-11-02').length, 1);
    assert.equal(submissionsInWeek([early], '2026-10-26').length, 0);
  });

  test('delta tính từ dữ liệu thật thay vì luôn 0%', () => {
    const subs = [
      sub({ submittedAt: '2026-10-27T10:00:00+07:00', links: ['a', 'b'], totalPoints: 20 }),
      sub({ submittedAt: '2026-11-03T10:00:00+07:00', links: ['a', 'b', 'c'], totalPoints: 30 }),
    ];
    const ctx = buildWeeklyReportContext({ submissions: subs, weekStart: '2026-11-02' });
    assert.equal(ctx.stats.deltaLinks, 50);
    assert.equal(ctx.stats.deltaPoints, 50);
    assert.equal(ctx.stats.deltaSubmits, 0);
    assert.match(buildContextString(ctx), /Link: \+50%, Điểm: \+50%, Submit: 0%/);
  });

  test('không có tuần trước → prompt ghi rõ, không ghi 0%', () => {
    const ctx = buildWeeklyReportContext({ submissions: [sub({})], weekStart: '2026-11-02' });
    assert.equal(ctx.stats.deltaLinks, null);
    assert.match(buildContextString(ctx), /Link: chưa có dữ liệu kỳ trước/);
  });

  test('số tổng sửa tay trên form được ưu tiên', () => {
    const ctx = buildWeeklyReportContext({
      submissions: [sub({})], weekStart: '2026-11-02', totalsOverride: { links: 42 },
    });
    assert.equal(ctx.stats.totalLinks, 42);
    assert.equal(ctx.stats.sku, 1);
  });
});

describe('Đọc JSON AI trả về', () => {
  test('chấp nhận JSON bọc trong ```json', () => {
    assert.deepEqual(parseJsonResponse('```json\n{"a":1}\n```'), { a: 1 });
  });
  test('báo lỗi dễ hiểu khi JSON hỏng', () => {
    assert.throws(() => parseJsonResponse('{"a":'), /không đúng định dạng/);
  });
});

describe('Gọi proxy (fetch giả lập)', () => {
  const realFetch = globalThis.fetch;
  const ctx = buildWeeklyReportContext({ submissions: [], weekStart: '2026-11-02' });
  const sse = (pieces: string[]) => new Response(new ReadableStream({
    start(c) { const enc = new TextEncoder(); pieces.forEach(p => c.enqueue(enc.encode(p))); c.close(); },
  }), { headers: { 'Content-Type': 'text/event-stream' } });
  const ev = (o: unknown) => `data: ${JSON.stringify(o)}\r\n\r\n`;

  test('chat streaming: ghép đúng khi sự kiện bị cắt giữa chừng, bỏ phần "thought"', async (t) => {
    t.after(() => { globalThis.fetch = realFetch; });
    let sentBody: Record<string, unknown> = {};
    const all = ev({ candidates: [{ content: { parts: [{ text: 'nghĩ...', thought: true }, { text: 'Xin ' }] } }] })
      + ev({ candidates: [{ content: { parts: [{ text: 'chào **team**' }] }, finishReason: 'STOP' }] });
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      sentBody = JSON.parse(String(init?.body));
      return sse([all.slice(0, 37), all.slice(37, 90), all.slice(90)]);
    }) as typeof fetch;
    const { chatWithAI } = await import('../src/shared/services/aiService.ts');
    const deltas: string[] = [];
    const out = await chatWithAI([{ role: 'user', text: 'hi' }], ctx, d => deltas.push(d));
    assert.equal(out, 'Xin chào **team**');
    assert.deepEqual(deltas, ['Xin ', 'Xin chào **team**']);
    assert.equal(sentBody.stream, true);
    assert.ok(sentBody.systemInstruction, 'gửi system prompt qua systemInstruction');
  });

  test('JSON bị cắt do MAX_TOKENS → báo lỗi rõ ràng', async (t) => {
    t.after(() => { globalThis.fetch = realFetch; });
    globalThis.fetch = (async () => Response.json({
      candidates: [{ content: { parts: [{ text: '{"insights":"a' }] }, finishReason: 'MAX_TOKENS' }],
    })) as typeof fetch;
    const { generateWeeklyReport } = await import('../src/shared/services/aiService.ts');
    await assert.rejects(generateWeeklyReport(ctx), /quá dài/);
  });

  test('báo cáo tuần: gửi responseSchema và đọc JSON', async (t) => {
    t.after(() => { globalThis.fetch = realFetch; });
    let cfg: Record<string, unknown> = {};
    globalThis.fetch = (async (_u: unknown, init?: RequestInit) => {
      cfg = JSON.parse(String(init?.body)).generationConfig;
      return Response.json({ candidates: [{ content: { parts: [{ text: JSON.stringify({
        insights: '- **A**', bottlenecks: '- B', aiAssessment: '- C', nextWeekPlan: '- D',
      }) }] }, finishReason: 'STOP' }] });
    }) as typeof fetch;
    const { generateWeeklyReport } = await import('../src/shared/services/aiService.ts');
    assert.deepEqual(await generateWeeklyReport(ctx), { insights: '- **A**', bottlenecks: '- B', aiAssessment: '- C', nextWeekPlan: '- D' });
    assert.equal(cfg.responseMimeType, 'application/json');
    assert.equal(cfg.temperature, 0.3);
  });
});
